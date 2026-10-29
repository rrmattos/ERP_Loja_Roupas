import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../../config/database';
import { AppError } from '../../shared/errors/AppError';
import { requireUnityApiKey } from '../../shared/middlewares/auth.middleware';

export const unityRouter = Router();

unityRouter.use(requireUnityApiKey);

const unityCheckoutSchema = z.object({
  customerName: z.string().min(2).max(120).default('Cliente VR Meta Quest'),
  customerEmail: z.string().email().max(160).optional(),
  unitySessionId: z.string().min(4).max(120),
  idempotencyKey: z.string().min(8).max(120),
  items: z
    .array(
      z.object({
        sku: z.string().min(2).max(64),
        quantity: z.number().int().min(1).max(50),
      })
    )
    .min(1, 'O carrinho VR deve conter ao menos 1 item')
    .max(25),
});

/**
 * GET /api/v1/unity/catalog
 * Retorna o catálogo 3D otimizado para consumo via UnityWebRequest no Meta Quest
 */
unityRouter.get('/catalog', async (req, res, next) => {
  try {
    const tenantId = req.unityTenantId!;

    const productsResult = await query(
      `SELECT
         p.id,
         p.name,
         p.slug,
         p.description,
         p.base_price::float8 AS "basePrice",
         p.image_url AS "imageUrl",
         p.unity_prefab_id AS "unityPrefabId",
         p.unity_category_slot AS "unityCategorySlot",
         p.unity_metadata AS "unityMetadata",
         c.name AS "categoryName",
         COALESCE(
           json_agg(
             json_build_object(
               'variantId', pv.id,
               'sku', pv.sku,
               'sizeCode', s.code,
               'sizeName', s.name,
               'colorName', col.name,
               'colorHex', col.hex_code,
               'unitPrice', COALESCE(pv.price_override, p.base_price)::float8,
               'stockQuantity', pv.stock_quantity,
               'inStock', (pv.stock_quantity > 0)
             ) ORDER BY s.display_order ASC, col.name ASC
           ) FILTER (WHERE pv.id IS NOT NULL AND pv.active = TRUE),
           '[]'::json
         ) AS variants
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN product_variants pv ON pv.product_id = p.id AND pv.tenant_id = p.tenant_id
       LEFT JOIN sizes s ON s.id = pv.size_id
       LEFT JOIN colors col ON col.id = pv.color_id
       WHERE p.tenant_id = $1 AND p.active = TRUE
       GROUP BY p.id, c.name
       ORDER BY p.created_at DESC`,
      [tenantId]
    );

    res.json({
      channel: 'UNITY_META_QUEST',
      timestamp: new Date().toISOString(),
      products: productsResult.rows,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/unity/checkout
 * Registra compra realizada no e-commerce VR (Unity 3D / Meta Quest) com:
 * - Proteção de Idempotência (evita duplicidade se o Wi-Fi do óculos oscilar)
 * - Row-Level Locking (SELECT ... FOR UPDATE) contra Race Conditions de estoque
 * - Baixa automática no saldo e registro no Livro-Razão (stock_movements)
 */
unityRouter.post('/checkout', async (req, res, next) => {
  try {
    const tenantId = req.unityTenantId!;
    const payload = unityCheckoutSchema.parse(req.body);

    const checkoutResult = await withTransaction(async (client) => {
      // 1. Verifica se este idempotencyKey já foi processado anteriormente
      const existingOrder = await client.query<{
        id: string;
        order_number: string;
        total_amount: string;
        status: string;
        created_at: Date;
      }>(
        `SELECT id, order_number, total_amount, status, created_at
         FROM orders
         WHERE tenant_id = $1 AND idempotency_key = $2
         LIMIT 1`,
        [tenantId, payload.idempotencyKey]
      );

      if (existingOrder.rows[0]) {
        return {
          idempotentReplay: true,
          order: existingOrder.rows[0],
        };
      }

      // 2. Valida e bloqueia (FOR UPDATE) cada SKU solicitado
      let orderTotal = 0;
      const resolvedItems: Array<{
        variantId: string;
        sku: string;
        quantity: number;
        unitPrice: number;
        subtotal: number;
        previousStock: number;
        newStock: number;
      }> = [];

      for (const item of payload.items) {
        const variantRes = await client.query<{
          id: string;
          sku: string;
          stock_quantity: number;
          unit_price: string;
          product_name: string;
        }>(
          `SELECT
             pv.id,
             pv.sku,
             pv.stock_quantity,
             COALESCE(pv.price_override, p.base_price) AS unit_price,
             p.name AS product_name
           FROM product_variants pv
           INNER JOIN products p ON p.id = pv.product_id
           WHERE pv.tenant_id = $1 AND pv.sku = $2 AND pv.active = TRUE AND p.active = TRUE
           FOR UPDATE OF pv`,
          [tenantId, item.sku]
        );

        const variant = variantRes.rows[0];
        if (!variant) {
          throw new AppError(
            `SKU '${item.sku}' não encontrado ou inativo nesta loja.`,
            404,
            'SKU_NOT_FOUND'
          );
        }

        if (variant.stock_quantity < item.quantity) {
          throw new AppError(
            `Estoque insuficiente para '${variant.product_name}' (SKU: ${variant.sku}). Disponível: ${variant.stock_quantity}, Solicitado: ${item.quantity}.`,
            409,
            'INSUFFICIENT_STOCK'
          );
        }

        const unitPrice = Number(variant.unit_price);
        const subtotal = Number((unitPrice * item.quantity).toFixed(2));
        const previousStock = variant.stock_quantity;
        const newStock = previousStock - item.quantity;

        orderTotal = Number((orderTotal + subtotal).toFixed(2));

        resolvedItems.push({
          variantId: variant.id,
          sku: variant.sku,
          quantity: item.quantity,
          unitPrice,
          subtotal,
          previousStock,
          newStock,
        });
      }

      // 3. Cria o Pedido (orders)
      const orderInsert = await client.query<{
        id: string;
        order_number: string;
        total_amount: string;
        status: string;
        created_at: Date;
      }>(
        `INSERT INTO orders (
           tenant_id, channel, status, customer_name, customer_email,
           unity_session_id, idempotency_key, total_amount, notes
         )
         VALUES ($1, 'UNITY_META_QUEST', 'PAID', $2, $3, $4, $5, $6, 'Checkout via Meta Quest VR')
         RETURNING id, order_number, total_amount, status, created_at`,
        [
          tenantId,
          payload.customerName,
          payload.customerEmail ?? null,
          payload.unitySessionId,
          payload.idempotencyKey,
          orderTotal,
        ]
      );

      const newOrder = orderInsert.rows[0];

      // 4. Insere itens, atualiza estoque e grava no Livro-Razão (stock_movements)
      for (const item of resolvedItems) {
        await client.query(
          `INSERT INTO order_items (tenant_id, order_id, variant_id, quantity, unit_price, subtotal)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            tenantId,
            newOrder.id,
            item.variantId,
            item.quantity,
            item.unitPrice,
            item.subtotal,
          ]
        );

        await client.query(
          `UPDATE product_variants
           SET stock_quantity = $1
           WHERE id = $2 AND tenant_id = $3`,
          [item.newStock, item.variantId, tenantId]
        );

        await client.query(
          `INSERT INTO stock_movements (
             tenant_id, variant_id, order_id, movement_type,
             quantity, previous_stock, new_stock, reason, reference_channel
           )
           VALUES ($1, $2, $3, 'SALE_OUT', $4, $5, $6, $7, 'UNITY_META_QUEST')`,
          [
            tenantId,
            item.variantId,
            newOrder.id,
            item.quantity,
            item.previousStock,
            item.newStock,
            `Baixa automática VR - Pedido #${newOrder.order_number} (Sessão: ${payload.unitySessionId})`,
          ]
        );
      }

      return {
        idempotentReplay: false,
        order: newOrder,
      };
    });

    res.status(checkoutResult.idempotentReplay ? 200 : 201).json({
      status: 'success',
      idempotentReplay: checkoutResult.idempotentReplay,
      order: {
        id: checkoutResult.order.id,
        orderNumber: Number(checkoutResult.order.order_number),
        totalAmount: Number(checkoutResult.order.total_amount),
        status: checkoutResult.order.status,
        createdAt: checkoutResult.order.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

