import { Router } from 'express';
import { query } from '../../config/database';
import { requireAuth } from '../../shared/middlewares/auth.middleware';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

/**
 * GET /api/v1/dashboard/summary
 * Retorna KPIs executivos, giro de estoque, vendas por canal e credenciais de integração Unity 3D
 */
dashboardRouter.get('/summary', async (req, res, next) => {
  try {
    const { tenantId } = req.auth!;

    const [
      salesSummary,
      inventorySummary,
      salesByChannel,
      recentMovements,
      lowStockItems,
      tenantInfo,
    ] = await Promise.all([
      query<{
        total_revenue: string;
        total_orders: string;
        avg_ticket: string;
      }>(
        `SELECT
           COALESCE(SUM(total_amount), 0)::numeric(12,2) AS total_revenue,
           COUNT(*)::int AS total_orders,
           COALESCE(AVG(total_amount), 0)::numeric(12,2) AS avg_ticket
         FROM orders
         WHERE tenant_id = $1 AND status <> 'CANCELLED'`,
        [tenantId]
      ),

      query<{
        total_products: string;
        total_variants: string;
        total_units: string;
        retail_value: string;
        cost_value: string;
        low_stock_count: string;
      }>(
        `SELECT
           (SELECT COUNT(*) FROM products WHERE tenant_id = $1) AS total_products,
           COUNT(pv.id) AS total_variants,
           COALESCE(SUM(pv.stock_quantity), 0) AS total_units,
           COALESCE(SUM(pv.stock_quantity * COALESCE(pv.price_override, p.base_price)), 0)::numeric(12,2) AS retail_value,
           COALESCE(SUM(pv.stock_quantity * p.cost_price), 0)::numeric(12,2) AS cost_value,
           COUNT(pv.id) FILTER (WHERE pv.stock_quantity <= pv.min_stock_alert) AS low_stock_count
         FROM product_variants pv
         INNER JOIN products p ON p.id = pv.product_id
         WHERE pv.tenant_id = $1 AND pv.active = TRUE AND p.active = TRUE`,
        [tenantId]
      ),

      query<{
        channel: string;
        orders_count: number;
        revenue: number;
      }>(
        `SELECT
           channel,
           COUNT(*)::int AS orders_count,
           COALESCE(SUM(total_amount), 0)::float8 AS revenue
         FROM orders
         WHERE tenant_id = $1 AND status <> 'CANCELLED'
         GROUP BY channel
         ORDER BY revenue DESC`,
        [tenantId]
      ),

      query(
        `SELECT
           sm.id,
           sm.movement_type AS "movementType",
           sm.quantity,
           sm.previous_stock AS "previousStock",
           sm.new_stock AS "newStock",
           sm.reason,
           sm.created_at AS "createdAt",
           pv.sku,
           p.name AS "productName",
           s.code AS "sizeCode",
           col.name AS "colorName",
           col.hex_code AS "colorHex"
         FROM stock_movements sm
         INNER JOIN product_variants pv ON pv.id = sm.variant_id
         INNER JOIN products p ON p.id = pv.product_id
         INNER JOIN sizes s ON s.id = pv.size_id
         INNER JOIN colors col ON col.id = pv.color_id
         WHERE sm.tenant_id = $1
         ORDER BY sm.created_at DESC
         LIMIT 6`,
        [tenantId]
      ),

      query(
        `SELECT
           pv.id AS "variantId",
           pv.sku,
           pv.stock_quantity AS "stockQuantity",
           pv.min_stock_alert AS "minStockAlert",
           p.name AS "productName",
           s.code AS "sizeCode",
           col.name AS "colorName",
           col.hex_code AS "colorHex"
         FROM product_variants pv
         INNER JOIN products p ON p.id = pv.product_id
         INNER JOIN sizes s ON s.id = pv.size_id
         INNER JOIN colors col ON col.id = pv.color_id
         WHERE pv.tenant_id = $1
           AND pv.stock_quantity <= pv.min_stock_alert
         ORDER BY pv.stock_quantity ASC
         LIMIT 6`,
        [tenantId]
      ),

      query<{
        slug: string;
        is_demo: boolean;
        is_sandbox: boolean;
        max_products: number;
        unity_api_key: string;
        expires_at: Date | null;
      }>(
        `SELECT slug, is_demo, is_sandbox, max_products, unity_api_key, expires_at
         FROM tenants WHERE id = $1 LIMIT 1`,
        [tenantId]
      ),
    ]);

    const sRow = salesSummary.rows[0];
    const iRow = inventorySummary.rows[0];
    const tRow = tenantInfo.rows[0];

    res.json({
      financial: {
        totalRevenue: Number(sRow?.total_revenue ?? 0),
        totalOrders: Number(sRow?.total_orders ?? 0),
        averageTicket: Number(sRow?.avg_ticket ?? 0),
      },
      inventory: {
        totalProducts: Number(iRow?.total_products ?? 0),
        maxProducts: Number(tRow?.max_products ?? 15),
        totalVariants: Number(iRow?.total_variants ?? 0),
        totalUnitsInStock: Number(iRow?.total_units ?? 0),
        retailStockValue: Number(iRow?.retail_value ?? 0),
        costStockValue: Number(iRow?.cost_value ?? 0),
        lowStockCount: Number(iRow?.low_stock_count ?? 0),
      },
      salesByChannel: salesByChannel.rows,
      recentMovements: recentMovements.rows,
      lowStockAlerts: lowStockItems.rows,
      unityIntegration: {
        tenantSlug: tRow?.slug ?? 'demo-store',
        unityApiKey: tRow?.unity_api_key ?? '',
        catalogEndpoint: '/api/v1/unity/catalog',
        checkoutEndpoint: '/api/v1/unity/checkout',
      },
    });
  } catch (error) {
    next(error);
  }
});

