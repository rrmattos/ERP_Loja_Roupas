import { Router } from 'express';
import { query } from '../../config/database';
import { requireAuth } from '../../shared/middlewares/auth.middleware';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

function buildPeriodCondition(
  period: string | undefined,
  columnName: string
): string {
  switch (period) {
    case 'today':
      return `AND ${columnName} >= CURRENT_DATE`;
    case 'week':
      return `AND ${columnName} >= NOW() - INTERVAL '7 days'`;
    case 'month':
      return `AND ${columnName} >= DATE_TRUNC('month', NOW())`;
    case 'year':
      return `AND ${columnName} >= DATE_TRUNC('year', NOW())`;
    default:
      return '';
  }
}

/**
 * GET /api/v1/dashboard/summary
 * Retorna os indicadores do Resumo Inicial + dados completos para o Modal de Detalhes
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
           sm.unit_cost::float8 AS "unitCost",
           sm.reason,
           sm.created_at AS "createdAt",
           pv.id AS "variantId",
           pv.sku,
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
           u.name AS "createdByUserName",
           o.order_number::int AS "orderNumber",
           o.customer_name AS "customerName",
           o.customer_email AS "customerEmail",
           o.channel AS "orderChannel",
           o.total_amount::float8 AS "orderTotalAmount",
           order_user.name AS "orderSellerName"
         FROM stock_movements sm
         INNER JOIN product_variants pv ON pv.id = sm.variant_id
         INNER JOIN products p ON p.id = pv.product_id
         LEFT JOIN categories cat ON cat.id = p.category_id
         INNER JOIN sizes s ON s.id = pv.size_id
         INNER JOIN colors col ON col.id = pv.color_id
         LEFT JOIN suppliers sup ON sup.id = sm.supplier_id
         LEFT JOIN suppliers prod_sup ON prod_sup.id = p.supplier_id
         LEFT JOIN users u ON u.id = sm.created_by_user_id
         LEFT JOIN orders o ON o.id = sm.order_id
         LEFT JOIN users order_user ON order_user.id = o.created_by_user_id
         WHERE sm.tenant_id = $1
         ORDER BY sm.created_at DESC
         LIMIT 8`,
        [tenantId]
      ),

      query(
        `SELECT
           pv.id AS "variantId",
           pv.sku,
           pv.stock_quantity AS "stockQuantity",
           pv.min_stock_alert AS "minStockAlert",
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
           sup.name AS "supplierName",
           sup.phone AS "supplierPhone",
           sup.lead_time_days AS "leadTimeDays"
         FROM product_variants pv
         INNER JOIN products p ON p.id = pv.product_id
         LEFT JOIN categories cat ON cat.id = p.category_id
         LEFT JOIN suppliers sup ON sup.id = p.supplier_id
         INNER JOIN sizes s ON s.id = pv.size_id
         INNER JOIN colors col ON col.id = pv.color_id
         WHERE pv.tenant_id = $1
           AND pv.stock_quantity <= pv.min_stock_alert
         ORDER BY pv.stock_quantity ASC
         LIMIT 8`,
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

/**
 * GET /api/v1/dashboard/analytics
 * Retorna dados completos para a tela de Métricas, Gráficos (Pizza e Barras) e Relatórios
 */
dashboardRouter.get('/analytics', async (req, res, next) => {
  try {
    const { tenantId } = req.auth!;
    const period =
      typeof req.query.period === 'string' ? req.query.period : 'all';

    const orderDateFilter = buildPeriodCondition(period, 'o.created_at');
    const movDateFilter = buildPeriodCondition(period, 'sm.created_at');

    const [
      financialMetrics,
      salesByCategory,
      salesByChannel,
      topProducts,
      salesBySeller,
      movementsBreakdown,
      stockValuation,
    ] = await Promise.all([
      // 1. Faturamento, Custo das Mercadorias Vendidas (CMV) e Lucro Bruto
      query<{
        total_revenue: string;
        total_orders: string;
        avg_ticket: string;
        units_sold: string;
        total_cogs: string;
      }>(
        `SELECT
           COALESCE(SUM(oi.subtotal), 0)::numeric(12,2) AS total_revenue,
           COUNT(DISTINCT o.id)::int AS total_orders,
           CASE
             WHEN COUNT(DISTINCT o.id) > 0
             THEN (COALESCE(SUM(oi.subtotal), 0) / COUNT(DISTINCT o.id))::numeric(12,2)
             ELSE 0
           END AS avg_ticket,
           COALESCE(SUM(oi.quantity), 0)::int AS units_sold,
           COALESCE(SUM(oi.quantity * p.cost_price), 0)::numeric(12,2) AS total_cogs
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN product_variants pv ON pv.id = oi.variant_id
         LEFT JOIN products p ON p.id = pv.product_id
         WHERE o.tenant_id = $1 AND o.status <> 'CANCELLED' ${orderDateFilter}`,
        [tenantId]
      ),

      // 2. Vendas por Categoria de Roupa (Gráfico Pizza)
      query<{
        categoryName: string;
        unitsSold: number;
        revenue: number;
      }>(
        `SELECT
           COALESCE(cat.name, 'Sem Categoria') AS "categoryName",
           COALESCE(SUM(oi.quantity), 0)::int AS "unitsSold",
           COALESCE(SUM(oi.subtotal), 0)::float8 AS revenue
         FROM order_items oi
         INNER JOIN orders o ON o.id = oi.order_id
         INNER JOIN product_variants pv ON pv.id = oi.variant_id
         INNER JOIN products p ON p.id = pv.product_id
         LEFT JOIN categories cat ON cat.id = p.category_id
         WHERE o.tenant_id = $1 AND o.status <> 'CANCELLED' ${orderDateFilter}
         GROUP BY cat.name
         ORDER BY revenue DESC`,
        [tenantId]
      ),

      // 3. Vendas por Canal (Gráfico Pizza)
      query<{
        channel: string;
        ordersCount: number;
        revenue: number;
      }>(
        `SELECT
           o.channel,
           COUNT(*)::int AS "ordersCount",
           COALESCE(SUM(o.total_amount), 0)::float8 AS revenue
         FROM orders o
         WHERE o.tenant_id = $1 AND o.status <> 'CANCELLED' ${orderDateFilter}
         GROUP BY o.channel
         ORDER BY revenue DESC`,
        [tenantId]
      ),

      // 4. Ranking de Produtos Mais Vendidos (Curva ABC / Gráfico de Barras)
      query<{
        productId: string;
        productName: string;
        categoryName: string;
        unitsSold: number;
        revenue: number;
        estimatedProfit: number;
      }>(
        `SELECT
           p.id AS "productId",
           p.name AS "productName",
           COALESCE(cat.name, 'Geral') AS "categoryName",
           COALESCE(SUM(oi.quantity), 0)::int AS "unitsSold",
           COALESCE(SUM(oi.subtotal), 0)::float8 AS revenue,
           COALESCE(SUM(oi.subtotal - (oi.quantity * p.cost_price)), 0)::float8 AS "estimatedProfit"
         FROM order_items oi
         INNER JOIN orders o ON o.id = oi.order_id
         INNER JOIN product_variants pv ON pv.id = oi.variant_id
         INNER JOIN products p ON p.id = pv.product_id
         LEFT JOIN categories cat ON cat.id = p.category_id
         WHERE o.tenant_id = $1 AND o.status <> 'CANCELLED' ${orderDateFilter}
         GROUP BY p.id, p.name, cat.name
         ORDER BY revenue DESC
         LIMIT 10`,
        [tenantId]
      ),

      // 5. Desempenho de Vendas por Funcionário / Vendedor
      query<{
        sellerName: string;
        ordersCount: number;
        revenue: number;
      }>(
        `SELECT
           COALESCE(u.name, 'Venda Online / Automática') AS "sellerName",
           COUNT(o.id)::int AS "ordersCount",
           COALESCE(SUM(o.total_amount), 0)::float8 AS revenue
         FROM orders o
         LEFT JOIN users u ON u.id = o.created_by_user_id
         WHERE o.tenant_id = $1 AND o.status <> 'CANCELLED' ${orderDateFilter}
         GROUP BY u.name
         ORDER BY revenue DESC`,
        [tenantId]
      ),

      // 6. Resumo de Movimentações de Estoque no Período
      query<{
        movementType: string;
        operationsCount: number;
        totalUnits: number;
      }>(
        `SELECT
           sm.movement_type AS "movementType",
           COUNT(*)::int AS "operationsCount",
           COALESCE(SUM(sm.quantity), 0)::int AS "totalUnits"
         FROM stock_movements sm
         WHERE sm.tenant_id = $1 ${movDateFilter}
         GROUP BY sm.movement_type
         ORDER BY "totalUnits" DESC`,
        [tenantId]
      ),

      // 7. Posição de Estoque por Categoria (Relatório de Valoração)
      query<{
        categoryName: string;
        modelsCount: number;
        unitsInStock: number;
        costValue: number;
        retailValue: number;
      }>(
        `SELECT
           COALESCE(cat.name, 'Sem Categoria') AS "categoryName",
           COUNT(DISTINCT p.id)::int AS "modelsCount",
           COALESCE(SUM(pv.stock_quantity), 0)::int AS "unitsInStock",
           COALESCE(SUM(pv.stock_quantity * p.cost_price), 0)::float8 AS "costValue",
           COALESCE(SUM(pv.stock_quantity * COALESCE(pv.price_override, p.base_price)), 0)::float8 AS "retailValue"
         FROM products p
         LEFT JOIN categories cat ON cat.id = p.category_id
         LEFT JOIN product_variants pv ON pv.product_id = p.id
         WHERE p.tenant_id = $1 AND p.active = TRUE
         GROUP BY cat.name
         ORDER BY "retailValue" DESC`,
        [tenantId]
      ),
    ]);

    const fin = financialMetrics.rows[0];
    const totalRevenue = Number(fin?.total_revenue ?? 0);
    const totalCogs = Number(fin?.total_cogs ?? 0);
    const grossProfit = Number((totalRevenue - totalCogs).toFixed(2));
    const profitMarginPercent =
      totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 100) : 0;

    res.json({
      period,
      kpis: {
        totalRevenue,
        totalCogs,
        grossProfit,
        profitMarginPercent,
        totalOrders: Number(fin?.total_orders ?? 0),
        averageTicket: Number(fin?.avg_ticket ?? 0),
        unitsSold: Number(fin?.units_sold ?? 0),
      },
      salesByCategory: salesByCategory.rows,
      salesByChannel: salesByChannel.rows,
      topProducts: topProducts.rows,
      salesBySeller: salesBySeller.rows,
      movementsBreakdown: movementsBreakdown.rows,
      stockValuation: stockValuation.rows,
    });
  } catch (error) {
    next(error);
  }
});
