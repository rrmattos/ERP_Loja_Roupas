import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Filter,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import {
  CsvExportBar,
  ITEMS_PER_PAGE,
  PaginationBar,
} from '../components/ListPaginationAndCsv';
import { useAuth } from '../context/AuthContext';
import {
  apiRequest,
  formatCurrencyBRL,
  formatDateTimeBR,
} from '../services/api';
import {
  Order,
  OrdersPaginatedResponse,
  Product,
  SalesChannel,
} from '../types/erp';
import {
  formatCpfCnpjMask,
  formatPhoneMask,
  onlyDigits,
} from '../utils/formatters';

interface CartItem {
  variantId: string;
  sku: string;
  productName: string;
  sizeCode: string;
  colorName: string;
  colorHex: string;
  unitPrice: number;
  availableStock: number;
  quantity: number;
}

export const OrdersPosPage: React.FC = () => {
  const { tenant } = useAuth();

  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sellers, setSellers] = useState<
    Array<{ id: string; name: string; jobTitle?: string; role: string }>
  >([]);
  const [registeredCustomers, setRegisteredCustomers] = useState<
    Array<{
      id: string;
      name: string;
      phone: string | null;
      document?: string | null;
    }>
  >([]);

  // Paginação (10 linhas por página) e Filtros do Histórico de Vendas
  const [periodFilter, setPeriodFilter] = useState<string>('all');
  const [customerFilter, setCustomerFilter] = useState<string>('ALL');
  const [sellerFilter, setSellerFilter] = useState<string>('ALL');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [filteredRevenue, setFilteredRevenue] = useState<number>(0);

  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [issuingNfId, setIssuingNfId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modais: Detalhes da Venda e Nota Fiscal (DANFE)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [invoiceOrder, setInvoiceOrder] = useState<Order | null>(null);

  // Estado do Carrinho de Venda
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [itemQty, setItemQty] = useState<number>(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedSellerId, setSelectedSellerId] = useState<string>('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('Cliente na Loja');
  const [customerDocument, setCustomerDocument] = useState<string>('');
  const [channel, setChannel] = useState<SalesChannel>('ERP_POS');

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        period: periodFilter,
        customer: customerFilter,
        sellerId: sellerFilter,
        search: searchFilter.trim(),
        page: '1',
        limit: '200',
      });

      const [ordersData, productsData] = await Promise.all([
        apiRequest<OrdersPaginatedResponse>(`/orders?${params.toString()}`),
        apiRequest<Product[]>('/products'),
      ]);

      setOrders(ordersData.orders);
      setFilteredRevenue(ordersData.pagination.filteredRevenue);
      setSellers(ordersData.filterOptions.sellers);
      setRegisteredCustomers(ordersData.filterOptions.customers);
      setProducts(productsData);

      if (ordersData.filterOptions.sellers.length > 0 && !selectedSellerId) {
        const defaultStaff =
          ordersData.filterOptions.sellers.find((s) => s.role === 'STAFF') ||
          ordersData.filterOptions.sellers[0];
        if (defaultStaff) {
          setSelectedSellerId(defaultStaff.id);
        }
      }

      const firstAvailable = productsData
        .flatMap((p) => p.variants)
        .find((v) => v.stockQuantity > 0);
      if (firstAvailable && !selectedVariantId) {
        setSelectedVariantId(firstAvailable.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar vendas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    void loadData();
  }, [periodFilter, customerFilter, sellerFilter, searchFilter]);

  const paginatedOrders = orders.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  const allVariants = products.flatMap((p) =>
    p.variants.map((v) => ({
      ...v,
      productName: p.name,
    }))
  );

  const handleAddToCart = () => {
    setError(null);
    const variant = allVariants.find((v) => v.id === selectedVariantId);
    if (!variant) return;

    if (variant.stockQuantity < itemQty) {
      setError(
        `Estoque insuficiente para esta peça. Disponível: ${variant.stockQuantity} un.`
      );
      return;
    }

    setCart((prev) => {
      const existingIndex = prev.findIndex((i) => i.variantId === variant.id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        const nextQty = updated[existingIndex].quantity + itemQty;
        if (nextQty > variant.stockQuantity) {
          setError(
            `Quantidade na sacola excede o estoque disponível (${variant.stockQuantity} un.).`
          );
          return prev;
        }
        updated[existingIndex].quantity = nextQty;
        return updated;
      }

      return [
        ...prev,
        {
          variantId: variant.id,
          sku: variant.sku,
          productName: variant.productName,
          sizeCode: variant.sizeCode,
          colorName: variant.colorName,
          colorHex: variant.colorHex,
          unitPrice: variant.finalPrice,
          availableStock: variant.stockQuantity,
          quantity: itemQty,
        },
      ];
    });
  };

  const handleRemoveFromCart = (variantId: string) => {
    setCart((prev) => prev.filter((i) => i.variantId !== variantId));
  };

  const cartTotal = cart.reduce(
    (acc, item) => acc + item.unitPrice * item.quantity,
    0
  );

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;

    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      const res = await apiRequest<{
        orderId: string;
        orderNumber: number;
        totalAmount: number;
      }>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          sellerId: selectedSellerId || null,
          customerId: selectedCustomerId || null,
          customerName,
          customerDocument: onlyDigits(customerDocument),
          channel,
          items: cart.map((i) => ({
            variantId: i.variantId,
            quantity: i.quantity,
          })),
        }),
      });

      setCart([]);
      setSuccessMsg(
        `Venda #${res.orderNumber} concluída (${formatCurrencyBRL(
          res.totalAmount
        )})! Você já pode emitir a Nota Fiscal na lista ao lado.`
      );
      setPage(1);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao finalizar venda.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleIssueOrOpenInvoice = async (
    order: Order,
    e?: React.MouseEvent
  ) => {
    if (e) e.stopPropagation();
    setError(null);

    if (order.invoiceNumber && order.invoiceAccessKey) {
      setInvoiceOrder(order);
      return;
    }

    setIssuingNfId(order.id);
    try {
      const issued = await apiRequest<{
        id: string;
        orderNumber: number;
        invoiceNumber: string;
        invoiceSeries: string;
        invoiceAccessKey: string;
        invoiceIssuedAt: string;
        customerDocument: string | null;
      }>(`/orders/${order.id}/issue-invoice`, {
        method: 'POST',
        body: JSON.stringify({
          customerDocument: order.customerDocument || undefined,
        }),
      });

      const updatedOrder: Order = {
        ...order,
        invoiceNumber: issued.invoiceNumber,
        invoiceSeries: issued.invoiceSeries,
        invoiceAccessKey: issued.invoiceAccessKey,
        invoiceIssuedAt: issued.invoiceIssuedAt,
        customerDocument: issued.customerDocument,
      };

      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? updatedOrder : o))
      );
      if (selectedOrder?.id === order.id) {
        setSelectedOrder(updatedOrder);
      }
      setInvoiceOrder(updatedOrder);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao emitir Nota Fiscal.'
      );
    } finally {
      setIssuingNfId(null);
    }
  };

  const buildInvoiceHtmlDocument = (order: Order): string => {
    const storeName = tenant?.name || 'Vértice Moda & Vestuário';
    const legalName =
      tenant?.legalName || `${storeName} Comércio de Confecções Ltda`;
    const storeCnpj = tenant?.document
      ? formatCpfCnpjMask(tenant.document)
      : '28.456.789/0001-55';
    const storeIe = tenant?.stateRegistration || '114.892.330.119';
    const storeAddress =
      tenant?.address ||
      'Rua Oscar Freire, 840 - Jardim Paulista, São Paulo/SP';
    const storePhone = tenant?.phone
      ? formatPhoneMask(tenant.phone)
      : '(11) 3456-7890';
    const nfNumber = order.invoiceNumber || `NF-000${100 + order.orderNumber}`;
    const nfSeries = order.invoiceSeries || '001';
    const accessKey =
      order.invoiceAccessKey ||
      '3526 1028 4567 8900 0155 5500 1000 0001 0110 0001 0190';
    const issuedDate = formatDateTimeBR(
      order.invoiceIssuedAt || order.createdAt
    );
    const icmsValue = order.totalAmount * 0.18;
    const approxTaxes = order.totalAmount * 0.245;

    const itemsRows = order.items
      .map(
        (item) => `
        <tr>
          <td>${item.sku}</td>
          <td>${item.productName} (Tam: ${item.sizeCode} / Cor: ${item.colorName})</td>
          <td>6109.10.00</td>
          <td>5102</td>
          <td>UN</td>
          <td style="text-align:center">${item.quantity}</td>
          <td style="text-align:right">${formatCurrencyBRL(item.unitPrice)}</td>
          <td style="text-align:right"><strong>${formatCurrencyBRL(item.subtotal)}</strong></td>
        </tr>`
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>DANFE - Nota Fiscal ${nfNumber} - ${storeName}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 24px; background: #fff; }
    .danfe-box { max-width: 820px; margin: 0 auto; border: 2px solid #111827; padding: 16px; }
    .header-grid { display: grid; grid-template-columns: 1.5fr 1fr 1.3fr; gap: 12px; border-bottom: 2px solid #111827; padding-bottom: 12px; }
    .box { border: 1px solid #374151; padding: 8px 10px; font-size: 12px; }
    .box-title { font-size: 10px; text-transform: uppercase; color: #4b5563; font-weight: bold; margin-bottom: 3px; }
    .box-value { font-size: 13px; font-weight: bold; color: #111827; }
    .section-title { font-size: 12px; font-weight: bold; text-transform: uppercase; background: #f3f4f6; padding: 5px 8px; border: 1px solid #374151; margin-top: 12px; }
    .grid-3 { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; margin-top: 6px; }
    .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 12px; }
    th, td { border: 1px solid #374151; padding: 6px 8px; text-align: left; }
    th { background: #f3f4f6; font-size: 11px; text-transform: uppercase; }
    .barcode { font-family: monospace; letter-spacing: 3px; font-size: 13px; background: #f9fafb; padding: 8px; text-align: center; border: 1px dashed #374151; margin-top: 4px; }
    .footer { margin-top: 14px; font-size: 11px; color: #374151; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="danfe-box">
    <div class="header-grid">
      <div class="box">
        <div class="box-title">Identificação do Emitente (Lojista)</div>
        <div style="font-size:16px;font-weight:bold;margin-bottom:4px;">${storeName}</div>
        <div>Razão Social: ${legalName}</div>
        <div>CNPJ: <strong>${storeCnpj}</strong> • IE: ${storeIe}</div>
        <div>${storeAddress}</div>
        <div>Tel: ${storePhone}</div>
      </div>
      <div class="box" style="text-align:center;">
        <div style="font-size:16px;font-weight:bold;">DANFE</div>
        <div style="font-size:11px;">Documento Auxiliar da Nota Fiscal Eletrônica</div>
        <div style="margin-top:8px;font-size:15px;font-weight:bold;">Nº ${nfNumber}</div>
        <div>Série: ${nfSeries} • Tipo: 1 - SAÍDA</div>
      </div>
      <div class="box">
        <div class="box-title">Chave de Acesso SEFAZ (44 Dígitos)</div>
        <div class="barcode">|||| |||| ||| ||||| |||| ||||| |||| |||</div>
        <div style="font-family:monospace;font-size:11px;word-break:break-all;margin-top:4px;">${accessKey}</div>
        <div style="margin-top:6px;font-size:11px;">Protocolo de Autorização: 1352600${100 + order.orderNumber}99 - ${issuedDate}</div>
      </div>
    </div>

    <div class="section-title">Destinatário / Cliente Comprador</div>
    <div class="grid-3">
      <div class="box">
        <div class="box-title">Nome / Razão Social do Cliente</div>
        <div class="box-value">${order.customerName || 'Consumidor Final na Loja'}</div>
      </div>
      <div class="box">
        <div class="box-title">CPF / CNPJ do Destinatário</div>
        <div class="box-value">${order.customerDocument ? formatCpfCnpjMask(order.customerDocument) : 'Não Informado'}</div>
      </div>
      <div class="box">
        <div class="box-title">Data e Hora da Emissão</div>
        <div class="box-value">${issuedDate}</div>
      </div>
    </div>

    <div class="section-title">Cálculo do Imposto</div>
    <div class="grid-4">
      <div class="box">
        <div class="box-title">Base de Cálculo ICMS</div>
        <div class="box-value">${formatCurrencyBRL(order.totalAmount)}</div>
      </div>
      <div class="box">
        <div class="box-title">Valor do ICMS (18%)</div>
        <div class="box-value">${formatCurrencyBRL(icmsValue)}</div>
      </div>
      <div class="box">
        <div class="box-title">Tributos Aprox. (Lei 12.741)</div>
        <div class="box-value">${formatCurrencyBRL(approxTaxes)}</div>
      </div>
      <div class="box">
        <div class="box-title">Valor Total da Nota</div>
        <div class="box-value" style="font-size:15px;">${formatCurrencyBRL(order.totalAmount)}</div>
      </div>
    </div>

    <div class="section-title">Dados dos Produtos / Peças de Vestuário</div>
    <table>
      <thead>
        <tr>
          <th>Código / Etiqueta</th>
          <th>Descrição da Peça (Modelo / Tamanho / Cor)</th>
          <th>NCM</th>
          <th>CFOP</th>
          <th>UN</th>
          <th>Qtd</th>
          <th>Vlr. Unitário</th>
          <th>Vlr. Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>

    <div class="footer">
      <div><strong>Vendedor Responsável:</strong> ${order.createdByUserName || 'Equipe da Loja'}</div>
      <div><strong>Pedido Interno:</strong> #${order.orderNumber} • Para devoluções ou trocas no estoque, informe a Nota Fiscal <strong>${nfNumber}</strong>.</div>
    </div>
  </div>
</body>
</html>`;
  };

  const handleDownloadInvoice = (order: Order) => {
    const htmlContent = buildInvoiceHtmlDocument(order);
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const nfNum = order.invoiceNumber || `NF-000${100 + order.orderNumber}`;
    link.href = url;
    link.download = `DANFE_${nfNum}_Pedido_${order.orderNumber}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrintInvoice = (order: Order) => {
    const htmlContent = buildInvoiceHtmlDocument(order);
    const printWin = window.open('', '_blank', 'width=900,height=720');
    if (!printWin) {
      window.print();
      return;
    }
    printWin.document.open();
    printWin.document.write(htmlContent);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => {
      printWin.print();
    }, 250);
  };

  const channelBadge = (ch: SalesChannel) => {
    if (ch === 'UNITY_META_QUEST') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-300 text-sm font-medium">
          Loja Virtual 3D
        </span>
      );
    }
    if (ch === 'WEB_ECOMMERCE') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-300 text-sm font-medium">
          Site / Online
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-sm font-medium">
        Balcão
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Cabeçalho da Página */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Caixa, Vendas e Notas Fiscais
          </h1>
          <p className="text-sm sm:text-base text-slate-400 mt-1">
            Registre vendas no caixa, emita ou imprima a Nota Fiscal (DANFE) e consulte os detalhes de cada compra.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadData()}
          className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sm font-medium text-slate-200 flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Atualizar Vendas</span>
        </button>
      </div>

      {/* BARRA DE FILTROS NO TOPO + IMPRESSÃO CSV */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-base font-bold text-white">
            <Filter className="w-4 h-4 text-indigo-400" />
            <span>Filtrar Histórico de Vendas e Notas Fiscais</span>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-400">
              Exibindo <strong className="text-white">{orders.length}</strong> venda(s) • Total:{' '}
              <strong className="text-emerald-400">
                {formatCurrencyBRL(filteredRevenue)}
              </strong>
            </span>

            {(periodFilter !== 'all' ||
              customerFilter !== 'ALL' ||
              sellerFilter !== 'ALL' ||
              searchFilter !== '') && (
              <button
                type="button"
                onClick={() => {
                  setPeriodFilter('all');
                  setCustomerFilter('ALL');
                  setSellerFilter('ALL');
                  setSearchFilter('');
                }}
                className="text-sm text-indigo-400 hover:underline font-medium cursor-pointer"
              >
                Limpar filtros
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              placeholder="Buscar cliente, nº venda ou NF..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            className="px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
          >
            <option value="all">Período: Todas as Datas</option>
            <option value="today">Período: Somente Hoje</option>
            <option value="week">Período: Últimos 7 Dias (Semana)</option>
            <option value="month">Período: Este Mês</option>
            <option value="year">Período: Este Ano</option>
          </select>

          <select
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            className="px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
          >
            <option value="ALL">Todos os Clientes</option>
            {registeredCustomers.map((c) => (
              <option key={c.id} value={c.name}>
                Cliente: {c.name}
              </option>
            ))}
          </select>

          <select
            value={sellerFilter}
            onChange={(e) => setSellerFilter(e.target.value)}
            className="px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
          >
            <option value="ALL">Todos os Funcionários / Vendedores</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                Vendedor: {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Barra de Exportação CSV com Seleção de Páginas */}
        <CsvExportBar
          reportTitle="Relatório de Vendas e Notas Fiscais"
          filenamePrefix="historico-vendas-notas-fiscais"
          items={orders}
          itemsPerPage={ITEMS_PER_PAGE}
          activeFilters={[
            {
              label: 'Busca',
              value: searchFilter.trim() || 'Todas',
            },
            {
              label: 'Período',
              value:
                periodFilter === 'all'
                  ? 'Todas as Datas'
                  : periodFilter === 'today'
                  ? 'Hoje'
                  : periodFilter === 'week'
                  ? 'Últimos 7 Dias'
                  : periodFilter === 'month'
                  ? 'Este Mês'
                  : 'Este Ano',
            },
            {
              label: 'Cliente',
              value: customerFilter === 'ALL' ? 'Todos' : customerFilter,
            },
            {
              label: 'Vendedor',
              value:
                sellerFilter === 'ALL'
                  ? 'Todos'
                  : sellers.find((s) => s.id === sellerFilter)?.name || 'Todos',
            },
          ]}
          headers={[
            'Nº Venda',
            'Nota Fiscal (NF-e)',
            'Data e Hora',
            'Cliente Comprador',
            'CPF/CNPJ do Cliente',
            'Vendedor Responsável',
            'Canal de Venda',
            'Peças Compradas',
            'Valor Total (R$)',
          ]}
          rowMapper={(o) => [
            `#${o.orderNumber}`,
            o.invoiceNumber || 'Pendente',
            formatDateTimeBR(o.createdAt),
            o.customerName || 'Consumidor Final',
            o.customerDocument ? formatCpfCnpjMask(o.customerDocument) : '-',
            o.createdByUserName || 'Equipe',
            o.channel === 'ERP_POS'
              ? 'Balcão'
              : o.channel === 'WEB_ECOMMERCE'
              ? 'Site/WhatsApp'
              : 'Loja Virtual 3D',
            o.items
              .map(
                (i) =>
                  `${i.quantity}x ${i.productName} (${i.sizeCode}/${i.colorName})`
              )
              .join(' | '),
            formatCurrencyBRL(o.totalAmount),
          ]}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Coluna Esquerda: Registrar Nova Venda */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-lg font-bold text-white pb-3 border-b border-slate-800">
              <ShoppingCart className="w-5 h-5 text-indigo-400" />
              <span>Registrar Nova Venda</span>
            </div>

            {error && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
                {error}
              </div>
            )}

            {successMsg && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  Escolha a Roupa / Etiqueta (Tamanho e Cor)
                </label>
                <select
                  value={selectedVariantId}
                  onChange={(e) => setSelectedVariantId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                >
                  {allVariants.map((v) => (
                    <option
                      key={v.id}
                      value={v.id}
                      disabled={v.stockQuantity <= 0}
                    >
                      [{v.sku}] {v.productName} (Tam: {v.sizeCode} / {v.colorName}) —{' '}
                      {formatCurrencyBRL(v.finalPrice)} (
                      {v.stockQuantity <= 0
                        ? 'Sem roupas no estoque'
                        : `${v.stockQuantity} disp.`}
                      )
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end gap-3">
                <div className="w-28">
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    Quantidade
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={itemQty}
                    onChange={(e) =>
                      setItemQty(Math.max(1, Number(e.target.value)))
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleAddToCart}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-indigo-300 flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Adicionar à Sacola</span>
                </button>
              </div>
            </div>

            {/* Itens da Sacola */}
            <div className="border-t border-slate-800 pt-4 space-y-3">
              <div className="text-sm font-semibold text-slate-300">
                Peças na Sacola ({cart.length})
              </div>

              {cart.length === 0 ? (
                <div className="p-6 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-sm text-slate-400">
                  Adicione uma peça acima para iniciar a venda.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
                  {cart.map((item) => (
                    <div
                      key={item.variantId}
                      className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-sm"
                    >
                      <div>
                        <div className="font-semibold text-white">
                          {item.productName}
                        </div>
                        <div className="text-sm text-slate-400">
                          Etiqueta: {item.sku} • Tam: {item.sizeCode} •{' '}
                          {item.quantity}x {formatCurrencyBRL(item.unitPrice)}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-bold text-emerald-400 text-base">
                          {formatCurrencyBRL(item.unitPrice * item.quantity)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveFromCart(item.variantId)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Fechamento da Venda */}
          <form
            onSubmit={handleCheckout}
            className="mt-6 pt-4 border-t border-slate-800 space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-slate-200 mb-1.5">
                Funcionário / Vendedor que atendeu *
              </label>
              <select
                required
                value={selectedSellerId}
                onChange={(e) => setSelectedSellerId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
              >
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.jobTitle || 'Vendedor(a)'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-200 mb-1.5">
                Selecionar Cliente Cadastrado (Opcional)
              </label>
              <select
                value={selectedCustomerId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedCustomerId(id);
                  const found = registeredCustomers.find((c) => c.id === id);
                  if (found) {
                    setCustomerName(found.name);
                    setCustomerDocument(
                      found.document ? formatCpfCnpjMask(found.document) : ''
                    );
                  } else {
                    setCustomerName('Cliente na Loja');
                    setCustomerDocument('');
                  }
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
              >
                <option value="">Cliente Avulso (Digitar abaixo)</option>
                {registeredCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{' '}
                    {c.phone ? `(${formatPhoneMask(c.phone)})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  Nome do Cliente
                </label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  CPF / CNPJ na Nota (Opcional)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={18}
                  placeholder="000.000.000-00"
                  value={customerDocument}
                  onChange={(e) =>
                    setCustomerDocument(formatCpfCnpjMask(e.target.value))
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-200 mb-1.5">
                Canal da Venda
              </label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as SalesChannel)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
              >
                <option value="ERP_POS">Balcão / Loja Física</option>
                <option value="WEB_ECOMMERCE">Site / WhatsApp</option>
              </select>
            </div>

            <div className="flex items-center justify-between py-2">
              <span className="text-base font-medium text-slate-300">
                Valor Total:
              </span>
              <span className="text-2xl font-bold text-emerald-400">
                {formatCurrencyBRL(cartTotal)}
              </span>
            </div>

            <button
              type="submit"
              disabled={submitting || cart.length === 0}
              className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-base font-bold text-white transition cursor-pointer"
            >
              {submitting ? 'Concluindo Venda...' : 'Concluir Venda'}
            </button>
          </form>
        </div>

        {/* Coluna Direita: Lista Simplificada do Histórico de Vendas (Até 10 por página) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Histórico de Vendas ({orders.length})
                </h2>
                <p className="text-sm text-slate-400">
                  Clique em uma venda para ver os itens detalhados ou em <strong>Nota Fiscal</strong> para emitir/imprimir a DANFE (máx. {ITEMS_PER_PAGE} por página).
                </p>
              </div>
            </div>

            {loading ? (
              <div className="py-12 text-center text-base text-slate-400">
                Carregando vendas...
              </div>
            ) : orders.length === 0 ? (
              <div className="py-12 text-center text-base text-slate-400">
                Nenhuma venda encontrada para os filtros selecionados.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {paginatedOrders.map((order) => {
                  const totalPieces = order.items.reduce(
                    (sum, i) => sum + i.quantity,
                    0
                  );
                  return (
                    <div
                      key={order.id}
                      onClick={() => setSelectedOrder(order)}
                      className="py-3.5 px-3 rounded-xl hover:bg-slate-800/40 transition cursor-pointer flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 group"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-bold text-white group-hover:text-indigo-300 flex items-center gap-1.5">
                            <span>Venda #{order.orderNumber}</span>
                            <Eye className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition" />
                          </span>

                          {order.invoiceNumber ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm font-semibold">
                              <FileCheck2 className="w-3.5 h-3.5" />
                              {order.invoiceNumber}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-sm">
                              NF Pendente
                            </span>
                          )}

                          {channelBadge(order.channel)}
                        </div>

                        <div className="text-sm text-slate-300 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <span>
                            Cliente:{' '}
                            <strong className="text-white">
                              {order.customerName || 'Consumidor'}
                            </strong>
                          </span>
                          <span>•</span>
                          <span className="text-indigo-300">
                            Vendedor: <strong>{order.createdByUserName}</strong>
                          </span>
                          <span>•</span>
                          <span className="text-slate-400">
                            {totalPieces} peça(s) • {formatDateTimeBR(order.createdAt)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div className="text-base font-bold text-emerald-400">
                            {formatCurrencyBRL(order.totalAmount)}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => void handleIssueOrOpenInvoice(order, e)}
                          disabled={issuingNfId === order.id}
                          className={`px-3.5 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                            order.invoiceNumber
                              ? 'bg-slate-800 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-slate-700'
                              : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                          }`}
                          title="Emitir, visualizar ou imprimir Nota Fiscal"
                        >
                          <FileText className="w-4 h-4" />
                          <span>
                            {issuingNfId === order.id
                              ? 'Emitindo...'
                              : order.invoiceNumber
                              ? 'Ver / Imprimir NF'
                              : 'Emitir NF'}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Controles de Paginação (10 vendas por página) */}
          <PaginationBar
            currentPage={page}
            totalItems={orders.length}
            itemsPerPage={ITEMS_PER_PAGE}
            onPageChange={setPage}
          />
        </div>
      </div>

      {/* MODAL 1: DETALHES DA VENDA (Ao clicar em um item da lista) */}
      {selectedOrder && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedOrder(null)}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-xl font-bold text-white">
                    Detalhes da Venda #{selectedOrder.orderNumber}
                  </h3>
                  {channelBadge(selectedOrder.channel)}
                </div>
                <p className="text-sm text-slate-400 mt-1">
                  Realizada em {formatDateTimeBR(selectedOrder.createdAt)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-slate-400">Cliente Comprador</div>
                <div className="font-bold text-white mt-0.5">
                  {selectedOrder.customerName || 'Consumidor Final'}
                </div>
                {selectedOrder.customerDocument && (
                  <div className="text-slate-400 font-mono">
                    CPF/CNPJ: {formatCpfCnpjMask(selectedOrder.customerDocument)}
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-slate-400 flex items-center gap-1">
                  <UserCheck className="w-4 h-4 text-indigo-400" />
                  <span>Funcionário / Vendedor</span>
                </div>
                <div className="font-bold text-indigo-300 mt-0.5">
                  {selectedOrder.createdByUserName || 'Equipe da Loja'}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-slate-400">Nota Fiscal (NF-e)</div>
                <div className="font-bold text-emerald-400 mt-0.5">
                  {selectedOrder.invoiceNumber || 'Ainda não emitida'}
                </div>
                <div className="text-slate-400">
                  Total: {formatCurrencyBRL(selectedOrder.totalAmount)}
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              <h4 className="text-base font-bold text-white">
                Peças Compradas nesta Venda ({selectedOrder.items.length})
              </h4>

              <div className="divide-y divide-slate-800 rounded-xl bg-slate-950 border border-slate-800">
                {selectedOrder.items.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 flex items-center justify-between gap-4 text-sm"
                  >
                    <div>
                      <div className="font-bold text-white">
                        {item.quantity}x {item.productName}
                      </div>
                      <div className="text-slate-400 flex flex-wrap items-center gap-2 mt-0.5">
                        <span>Etiqueta: {item.sku}</span>
                        <span>•</span>
                        <span>Tam: {item.sizeCode}</span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1">
                          <span
                            className="w-3 h-3 rounded-full inline-block border border-slate-600"
                            style={{ backgroundColor: item.colorHex }}
                          />
                          {item.colorName}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-slate-400">
                        Unit.: {formatCurrencyBRL(item.unitPrice)}
                      </div>
                      <div className="font-bold text-emerald-400 text-base">
                        {formatCurrencyBRL(item.subtotal)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => void handleIssueOrOpenInvoice(selectedOrder)}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white flex items-center gap-2 cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                <span>
                  {selectedOrder.invoiceNumber
                    ? `Visualizar / Imprimir Nota Fiscal (${selectedOrder.invoiceNumber})`
                    : 'Emitir Nota Fiscal desta Venda'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-white cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: NOTA FISCAL ELETRÔNICA SIMULADA (DANFE COMPLETA) */}
      {invoiceOrder && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setInvoiceOrder(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full p-6 space-y-5 shadow-2xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Barra de Ações da Nota Fiscal */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm font-semibold">
                  <FileCheck2 className="w-4 h-4" />
                  Nota Fiscal Emitida • {invoiceOrder.invoiceNumber}
                </span>
                <h3 className="text-xl font-bold text-white mt-1.5">
                  DANFE — Documento Auxiliar da Nota Fiscal Eletrônica
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleDownloadInvoice(invoiceOrder)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm font-semibold text-white flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4 text-amber-400" />
                  <span>Baixar Nota Fiscal</span>
                </button>

                <button
                  type="button"
                  onClick={() => handlePrintInvoice(invoiceOrder)}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white flex items-center gap-2 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir / Salvar PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => setInvoiceOrder(null)}
                  className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Folha Visual da DANFE */}
            <div className="bg-white text-slate-900 rounded-xl p-5 sm:p-6 border-2 border-slate-800 space-y-4 text-sm">
              {/* Cabeçalho do Emitente + Número da NF + Chave de Acesso */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pb-4 border-b-2 border-slate-900">
                <div className="md:col-span-5 border border-slate-400 rounded-lg p-3 space-y-1">
                  <div className="text-slate-500 font-bold uppercase text-sm">
                    Identificação do Emitente (Loja)
                  </div>
                  <div className="text-base font-bold text-slate-950">
                    {tenant?.name || 'Vértice Moda & Vestuário'}
                  </div>
                  <div className="text-sm text-slate-700">
                    {tenant?.legalName ||
                      `${tenant?.name || 'Vértice'} Comércio de Confecções Ltda`}
                  </div>
                  <div className="text-sm text-slate-800">
                    <strong>CNPJ:</strong>{' '}
                    {tenant?.document
                      ? formatCpfCnpjMask(tenant.document)
                      : '28.456.789/0001-55'}{' '}
                    • <strong>IE:</strong>{' '}
                    {tenant?.stateRegistration || '114.892.330.119'}
                  </div>
                  <div className="text-sm text-slate-600">
                    {tenant?.address ||
                      'Rua Oscar Freire, 840 - Jardim Paulista, São Paulo/SP'}
                  </div>
                </div>

                <div className="md:col-span-3 border border-slate-400 rounded-lg p-3 flex flex-col justify-center items-center text-center">
                  <div className="text-lg font-extrabold text-slate-950">
                    DANFE
                  </div>
                  <div className="text-sm text-slate-600">
                    Documento Auxiliar da NF-e
                  </div>
                  <div className="mt-2 px-3 py-1 rounded bg-slate-900 text-white font-bold text-base">
                    {invoiceOrder.invoiceNumber}
                  </div>
                  <div className="text-sm text-slate-700 mt-1">
                    Série: {invoiceOrder.invoiceSeries || '001'} • Saída
                  </div>
                </div>

                <div className="md:col-span-4 border border-slate-400 rounded-lg p-3 space-y-1.5">
                  <div className="text-slate-500 font-bold uppercase text-sm">
                    Chave de Acesso SEFAZ
                  </div>
                  <div className="py-1.5 px-2 bg-slate-100 border border-dashed border-slate-400 text-center font-mono tracking-widest text-sm font-bold">
                    |||| ||||| |||| ||| ||||| |||| |||
                  </div>
                  <div className="font-mono text-sm break-all text-slate-800">
                    {invoiceOrder.invoiceAccessKey}
                  </div>
                </div>
              </div>

              {/* Destinatário e Impostos */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="border border-slate-400 rounded-lg p-2.5">
                  <div className="text-slate-500 text-sm font-semibold">
                    Cliente / Destinatário
                  </div>
                  <div className="font-bold text-slate-950">
                    {invoiceOrder.customerName || 'Consumidor Final'}
                  </div>
                </div>

                <div className="border border-slate-400 rounded-lg p-2.5">
                  <div className="text-slate-500 text-sm font-semibold">
                    CPF / CNPJ na Nota
                  </div>
                  <div className="font-bold text-slate-950 font-mono">
                    {invoiceOrder.customerDocument
                      ? formatCpfCnpjMask(invoiceOrder.customerDocument)
                      : 'Não informado'}
                  </div>
                </div>

                <div className="border border-slate-400 rounded-lg p-2.5">
                  <div className="text-slate-500 text-sm font-semibold">
                    Data de Emissão
                  </div>
                  <div className="font-bold text-slate-950">
                    {formatDateTimeBR(
                      invoiceOrder.invoiceIssuedAt || invoiceOrder.createdAt
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="border border-slate-400 rounded-lg p-2.5">
                  <div className="text-slate-500 text-sm">Base Cálc. ICMS</div>
                  <div className="font-bold text-slate-950">
                    {formatCurrencyBRL(invoiceOrder.totalAmount)}
                  </div>
                </div>
                <div className="border border-slate-400 rounded-lg p-2.5">
                  <div className="text-slate-500 text-sm">Valor ICMS (18%)</div>
                  <div className="font-bold text-slate-950">
                    {formatCurrencyBRL(invoiceOrder.totalAmount * 0.18)}
                  </div>
                </div>
                <div className="border border-slate-400 rounded-lg p-2.5">
                  <div className="text-slate-500 text-sm">
                    Trib. Aprox. (IBPT)
                  </div>
                  <div className="font-bold text-slate-950">
                    {formatCurrencyBRL(invoiceOrder.totalAmount * 0.245)}
                  </div>
                </div>
                <div className="border border-slate-400 rounded-lg p-2.5 bg-emerald-50">
                  <div className="text-emerald-800 text-sm font-semibold">
                    Valor Total da NF
                  </div>
                  <div className="font-extrabold text-emerald-900 text-base">
                    {formatCurrencyBRL(invoiceOrder.totalAmount)}
                  </div>
                </div>
              </div>

              {/* Tabela de Itens da Nota Fiscal */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-slate-400 text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800">
                      <th className="border border-slate-400 p-2 text-left">
                        Etiqueta (SKU)
                      </th>
                      <th className="border border-slate-400 p-2 text-left">
                        Descrição da Roupa
                      </th>
                      <th className="border border-slate-400 p-2 text-left">
                        NCM / CFOP
                      </th>
                      <th className="border border-slate-400 p-2 text-center">
                        Qtd
                      </th>
                      <th className="border border-slate-400 p-2 text-right">
                        Vlr. Unit.
                      </th>
                      <th className="border border-slate-400 p-2 text-right">
                        Subtotal
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceOrder.items.map((item) => (
                      <tr key={item.id}>
                        <td className="border border-slate-400 p-2 font-mono font-semibold">
                          {item.sku}
                        </td>
                        <td className="border border-slate-400 p-2">
                          {item.productName} (Tam: {item.sizeCode} / Cor:{' '}
                          {item.colorName})
                        </td>
                        <td className="border border-slate-400 p-2">
                          6109.10.00 / 5102
                        </td>
                        <td className="border border-slate-400 p-2 text-center font-bold">
                          {item.quantity} UN
                        </td>
                        <td className="border border-slate-400 p-2 text-right">
                          {formatCurrencyBRL(item.unitPrice)}
                        </td>
                        <td className="border border-slate-400 p-2 text-right font-bold">
                          {formatCurrencyBRL(item.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-sm text-slate-700">
                <div>
                  <strong>Vendedor Responsável:</strong>{' '}
                  {invoiceOrder.createdByUserName || 'Equipe da Loja'}
                </div>
                <div>
                  Para devolução no Controle de Estoque, utilize o nº{' '}
                  <strong className="text-slate-950">
                    {invoiceOrder.invoiceNumber}
                  </strong>
                  .
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
