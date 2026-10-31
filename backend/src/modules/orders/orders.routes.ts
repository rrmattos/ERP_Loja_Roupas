import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../../config/database';
import { AppError } from '../../shared/errors/AppError';
import { requireAuth } from '../../shared/middlewares/auth.middleware';

export const ordersRouter = Router();

ordersRouter.use(requireAuth);

const createPosOrderSchema = z.object({
  sellerId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  customerName: z.string().min(2, 'Informe o nome do cliente').max(120),
  customerDocument: z
    .string()
    .optional()
    .transform((v) => (v ? v.replace(/\D/g, '').slice(0, 14) : '')),
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
 * Lista pedidos com filtros (período, cliente, funcionário, busca) e paginação
 */
ordersRouter.get('/', async (req, res, next) => {
  try {
    const { tenantId } = req.auth!;

    const period =
      typeof req.query.period === 'string' ? req.query.period : 'all';
    const customerFilter =
      typeof req.query.customer === 'string' && req.query.customer !== 'ALL'
        ? req.query.customer.trim()
        : null;
    const sellerFilter =
      typeof req.query.sellerId === 'string' && req.query.sellerId !== 'ALL'
        ? req.query.sellerId.trim()
        : null;
    const searchFilter =
      typeof req.query.search === 'string' && req.query.search.trim() !== ''
        ? `%${req.query.search.trim()}%`
        : null;

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    let periodSql = '';
    if (period === 'today') {
      periodSql = `AND o.created_at >= CURRENT_DATE`;
    } else if (period === 'week') {
      periodSql = `AND o.created_at >= NOW() - INTERVAL '7 days'`;
    } else if (period === 'month') {
      periodSql = `AND o.created_at >= DATE_TRUNC('month', NOW())`;
    } else if (period === 'year') {
      periodSql = `AND o.created_at >= DATE_TRUNC('year', NOW())`;
    }

    const whereClause = `
      WHERE o.tenant_id = $1
        ${periodSql}
        AND ($2::text IS NULL OR LOWER(COALESCE(o.customer_name, '')) = LOWER($2))
        AND ($3::uuid IS NULL OR o.created_by_user_id = $3)
        AND (
          $4::text IS NULL
          OR COALESCE(o.customer_name, '') ILIKE $4
          OR o.order_number::text ILIKE $4
          OR COALESCE(o.invoice_number, '') ILIKE $4
        )
    `;

    const [countRes, ordersRes, sellersRes, customersRes] = await Promise.all([
      query<{ total: string; sum_amount: string }>(
        `SELECT
           COUNT(*)::int AS total,
           COALESCE(SUM(o.total_amount), 0)::float8 AS sum_amount
         FROM orders o
         ${whereClause}`,
        [tenantId, customerFilter, sellerFilter, searchFilter]
      ),

      query(
        `SELECT
           o.id,
           o.order_number::int AS "orderNumber",
           o.channel,
           o.status,
           o.customer_id AS "customerId",
           o.customer_name AS "customerName",
           o.customer_email AS "customerEmail",
           COALESCE(o.customer_document, c.document) AS "customerDocument",
           o.invoice_number AS "invoiceNumber",
           COALESCE(o.invoice_series, '001') AS "invoiceSeries",
           o.invoice_access_key AS "invoiceAccessKey",
           o.invoice_issued_at AS "invoiceIssuedAt",
           o.unity_session_id AS "unitySessionId",
           o.total_amount::float8 AS "totalAmount",
           o.notes,
           o.created_at AS "createdAt",
           o.created_by_user_id AS "createdByUserId",
           COALESCE(u.name, 'Venda Online / Automática') AS "createdByUserName",
           COALESCE(
             json_agg(
               json_build_object(
                 'id', oi.id,
                 'variantId', pv.id,
                 'sku', pv.sku,
                 'barcodeEan', pv.barcode_ean,
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
         LEFT JOIN customers c ON c.id = o.customer_id
         LEFT JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN product_variants pv ON pv.id = oi.variant_id
         LEFT JOIN products p ON p.id = pv.product_id
         LEFT JOIN sizes s ON s.id = pv.size_id
         LEFT JOIN colors col ON col.id = pv.color_id
         ${whereClause}
         GROUP BY o.id, u.name, c.document
         ORDER BY o.created_at DESC
         LIMIT $5 OFFSET $6`,
        [tenantId, customerFilter, sellerFilter, searchFilter, limit, offset]
      ),

      query<{ id: string; name: string; jobTitle: string; role: string }>(
        `SELECT id, name, COALESCE(job_title, 'Vendedor(a)') AS "jobTitle", role
         FROM users
         WHERE tenant_id = $1 AND active = TRUE
         ORDER BY name ASC`,
        [tenantId]
      ),

      query<{
        id: string;
        name: string;
        phone: string | null;
        document: string | null;
      }>(
        `SELECT id, name, phone, document FROM customers WHERE tenant_id = $1 AND active = TRUE ORDER BY name ASC`,
        [tenantId]
      ),
    ]);

    const totalItems = Number(countRes.rows[0]?.total ?? 0);
    const filteredRevenue = Number(countRes.rows[0]?.sum_amount ?? 0);
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    res.json({
      orders: ordersRes.rows,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        filteredRevenue,
      },
      filterOptions: {
        sellers: sellersRes.rows,
        customers: customersRes.rows,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/orders
 * Cria um novo pedido no Caixa com baixa automática de estoque e vínculo ao Cliente e Vendedor
 */
ordersRouter.post('/', async (req, res, next) => {
  try {
    const { tenantId, userId } = req.auth!;
    const body = createPosOrderSchema.parse(req.body);
    const effectiveSellerId = body.sellerId || userId;

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
           tenant_id, channel, status, customer_id, customer_name, customer_email,
           customer_document, idempotency_key, total_amount, notes, created_by_user_id
         )
         VALUES ($1, $2, 'PAID', $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, order_number, total_amount`,
        [
          tenantId,
          body.channel,
          body.customerId || null,
          body.customerName.trim(),
          body.customerEmail || null,
          body.customerDocument?.trim() || null,
          idempotencyKey,
          totalAmount,
          body.notes?.trim() || null,
          effectiveSellerId,
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
             quantity, previous_stock, new_stock, tag_code, reason, reference_channel, created_by_user_id
           )
           VALUES ($1, $2, $3, 'SALE_OUT', $4, $5, $6, $7, $8, $9, $10)`,
          [
            tenantId,
            item.variantId,
            newOrder.id,
            item.quantity,
            item.previousStock,
            item.newStock,
            item.sku,
            `Venda #${newOrder.order_number} para ${body.customerName.trim()}`,
            body.channel,
            effectiveSellerId,
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

/**
 * POST /api/v1/orders/:id/issue-invoice
 * Emite (ou retorna caso já emitida) a Nota Fiscal Eletrônica Simulada (NF-e / DANFE) de uma venda
 */
ordersRouter.post('/:id/issue-invoice', async (req, res, next) => {
  try {
    const { tenantId } = req.auth!;
    const orderId = req.params.id;
    const customerDocument =
      typeof req.body?.customerDocument === 'string' &&
      req.body.customerDocument.trim() !== ''
        ? req.body.customerDocument.trim()
        : null;

    const updated = await withTransaction(async (client) => {
      const ordRes = await client.query<{
        id: string;
        order_number: string;
        invoice_number: string | null;
        invoice_series: string | null;
        invoice_access_key: string | null;
        invoice_issued_at: Date | null;
        customer_document: string | null;
      }>(
        `SELECT id, order_number, invoice_number, invoice_series, invoice_access_key, invoice_issued_at, customer_document
         FROM orders
         WHERE id = $1 AND tenant_id = $2
         FOR UPDATE`,
        [orderId, tenantId]
      );

      const order = ordRes.rows[0];
      if (!order) {
        throw new AppError('Venda não encontrada.', 404, 'ORDER_NOT_FOUND');
      }

      const invoiceNumber =
        order.invoice_number ||
        `NF-${String(100 + Number(order.order_number)).padStart(6, '0')}`;
      const invoiceSeries = order.invoice_series || '001';
      const paddedOrder = String(100 + Number(order.order_number)).padStart(8, '0');
      const randomCheck = String(Math.floor(10000000 + Math.random() * 89999999));
      const invoiceAccessKey =
        order.invoice_access_key ||
        `3526102845678900015555001${paddedOrder}1${randomCheck}`;

      const updateRes = await client.query(
        `UPDATE orders
         SET invoice_number = $1,
             invoice_series = $2,
             invoice_access_key = $3,
             invoice_issued_at = COALESCE(invoice_issued_at, NOW()),
             customer_document = COALESCE($4, customer_document)
         WHERE id = $5 AND tenant_id = $6
         RETURNING
           id,
           order_number::int AS "orderNumber",
           invoice_number AS "invoiceNumber",
           invoice_series AS "invoiceSeries",
           invoice_access_key AS "invoiceAccessKey",
           invoice_issued_at AS "invoiceIssuedAt",
           customer_document AS "customerDocument"`,
        [
          invoiceNumber,
          invoiceSeries,
          invoiceAccessKey,
          customerDocument,
          orderId,
          tenantId,
        ]
      );

      await client.query(
        `UPDATE stock_movements
         SET invoice_number = $1
         WHERE order_id = $2 AND tenant_id = $3`,
        [invoiceNumber, orderId, tenantId]
      );

      return updateRes.rows[0];
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});
