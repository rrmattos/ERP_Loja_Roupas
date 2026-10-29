import React, { useEffect, useState } from 'react';
import {
  Box,
  ImagePlus,
  Layers,
  Palette,
  Plus,
  RefreshCw,
  Ruler,
  Trash2,
  X,
} from 'lucide-react';
import {
  apiRequest,
  compressImageToWebP,
  formatCurrencyBRL,
} from '../services/api';
import {
  Category,
  Color,
  PresetGalleryItem,
  Product,
  Size,
  Supplier,
} from '../types/erp';

interface MetadataResponse {
  categories: Category[];
  suppliers: Supplier[];
  sizes: Size[];
  colors: Color[];
  presetGallery: PresetGalleryItem[];
  quota: {
    currentProducts: number;
    maxProducts: number;
  };
}

interface DraftVariant {
  sizeId: string;
  colorId: string;
  sku: string;
  initialStock: number;
  minStockAlert: number;
}

export const ProductsPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [meta, setMeta] = useState<MetadataResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modais
  const [showProductModal, setShowProductModal] = useState<boolean>(false);
  const [showAttributeModal, setShowAttributeModal] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Campos de Novo Produto
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [description, setDescription] = useState('');
  const [basePrice, setBasePrice] = useState('149.90');
  const [costPrice, setCostPrice] = useState('55.00');
  const [imageInput, setImageInput] = useState('/presets/tshirt-oversized.svg');
  const [uploadSizeInfo, setUploadSizeInfo] = useState<string | null>(null);
  const [variants, setVariants] = useState<DraftVariant[]>([]);

  // Campos de Novos Atributos (Cor, Tamanho, Categoria, Fornecedor)
  const [attrType, setAttrType] = useState<'color' | 'size' | 'category' | 'supplier'>('color');
  const [attrName, setAttrName] = useState('');
  const [attrCodeOrHex, setAttrCodeOrHex] = useState('#10B981');

  const loadAll = async () => {
    setLoading(true);
    try {
      const [prodsData, metaData] = await Promise.all([
        apiRequest<Product[]>('/products'),
        apiRequest<MetadataResponse>('/products/metadata'),
      ]);
      setProducts(prodsData);
      setMeta(metaData);

      if (metaData.categories[0] && !categoryId) {
        setCategoryId(metaData.categories[0].id);
      }
      if (metaData.suppliers[0] && !supplierId) {
        setSupplierId(metaData.suppliers[0].id);
      }
      if (
        variants.length === 0 &&
        metaData.sizes[0] &&
        metaData.colors[0]
      ) {
        setVariants([
          {
            sizeId: metaData.sizes[0].id,
            colorId: metaData.colors[0].id,
            sku: `REF-${Math.floor(1000 + Math.random() * 9000)}`,
            initialStock: 12,
            minStockAlert: 5,
          },
        ]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar produtos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const compressedDataUrl = await compressImageToWebP(file);
      setImageInput(compressedDataUrl);
      setUploadSizeInfo('Foto carregada e pronta para salvar');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar foto.');
    }
  };

  const handleAddVariantRow = () => {
    if (!meta || !meta.sizes[0] || !meta.colors[0]) return;
    setVariants((prev) => [
      ...prev,
      {
        sizeId: meta.sizes[0].id,
        colorId: meta.colors[0].id,
        sku: `REF-${Math.floor(1000 + Math.random() * 9000)}`,
        initialStock: 10,
        minStockAlert: 5,
      },
    ]);
  };

  const handleRemoveVariantRow = (index: number) => {
    setVariants((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiRequest('/products', {
        method: 'POST',
        body: JSON.stringify({
          name,
          categoryId: categoryId || null,
          supplierId: supplierId || null,
          description,
          basePrice: Number(basePrice),
          costPrice: Number(costPrice),
          imageInput,
          variants,
        }),
      });

      setShowProductModal(false);
      setName('');
      setDescription('');
      setUploadSizeInfo(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar produto.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    if (
      !window.confirm(
        `Deseja excluir o produto "${product.name}" e todas as suas opções de tamanho e cor?`
      )
    ) {
      return;
    }

    try {
      await apiRequest(`/products/${product.id}`, { method: 'DELETE' });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir produto.');
    }
  };

  const handleCreateAttribute = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (attrType === 'color') {
        await apiRequest('/products/attributes/colors', {
          method: 'POST',
          body: JSON.stringify({ name: attrName, hexCode: attrCodeOrHex }),
        });
      } else if (attrType === 'size') {
        await apiRequest('/products/attributes/sizes', {
          method: 'POST',
          body: JSON.stringify({
            code: attrCodeOrHex,
            name: attrName,
            displayOrder: 10,
          }),
        });
      } else if (attrType === 'category') {
        await apiRequest('/products/attributes/categories', {
          method: 'POST',
          body: JSON.stringify({ name: attrName }),
        });
      } else if (attrType === 'supplier') {
        await apiRequest('/products/attributes/suppliers', {
          method: 'POST',
          body: JSON.stringify({ name: attrName, leadTimeDays: 7 }),
        });
      }

      setAttrName('');
      setShowAttributeModal(false);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar item.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-300 text-base gap-2.5">
        <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
        <span>Carregando catálogo de roupas...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Produtos e Roupas
          </h1>
          <p className="text-sm sm:text-base text-slate-400 mt-1">
            Cadastre os modelos da sua loja e defina as quantidades por tamanho e cor.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowAttributeModal(true)}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sm font-medium text-slate-200 flex items-center gap-2 transition cursor-pointer"
          >
            <Palette className="w-4 h-4 text-indigo-400" />
            <span>+ Nova Cor / Tamanho / Categoria</span>
          </button>

          <button
            type="button"
            onClick={() => setShowProductModal(true)}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white flex items-center gap-2 transition shadow-md shadow-indigo-950/50 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Cadastrar Novo Produto</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm font-medium flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Resumo de Tamanhos e Cores Cadastrados */}
      {meta && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Ruler className="w-4 h-4 text-indigo-400" />
              <span>Tamanhos Disponíveis</span>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {meta.sizes.map((s) => (
                <span
                  key={s.id}
                  className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-sm font-semibold text-white"
                >
                  {s.code}{' '}
                  <span className="font-normal text-slate-400">
                    ({s.name})
                  </span>
                </span>
              ))}
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Palette className="w-4 h-4 text-emerald-400" />
              <span>Cores Disponíveis</span>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {meta.colors.map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white"
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-slate-600"
                    style={{ backgroundColor: c.hexCode }}
                  />
                  <span>{c.name}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Lista de Produtos */}
      <div className="space-y-4">
        {products.map((prod) => {
          const profitAmount = prod.basePrice - prod.costPrice;

          return (
            <div
              key={prod.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col lg:flex-row gap-6"
            >
              {/* Foto + Informações do Produto */}
              <div className="flex items-start gap-5 lg:w-5/12">
                <img
                  src={prod.imageUrl || '/presets/tshirt-oversized.svg'}
                  alt={prod.name}
                  className="w-24 h-24 rounded-2xl object-cover bg-slate-950 border border-slate-800 shrink-0"
                />

                <div className="min-w-0 flex-1">
                  <span className="inline-block px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-300 text-sm font-medium">
                    {prod.categoryName || 'Geral'}
                  </span>

                  <h3 className="text-lg font-bold text-white mt-2">
                    {prod.name}
                  </h3>
                  <p className="text-sm text-slate-400 mt-1">
                    {prod.description || 'Sem descrição.'}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                    <div>
                      <span className="text-slate-400">Venda: </span>
                      <strong className="text-emerald-400 text-base">
                        {formatCurrencyBRL(prod.basePrice)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Custo: </span>
                      <span className="text-slate-200">
                        {formatCurrencyBRL(prod.costPrice)}
                      </span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-300 text-sm font-medium">
                      Lucro: {formatCurrencyBRL(profitAmount)} / peça
                    </span>
                  </div>
                </div>
              </div>

              {/* Opções de Tamanho e Cor */}
              <div className="lg:w-7/12 border-t lg:border-t-0 lg:border-l border-slate-800 pt-4 lg:pt-0 lg:pl-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-indigo-400" />
                      <span>
                        Quantidades por Tamanho e Cor (Total:{' '}
                        <strong className="text-white">{prod.totalStock} peças</strong>)
                      </span>
                    </span>

                    <button
                      type="button"
                      onClick={() => void handleDeleteProduct(prod)}
                      title="Excluir produto"
                      className="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Excluir</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {prod.variants.map((v) => (
                      <div
                        key={v.id}
                        className={`p-3.5 rounded-xl border text-sm flex items-center justify-between ${
                          v.isLowStock
                            ? 'bg-amber-500/5 border-amber-500/30'
                            : 'bg-slate-950 border-slate-800'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 font-semibold text-white">
                            <span className="px-2 py-0.5 rounded bg-slate-800">
                              Tam {v.sizeCode}
                            </span>
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-slate-600 shrink-0"
                              style={{ backgroundColor: v.colorHex }}
                            />
                            <span className="truncate">{v.colorName}</span>
                          </div>
                          <div className="text-sm text-slate-400 mt-1">
                            Cód: {v.sku}
                          </div>
                        </div>

                        <div className="text-right shrink-0 ml-2">
                          <div
                            className={`text-base font-bold ${
                              v.isLowStock ? 'text-amber-400' : 'text-emerald-400'
                            }`}
                          >
                            {v.stockQuantity} un.
                          </div>
                          {v.isLowStock && (
                            <div className="text-sm text-amber-300">
                              Acabando
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL 1: Cadastrar Novo Produto */}
      {showProductModal && meta && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl p-6 sm:p-8 shadow-2xl my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h2 className="text-xl font-bold text-white">
                  Cadastrar Novo Produto
                </h2>
                <p className="text-sm text-slate-400 mt-0.5">
                  Preencha os dados da roupa e informe os tamanhos e cores disponíveis.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="space-y-5 mt-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    Nome da Roupa / Produto
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Jaqueta Corta-Vento Preta"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    Categoria
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white"
                  >
                    {meta.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    Preço de Venda para o Cliente (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={basePrice}
                    onChange={(e) => setBasePrice(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    Preço de Custo / Compra (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={costPrice}
                    onChange={(e) => setCostPrice(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  Descrição (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Algodão 100%, lavagem especial, tecido confortável"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white"
                />
              </div>

              {/* Escolha da Foto */}
              <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-white flex items-center gap-2">
                    <ImagePlus className="w-4 h-4 text-indigo-400" />
                    <span>Foto do Produto (Escolha abaixo ou envie do computador)</span>
                  </span>

                  <label className="px-4 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 text-sm font-semibold cursor-pointer transition">
                    <span>Enviar Foto do Computador</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                </div>

                {uploadSizeInfo && (
                  <div className="text-sm text-emerald-400 font-medium">
                    ✓ {uploadSizeInfo}
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                  {meta.presetGallery.map((preset) => {
                    const selected = imageInput === preset.url;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setImageInput(preset.url);
                          setUploadSizeInfo(null);
                        }}
                        className={`p-3 rounded-xl border text-center transition cursor-pointer ${
                          selected
                            ? 'border-indigo-500 bg-indigo-500/15'
                            : 'border-slate-800 bg-slate-900 hover:border-slate-700'
                        }`}
                      >
                        <img
                          src={preset.url}
                          alt={preset.name}
                          className="w-14 h-14 mx-auto rounded-lg"
                        />
                        <span className="block text-sm text-slate-200 mt-1.5 truncate">
                          {preset.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Opções de Tamanho e Cor */}
              <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-white flex items-center gap-2">
                    <Box className="w-4 h-4 text-emerald-400" />
                    <span>Tamanhos, Cores e Quantidades Iniciais</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleAddVariantRow}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-indigo-300 cursor-pointer"
                  >
                    + Adicionar Outro Tamanho / Cor
                  </button>
                </div>

                <div className="space-y-3">
                  {variants.map((v, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center bg-slate-900 p-3.5 rounded-xl border border-slate-800"
                    >
                      <div className="sm:col-span-3">
                        <label className="block text-sm text-slate-400 mb-1">
                          Tamanho
                        </label>
                        <select
                          value={v.sizeId}
                          onChange={(e) => {
                            const copy = [...variants];
                            copy[idx].sizeId = e.target.value;
                            setVariants(copy);
                          }}
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white"
                        >
                          {meta.sizes.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.code} - {s.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-4">
                        <label className="block text-sm text-slate-400 mb-1">
                          Cor
                        </label>
                        <select
                          value={v.colorId}
                          onChange={(e) => {
                            const copy = [...variants];
                            copy[idx].colorId = e.target.value;
                            setVariants(copy);
                          }}
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white"
                        >
                          {meta.colors.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-sm text-slate-400 mb-1">
                          Código da Etiqueta
                        </label>
                        <input
                          type="text"
                          required
                          value={v.sku}
                          onChange={(e) => {
                            const copy = [...variants];
                            copy[idx].sku = e.target.value.toUpperCase();
                            setVariants(copy);
                          }}
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-indigo-300"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-sm text-slate-400 mb-1">
                          Qtd Inicial
                        </label>
                        <input
                          type="number"
                          min={0}
                          required
                          value={v.initialStock}
                          onChange={(e) => {
                            const copy = [...variants];
                            copy[idx].initialStock = Number(e.target.value);
                            setVariants(copy);
                          }}
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white"
                        />
                      </div>

                      <div className="sm:col-span-1 flex justify-end pt-5">
                        {variants.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveVariantRow(idx)}
                            className="p-2 text-slate-400 hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowProductModal(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 text-sm font-medium text-slate-200 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-semibold text-white cursor-pointer"
                >
                  {submitting ? 'Salvando...' : 'Salvar Produto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Cadastrar Cor, Tamanho, Categoria ou Fornecedor */}
      {showAttributeModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 sm:p-7 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white">
                Cadastrar Nova Opção
              </h3>
              <button
                type="button"
                onClick={() => setShowAttributeModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAttribute} className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  O que você deseja cadastrar?
                </label>
                <select
                  value={attrType}
                  onChange={(e) => {
                    const nextType = e.target.value as
                      | 'color'
                      | 'size'
                      | 'category'
                      | 'supplier';
                    setAttrType(nextType);
                    if (nextType === 'color') setAttrCodeOrHex('#10B981');
                    if (nextType === 'size') setAttrCodeOrHex('XG');
                  }}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white"
                >
                  <option value="color">Nova Cor de Roupa</option>
                  <option value="size">Novo Tamanho (PP, XG, 40, 42...)</option>
                  <option value="category">Nova Categoria (Ex: Vestidos, Calças)</option>
                  <option value="supplier">Novo Fornecedor / Fábrica</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  {attrType === 'color'
                    ? 'Nome da Cor (Ex: Verde Militar)'
                    : attrType === 'size'
                    ? 'Nome do Tamanho (Ex: Extra Grande)'
                    : attrType === 'category'
                    ? 'Nome da Categoria (Ex: Jaquetas)'
                    : 'Nome do Fornecedor'}
                </label>
                <input
                  type="text"
                  required
                  value={attrName}
                  onChange={(e) => setAttrName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white"
                />
              </div>

              {attrType === 'color' && (
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    Escolha a Cor
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={attrCodeOrHex}
                      onChange={(e) => setAttrCodeOrHex(e.target.value.toUpperCase())}
                      className="w-12 h-11 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer"
                    />
                    <input
                      type="text"
                      required
                      pattern="^#[0-9A-Fa-f]{6}$"
                      value={attrCodeOrHex}
                      onChange={(e) => setAttrCodeOrHex(e.target.value.toUpperCase())}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white"
                    />
                  </div>
                </div>
              )}

              {attrType === 'size' && (
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    Sigla na Etiqueta (Ex: PP, G, GG, 42)
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    value={attrCodeOrHex}
                    onChange={(e) => setAttrCodeOrHex(e.target.value.toUpperCase())}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white"
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAttributeModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-sm text-slate-200 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white cursor-pointer"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
