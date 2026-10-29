import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../../config/database';
import { AppError } from '../../shared/errors/AppError';
import { requireAuth } from '../../shared/middlewares/auth.middleware';

export const ordersRouter = Router();

ordersRouter.use(requireAuth);

const createPosOrderSchema = z.object({
  customerName: z.string().min(2, 'Informe o nome do cliente').max(120),
  customerEmail: z.string().email().max(160).optional().or(z.literal('')),
  channel: z
    .enum(['ERP_POS', 'WEB_ECOMMERCE', 'UNITY_META_QUEST'])
    .default('ERP_POS'),
  notes: z.string().max(400).optional(),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantity: z.coerce.number().int().min(1).max(100),
      })
    )
    .min(1, 'Adicione ao menos 1 item ao pedido')
    .max(30),
});

/**
 * GET /api/v1/orders
 * Lista pedidos de venda da loja com os itens detalhados
 */
ordersRouter.get('/', async (req, res, next) => {
  try {
    const { tenantId } = req.auth!;

    const result = await query(
      `SELECT
         o.id,
         o.order_number::int AS "orderNumber",
         o.channel,
         o.status,
         o.customer_name AS "customerName",
         o.customer_email AS "customerEmail",
         o.unity_session_id AS "unitySessionId",
         o.total_amount::float8 AS "totalAmount",
         o.notes,
         o.created_at AS "createdAt",
         u.name AS "createdByUserName",
         COALESCE(
           json_agg(
             json_build_object(
               'id', oi.id,
               'variantId', pv.id,
               'sku', pv.sku,
               'productName', p.name,
               'sizeCode', s.code,
               'colorName', col.name,
               'colorHex', col.hex_code,
               'quantity', oi.quantity,
               'unitPrice', oi.unit_price::float8,
               'subtotal', oi.subtotal::float8
             )
           ) FILTER (WHERE oi.id IS NOT NULL),
           '[]'::json
         ) AS items
       FROM orders o
       LEFT JOIN users u ON u.id = o.created_by_user_id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN product_variants pv ON pv.id = oi.variant_id
       LEFT JOIN products p ON p.id = pv.product_id
       LEFT JOIN sizes s ON s.id = pv.size_id
       LEFT JOIN colors col ON col.id = pv.color_id
       WHERE o.tenant_id = $1
       GROUP BY o.id, u.name
       ORDER BY o.created_at DESC
       LIMIT 100`,
      [tenantId]
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/orders
 * Cria um novo pedido no PDV (Frente de Caixa) com baixa automática de estoque
 */
ordersRouter.post('/', async (req, res, next) => {
  try {
    const { tenantId, userId } = req.auth!;
    const body = createPosOrderSchema.parse(req.body);

    const createdOrder = await withTransaction(async (client) => {
      let totalAmount = 0;
      const resolvedItems: Array<{
        variantId: string;
        sku: string;
        quantity: number;
        unitPrice: number;
        subtotal: number;
        previousStock: number;
        newStock: number;
      }> = [];

      for (const item of body.items) {
        const varRes = await client.query<{
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
           WHERE pv.id = $1 AND pv.tenant_id = $2 AND pv.active = TRUE
           FOR UPDATE OF pv`,
          [item.variantId, tenantId]
        );

        const variant = varRes.rows[0];
        if (!variant) {
          throw new AppError('Variação (SKU) não encontrada.', 404, 'VARIANT_NOT_FOUND');
        }

        if (variant.stock_quantity < item.quantity) {
          throw new AppError(
            `Estoque insuficiente para '${variant.product_name}' (${variant.sku}). Disponível: ${variant.stock_quantity}, Solicitado: ${item.quantity}.`,
            409,
            'INSUFFICIENT_STOCK'
          );
        }

        const unitPrice = Number(variant.unit_price);
        const subtotal = Number((unitPrice * item.quantity).toFixed(2));
        const previousStock = variant.stock_quantity;
        const newStock = previousStock - item.quantity;

        totalAmount = Number((totalAmount + subtotal).toFixed(2));

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

      const idempotencyKey = `POS-${crypto.randomUUID()}`;
      const orderRes = await client.query<{
        id: string;
        order_number: string;
        total_amount: string;
      }>(
        `INSERT INTO orders (
           tenant_id, channel, status, customer_name, customer_email,
           idempotency_key, total_amount, notes, created_by_user_id
         )
         VALUES ($1, $2, 'PAID', $3, $4, $5, $6, $7, $8)
         RETURNING id, order_number, total_amount`,
        [
          tenantId,
          body.channel,
          body.customerName.trim(),
          body.customerEmail || null,
          idempotencyKey,
          totalAmount,
          body.notes?.trim() || null,
          userId,
        ]
      );

      const newOrder = orderRes.rows[0];

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
             quantity, previous_stock, new_stock, reason, reference_channel, created_by_user_id
           )
           VALUES ($1, $2, $3, 'SALE_OUT', $4, $5, $6, $7, $8, $9)`,
          [
            tenantId,
            item.variantId,
            newOrder.id,
            item.quantity,
            item.previousStock,
            item.newStock,
            `Venda PDV #${newOrder.order_number} - Cliente: ${body.customerName.trim()}`,
            body.channel,
            userId,
          ]
        );
      }

      return {
        orderId: newOrder.id,
        orderNumber: Number(newOrder.order_number),
        totalAmount: Number(newOrder.total_amount),
      };
    });

    res.status(201).json({
      status: 'success',
      ...createdOrder,
    });
  } catch (error) {
    next(error);
  }
});

