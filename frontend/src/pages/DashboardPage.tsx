import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  DollarSign,
  Layers,
  RefreshCw,
  ShoppingBag,
} from 'lucide-react';
import { apiRequest, formatCurrencyBRL, formatDateTimeBR } from '../services/api';
import { DashboardSummary } from '../types/erp';
import { ActivePage } from '../components/Layout';

interface DashboardPageProps {
  onNavigate: (page: ActivePage) => void;
}

const movementTypeLabel: Record<string, string> = {
  INITIAL_BALANCE: 'Estoque Inicial',
  PURCHASE_IN: 'Compra de Fornecedor',
  SALE_OUT: 'Venda Realizada',
  RETURN_IN: 'Devolução de Cliente',
  ADJUSTMENT_IN: 'Entrada por Ajuste',
  ADJUSTMENT_OUT: 'Baixa por Perda/Avaria',
};

const channelLabel: Record<string, string> = {
  ERP_POS: 'Venda no Balcão (Loja Física)',
  WEB_ECOMMERCE: 'Loja Online (Site)',
  UNITY_META_QUEST: 'Loja Virtual 3D (Realidade Virtual)',
};

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

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

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Resumo da Loja
          </h1>
          <p className="text-sm sm:text-base text-slate-400 mt-1">
            Acompanhe suas vendas, o total de roupas disponíveis e os avisos de reposição.
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

      {/* 4 Cartões de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
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
        </div>

        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
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
            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="text-indigo-400 hover:underline font-medium cursor-pointer"
            >
              Ver estoque &rarr;
            </button>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
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
        </div>

        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-300 text-sm font-medium">
            <span>Modelos Cadastrados</span>
            <div
              className={`p-2.5 rounded-lg ${
                summary.inventory.lowStockCount > 0
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
            {summary.inventory.lowStockCount > 0 ? (
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
        </div>
      </div>

      {/* Área Central: Últimas Movimentações + Canais e Alertas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tabela de Últimas Entradas e Saídas */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-white">
                Últimas Entradas e Saídas de Estoque
              </h2>
              <p className="text-sm text-slate-400">
                Histórico recente de compras de mercadoria e vendas realizadas
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="text-sm text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
            >
              Ver tudo &rarr;
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-sm text-slate-400">
                  <th className="py-3 pr-3 font-semibold">Roupa / Tamanho / Cor</th>
                  <th className="py-3 px-3 font-semibold">Tipo</th>
                  <th className="py-3 px-3 font-semibold">Quantidade</th>
                  <th className="py-3 px-3 font-semibold">Estoque</th>
                  <th className="py-3 pl-3 text-right font-semibold">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-sm">
                {summary.recentMovements.map((m) => {
                  const isOut =
                    m.movementType === 'SALE_OUT' || m.movementType === 'ADJUSTMENT_OUT';
                  return (
                    <tr key={m.id} className="hover:bg-slate-800/30">
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
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm font-medium ${
                            isOut
                              ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                              : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          }`}
                        >
                          {isOut ? (
                            <ArrowDownRight className="w-4 h-4" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4" />
                          )}
                          {movementTypeLabel[m.movementType] ?? m.movementType}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 font-bold text-white">
                        {isOut ? `-${m.quantity}` : `+${m.quantity}`} un.
                      </td>
                      <td className="py-3.5 px-3 text-slate-300">
                        Era {m.previousStock} &rarr;{' '}
                        <strong className="text-white">Ficou {m.newStock}</strong>
                      </td>
                      <td className="py-3.5 pl-3 text-right text-slate-400 whitespace-nowrap">
                        {formatDateTimeBR(m.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Coluna Direita: Onde as Vendas Aconteceram + Avisos de Estoque Baixo */}
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-1">
              Vendas por Canal
            </h2>
            <p className="text-sm text-slate-400 mb-4">
              De onde vieram os pedidos dos seus clientes
            </p>

            {summary.salesByChannel.length === 0 ? (
              <p className="text-sm text-slate-400 py-4">
                Nenhuma venda registrada ainda.
              </p>
            ) : (
              <div className="space-y-3">
                {summary.salesByChannel.map((ch) => (
                  <div
                    key={ch.channel}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {channelLabel[ch.channel] ?? ch.channel}
                      </div>
                      <div className="text-sm text-slate-400 mt-0.5">
                        {ch.orders_count} venda(s)
                      </div>
                    </div>
                    <div className="text-base font-bold text-emerald-400">
                      {formatCurrencyBRL(ch.revenue)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Avisos de Roupas Acabando */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <span>Roupas Acabando</span>
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('inventory')}
                className="text-sm text-indigo-400 hover:underline font-semibold cursor-pointer"
              >
                Repor &rarr;
              </button>
            </div>

            {summary.lowStockAlerts.length === 0 ? (
              <p className="text-sm text-emerald-400 py-2">
                Todas as peças estão com bom estoque!
              </p>
            ) : (
              <div className="space-y-3">
                {summary.lowStockAlerts.map((item) => (
                  <div
                    key={item.variantId}
                    className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/25 flex items-center justify-between text-sm"
                  >
                    <div>
                      <div className="font-semibold text-white">{item.productName}</div>
                      <div className="text-sm text-slate-400">
                        Tam: {item.sizeCode} • Cor: {item.colorName}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 font-bold">
                        Restam {item.stockQuantity}
                      </span>
                      <div className="text-sm text-slate-400 mt-1">
                        Mínimo ideal: {item.minStockAlert}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
