import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Plus,
  RefreshCw,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import {
  apiRequest,
  formatCurrencyBRL,
  formatDateTimeBR,
} from '../services/api';
import { Order, Product, SalesChannel } from '../types/erp';

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
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Estado do Carrinho de Venda
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [itemQty, setItemQty] = useState<number>(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState<string>('Cliente na Loja');
  const [channel, setChannel] = useState<SalesChannel>('ERP_POS');

  const loadData = async () => {
    setLoading(true);
    try {
      const [ordersData, productsData] = await Promise.all([
        apiRequest<Order[]>('/orders'),
        apiRequest<Product[]>('/products'),
      ]);
      setOrders(ordersData);
      setProducts(productsData);

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
    void loadData();
  }, []);

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
            `Quantidade no carrinho excede o estoque disponível (${variant.stockQuantity} un.).`
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
        orderNumber: number;
        totalAmount: number;
      }>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          customerName,
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
        )})! As peças já foram descontadas do estoque.`
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao finalizar venda.');
    } finally {
      setSubmitting(false);
    }
  };

  const channelBadge = (ch: SalesChannel) => {
    if (ch === 'UNITY_META_QUEST') {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-300 text-sm font-medium">
          Loja Virtual 3D
        </span>
      );
    }
    if (ch === 'WEB_ECOMMERCE') {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-sm font-medium">
          Site / Loja Online
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-sm font-medium">
        Balcão / Loja Física
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Caixa e Histórico de Vendas
          </h1>
          <p className="text-sm sm:text-base text-slate-400 mt-1">
            Registre uma nova venda para descontar as roupas do estoque automaticamente.
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
                  Escolha a Roupa (Tamanho e Cor)
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
                      {v.productName} (Tam: {v.sizeCode} / {v.colorName}) —{' '}
                      {formatCurrencyBRL(v.finalPrice)} ({v.stockQuantity} disp.)
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
                    onChange={(e) => setItemQty(Math.max(1, Number(e.target.value)))}
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
                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
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
                          Tam: {item.sizeCode} • Cor: {item.colorName} •{' '}
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
                  Onde foi a venda?
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

        {/* Coluna Direita: Histórico de Vendas */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">
            Vendas Realizadas ({orders.length})
          </h2>

          {loading ? (
            <div className="py-12 text-center text-base text-slate-400">
              Carregando vendas...
            </div>
          ) : orders.length === 0 ? (
            <div className="py-12 text-center text-base text-slate-400">
              Nenhuma venda registrada ainda.
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="text-base font-bold text-white">
                        Venda #{order.orderNumber}
                      </span>
                      {channelBadge(order.channel)}
                    </div>

                    <div className="text-right">
                      <span className="text-lg font-bold text-emerald-400">
                        {formatCurrencyBRL(order.totalAmount)}
                      </span>
                      <span className="block text-sm text-slate-400">
                        {formatDateTimeBR(order.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div className="text-sm text-slate-300">
                    Cliente: <strong>{order.customerName || 'Não informado'}</strong>
                  </div>

                  <div className="pt-3 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {order.items.map((item) => (
                      <div
                        key={item.id}
                        className="px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-sm flex items-center justify-between"
                      >
                        <div className="truncate pr-2">
                          <span className="font-semibold text-white">
                            {item.quantity}x {item.productName}
                          </span>
                          <span className="block text-slate-400 text-sm">
                            Tam: {item.sizeCode} • Cor: {item.colorName}
                          </span>
                        </div>
                        <span className="font-semibold text-white shrink-0">
                          {formatCurrencyBRL(item.subtotal)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
