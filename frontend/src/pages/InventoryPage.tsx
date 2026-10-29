import React, { useEffect, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  Filter,
  PlusCircle,
  RefreshCw,
} from 'lucide-react';
import {
  apiRequest,
  formatCurrencyBRL,
  formatDateTimeBR,
} from '../services/api';
import { Product, StockMovement, Supplier } from '../types/erp';

export const InventoryPage: React.FC = () => {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Campos de Nova Movimentação
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [movementType, setMovementType] = useState<
    'PURCHASE_IN' | 'RETURN_IN' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT'
  >('PURCHASE_IN');
  const [quantity, setQuantity] = useState<string>('10');
  const [supplierId, setSupplierId] = useState<string>('');
  const [unitCost, setUnitCost] = useState<string>('48.50');
  const [reason, setReason] = useState<string>('Chegada de mercadoria nova');

  const loadData = async (typeFilter = filterType) => {
    setLoading(true);
    try {
      const [movs, prods, meta] = await Promise.all([
        apiRequest<StockMovement[]>(
          `/inventory/movements?movementType=${encodeURIComponent(typeFilter)}`
        ),
        apiRequest<Product[]>('/products'),
        apiRequest<{ suppliers: Supplier[] }>('/products/metadata'),
      ]);

      setMovements(movs);
      setProducts(prods);
      setSuppliers(meta.suppliers);

      if (!selectedVariantId && prods[0]?.variants[0]) {
        setSelectedVariantId(prods[0].variants[0].id);
      }
      if (!supplierId && meta.suppliers[0]) {
        setSupplierId(meta.suppliers[0].id);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao carregar estoque.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(filterType);
  }, [filterType]);

  const allVariants = products.flatMap((p) =>
    p.variants.map((v) => ({
      ...v,
      productName: p.name,
      costPrice: p.costPrice,
    }))
  );

  const activeVariant = allVariants.find((v) => v.id === selectedVariantId);
  const isOutflow = movementType === 'ADJUSTMENT_OUT';
  const parsedQty = Math.max(0, Number(quantity) || 0);
  const previewNewStock = activeVariant
    ? isOutflow
      ? activeVariant.stockQuantity - parsedQty
      : activeVariant.stockQuantity + parsedQty
    : 0;

  const handleCreateMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      const res = await apiRequest<{
        sku: string;
        previousStock: number;
        newStock: number;
      }>('/inventory/movements', {
        method: 'POST',
        body: JSON.stringify({
          variantId: selectedVariantId,
          movementType,
          quantity: Number(quantity),
          supplierId: movementType === 'PURCHASE_IN' ? supplierId || null : null,
          unitCost:
            movementType === 'PURCHASE_IN' ? Number(unitCost) || null : null,
          reason,
        }),
      });

      setSuccessMsg(
        `Estoque atualizado com sucesso! A peça (${res.sku}) passou de ${res.previousStock} para ${res.newStock} unidades.`
      );
      await loadData(filterType);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao atualizar estoque.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const movementLabel: Record<string, string> = {
    INITIAL_BALANCE: 'Estoque Inicial',
    PURCHASE_IN: 'Compra de Fornecedor',
    SALE_OUT: 'Venda Realizada',
    RETURN_IN: 'Devolução de Cliente',
    ADJUSTMENT_IN: 'Entrada Manual (+)',
    ADJUSTMENT_OUT: 'Saída por Perda/Defeito (-)',
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Controle de Estoque
          </h1>
          <p className="text-sm sm:text-base text-slate-400 mt-1">
            Registre a chegada de novas roupas compradas do fornecedor, devoluções ou correções de contagem.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadData(filterType)}
          className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sm font-medium text-slate-200 flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Atualizar Lista</span>
        </button>
      </div>

      {/* Painel Superior: Registrar Entrada ou Saída Manual */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center gap-2 text-lg font-bold text-white mb-4">
          <PlusCircle className="w-5 h-5 text-emerald-400" />
          <span>Adicionar ou Retirar Peças do Estoque</span>
        </div>

        {error && (
          <div className="mb-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm font-medium">
            ✓ {successMsg}
          </div>
        )}

        <form
          onSubmit={handleCreateMovement}
          className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end"
        >
          <div className="md:col-span-5">
            <label className="block text-sm font-medium text-slate-200 mb-1.5">
              Escolha a Roupa (Tamanho e Cor)
            </label>
            <select
              required
              value={selectedVariantId}
              onChange={(e) => setSelectedVariantId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
            >
              {allVariants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.productName} — Tam: {v.sizeCode} / Cor: {v.colorName} (Atual: {v.stockQuantity} un.)
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-4">
            <label className="block text-sm font-medium text-slate-200 mb-1.5">
              Tipo de Movimentação
            </label>
            <select
              value={movementType}
              onChange={(e) => {
                const val = e.target.value as
                  | 'PURCHASE_IN'
                  | 'RETURN_IN'
                  | 'ADJUSTMENT_IN'
                  | 'ADJUSTMENT_OUT';
                setMovementType(val);
                if (val === 'PURCHASE_IN')
                  setReason('Chegada de mercadoria do fornecedor');
                if (val === 'RETURN_IN')
                  setReason('Troca ou devolução de cliente');
                if (val === 'ADJUSTMENT_IN')
                  setReason('Acerto de contagem de estoque');
                if (val === 'ADJUSTMENT_OUT')
                  setReason('Peça com defeito ou avaria');
              }}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
            >
              <option value="PURCHASE_IN">
                + Chegada de Mercadoria (Compra)
              </option>
              <option value="RETURN_IN">+ Devolução de Cliente</option>
              <option value="ADJUSTMENT_IN">
                + Adicionar Peças Manualmente
              </option>
              <option value="ADJUSTMENT_OUT">
                - Retirar Peças (Defeito / Perda)
              </option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-slate-200 mb-1.5">
              Quantidade de Peças
            </label>
            <input
              type="number"
              min={1}
              max={5000}
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
            />
          </div>

          {movementType === 'PURCHASE_IN' && (
            <div className="md:col-span-4">
              <label className="block text-sm font-medium text-slate-200 mb-1.5">
                Fornecedor
              </label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div
            className={
              movementType === 'PURCHASE_IN' ? 'md:col-span-4' : 'md:col-span-8'
            }
          >
            <label className="block text-sm font-medium text-slate-200 mb-1.5">
              Observação / Motivo
            </label>
            <input
              type="text"
              required
              minLength={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
            />
          </div>

          <div className="md:col-span-4">
            <button
              type="submit"
              disabled={submitting || previewNewStock < 0}
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-semibold text-white transition cursor-pointer"
            >
              {submitting
                ? 'Salvando...'
                : `Confirmar (${
                    activeVariant
                      ? `Vai ficar com ${previewNewStock} un.`
                      : ''
                  })`}
            </button>
          </div>
        </form>
      </div>

      {/* Histórico de Entradas e Saídas */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Boxes className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white">
              Histórico de Entradas e Saídas ({movements.length})
            </h2>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-200"
            >
              <option value="ALL">Mostrar Tudo</option>
              <option value="PURCHASE_IN">Apenas Compras de Fornecedor</option>
              <option value="SALE_OUT">Apenas Vendas Realizadas</option>
              <option value="INITIAL_BALANCE">Apenas Estoque Inicial</option>
              <option value="RETURN_IN">Apenas Devoluções</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-base text-slate-400">
            Carregando histórico de estoque...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-sm text-slate-400">
                  <th className="py-3 pr-3 font-semibold">Data e Hora</th>
                  <th className="py-3 px-3 font-semibold">Roupa / Opção</th>
                  <th className="py-3 px-3 font-semibold">Tipo</th>
                  <th className="py-3 px-3 font-semibold">Quantidade</th>
                  <th className="py-3 px-3 font-semibold">Como ficou o estoque</th>
                  <th className="py-3 pl-3 font-semibold">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-sm">
                {movements.map((m) => {
                  const isOut =
                    m.movementType === 'SALE_OUT' ||
                    m.movementType === 'ADJUSTMENT_OUT';

                  return (
                    <tr key={m.id} className="hover:bg-slate-800/30">
                      <td className="py-3.5 pr-3 text-slate-400 whitespace-nowrap">
                        {formatDateTimeBR(m.createdAt)}
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="font-semibold text-white">
                          {m.productName}
                        </div>
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
                          {movementLabel[m.movementType] ?? m.movementType}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 font-bold text-white">
                        {isOut ? `-${m.quantity}` : `+${m.quantity}`} un.
                      </td>
                      <td className="py-3.5 px-3 text-slate-300">
                        Tinha {m.previousStock} &rarr;{' '}
                        <strong className="text-white">Ficou {m.newStock} un.</strong>
                      </td>
                      <td className="py-3.5 pl-3 text-slate-300">
                        <div>{m.reason}</div>
                        <div className="text-sm text-slate-500">
                          {m.supplierName && `Fornecedor: ${m.supplierName} • `}
                          {m.unitCost
                            ? `Custo: ${formatCurrencyBRL(m.unitCost)} • `
                            : ''}
                          {m.createdByUserName
                            ? `Por: ${m.createdByUserName}`
                            : ''}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
