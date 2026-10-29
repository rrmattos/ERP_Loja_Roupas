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
  reason: z
    .string()
    .min(3, 'Informe uma justificativa ou nota fiscal para auditoria')
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
         sm.reason,
         sm.reference_channel AS "referenceChannel",
         sm.created_at AS "createdAt",
         pv.id AS "variantId",
         pv.sku,
         p.id AS "productId",
         p.name AS "productName",
         p.image_url AS "productImageUrl",
         s.code AS "sizeCode",
         col.name AS "colorName",
         col.hex_code AS "colorHex",
         sup.name AS "supplierName",
         o.order_number AS "orderNumber",
         u.name AS "createdByUserName"
       FROM stock_movements sm
       INNER JOIN product_variants pv ON pv.id = sm.variant_id
       INNER JOIN products p ON p.id = pv.product_id
       INNER JOIN sizes s ON s.id = pv.size_id
       INNER JOIN colors col ON col.id = pv.color_id
       LEFT JOIN suppliers sup ON sup.id = sm.supplier_id
       LEFT JOIN orders o ON o.id = sm.order_id
       LEFT JOIN users u ON u.id = sm.created_by_user_id
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
 * Registra Entrada de Fornecedor (Compra), Devolução ou Ajuste de Inventário
 * utilizando Lock Transacional (SELECT ... FOR UPDATE)
 */
inventoryRouter.post('/movements', async (req, res, next) => {
  try {
    const { tenantId, userId } = req.auth!;
    const body = createMovementSchema.parse(req.body);

    const movementResult = await withTransaction(async (client) => {
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
          `Saldo insuficiente para realizar baixa de ${body.quantity} un. no SKU ${variant.sku} (Saldo atual: ${previousStock}).`,
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
           tenant_id, variant_id, supplier_id, movement_type,
           quantity, previous_stock, new_stock, unit_cost, reason, created_by_user_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          tenantId,
          variant.id,
          body.supplierId || null,
          body.movementType,
          body.quantity,
          previousStock,
          newStock,
          body.unitCost ?? null,
          body.reason.trim(),
          userId,
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

