import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../../config/database';
import { AppError } from '../../shared/errors/AppError';
import { requireAuth } from '../../shared/middlewares/auth.middleware';

export const inventoryRouter = Router();

inventoryRouter.use(requireAuth);

const createMovementSchema = z.object({
  variantId: z.string().uuid('Selecione uma variação (SKU) válida'),
  movementType: z.enum([
    'PURCHASE_IN',
    'RETURN_IN',
    'ADJUSTMENT_IN',
    'ADJUSTMENT_OUT',
  ]),
  quantity: z.coerce
    .number()
    .int()
    .min(1, 'A quantidade deve ser de pelo menos 1 unidade')
    .max(10000),
  supplierId: z.string().uuid().optional().nullable(),
  unitCost: z.coerce.number().min(0).optional().nullable(),
  invoiceNumber: z.string().max(40).optional().nullable(),
  tagCode: z
    .string()
    .min(2, 'Informe o código da etiqueta ou código de barras da peça')
    .max(60),
  employeeId: z.string().uuid().optional().nullable(),
  reason: z
    .string()
    .min(3, 'Informe uma justificativa ou observação da operação')
    .max(250),
});

/**
 * GET /api/v1/inventory/movements
 * Lista o Livro-Razão (Ledger) de todas as movimentações de estoque da loja
 */
inventoryRouter.get('/movements', async (req, res, next) => {
  try {
    const { tenantId } = req.auth!;
    const movementType =
      typeof req.query.movementType === 'string' && req.query.movementType !== 'ALL'
        ? req.query.movementType
        : null;

    const result = await query(
      `SELECT
         sm.id,
         sm.movement_type AS "movementType",
         sm.quantity,
         sm.previous_stock AS "previousStock",
         sm.new_stock AS "newStock",
         sm.unit_cost::float8 AS "unitCost",
         COALESCE(sm.invoice_number, o.invoice_number) AS "invoiceNumber",
         COALESCE(sm.tag_code, pv.barcode_ean, pv.sku) AS "tagCode",
         sm.reason,
         sm.reference_channel AS "referenceChannel",
         sm.created_at AS "createdAt",
         pv.id AS "variantId",
         pv.sku,
         pv.barcode_ean AS "barcodeEan",
         pv.stock_quantity AS "currentStock",
         p.id AS "productId",
         p.name AS "productName",
         p.description AS "productDescription",
         p.image_url AS "productImageUrl",
         p.base_price::float8 AS "basePrice",
         p.cost_price::float8 AS "costPrice",
         cat.name AS "categoryName",
         s.code AS "sizeCode",
         s.name AS "sizeName",
         col.name AS "colorName",
         col.hex_code AS "colorHex",
         COALESCE(sup.name, prod_sup.name) AS "supplierName",
         COALESCE(sup.phone, prod_sup.phone) AS "supplierPhone",
         o.order_number::int AS "orderNumber",
         o.customer_name AS "customerName",
         o.channel AS "orderChannel",
         o.total_amount::float8 AS "orderTotalAmount",
         u.name AS "createdByUserName",
         order_user.name AS "orderSellerName"
       FROM stock_movements sm
       INNER JOIN product_variants pv ON pv.id = sm.variant_id
       INNER JOIN products p ON p.id = pv.product_id
       LEFT JOIN categories cat ON cat.id = p.category_id
       INNER JOIN sizes s ON s.id = pv.size_id
       INNER JOIN colors col ON col.id = pv.color_id
       LEFT JOIN suppliers sup ON sup.id = sm.supplier_id
       LEFT JOIN suppliers prod_sup ON prod_sup.id = p.supplier_id
       LEFT JOIN orders o ON o.id = sm.order_id
       LEFT JOIN users u ON u.id = sm.created_by_user_id
       LEFT JOIN users order_user ON order_user.id = o.created_by_user_id
       WHERE sm.tenant_id = $1
         AND ($2::stock_movement_type IS NULL OR sm.movement_type = $2::stock_movement_type)
       ORDER BY sm.created_at DESC
       LIMIT 100`,
      [tenantId, movementType]
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/inventory/low-stock
 * Retorna SKUs que atingiram ou ficaram abaixo do estoque mínimo configurado
 */
inventoryRouter.get('/low-stock', async (req, res, next) => {
  try {
    const { tenantId } = req.auth!;

    const result = await query(
      `SELECT
         pv.id AS "variantId",
         pv.sku,
         pv.stock_quantity AS "stockQuantity",
         pv.min_stock_alert AS "minStockAlert",
         p.id AS "productId",
         p.name AS "productName",
         p.image_url AS "productImageUrl",
         s.code AS "sizeCode",
         col.name AS "colorName",
         col.hex_code AS "colorHex",
         sup.name AS "supplierName",
         sup.lead_time_days AS "leadTimeDays"
       FROM product_variants pv
       INNER JOIN products p ON p.id = pv.product_id
       INNER JOIN sizes s ON s.id = pv.size_id
       INNER JOIN colors col ON col.id = pv.color_id
       LEFT JOIN suppliers sup ON sup.id = p.supplier_id
       WHERE pv.tenant_id = $1
         AND pv.active = TRUE
         AND p.active = TRUE
         AND pv.stock_quantity <= pv.min_stock_alert
       ORDER BY pv.stock_quantity ASC, p.name ASC`,
      [tenantId]
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/inventory/movements
 * Registra Entrada de Fornecedor (Compra), Devolução de Cliente (exigindo NF), Entrada Manual ou Baixa por Defeito
 * utilizando Lock Transacional (SELECT ... FOR UPDATE)
 */
inventoryRouter.post('/movements', async (req, res, next) => {
  try {
    const { tenantId, userId } = req.auth!;
    const body = createMovementSchema.parse(req.body);
    const effectiveEmployeeId = body.employeeId || userId;
    const rawInvoice = body.invoiceNumber?.trim() || null;

    if (body.movementType === 'RETURN_IN' && !rawInvoice) {
      throw new AppError(
        'Para registrar Devolução de Cliente é obrigatório informar o Número da Nota Fiscal (NF) da venda.',
        400,
        'INVOICE_REQUIRED_FOR_RETURN'
      );
    }

    if (body.movementType === 'PURCHASE_IN' && !rawInvoice) {
      throw new AppError(
        'Para registrar Chegada de Mercadoria é obrigatório informar o Número da Nota Fiscal do fornecedor.',
        400,
        'SUPPLIER_INVOICE_REQUIRED'
      );
    }

    const movementResult = await withTransaction(async (client) => {
      let linkedOrderId: string | null = null;
      let resolvedInvoiceNumber: string | null = rawInvoice;

      // Se for devolução de cliente, valida se a Nota Fiscal existe nas vendas da loja
      if (body.movementType === 'RETURN_IN' && rawInvoice) {
        const normalizedNf = rawInvoice.toUpperCase().startsWith('NF-')
          ? rawInvoice.toUpperCase()
          : `NF-${rawInvoice.replace(/\D/g, '').padStart(6, '0')}`;

        const orderRes = await client.query<{
          id: string;
          invoice_number: string;
          customer_name: string | null;
        }>(
          `SELECT id, invoice_number, customer_name
           FROM orders
           WHERE tenant_id = $1
             AND (
               UPPER(invoice_number) = UPPER($2)
               OR UPPER(invoice_number) = UPPER($3)
             )
           LIMIT 1`,
          [tenantId, rawInvoice, normalizedNf]
        );

        const matchedOrder = orderRes.rows[0];
        if (!matchedOrder) {
          throw new AppError(
            `Nota Fiscal "${rawInvoice}" não encontrada nas vendas emitidas da loja. Emita ou confira o número da NF antes de efetuar a devolução.`,
            404,
            'RETURN_INVOICE_NOT_FOUND'
          );
        }

        linkedOrderId = matchedOrder.id;
        resolvedInvoiceNumber = matchedOrder.invoice_number;
      }

      const varRes = await client.query<{
        id: string;
        sku: string;
        stock_quantity: number;
      }>(
        `SELECT id, sku, stock_quantity
         FROM product_variants
         WHERE id = $1 AND tenant_id = $2
         FOR UPDATE`,
        [body.variantId, tenantId]
      );

      const variant = varRes.rows[0];
      if (!variant) {
        throw new AppError('Variação (SKU) não encontrada nesta loja.', 404, 'VARIANT_NOT_FOUND');
      }

      const isOutflow = body.movementType === 'ADJUSTMENT_OUT';
      const previousStock = variant.stock_quantity;
      const newStock = isOutflow
        ? previousStock - body.quantity
        : previousStock + body.quantity;

      if (newStock < 0) {
        throw new AppError(
          `Saldo insuficiente para realizar baixa de ${body.quantity} un. na etiqueta ${variant.sku} (Saldo atual: ${previousStock}).`,
          409,
          'INSUFFICIENT_STOCK_FOR_ADJUSTMENT'
        );
      }

      await client.query(
        `UPDATE product_variants
         SET stock_quantity = $1
         WHERE id = $2 AND tenant_id = $3`,
        [newStock, variant.id, tenantId]
      );

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO stock_movements (
           tenant_id, variant_id, supplier_id, order_id, movement_type,
           quantity, previous_stock, new_stock, unit_cost,
           invoice_number, tag_code, reason, created_by_user_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id`,
        [
          tenantId,
          variant.id,
          body.supplierId || null,
          linkedOrderId,
          body.movementType,
          body.quantity,
          previousStock,
          newStock,
          body.unitCost ?? null,
          resolvedInvoiceNumber,
          body.tagCode.trim().toUpperCase(),
          body.reason.trim(),
          effectiveEmployeeId,
        ]
      );

      return {
        movementId: inserted.rows[0].id,
        sku: variant.sku,
        previousStock,
        newStock,
      };
    });

    res.status(201).json({
      status: 'success',
      ...movementResult,
    });
  } catch (error) {
    next(error);
  }
});

