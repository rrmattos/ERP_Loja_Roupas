import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  DollarSign,
  Eye,
  Layers,
  RefreshCw,
  ShoppingBag,
  Truck,
  UserCheck,
  X,
} from 'lucide-react';
import { apiRequest, formatCurrencyBRL, formatDateTimeBR } from '../services/api';
import {
  DashboardLowStockItem,
  DashboardMovementItem,
  DashboardSummary,
  MetricsSectionFocus,
} from '../types/erp';
import { ActivePage } from '../components/Layout';
import {
  CsvExportBar,
  ITEMS_PER_PAGE,
  PaginationBar,
} from '../components/ListPaginationAndCsv';
import { formatPhoneMask } from '../utils/formatters';
import { getMovementBadge, movementTypeLabel } from '../utils/movementBadge';

interface DashboardPageProps {
  onNavigate: (page: ActivePage) => void;
  onOpenMetricsSection: (section: MetricsSectionFocus) => void;
}

const channelLabel: Record<string, string> = {
  ERP_POS: 'Venda no Balcão (Loja Física)',
  WEB_ECOMMERCE: 'Loja Online (Site)',
  UNITY_META_QUEST: 'Loja Virtual 3D (Realidade Virtual)',
};

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onNavigate,
  onOpenMetricsSection,
}) => {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Estados para os Modais de Detalhes ao clicar em uma movimentação ou produto
  const [selectedMovement, setSelectedMovement] =
    useState<DashboardMovementItem | null>(null);
  const [selectedLowStock, setSelectedLowStock] =
    useState<DashboardLowStockItem | null>(null);
  const [movementsPage, setMovementsPage] = useState<number>(1);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<DashboardSummary>('/dashboard/summary');
      setSummary(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSummary();
  }, []);

  if (loading || !summary) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-300 text-base gap-2.5">
        <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
        <span>Carregando resumo da loja...</span>
      </div>
    );
  }

  const outOfStockCount = summary.lowStockAlerts.filter(
    (item) => item.stockQuantity <= 0
  ).length;

  const paginatedMovements = summary.recentMovements.slice(
    (movementsPage - 1) * ITEMS_PER_PAGE,
    movementsPage * ITEMS_PER_PAGE
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Resumo da Loja
          </h1>
          <p className="text-sm sm:text-base text-slate-400 mt-1">
            Clique nos cartões abaixo para abrir os gráficos detalhados ou clique em um produto da lista para ver a ficha completa.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void loadSummary()}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sm font-medium text-slate-200 flex items-center gap-2 transition cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Atualizar</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('orders')}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white transition cursor-pointer"
          >
            + Registrar Nova Venda
          </button>
        </div>
      </div>

      {/* 4 Cartões de Resumo Clicáveis -> Levam para Métricas na seção específica */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onOpenMetricsSection('financial')}
          className="text-left p-5 rounded-2xl bg-slate-900 hover:bg-slate-900/80 border border-slate-800 hover:border-emerald-500/60 transition group cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-300 text-sm font-medium">
            <span>Total em Vendas</span>
            <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-white">
            {formatCurrencyBRL(summary.financial.totalRevenue)}
          </div>
          <div className="mt-2 text-sm text-slate-400 flex items-center justify-between">
            <span>{summary.financial.totalOrders} venda(s)</span>
            <span className="text-emerald-400 font-medium">
              Média: {formatCurrencyBRL(summary.financial.averageTicket)}
            </span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-sm text-indigo-400 group-hover:text-indigo-300 font-medium flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4" />
            <span>Ver métricas financeiras &rarr;</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onOpenMetricsSection('inventory')}
          className="text-left p-5 rounded-2xl bg-slate-900 hover:bg-slate-900/80 border border-slate-800 hover:border-indigo-500/60 transition group cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-300 text-sm font-medium">
            <span>Peças no Estoque</span>
            <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Boxes className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-white">
            {summary.inventory.totalUnitsInStock}{' '}
            <span className="text-base font-normal text-slate-400">peças</span>
          </div>
          <div className="mt-2 text-sm text-slate-400 flex items-center justify-between">
            <span>Em {summary.inventory.totalVariants} opções (tam/cor)</span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-sm text-indigo-400 group-hover:text-indigo-300 font-medium flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4" />
            <span>Ver giro de estoque &rarr;</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onOpenMetricsSection('valuation')}
          className="text-left p-5 rounded-2xl bg-slate-900 hover:bg-slate-900/80 border border-slate-800 hover:border-sky-500/60 transition group cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-300 text-sm font-medium">
            <span>Valor das Mercadorias</span>
            <div className="p-2.5 rounded-lg bg-sky-500/10 text-sky-400">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-white">
            {formatCurrencyBRL(summary.inventory.retailStockValue)}
          </div>
          <div className="mt-2 text-sm text-slate-400 flex items-center justify-between">
            <span>Custo: {formatCurrencyBRL(summary.inventory.costStockValue)}</span>
            <span className="text-sky-400 font-medium">
              Lucro prev.:{' '}
              {formatCurrencyBRL(
                summary.inventory.retailStockValue - summary.inventory.costStockValue
              )}
            </span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-sm text-indigo-400 group-hover:text-indigo-300 font-medium flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4" />
            <span>Ver relatório de valores &rarr;</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onOpenMetricsSection('products')}
          className={`text-left p-5 rounded-2xl bg-slate-900 hover:bg-slate-900/80 border transition group cursor-pointer ${
            outOfStockCount > 0
              ? 'border-rose-500/50 hover:border-rose-500'
              : 'border-slate-800 hover:border-amber-500/60'
          }`}
        >
          <div className="flex items-center justify-between text-slate-300 text-sm font-medium">
            <span>Modelos Cadastrados</span>
            <div
              className={`p-2.5 rounded-lg ${
                outOfStockCount > 0
                  ? 'bg-rose-500/15 text-rose-400'
                  : summary.inventory.lowStockCount > 0
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              <Layers className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-white">
            {summary.inventory.totalProducts}{' '}
            <span className="text-base font-normal text-slate-400">produtos</span>
          </div>
          <div className="mt-2 text-sm flex items-center justify-between">
            {outOfStockCount > 0 ? (
              <span className="px-2 py-0.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                Sem roupas no estoque ({outOfStockCount})
              </span>
            ) : summary.inventory.lowStockCount > 0 ? (
              <span className="text-amber-400 font-medium flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                {summary.inventory.lowStockCount} peça(s) acabando
              </span>
            ) : (
              <span className="text-emerald-400 font-medium">
                Estoque em dia
              </span>
            )}
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-sm text-indigo-400 group-hover:text-indigo-300 font-medium flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4" />
            <span>Ver ranking de produtos &rarr;</span>
          </div>
        </button>
      </div>

      {/* Área Central: Últimas Movimentações (Clicáveis) + Avisos de Estoque Baixo (Clicáveis) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tabela de Últimas Entradas e Saídas */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-lg font-bold text-white">
                Últimas Entradas e Saídas de Estoque
              </h2>
              <p className="text-sm text-slate-400">
                Clique em qualquer linha para ver quem registrou a operação, o fornecedor ou qual cliente comprou.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="text-sm text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
            >
              Ver histórico completo &rarr;
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-sm text-slate-400">
                  <th className="py-3 pr-3 font-semibold">Roupa / Tamanho / Cor</th>
                  <th className="py-3 px-3 font-semibold">Operação</th>
                  <th className="py-3 px-3 font-semibold">Envolvido</th>
                  <th className="py-3 px-3 font-semibold">Estoque</th>
                  <th className="py-3 pl-3 text-right font-semibold">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-sm">
                {paginatedMovements.map((m) => {
                  const badge = getMovementBadge(m.movementType, m.quantity);
                  return (
                    <tr
                      key={m.id}
                      onClick={() => setSelectedMovement(m)}
                      className="hover:bg-slate-800/60 transition cursor-pointer"
                    >
                      <td className="py-3.5 pr-3">
                        <div className="font-semibold text-white">{m.productName}</div>
                        <div className="flex items-center gap-2 text-sm text-slate-400 mt-0.5">
                          <span>Tam: {m.sizeCode}</span>
                          <span>•</span>
                          <span
                            className="w-3 h-3 rounded-full inline-block border border-slate-600"
                            style={{ backgroundColor: m.colorHex }}
                          />
                          <span>{m.colorName}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm ${badge.badgeStyle}`}
                        >
                          {badge.iconType === 'sale' ? (
                            <ShoppingBag className="w-4 h-4 text-emerald-400" />
                          ) : badge.iconType === 'defect_out' ? (
                            <ArrowDownRight className="w-4 h-4 text-rose-400" />
                          ) : badge.iconType === 'initial' ? (
                            <Boxes className="w-4 h-4 text-slate-200" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4" />
                          )}
                          <span>
                            {badge.qtyText} ({movementTypeLabel[m.movementType] ?? m.movementType})
                          </span>
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-slate-300">
                        {m.movementType === 'SALE_OUT' ? (
                          <div>
                            <span className="text-slate-400">Cliente: </span>
                            <strong className="text-white">
                              {m.customerName || 'Cliente no Balcão'}
                            </strong>
                          </div>
                        ) : (
                          <div>
                            <span className="text-slate-400">Fornecedor: </span>
                            <strong className="text-white">
                              {m.supplierName || 'Estoque Interno'}
                            </strong>
                          </div>
                        )}
                        <div className="text-sm text-slate-400">
                          Reg. por: {m.createdByUserName || m.orderSellerName || 'Sistema'}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-slate-300 whitespace-nowrap">
                        {m.previousStock} &rarr;{' '}
                        <strong className={m.newStock <= 0 ? 'text-rose-400' : 'text-white'}>
                          {m.newStock} un.
                        </strong>
                      </td>
                      <td className="py-3.5 pl-3 text-right">
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-indigo-300 hover:text-white text-sm font-medium transition">
                          <Eye className="w-4 h-4" />
                          <span>Ver ficha</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 space-y-3">
            <CsvExportBar
              reportTitle="Últimas Entradas e Saídas de Estoque (Resumo)"
              filenamePrefix="resumo-movimentacoes"
              items={summary.recentMovements}
              activeFilters={[{ label: 'Tela', value: 'Resumo da Loja' }]}
              headers={[
                'Data / Hora',
                'Produto',
                'Tamanho',
                'Cor',
                'Etiqueta',
                'Operação',
                'Qtd',
                'Estoque Antes',
                'Estoque Depois',
                'Cliente / Fornecedor',
                'Responsável',
              ]}
              rowMapper={(m) => [
                formatDateTimeBR(m.createdAt),
                m.productName,
                m.sizeCode,
                m.colorName,
                m.sku,
                movementTypeLabel[m.movementType] ?? m.movementType,
                m.quantity,
                m.previousStock,
                m.newStock,
                m.movementType === 'SALE_OUT'
                  ? m.customerName || 'Cliente no Balcão'
                  : m.supplierName || 'Estoque Interno',
                m.createdByUserName || m.orderSellerName || 'Sistema',
              ]}
            />

            <PaginationBar
              currentPage={movementsPage}
              totalItems={summary.recentMovements.length}
              onPageChange={setMovementsPage}
            />
          </div>
        </div>

        {/* Coluna Direita: Avisos de Roupas Acabando / Sem Roupas no Estoque (Clicáveis) */}
        <div
          className={`bg-slate-900 border rounded-2xl p-6 flex flex-col justify-between ${
            outOfStockCount > 0 ? 'border-rose-500/40' : 'border-slate-800'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <AlertTriangle
                  className={`w-5 h-5 ${
                    outOfStockCount > 0 ? 'text-rose-400' : 'text-amber-400'
                  }`}
                />
                <span>
                  {outOfStockCount > 0
                    ? 'Sem Roupas no Estoque / Acabando'
                    : 'Roupas Acabando'}
                </span>
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('inventory')}
                className="text-sm text-indigo-400 hover:underline font-semibold cursor-pointer"
              >
                Repor estoque &rarr;
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              Clique em uma peça abaixo para ver o fornecedor e dados para reposição.
            </p>

            {summary.lowStockAlerts.length === 0 ? (
              <div className="p-6 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-sm text-emerald-300 text-center">
                Todas as peças estão com bom estoque no momento!
              </div>
            ) : (
              <div className="space-y-3">
                {summary.lowStockAlerts.slice(0, ITEMS_PER_PAGE).map((item) => {
                  const isZeroStock = item.stockQuantity <= 0;
                  return (
                    <button
                      key={item.variantId}
                      type="button"
                      onClick={() => setSelectedLowStock(item)}
                      className={`w-full text-left p-4 rounded-xl border flex items-center justify-between text-sm transition cursor-pointer ${
                        isZeroStock
                          ? 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/40 hover:border-rose-500/70'
                          : 'bg-amber-500/5 hover:bg-amber-500/15 border-amber-500/25 hover:border-amber-500/50'
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-white">
                          {item.productName}
                        </div>
                        <div className="flex items-center gap-1.5 text-sm text-slate-300 mt-1">
                          <span>Tam: {item.sizeCode}</span>
                          <span>•</span>
                          <span
                            className="w-3 h-3 rounded-full border border-slate-600"
                            style={{ backgroundColor: item.colorHex }}
                          />
                          <span>{item.colorName}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        {isZeroStock ? (
                          <span className="inline-block px-2.5 py-1 rounded-lg bg-rose-500/25 border border-rose-500/40 text-rose-200 font-bold">
                            Sem roupas no estoque
                          </span>
                        ) : (
                          <span className="inline-block px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 font-bold">
                            Restam {item.stockQuantity}
                          </span>
                        )}
                        <div className="text-sm text-indigo-300 mt-1.5 font-medium">
                          Ver detalhes &rarr;
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => onNavigate('metrics')}
              className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-indigo-300 hover:text-white flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <BarChart3 className="w-4 h-4" />
              <span>Abrir Painel Completo de Métricas e Relatórios</span>
            </button>
          </div>
        </div>
      </div>

      {/* MODAL 1: Detalhes Completos da Movimentação (Entrada / Saída / Produto / Cliente / Funcionário) */}
      {selectedMovement && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedMovement(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl p-6 sm:p-8 shadow-2xl space-y-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <span className="text-sm font-semibold text-indigo-400">
                  Ficha Detalhada da Operação e do Produto
                </span>
                <div className="flex flex-wrap items-center gap-2.5 mt-1">
                  <h3 className="text-xl font-bold text-white">
                    {movementTypeLabel[selectedMovement.movementType] ??
                      selectedMovement.movementType}
                  </h3>
                  {(() => {
                    const modalBadge = getMovementBadge(
                      selectedMovement.movementType,
                      selectedMovement.quantity
                    );
                    return (
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs ${modalBadge.badgeStyle}`}
                      >
                        {modalBadge.iconType === 'sale' ? (
                          <ShoppingBag className="w-3.5 h-3.5 text-emerald-400" />
                        ) : modalBadge.iconType === 'defect_out' ? (
                          <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />
                        ) : modalBadge.iconType === 'initial' ? (
                          <Boxes className="w-3.5 h-3.5 text-slate-200" />
                        ) : (
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        )}
                        <span>{modalBadge.qtyText} un.</span>
                      </span>
                    );
                  })()}
                </div>
                <p className="text-sm text-slate-400 mt-0.5">
                  Registrado em {formatDateTimeBR(selectedMovement.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMovement(null)}
                className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Bloco 1: Informações da Roupa */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row items-start gap-4">
              <img
                src={
                  selectedMovement.productImageUrl ||
                  '/presets/tshirt-oversized.svg'
                }
                alt={selectedMovement.productName}
                className="w-20 h-20 rounded-xl object-cover bg-slate-900 border border-slate-800 shrink-0"
              />
              <div className="space-y-1.5 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 text-sm font-medium">
                    {selectedMovement.categoryName || 'Geral'}
                  </span>
                  <span className="text-sm text-slate-400">
                    Código da Etiqueta: <strong className="text-white">{selectedMovement.sku}</strong>
                  </span>
                </div>
                <h4 className="text-lg font-bold text-white">
                  {selectedMovement.productName}
                </h4>
                <p className="text-sm text-slate-400">
                  {selectedMovement.productDescription || 'Sem descrição adicional.'}
                </p>
                <div className="pt-1 flex flex-wrap items-center gap-4 text-sm">
                  <span>
                    Tamanho: <strong className="text-white">{selectedMovement.sizeCode} ({selectedMovement.sizeName})</strong>
                  </span>
                  <span className="flex items-center gap-1.5">
                    Cor:
                    <span
                      className="w-3.5 h-3.5 rounded-full inline-block border border-slate-600"
                      style={{ backgroundColor: selectedMovement.colorHex }}
                    />
                    <strong className="text-white">{selectedMovement.colorName}</strong>
                  </span>
                  <span>
                    Preço de Venda:{' '}
                    <strong className="text-emerald-400">
                      {formatCurrencyBRL(selectedMovement.basePrice)}
                    </strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Bloco 2: Quem Registrou e Quem Comprou / Forneceu */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-indigo-300">
                  <UserCheck className="w-4 h-4" />
                  <span>Responsável pelo Registro</span>
                </div>
                <div className="text-base font-bold text-white">
                  {selectedMovement.createdByUserName ||
                    selectedMovement.orderSellerName ||
                    'Administrador da Loja'}
                </div>
                <div className="text-sm text-slate-400">
                  Operação: {selectedMovement.reason || 'Movimentação padrão'}
                </div>
              </div>

              {selectedMovement.movementType === 'SALE_OUT' ? (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
                    <ShoppingBag className="w-4 h-4" />
                    <span>Dados do Cliente Comprador</span>
                  </div>
                  <div className="text-base font-bold text-white">
                    {selectedMovement.customerName || 'Cliente no Balcão'}
                  </div>
                  {selectedMovement.customerEmail && (
                    <div className="text-sm text-slate-400">
                      E-mail: {selectedMovement.customerEmail}
                    </div>
                  )}
                  <div className="text-sm text-slate-300">
                    Venda #{selectedMovement.orderNumber} •{' '}
                    {selectedMovement.orderChannel
                      ? channelLabel[selectedMovement.orderChannel]
                      : 'Balcão'}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-sky-400">
                    <Truck className="w-4 h-4" />
                    <span>Fornecedor da Mercadoria</span>
                  </div>
                  <div className="text-base font-bold text-white">
                    {selectedMovement.supplierName || 'Fornecedor Padrão'}
                  </div>
                  {selectedMovement.supplierPhone && (
                    <div className="text-sm text-slate-400">
                      Telefone: {selectedMovement.supplierPhone}
                    </div>
                  )}
                  <div className="text-sm text-slate-300">
                    Custo unitário:{' '}
                    <strong>
                      {formatCurrencyBRL(
                        selectedMovement.unitCost ?? selectedMovement.costPrice
                      )}
                    </strong>
                  </div>
                </div>
              )}
            </div>

            {/* Bloco 3: Resumo da Quantidade no Estoque */}
            {(() => {
              const modalBadge = getMovementBadge(
                selectedMovement.movementType,
                selectedMovement.quantity
              );
              return (
                <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-500/30 flex flex-wrap items-center justify-between gap-4 text-sm">
                  <div>
                    <span className="text-slate-300">Estoque antes da operação: </span>
                    <strong className="text-white">{selectedMovement.previousStock} un.</strong>
                  </div>
                  <div>
                    <span className="text-slate-300">Quantidade movimentada: </span>
                    <strong className={modalBadge.qtyColor}>{modalBadge.qtyText} un.</strong>
                  </div>
                  <div>
                    <span className="text-slate-300">Estoque resultante: </span>
                    <strong
                      className={
                        selectedMovement.newStock <= 0
                          ? 'text-rose-400 font-bold text-base'
                          : 'text-emerald-400 font-bold text-base'
                      }
                    >
                      {selectedMovement.newStock} un.
                    </strong>
                  </div>
                </div>
              );
            })()}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedMovement(null)}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Detalhes de Roupa Acabando (Para Reposição) */}
      {selectedLowStock && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedLowStock(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl p-6 sm:p-8 shadow-2xl space-y-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <span
                  className={`text-sm font-semibold ${
                    selectedLowStock.stockQuantity <= 0
                      ? 'text-rose-400'
                      : 'text-amber-400'
                  }`}
                >
                  {selectedLowStock.stockQuantity <= 0
                    ? 'Alerta Crítico: Sem Roupas no Estoque'
                    : 'Aviso de Reposição de Mercadoria'}
                </span>
                <h3 className="text-xl font-bold text-white mt-1">
                  {selectedLowStock.productName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLowStock(null)}
                className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-4">
              <img
                src={
                  selectedLowStock.productImageUrl ||
                  '/presets/tshirt-oversized.svg'
                }
                alt={selectedLowStock.productName}
                className="w-20 h-20 rounded-xl object-cover bg-slate-900 border border-slate-800 shrink-0"
              />
              <div className="space-y-1.5 text-sm">
                <div className="text-slate-300">
                  Categoria: <strong className="text-white">{selectedLowStock.categoryName || 'Geral'}</strong>
                </div>
                <div className="text-slate-300">
                  Tamanho: <strong className="text-white">{selectedLowStock.sizeCode} ({selectedLowStock.sizeName})</strong> • Cor:{' '}
                  <strong className="text-white">{selectedLowStock.colorName}</strong>
                </div>
                <div className="text-slate-300">
                  Código da Etiqueta: <strong className="text-indigo-300">{selectedLowStock.sku}</strong>
                </div>
                <div className="text-slate-300">
                  Preço de Custo: <strong className="text-white">{formatCurrencyBRL(selectedLowStock.costPrice)}</strong> • Venda:{' '}
                  <strong className="text-emerald-400">{formatCurrencyBRL(selectedLowStock.basePrice)}</strong>
                </div>
              </div>
            </div>

            <div
              className={`p-4 rounded-xl border flex items-center justify-between text-sm ${
                selectedLowStock.stockQuantity <= 0
                  ? 'bg-rose-500/15 border-rose-500/40'
                  : 'bg-amber-500/10 border-amber-500/30'
              }`}
            >
              <div>
                <div
                  className={`font-bold ${
                    selectedLowStock.stockQuantity <= 0
                      ? 'text-rose-300'
                      : 'text-amber-300'
                  }`}
                >
                  {selectedLowStock.stockQuantity <= 0
                    ? 'Sem roupas no estoque (0 unidades)'
                    : `Quantidade Atual: ${selectedLowStock.stockQuantity} unidades`}
                </div>
                <div className="text-slate-300 mt-0.5">
                  Estoque mínimo recomendado: {selectedLowStock.minStockAlert} unidades
                </div>
              </div>
              <div className="text-right">
                <div className="text-slate-300 font-semibold">
                  Fornecedor: {selectedLowStock.supplierName || 'Não vinculado'}
                </div>
                {selectedLowStock.supplierPhone && (
                  <div className="text-slate-400">
                    Tel: {formatPhoneMask(selectedLowStock.supplierPhone)}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedLowStock(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 text-sm text-slate-200 cursor-pointer"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedLowStock(null);
                  onNavigate('inventory');
                }}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white cursor-pointer"
              >
                Ir para Entrada de Estoque &rarr;
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
