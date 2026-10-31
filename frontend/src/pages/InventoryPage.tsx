import React, { useEffect, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Barcode,
  Boxes,
  CheckCircle2,
  Eye,
  FileText,
  Filter,
  PlusCircle,
  RefreshCw,
  Search,
  ShoppingBag,
  Tag,
  Truck,
  UserCheck,
  X,
} from 'lucide-react';
import {
  CsvExportBar,
  ITEMS_PER_PAGE,
  PaginationBar,
} from '../components/ListPaginationAndCsv';
import {
  apiRequest,
  formatCurrencyBRL,
  formatDateTimeBR,
} from '../services/api';
import {
  Employee,
  OrdersPaginatedResponse,
  Product,
  StockMovement,
  Supplier,
} from '../types/erp';
import { formatCpfCnpjMask } from '../utils/formatters';
import { getMovementBadge } from '../utils/movementBadge';

export const InventoryPage: React.FC = () => {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [emittedOrders, setEmittedOrders] = useState<
    Array<{
      id: string;
      orderNumber: number;
      invoiceNumber: string;
      customerName: string | null;
      items: Array<{ variantId: string; sku: string; productName: string }>;
    }>
  >([]);

  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchMovements, setSearchMovements] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [selectedMovement, setSelectedMovement] =
    useState<StockMovement | null>(null);

  // Campos de Operação de Estoque de Loja Real
  const [movementType, setMovementType] = useState<
    'PURCHASE_IN' | 'RETURN_IN' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT'
  >('PURCHASE_IN');
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('10');
  const [tagCode, setTagCode] = useState<string>('');
  const [invoiceNumber, setInvoiceNumber] = useState<string>('NF-FORN-00580');
  const [supplierId, setSupplierId] = useState<string>('');
  const [unitCost, setUnitCost] = useState<string>('48.50');
  const [employeeId, setEmployeeId] = useState<string>('');
  const [operationPresetReason, setOperationPresetReason] = useState<string>(
    'Remessa conferida com etiqueta de fábrica'
  );
  const [defectDestination, setDefectDestination] = useState<string>(
    'Separada para devolução ao fornecedor'
  );
  const [extraNotes, setExtraNotes] = useState<string>('');

  const loadData = async (typeFilter = filterType) => {
    setLoading(true);
    try {
      const [movs, prods, meta, empList, ordData] = await Promise.all([
        apiRequest<StockMovement[]>(
          `/inventory/movements?movementType=${encodeURIComponent(typeFilter)}`
        ),
        apiRequest<Product[]>('/products'),
        apiRequest<{ suppliers: Supplier[] }>('/products/metadata'),
        apiRequest<Employee[]>('/partners/employees'),
        apiRequest<OrdersPaginatedResponse>('/orders?limit=30'),
      ]);

      setMovements(movs);
      setProducts(prods);
      setSuppliers(meta.suppliers);
      setEmployees(empList);

      const withNf = ordData.orders
        .filter((o) => Boolean(o.invoiceNumber))
        .map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          invoiceNumber: o.invoiceNumber!,
          customerName: o.customerName,
          items: o.items.map((i) => ({
            variantId: i.variantId,
            sku: i.sku,
            productName: i.productName,
          })),
        }));
      setEmittedOrders(withNf);

      const firstVar = prods[0]?.variants[0];
      if (!selectedVariantId && firstVar) {
        setSelectedVariantId(firstVar.id);
        setTagCode(firstVar.barcodeEan || firstVar.sku);
        setUnitCost(String(prods[0].costPrice || 48.5));
      }
      if (!supplierId && meta.suppliers[0]) {
        setSupplierId(meta.suppliers[0].id);
      }
      if (!employeeId && empList[0]) {
        setEmployeeId(empList[0].id);
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

  const handleVariantChange = (newVarId: string) => {
    setSelectedVariantId(newVarId);
    const found = allVariants.find((v) => v.id === newVarId);
    if (found) {
      setTagCode(found.barcodeEan || found.sku);
      if (movementType === 'PURCHASE_IN') {
        setUnitCost(String(found.costPrice || 45));
      }
    }
  };

  const handleMovementTypeChange = (
    nextType: 'PURCHASE_IN' | 'RETURN_IN' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT'
  ) => {
    setMovementType(nextType);
    setError(null);
    setSuccessMsg(null);

    if (nextType === 'PURCHASE_IN') {
      setQuantity('10');
      setInvoiceNumber('NF-FORN-00580');
      setOperationPresetReason('Remessa conferida com etiqueta do fornecedor');
    } else if (nextType === 'RETURN_IN') {
      setQuantity('1');
      setInvoiceNumber(emittedOrders[0]?.invoiceNumber || 'NF-000101');
      setOperationPresetReason('Troca de tamanho solicitada pelo cliente');
    } else if (nextType === 'ADJUSTMENT_IN') {
      setQuantity('2');
      setInvoiceNumber('');
      setOperationPresetReason(
        'Sobra identificada na contagem física das araras'
      );
    } else if (nextType === 'ADJUSTMENT_OUT') {
      setQuantity('1');
      setInvoiceNumber('');
      setOperationPresetReason(
        'Defeito na costura / zíper identificado na loja'
      );
      setDefectDestination('Separada para devolução ao fornecedor');
    }
  };

  const handleGenerateInternalTag = () => {
    if (!activeVariant) return;
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    setTagCode(`ETQ-${activeVariant.sku}-${randomSuffix}`);
  };

  const handleCreateMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);

    const finalReason =
      movementType === 'ADJUSTMENT_OUT'
        ? `${operationPresetReason} • Destino: ${defectDestination}${
            extraNotes.trim() ? ` (${extraNotes.trim()})` : ''
          }`
        : `${operationPresetReason}${
            extraNotes.trim() ? ` — ${extraNotes.trim()}` : ''
          }`;

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
          supplierId:
            movementType === 'PURCHASE_IN' ? supplierId || null : null,
          unitCost:
            movementType === 'PURCHASE_IN' ? Number(unitCost) || null : null,
          invoiceNumber:
            movementType === 'PURCHASE_IN' || movementType === 'RETURN_IN'
              ? invoiceNumber.trim()
              : null,
          tagCode: tagCode.trim(),
          employeeId: employeeId || null,
          reason: finalReason,
        }),
      });

      setSuccessMsg(
        `Operação registrada! Etiqueta ${tagCode.toUpperCase()} (${
          res.sku
        }) passou de ${res.previousStock} para ${res.newStock} unidades no estoque.`
      );
      setExtraNotes('');
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
    PURCHASE_IN: 'Chegada de Fornecedor',
    SALE_OUT: 'Saída por Venda',
    RETURN_IN: 'Devolução de Cliente',
    ADJUSTMENT_IN: 'Entrada Manual / Balanço (+)',
    ADJUSTMENT_OUT: 'Retirada por Defeito / Baixa (-)',
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Controle de Estoque e Etiquetas
          </h1>
          <p className="text-sm sm:text-base text-slate-400 mt-1">
            Registre chegada de mercadorias com NF do fornecedor, devoluções de clientes (com validação da NF de venda), balanço manual ou baixa de peças com defeito.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadData(filterType)}
          className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sm font-medium text-slate-200 flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Atualizar Estoque</span>
        </button>
      </div>

      {/* Painel Superior: Operação de Estoque de Loja Real */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2 text-lg font-bold text-white">
            <PlusCircle className="w-5 h-5 text-emerald-400" />
            <span>Registrar Operação no Estoque da Loja</span>
          </div>

          {/* Abas Rápidas das 4 Operações Reais da Loja */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleMovementTypeChange('PURCHASE_IN')}
              className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
                movementType === 'PURCHASE_IN'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
              }`}
            >
              + Chegada de Mercadoria
            </button>

            <button
              type="button"
              onClick={() => handleMovementTypeChange('RETURN_IN')}
              className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
                movementType === 'RETURN_IN'
                  ? 'bg-purple-600 text-white shadow'
                  : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
              }`}
            >
              + Devolução de Cliente (Com NF)
            </button>

            <button
              type="button"
              onClick={() => handleMovementTypeChange('ADJUSTMENT_IN')}
              className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
                movementType === 'ADJUSTMENT_IN'
                  ? 'bg-sky-600 text-white shadow'
                  : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
              }`}
            >
              + Adicionar Manualmente
            </button>

            <button
              type="button"
              onClick={() => handleMovementTypeChange('ADJUSTMENT_OUT')}
              className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
                movementType === 'ADJUSTMENT_OUT'
                  ? 'bg-rose-600 text-white shadow'
                  : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
              }`}
            >
              - Retirar Peça com Defeito
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm font-medium">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm font-medium flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleCreateMovement} className="space-y-4">
          {/* Linha 1: Peça, Código da Etiqueta, Quantidade e Funcionário */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-4">
              <label className="block text-sm font-medium text-slate-200 mb-1.5">
                Escolha a Roupa (Tamanho e Cor) *
              </label>
              <select
                required
                value={selectedVariantId}
                onChange={(e) => handleVariantChange(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
              >
                {allVariants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.productName} — Tam: {v.sizeCode} / {v.colorName} (
                    {v.stockQuantity <= 0
                      ? 'Sem roupas no estoque - 0 un.'
                      : `Saldo: ${v.stockQuantity} un.`}
                    )
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-slate-200 flex items-center gap-1">
                  <Barcode className="w-4 h-4 text-amber-400" />
                  <span>
                    {movementType === 'PURCHASE_IN'
                      ? 'Etiqueta do Fornecedor *'
                      : 'Código da Etiqueta *'}
                  </span>
                </label>
                {movementType === 'ADJUSTMENT_IN' && (
                  <button
                    type="button"
                    onClick={handleGenerateInternalTag}
                    className="text-sm text-indigo-400 hover:underline font-medium cursor-pointer"
                  >
                    Gerar Etiqueta
                  </button>
                )}
              </div>
              <input
                type="text"
                required
                placeholder="Ex: 7890001000012 ou SKU"
                value={tagCode}
                onChange={(e) => setTagCode(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono text-amber-300"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-200 mb-1.5">
                Qtd. de Peças *
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

            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-slate-200 mb-1.5">
                Funcionário Responsável *
              </label>
              <select
                required
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.jobTitle})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Linha 2: Campos específicos de cada operação de loja real */}
          {movementType === 'PURCHASE_IN' && (
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-4">
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  Fornecedor da Mercadoria (CNPJ) *
                </label>
                <select
                  required
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-white"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}{' '}
                      {s.document ? `(${formatCpfCnpjMask(s.document)})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-4">
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  Nº da Nota Fiscal de Entrada (Fornecedor) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: NF-FORN-00580"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-white"
                />
              </div>

              <div className="md:col-span-4">
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  Custo Unitário na Nota (R$) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0.01}
                  required
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-white"
                />
              </div>
            </div>
          )}

          {movementType === 'RETURN_IN' && (
            <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/30 grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-4">
                <label className="block text-sm font-semibold text-indigo-200 mb-1.5">
                  Nº da Nota Fiscal da Venda (Obrigatório) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: NF-000101"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-indigo-500/50 text-sm font-bold text-white"
                />
              </div>

              <div className="md:col-span-4">
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  Ou selecione uma NF emitida na loja
                </label>
                <select
                  value={invoiceNumber}
                  onChange={(e) => {
                    const nf = e.target.value;
                    setInvoiceNumber(nf);
                    const foundOrd = emittedOrders.find(
                      (o) => o.invoiceNumber === nf
                    );
                    if (foundOrd && foundOrd.items[0]) {
                      handleVariantChange(foundOrd.items[0].variantId);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                >
                  <option value="">Selecionar NF emitida...</option>
                  {emittedOrders.map((o) => (
                    <option key={o.id} value={o.invoiceNumber}>
                      {o.invoiceNumber} — Cliente: {o.customerName} (Venda #
                      {o.orderNumber})
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-4">
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  Motivo da Devolução do Cliente *
                </label>
                <select
                  value={operationPresetReason}
                  onChange={(e) => setOperationPresetReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                >
                  <option value="Troca de tamanho solicitada pelo cliente (Etiqueta intacta)">
                    Troca de tamanho (Etiqueta intacta)
                  </option>
                  <option value="Troca de cor ou modelo pelo cliente">
                    Troca de cor ou modelo
                  </option>
                  <option value="Devolução dentro do prazo legal (7 dias)">
                    Devolução no prazo de 7 dias
                  </option>
                </select>
              </div>
            </div>
          )}

          {movementType === 'ADJUSTMENT_IN' && (
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-6">
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  Origem da Entrada Manual *
                </label>
                <select
                  value={operationPresetReason}
                  onChange={(e) => setOperationPresetReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-white"
                >
                  <option value="Sobra identificada na contagem física das araras">
                    Sobra identificada na contagem física das araras (Inventário)
                  </option>
                  <option value="Retorno de peça que estava em exposição no manequim / vitrine">
                    Retorno de peça em exposição no manequim / vitrine
                  </option>
                  <option value="Entrada de lote de confecção própria da loja">
                    Entrada de lote de confecção própria da loja
                  </option>
                </select>
              </div>

              <div className="md:col-span-6">
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  Observação Complementar (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Peças etiquetadas e conferidas na arara central"
                  value={extraNotes}
                  onChange={(e) => setExtraNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-white"
                />
              </div>
            </div>
          )}

          {movementType === 'ADJUSTMENT_OUT' && (
            <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-6">
                <label className="block text-sm font-medium text-rose-200 mb-1.5">
                  Tipo de Defeito ou Motivo da Retirada *
                </label>
                <select
                  value={operationPresetReason}
                  onChange={(e) => setOperationPresetReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                >
                  <option value="Defeito na costura / zíper identificado na loja">
                    Defeito de fabricação (costura, zíper ou botão)
                  </option>
                  <option value="Peça manchada ou danificada no provador / manequim">
                    Peça danificada no provador ou manequim
                  </option>
                  <option value="Divergência / perda apurada na contagem física de estoque">
                    Perda / falta apurada no balanço de estoque
                  </option>
                </select>
              </div>

              <div className="md:col-span-6">
                <label className="block text-sm font-medium text-rose-200 mb-1.5">
                  Destino da Peça Retirada *
                </label>
                <select
                  value={defectDestination}
                  onChange={(e) => setDefectDestination(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                >
                  <option value="Separada para devolução ao fornecedor">
                    Separada para troca junto ao fornecedor
                  </option>
                  <option value="Enviada para conserto / costureira">
                    Enviada para conserto na costureira
                  </option>
                  <option value="Baixa definitiva / descarte">
                    Baixa definitiva / descarte
                  </option>
                </select>
              </div>
            </div>
          )}

          {/* Linha 3: Resumo da Operação e Botão Confirmar */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <div className="text-sm text-slate-300 flex flex-wrap items-center gap-2">
              {activeVariant && (
                <>
                  <span>
                    Saldo atual da peça:{' '}
                    <strong className="text-white">
                      {activeVariant.stockQuantity} un.
                    </strong>{' '}
                    &rarr; Novo saldo após confirmar:{' '}
                    <strong
                      className={
                        previewNewStock <= 0
                          ? 'text-rose-400'
                          : 'text-emerald-400'
                      }
                    >
                      {previewNewStock} un.
                    </strong>
                  </span>
                  {activeVariant.stockQuantity <= 0 && (
                    <span className="px-2.5 py-0.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-bold">
                      Sem roupas no estoque
                    </span>
                  )}
                </>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting || previewNewStock < 0}
              className={`py-3 px-6 rounded-xl disabled:opacity-50 text-sm font-bold text-white transition cursor-pointer ${
                isOutflow
                  ? 'bg-rose-600 hover:bg-rose-500'
                  : 'bg-indigo-600 hover:bg-indigo-500'
              }`}
            >
              {submitting
                ? 'Registrando no Estoque...'
                : isOutflow
                ? 'Confirmar Baixa de Peça'
                : 'Confirmar Entrada no Estoque'}
            </button>
          </div>
        </form>
      </div>

      {/* Histórico de Entradas e Saídas */}
      {(() => {
        const filteredMovements = movements.filter((m) => {
          if (!searchMovements.trim()) return true;
          const q = searchMovements.trim().toLowerCase();
          return (
            m.productName.toLowerCase().includes(q) ||
            (m.tagCode || m.sku).toLowerCase().includes(q) ||
            (m.invoiceNumber || '').toLowerCase().includes(q) ||
            (m.reason || '').toLowerCase().includes(q) ||
            (m.customerName || '').toLowerCase().includes(q) ||
            (m.supplierName || '').toLowerCase().includes(q) ||
            (m.createdByUserName || m.orderSellerName || '')
              .toLowerCase()
              .includes(q)
          );
        });

        const paginatedMovements = filteredMovements.slice(
          (currentPage - 1) * ITEMS_PER_PAGE,
          currentPage * ITEMS_PER_PAGE
        );

        return (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Boxes className="w-5 h-5 text-indigo-400" />
                  <h2 className="text-lg font-bold text-white">
                    Histórico de Entradas e Saídas ({filteredMovements.length})
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative w-full sm:w-72">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      placeholder="Buscar roupa, etiqueta, NF, pessoa..."
                      value={searchMovements}
                      onChange={(e) => {
                        setSearchMovements(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm text-white"
                    />
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <select
                      value={filterType}
                      onChange={(e) => {
                        setFilterType(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-200"
                    >
                      <option value="ALL">Mostrar Todas as Operações</option>
                      <option value="PURCHASE_IN">
                        Apenas Chegadas de Fornecedor
                      </option>
                      <option value="SALE_OUT">Apenas Saídas por Venda</option>
                      <option value="RETURN_IN">
                        Apenas Devoluções de Clientes
                      </option>
                      <option value="ADJUSTMENT_IN">
                        Apenas Entradas Manuais
                      </option>
                      <option value="ADJUSTMENT_OUT">
                        Apenas Baixas por Defeito
                      </option>
                    </select>
                  </div>
                </div>
              </div>

              <CsvExportBar
                reportTitle="Histórico de Movimentações de Estoque"
                filenamePrefix="movimentacoes-estoque"
                items={filteredMovements}
                activeFilters={[
                  {
                    label: 'Operação',
                    value:
                      filterType === 'ALL'
                        ? 'Todas'
                        : movementLabel[filterType] || filterType,
                  },
                  { label: 'Busca', value: searchMovements || 'Todas' },
                ]}
                headers={[
                  'Data e Hora',
                  'Produto / Roupa',
                  'Etiqueta / Código',
                  'Tamanho',
                  'Cor',
                  'Operação',
                  'Nota Fiscal',
                  'Quantidade',
                  'Saldo Antes',
                  'Saldo Depois',
                  'Fornecedor / Cliente',
                  'Funcionário Responsável',
                  'Motivo / Detalhe',
                ]}
                rowMapper={(m) => {
                  const isOut =
                    m.movementType === 'SALE_OUT' ||
                    m.movementType === 'ADJUSTMENT_OUT';
                  return [
                    formatDateTimeBR(m.createdAt),
                    m.productName,
                    m.tagCode || m.sku,
                    m.sizeCode,
                    m.colorName,
                    movementLabel[m.movementType] ?? m.movementType,
                    m.invoiceNumber || '—',
                    isOut ? `-${m.quantity}` : `+${m.quantity}`,
                    m.previousStock,
                    m.newStock,
                    m.customerName || m.supplierName || 'Estoque Interno',
                    m.createdByUserName || m.orderSellerName || 'Equipe',
                    m.reason || '—',
                  ];
                }}
              />
            </div>

            {loading ? (
              <div className="py-12 text-center text-base text-slate-400">
                Carregando histórico de estoque...
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-sm text-slate-400">
                        <th className="py-3 pr-3 font-semibold">Data e Hora</th>
                        <th className="py-3 px-3 font-semibold">
                          Roupa / Etiqueta
                        </th>
                        <th className="py-3 px-3 font-semibold">
                          Operação / NF
                        </th>
                        <th className="py-3 px-3 font-semibold">Qtd</th>
                        <th className="py-3 px-3 font-semibold">Saldo</th>
                        <th className="py-3 pl-3 font-semibold">
                          Responsável / Detalhes
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70 text-sm">
                      {paginatedMovements.map((m) => {
                        const badge = getMovementBadge(
                          m.movementType,
                          m.quantity
                        );

                        return (
                          <tr
                            key={m.id}
                            onClick={() => setSelectedMovement(m)}
                            className="hover:bg-slate-800/40 cursor-pointer transition group"
                          >
                            <td className="py-3.5 pr-3 text-slate-400 whitespace-nowrap">
                              {formatDateTimeBR(m.createdAt)}
                            </td>
                            <td className="py-3.5 px-3">
                              <div className="font-semibold text-white group-hover:text-indigo-300 flex items-center gap-1.5">
                                <span>{m.productName}</span>
                                <Eye className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition shrink-0" />
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400 mt-0.5">
                                <span className="font-mono text-amber-300">
                                  Etq: {m.tagCode || m.sku}
                                </span>
                                <span>•</span>
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
                              <div className="flex flex-col items-start gap-1">
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
                                    {movementLabel[m.movementType] ?? badge.label}
                                  </span>
                                </span>

                                {m.invoiceNumber && (
                                  <span className="inline-flex items-center gap-1 text-sm text-indigo-300 font-semibold">
                                    <FileText className="w-3.5 h-3.5" />
                                    {m.invoiceNumber}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className={`py-3.5 px-3 whitespace-nowrap ${badge.qtyColor}`}>
                              {badge.qtyText} un.
                            </td>
                            <td className="py-3.5 px-3 text-slate-300 whitespace-nowrap">
                              {m.previousStock} &rarr;{' '}
                              <strong
                                className={
                                  m.newStock <= 0
                                    ? 'text-rose-400 font-bold'
                                    : 'text-white'
                                }
                              >
                                {m.newStock} un.
                              </strong>
                            </td>
                            <td className="py-3.5 pl-3 text-slate-300">
                              <div>{m.reason}</div>
                              <div className="text-sm text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2">
                                {m.customerName && (
                                  <span className="text-amber-300 font-medium">
                                    Cliente: {m.customerName}
                                  </span>
                                )}
                                {m.supplierName && (
                                  <span className="text-emerald-300 font-medium">
                                    Fornecedor: {m.supplierName}
                                  </span>
                                )}
                                {(m.createdByUserName || m.orderSellerName) && (
                                  <span className="text-indigo-300">
                                    Por:{' '}
                                    {m.createdByUserName || m.orderSellerName}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <PaginationBar
                  currentPage={currentPage}
                  totalItems={filteredMovements.length}
                  onPageChange={setCurrentPage}
                />
              </>
            )}
          </div>
        );
      })()}

      {/* Modal de Detalhes da Movimentação e Produto */}
      {selectedMovement && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedMovement(null)}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  {(() => {
                    const modalBadge = getMovementBadge(
                      selectedMovement.movementType,
                      selectedMovement.quantity
                    );
                    return (
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm ${modalBadge.badgeStyle}`}
                      >
                        {modalBadge.iconType === 'sale' ? (
                          <ShoppingBag className="w-4 h-4 text-emerald-400" />
                        ) : modalBadge.iconType === 'defect_out' ? (
                          <ArrowDownRight className="w-4 h-4 text-rose-400" />
                        ) : modalBadge.iconType === 'initial' ? (
                          <Boxes className="w-4 h-4 text-slate-200" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" />
                        )}
                        <span>
                          {movementLabel[selectedMovement.movementType] ??
                            modalBadge.label}
                        </span>
                      </span>
                    );
                  })()}

                  {selectedMovement.invoiceNumber && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-sm font-semibold">
                      <FileText className="w-4 h-4" />
                      Nota Fiscal: {selectedMovement.invoiceNumber}
                    </span>
                  )}
                </div>

                <h3 className="text-xl font-bold text-white mt-2">
                  Ficha da Operação de Estoque
                </h3>
                <p className="text-sm text-slate-400">
                  Registrado em {formatDateTimeBR(selectedMovement.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMovement(null)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 bg-slate-950/70 border border-slate-800 rounded-xl p-4">
              {selectedMovement.productImageUrl && (
                <img
                  src={selectedMovement.productImageUrl}
                  alt={selectedMovement.productName}
                  className="w-24 h-24 rounded-xl object-cover border border-slate-800 shrink-0"
                />
              )}
              <div className="space-y-1.5 flex-1">
                <div className="text-sm text-indigo-400 font-medium">
                  {selectedMovement.categoryName ?? 'Vestuário'}
                </div>
                <div className="text-lg font-bold text-white">
                  {selectedMovement.productName}
                </div>
                <div className="flex flex-wrap items-center gap-2.5 text-sm text-slate-300 pt-1">
                  <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-amber-400" />
                    Etiqueta:{' '}
                    <strong className="font-mono text-amber-300">
                      {selectedMovement.tagCode || selectedMovement.sku}
                    </strong>
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800">
                    Tam: <strong>{selectedMovement.sizeCode}</strong>
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 flex items-center gap-1.5">
                    <span
                      className="w-3 h-3 rounded-full inline-block border border-slate-600"
                      style={{ backgroundColor: selectedMovement.colorHex }}
                    />
                    Cor: <strong>{selectedMovement.colorName}</strong>
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5">
                <div className="text-sm text-slate-400">Estoque Antes</div>
                <div className="text-lg font-bold text-white mt-0.5">
                  {selectedMovement.previousStock} peças
                </div>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5">
                <div className="text-sm text-slate-400">Qtd. Movimentada</div>
                {(() => {
                  const modalBadge = getMovementBadge(
                    selectedMovement.movementType,
                    selectedMovement.quantity
                  );
                  return (
                    <div className={`text-lg font-bold mt-0.5 ${modalBadge.qtyColor}`}>
                      {modalBadge.qtyText} peças
                    </div>
                  );
                })()}
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5">
                <div className="text-sm text-slate-400">Estoque Depois</div>
                <div
                  className={`text-lg font-bold mt-0.5 ${
                    selectedMovement.newStock <= 0
                      ? 'text-rose-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {selectedMovement.newStock} peças
                </div>
              </div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
              <h4 className="text-base font-bold text-white">
                Responsável e Vínculo Fiscal da Operação
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-900 border border-slate-800/80">
                  <UserCheck className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-slate-400">Funcionário Responsável</div>
                    <div className="font-semibold text-white mt-0.5">
                      {selectedMovement.createdByUserName ||
                        selectedMovement.orderSellerName ||
                        'Equipe da Loja'}
                    </div>
                  </div>
                </div>

                {selectedMovement.movementType === 'SALE_OUT' ||
                selectedMovement.movementType === 'RETURN_IN' ? (
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-900 border border-slate-800/80">
                    <ShoppingBag className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-slate-400">
                        Cliente / Nota Fiscal de Venda
                      </div>
                      <div className="font-semibold text-white mt-0.5">
                        {selectedMovement.customerName || 'Cliente da Loja'}
                      </div>
                      {selectedMovement.invoiceNumber && (
                        <div className="text-indigo-300 font-semibold">
                          NF Vinculada: {selectedMovement.invoiceNumber}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-900 border border-slate-800/80">
                    <Truck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-slate-400">Fornecedor / Origem</div>
                      <div className="font-semibold text-white mt-0.5">
                        {selectedMovement.supplierName || 'Controle Interno da Loja'}
                      </div>
                      {selectedMovement.invoiceNumber && (
                        <div className="text-emerald-300 font-semibold">
                          NF Entrada: {selectedMovement.invoiceNumber}
                        </div>
                      )}
                      {selectedMovement.unitCost && (
                        <div className="text-slate-400">
                          Custo unitário:{' '}
                          {formatCurrencyBRL(selectedMovement.unitCost)}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {selectedMovement.reason && (
                <div className="text-sm text-slate-300 pt-1">
                  <span className="text-slate-400">Observação / Detalhe:</span>{' '}
                  {selectedMovement.reason}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedMovement(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-white cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
