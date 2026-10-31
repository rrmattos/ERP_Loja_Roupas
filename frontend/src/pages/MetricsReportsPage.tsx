import React, { useEffect, useRef, useState } from 'react';
import {
  Award,
  BarChart3,
  FileSpreadsheet,
  PieChart,
  Printer,
  RefreshCw,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  CsvExportBar,
  ITEMS_PER_PAGE,
  PaginationBar,
} from '../components/ListPaginationAndCsv';
import { apiRequest, formatCurrencyBRL } from '../services/api';
import { AnalyticsResponse, MetricsSectionFocus } from '../types/erp';

interface MetricsReportsPageProps {
  focusSection: MetricsSectionFocus | null;
  onClearFocus: () => void;
}

const CHART_COLORS = [
  '#6366F1', // Indigo
  '#10B981', // Emerald
  '#0EA5E9', // Sky
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#8B5CF6', // Violet
];

const channelLabel: Record<string, string> = {
  ERP_POS: 'Balcão / Loja Física',
  WEB_ECOMMERCE: 'Site / Loja Online',
  UNITY_META_QUEST: 'Loja Virtual 3D',
};

const movementLabel: Record<string, string> = {
  INITIAL_BALANCE: 'Estoque Inicial',
  PURCHASE_IN: 'Compra de Fornecedor (+)',
  SALE_OUT: 'Saída por Venda (-)',
  RETURN_IN: 'Devolução de Cliente (+)',
  ADJUSTMENT_IN: 'Entrada por Ajuste (+)',
  ADJUSTMENT_OUT: 'Baixa por Perda/Defeito (-)',
};

/**
 * Componente de Gráfico de Pizza / Rosca (SVG Puro - Peso zero na VPS)
 */
const SvgDonutChart: React.FC<{
  items: Array<{ label: string; value: number; sublabel: string }>;
  emptyMessage: string;
}> = ({ items, emptyMessage }) => {
  const total = items.reduce((acc, i) => acc + i.value, 0);

  if (total <= 0 || items.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-slate-400">
        {emptyMessage}
      </div>
    );
  }

  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let accumulatedPercent = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6 py-2">
      <div className="relative w-40 h-40 shrink-0 flex items-center justify-center">
        <svg className="w-40 h-40 -rotate-90" viewBox="0 0 160 160">
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="transparent"
            stroke="#1e293b"
            strokeWidth="22"
          />
          {items.map((item, idx) => {
            const pct = item.value / total;
            const strokeDasharray = `${pct * circumference} ${circumference}`;
            const strokeDashoffset = -accumulatedPercent * circumference;
            accumulatedPercent += pct;

            return (
              <circle
                key={item.label}
                cx="80"
                cy="80"
                r={radius}
                fill="transparent"
                stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                strokeWidth="22"
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
          <span className="text-sm text-slate-400">Total</span>
          <span className="text-sm font-bold text-white">
            {formatCurrencyBRL(total)}
          </span>
        </div>
      </div>

      <div className="flex-1 w-full space-y-2.5">
        {items.map((item, idx) => {
          const pct = Math.round((item.value / total) * 100);
          return (
            <div
              key={item.label}
              className="flex items-center justify-between text-sm p-2.5 rounded-xl bg-slate-950 border border-slate-800"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-3.5 h-3.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
                  }}
                />
                <div className="truncate">
                  <div className="font-semibold text-white truncate">
                    {item.label}
                  </div>
                  <div className="text-sm text-slate-400">{item.sublabel}</div>
                </div>
              </div>
              <div className="text-right shrink-0 ml-3">
                <div className="font-bold text-emerald-400">
                  {formatCurrencyBRL(item.value)}
                </div>
                <div className="text-sm text-slate-400">{pct}%</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const MetricsReportsPage: React.FC<MetricsReportsPageProps> = ({
  focusSection,
  onClearFocus,
}) => {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [period, setPeriod] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [highlightedSection, setHighlightedSection] =
    useState<MetricsSectionFocus | null>(null);

  // Paginação (até 10 linhas por página) nas listas de relatório
  const [prodPage, setProdPage] = useState<number>(1);
  const [valPage, setValPage] = useState<number>(1);

  const financialRef = useRef<HTMLDivElement>(null);
  const productsRef = useRef<HTMLDivElement>(null);
  const valuationRef = useRef<HTMLDivElement>(null);
  const inventoryRef = useRef<HTMLDivElement>(null);

  const loadAnalytics = async (selectedPeriod = period) => {
    setLoading(true);
    try {
      const res = await apiRequest<AnalyticsResponse>(
        `/dashboard/analytics?period=${encodeURIComponent(selectedPeriod)}`
      );
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setProdPage(1);
    setValPage(1);
    void loadAnalytics(period);
  }, [period]);

  useEffect(() => {
    if (!loading && focusSection) {
      setHighlightedSection(focusSection);
      const map: Record<
        MetricsSectionFocus,
        React.RefObject<HTMLDivElement | null>
      > = {
        financial: financialRef,
        products: productsRef,
        valuation: valuationRef,
        inventory: inventoryRef,
      };
      const target = map[focusSection]?.current;
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      onClearFocus();
      const timer = setTimeout(() => setHighlightedSection(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [loading, focusSection]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-300 text-base gap-2.5">
        <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
        <span>Calculando métricas, gráficos e relatórios...</span>
      </div>
    );
  }

  const maxProductRevenue = Math.max(
    1,
    ...data.topProducts.map((p) => p.revenue)
  );

  const periodText =
    period === 'all'
      ? 'Todo o Histórico'
      : period === 'today'
      ? 'Somente Hoje'
      : period === 'week'
      ? 'Últimos 7 Dias'
      : period === 'month'
      ? 'Este Mês'
      : 'Este Ano';

  const paginatedTopProducts = data.topProducts.slice(
    (prodPage - 1) * ITEMS_PER_PAGE,
    prodPage * ITEMS_PER_PAGE
  );

  const paginatedValuation = data.stockValuation.slice(
    (valPage - 1) * ITEMS_PER_PAGE,
    valPage * ITEMS_PER_PAGE
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Cabeçalho + Filtro de Período + Botões de Relatório */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Métricas, Gráficos e Relatórios
          </h1>
          <p className="text-sm sm:text-base text-slate-400 mt-1">
            Análise financeira de lucro, gráficos de participação por categoria e exportação de relatórios.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm font-medium text-white"
          >
            <option value="all">Período: Todo o Histórico</option>
            <option value="today">Período: Somente Hoje</option>
            <option value="week">Período: Últimos 7 Dias</option>
            <option value="month">Período: Este Mês</option>
            <option value="year">Período: Este Ano</option>
          </select>

          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sm font-medium text-slate-200 flex items-center gap-2 cursor-pointer"
          >
            <Printer className="w-4 h-4 text-indigo-400" />
            <span>Imprimir / Salvar PDF</span>
          </button>
        </div>
      </div>

      {/* Central Rápida de Exportação de Relatórios (CSV com Seleção de Páginas) */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-indigo-500/15 text-indigo-400">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">
              Central de Exportação de Relatórios (Excel / CSV)
            </h2>
            <p className="text-sm text-slate-400">
              Baixe o Ranking de Vendas com os filtros ativos e escolha todas as páginas ou intervalos (ex: 1-2).
            </p>
          </div>
        </div>

        <CsvExportBar
          reportTitle="Relatório de Vendas por Produto (Curva ABC)"
          filenamePrefix={`relatorio-vendas-produtos-${period}`}
          items={data.topProducts}
          itemsPerPage={ITEMS_PER_PAGE}
          activeFilters={[{ label: 'Período Analisado', value: periodText }]}
          headers={[
            'Posição',
            'Produto',
            'Categoria',
            'Unidades Vendidas',
            'Faturamento (R$)',
            'Lucro Estimado (R$)',
          ]}
          rowMapper={(p, idx) => [
            `#${idx + 1}`,
            p.productName,
            p.categoryName,
            String(p.unitsSold),
            formatCurrencyBRL(p.revenue),
            formatCurrencyBRL(p.estimatedProfit),
          ]}
        />
      </div>

      {/* SEÇÃO 1: Índices Financeiros de ERP Real (Faturamento, Custo CMV e Lucro Realizado) */}
      <div
        ref={financialRef}
        className={`p-6 rounded-2xl bg-slate-900 border transition ${
          highlightedSection === 'financial'
            ? 'border-emerald-400 ring-2 ring-emerald-500/30'
            : 'border-slate-800'
        }`}
      >
        <div className="flex items-center gap-2 text-lg font-bold text-white mb-4">
          <TrendingUp className="w-5 h-5 text-emerald-400" />
          <span>Índices de Resultado Financeiro das Vendas</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-sm text-slate-400">Faturamento Bruto</div>
            <div className="text-2xl font-bold text-white mt-1">
              {formatCurrencyBRL(data.kpis.totalRevenue)}
            </div>
            <div className="text-sm text-slate-400 mt-1">
              {data.kpis.totalOrders} venda(s) • {data.kpis.unitsSold} peças vendidas
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-sm text-slate-400">
              Custo das Roupas Vendidas
            </div>
            <div className="text-2xl font-bold text-slate-200 mt-1">
              {formatCurrencyBRL(data.kpis.totalCogs)}
            </div>
            <div className="text-sm text-slate-400 mt-1">
              Valor pago ao fornecedor pelas peças
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-sm text-slate-400">Lucro Bruto Realizado</div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">
              {formatCurrencyBRL(data.kpis.grossProfit)}
            </div>
            <div className="text-sm text-emerald-300 mt-1">
              Margem média de {data.kpis.profitMarginPercent}% sobre as vendas
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-sm text-slate-400">
              Valor Médio por Compra (Ticket)
            </div>
            <div className="text-2xl font-bold text-indigo-400 mt-1">
              {formatCurrencyBRL(data.kpis.averageTicket)}
            </div>
            <div className="text-sm text-slate-400 mt-1">
              Média gasta por cada cliente
            </div>
          </div>
        </div>
      </div>

      {/* SEÇÃO 2: Gráficos de Pizza (Vendas por Categoria e Vendas por Canal) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center gap-2 text-lg font-bold text-white mb-1">
            <PieChart className="w-5 h-5 text-indigo-400" />
            <span>Gráfico de Vendas por Tipo de Roupa (Categoria)</span>
          </div>
          <p className="text-sm text-slate-400 mb-4">
            Participação de cada categoria no faturamento da loja
          </p>

          <SvgDonutChart
            items={data.salesByCategory.map((c) => ({
              label: c.categoryName,
              value: c.revenue,
              sublabel: `${c.unitsSold} peça(s) vendida(s)`,
            }))}
            emptyMessage="Nenhuma venda registrada neste período."
          />
        </div>

        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center gap-2 text-lg font-bold text-white mb-1">
            <PieChart className="w-5 h-5 text-sky-400" />
            <span>Gráfico de Vendas por Canal de Atendimento</span>
          </div>
          <p className="text-sm text-slate-400 mb-4">
            Comparativo entre Balcão Físico, Site e Loja Virtual 3D
          </p>

          <SvgDonutChart
            items={data.salesByChannel.map((ch) => ({
              label: channelLabel[ch.channel] ?? ch.channel,
              value: ch.revenue,
              sublabel: `${ch.ordersCount} pedido(s)`,
            }))}
            emptyMessage="Nenhuma venda registrada neste período."
          />
        </div>
      </div>

      {/* SEÇÃO 3: Ranking de Produtos Mais Vendidos + Desempenho por Funcionário */}
      <div
        ref={productsRef}
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
      >
        <div
          className={`lg:col-span-2 p-6 rounded-2xl bg-slate-900 border transition ${
            highlightedSection === 'products'
              ? 'border-amber-400 ring-2 ring-amber-500/30'
              : 'border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2 text-lg font-bold text-white mb-1">
            <Award className="w-5 h-5 text-amber-400" />
            <span>Ranking de Produtos Mais Vendidos (Curva ABC)</span>
          </div>
          <p className="text-sm text-slate-400 mb-4">
            Modelos que geraram maior receita e lucro para a loja
          </p>

          {data.topProducts.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">
              Nenhuma venda registrada neste período.
            </div>
          ) : (
            <div className="space-y-4">
              {paginatedTopProducts.map((prod, index) => {
                const rankIndex = (prodPage - 1) * ITEMS_PER_PAGE + index + 1;
                const barWidth = Math.max(
                  8,
                  Math.round((prod.revenue / maxProductRevenue) * 100)
                );
                return (
                  <div
                    key={prod.productId}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <div className="font-bold text-white">
                        #{rankIndex} — {prod.productName}{' '}
                        <span className="font-normal text-slate-400">
                          ({prod.categoryName})
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-slate-300">
                          <strong>{prod.unitsSold}</strong> un. vendidas
                        </span>
                        <span className="font-bold text-emerald-400">
                          {formatCurrencyBRL(prod.revenue)}
                        </span>
                      </div>
                    </div>

                    <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>

                    <div className="text-sm text-slate-400 flex justify-between">
                      <span>Lucro líquido gerado por este modelo:</span>
                      <strong className="text-sky-400">
                        {formatCurrencyBRL(prod.estimatedProfit)}
                      </strong>
                    </div>
                  </div>
                );
              })}

              <PaginationBar
                currentPage={prodPage}
                totalItems={data.topProducts.length}
                itemsPerPage={ITEMS_PER_PAGE}
                onPageChange={setProdPage}
              />
            </div>
          )}
        </div>

        {/* Desempenho por Funcionário / Vendedor */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center gap-2 text-lg font-bold text-white mb-1">
            <Users className="w-5 h-5 text-indigo-400" />
            <span>Vendas por Funcionário</span>
          </div>
          <p className="text-sm text-slate-400 mb-4">
            Total vendido por cada usuário do sistema
          </p>

          {data.salesBySeller.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">
              Nenhuma venda no período.
            </div>
          ) : (
            <div className="space-y-3">
              {data.salesBySeller.map((seller) => (
                <div
                  key={seller.sellerName}
                  className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-sm"
                >
                  <div>
                    <div className="font-bold text-white">
                      {seller.sellerName}
                    </div>
                    <div className="text-slate-400 mt-0.5">
                      {seller.ordersCount} venda(s) registrada(s)
                    </div>
                  </div>
                  <div className="text-base font-bold text-emerald-400">
                    {formatCurrencyBRL(seller.revenue)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SEÇÃO 4: Relatório de Valor de Estoque por Categoria + Resumo de Entradas e Saídas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div
          ref={valuationRef}
          className={`lg:col-span-2 p-6 rounded-2xl bg-slate-900 border space-y-4 transition ${
            highlightedSection === 'valuation'
              ? 'border-sky-400 ring-2 ring-sky-500/30'
              : 'border-slate-800'
          }`}
        >
          <div>
            <div className="flex items-center gap-2 text-lg font-bold text-white mb-1">
              <BarChart3 className="w-5 h-5 text-sky-400" />
              <span>Relatório de Valor de Estoque por Categoria</span>
            </div>
            <p className="text-sm text-slate-400">
              Quanto dinheiro você tem parado em mercadorias hoje (Custo vs. Venda)
            </p>
          </div>

          <CsvExportBar
            reportTitle="Relatório de Valor de Estoque por Categoria"
            filenamePrefix="relatorio-valor-estoque"
            items={data.stockValuation}
            itemsPerPage={ITEMS_PER_PAGE}
            activeFilters={[
              { label: 'Posição Atual', value: 'Todas as Categorias' },
            ]}
            headers={[
              'Categoria',
              'Qtd Modelos',
              'Peças em Estoque',
              'Valor de Custo (R$)',
              'Valor de Venda (R$)',
            ]}
            rowMapper={(s) => [
              s.categoryName,
              String(s.modelsCount),
              String(s.unitsInStock),
              formatCurrencyBRL(s.costValue),
              formatCurrencyBRL(s.retailValue),
            ]}
          />

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-3 pr-3 font-semibold">Categoria</th>
                  <th className="py-3 px-3 font-semibold">Modelos</th>
                  <th className="py-3 px-3 font-semibold">Peças</th>
                  <th className="py-3 px-3 font-semibold">Valor de Custo</th>
                  <th className="py-3 pl-3 text-right font-semibold">
                    Valor de Venda
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {paginatedValuation.map((row) => (
                  <tr key={row.categoryName}>
                    <td className="py-3.5 pr-3 font-semibold text-white">
                      {row.categoryName}
                    </td>
                    <td className="py-3.5 px-3 text-slate-300">
                      {row.modelsCount}
                    </td>
                    <td className="py-3.5 px-3 font-bold text-white">
                      {row.unitsInStock} un.
                    </td>
                    <td className="py-3.5 px-3 text-slate-300">
                      {formatCurrencyBRL(row.costValue)}
                    </td>
                    <td className="py-3.5 pl-3 text-right font-bold text-emerald-400">
                      {formatCurrencyBRL(row.retailValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <PaginationBar
            currentPage={valPage}
            totalItems={data.stockValuation.length}
            itemsPerPage={ITEMS_PER_PAGE}
            onPageChange={setValPage}
          />
        </div>

        <div
          ref={inventoryRef}
          className={`p-6 rounded-2xl bg-slate-900 border transition ${
            highlightedSection === 'inventory'
              ? 'border-indigo-400 ring-2 ring-indigo-500/30'
              : 'border-slate-800'
          }`}
        >
          <h3 className="text-lg font-bold text-white mb-1">
            Giro de Entradas e Saídas
          </h3>
          <p className="text-sm text-slate-400 mb-4">
            Total de peças movimentadas por tipo de operação
          </p>

          <div className="space-y-3">
            {data.movementsBreakdown.map((m) => (
              <div
                key={m.movementType}
                className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-sm"
              >
                <div>
                  <div className="font-semibold text-white">
                    {movementLabel[m.movementType] ?? m.movementType}
                  </div>
                  <div className="text-slate-400">
                    {m.operationsCount} lançamento(s)
                  </div>
                </div>
                <div className="text-base font-bold text-indigo-300">
                  {m.totalUnits} peças
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

