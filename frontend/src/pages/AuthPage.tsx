import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  KeyRound,
  MapPin,
  Phone,
  Shirt,
  ShoppingBag,
  Sparkles,
  Store,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { StructuredAddressFields } from '../components/StructuredAddressFields';
import { ApiError, apiRequest } from '../services/api';
import { PublicStoreClient } from '../types/erp';
import {
  composeAddressString,
  formatCpfCnpjMask,
  formatPhoneMask,
  onlyDigits,
} from '../utils/formatters';

const DEFAULT_CLIENT_STORES: PublicStoreClient[] = [
  {
    id: 'default-1',
    name: 'Boutique Bella Donna',
    logoUrl: null,
    address: 'Rua Oscar Freire, 412 - Jardins, São Paulo/SP',
    phone: '(11) 3082-4410',
  },
  {
    id: 'default-2',
    name: 'Atelier Fio Nobre Alfaiataria',
    logoUrl: null,
    address: 'Av. Batel, 1280 - Batel, Curitiba/PR',
    phone: '(41) 3342-8890',
  },
  {
    id: 'default-3',
    name: 'Kroma Streetwear & Jeans',
    logoUrl: null,
    address: 'Rua Visconde de Pirajá, 310 - Ipanema, Rio de Janeiro/RJ',
    phone: '(21) 2523-7712',
  },
  {
    id: 'default-4',
    name: 'Lumina Moda Feminina',
    logoUrl: null,
    address: 'Rua Padre Chagas, 220 - Moinhos de Vento, Porto Alegre/RS',
    phone: null,
  },
  {
    id: 'default-5',
    name: 'Casa do Algodão Básico',
    logoUrl: null,
    address: 'Av. Savassi, 950 - Belo Horizonte/MG',
    phone: '(31) 3281-5500',
  },
];

export const AuthPage: React.FC = () => {
  const { modeConfig, login, loginDemoStore, registerSandboxStore } = useAuth();
  const isSandboxMode = modeConfig?.isPortfolioSandbox ?? true;

  const [activeTab, setActiveTab] = useState<'login' | 'sandbox'>('login');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [clientStores, setClientStores] = useState<PublicStoreClient[]>(
    DEFAULT_CLIENT_STORES
  );

  // Limpa o erro de um campo específico quando o usuário digita nele
  const clearFieldError = (fieldName: string) => {
    if (fieldErrors[fieldName]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[fieldName];
        return next;
      });
    }
    if (error && Object.keys(fieldErrors).length <= 1) {
      setError(null);
    }
  };

  // Campos de Login
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Campos de Criar Nova Loja
  const [storeName, setStoreName] = useState('');
  const [storeDocument, setStoreDocument] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [storeAddrObj, setStoreAddrObj] = useState({
    cep: '',
    stateUf: '',
    city: '',
    street: '',
  });
  const [ownerName, setOwnerName] = useState('');
  const [sandboxEmail, setSandboxEmail] = useState('');
  const [sandboxPassword, setSandboxPassword] = useState('');

  useEffect(() => {
    apiRequest<PublicStoreClient[]>('/auth/public-stores')
      .then((stores) => {
        if (Array.isArray(stores) && stores.length > 0) {
          setClientStores(stores);
        }
      })
      .catch(() => {
        // Mantém lista padrão caso offline
      });
  }, []);

  const handleDemoAccess = async () => {
    setError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      await loginDemoStore();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao acessar a loja de demonstração.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      await login(loginEmail, loginPassword);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        setFieldErrors(err.fieldErrors);
      }
      setError(
        err instanceof Error ? err.message : 'E-mail ou senha incorretos.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSandboxSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    // Validação preliminar amigável no frontend antes de enviar
    const localErrors: Record<string, string[]> = {};
    const cleanDoc = onlyDigits(storeDocument, 14);

    if (storeName.trim().length < 3) {
      localErrors.storeName = ['O nome da loja deve ter no mínimo 3 caracteres.'];
    }
    if (cleanDoc.length !== 11 && cleanDoc.length !== 14) {
      localErrors.document = [
        'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.',
      ];
    }
    if (ownerName.trim().length < 2) {
      localErrors.ownerName = ['Informe o nome do responsável pela loja.'];
    }
    if (!sandboxEmail.includes('@') || !sandboxEmail.includes('.')) {
      localErrors.email = [
        'Informe um e-mail válido com @ e domínio (ex: contato@loja.com).',
      ];
    }
    if (sandboxPassword.length < 6) {
      localErrors.password = ['A senha precisa ter no mínimo 6 dígitos.'];
    }

    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      const firstMsg = Object.values(localErrors)[0][0];
      setError(`Revise os dados informados: ${firstMsg}`);
      return;
    }

    setSubmitting(true);
    try {
      await registerSandboxStore({
        storeName,
        document: cleanDoc,
        phone: onlyDigits(storePhone, 11),
        address: composeAddressString(storeAddrObj),
        ownerName,
        email: sandboxEmail.trim(),
        password: sandboxPassword,
      });
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.fieldErrors &&
        Object.keys(err.fieldErrors).length > 0
      ) {
        setFieldErrors(err.fieldErrors);
        setError(err.message);
      } else {
        setFieldErrors({});
        setError(err instanceof Error ? err.message : 'Erro ao criar sua loja.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Duplica a lista para criar o efeito de carrossel contínuo infinito
  const marqueeStores = [...clientStores, ...clientStores];

  return (
    <div className="relative min-h-screen text-slate-100 flex flex-col items-center justify-between px-4 py-8 overflow-hidden">
      {/* Estilo CSS inline para animação suave dos cards de clientes lojistas */}
      <style>{`
        @keyframes scrollMarquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-store-marquee {
          display: flex;
          width: max-content;
          animation: scrollMarquee 38s linear infinite;
        }
        .animate-store-marquee:hover {
          animation-play-state: paused;
        }
      `}</style>

      {/* Fundo Ambientado de Loja de Roupas / Boutique */}
      <div
        className="fixed inset-0 bg-cover bg-center bg-no-repeat scale-105"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1920&q=80')",
        }}
      />
      <div className="fixed inset-0 bg-gradient-to-b from-slate-950/85 via-slate-950/88 to-slate-950/95 backdrop-blur-[3px]" />
      <div className="fixed -top-32 left-1/2 -translate-x-1/2 w-[750px] h-[350px] bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* Conteúdo Principal Centralizado */}
      <div className="relative z-10 w-full max-w-5xl space-y-8 my-auto">
        {/* Cabeçalho da Loja de Roupas (Sem as pílulas removidas) */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-200 text-sm font-medium shadow-sm">
            <Shirt className="w-4 h-4 text-amber-300" />
            <span>Sistema para Loja de Roupas, Boutique e Confecção</span>
          </div>

          <div className="pt-2">
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white select-none">
              Gestão <span className="font-black text-amber-200">ERP</span>
            </h1>
          </div>

          <p className="text-base text-slate-200 max-w-xl mx-auto leading-relaxed">
            Organize suas araras, tamanhos, cores, clientes, vendedores, notas fiscais e frente de caixa com praticidade no dia a dia da loja.
          </p>
        </div>

        {/* Card Central de Login / Criar Loja (Alargado para max-w-3xl no Cadastro para acomodar os campos confortavelmente) */}
        <div
          className={`w-full mx-auto bg-slate-900/95 border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 backdrop-blur-md transition-all duration-300 ${activeTab === 'sandbox' ? 'max-w-3xl' : 'max-w-lg'
            }`}
        >
          {isSandboxMode && (
            <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-950 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('login');
                  setError(null);
                  setFieldErrors({});
                }}
                className={`py-2.5 px-4 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 cursor-pointer ${activeTab === 'login'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-300 hover:text-white'
                  }`}
              >
                <KeyRound className="w-4 h-4" />
                <span>Entrar na Loja</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('sandbox');
                  setError(null);
                  setFieldErrors({});
                }}
                className={`py-2.5 px-4 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 cursor-pointer ${activeTab === 'sandbox'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-300 hover:text-white'
                  }`}
              >
                <Store className="w-4 h-4" />
                <span>Cadastrar Loja</span>
              </button>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-sm font-medium flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold text-rose-300">
                  Atenção ao preencher os campos
                </div>
                <div className="text-sm text-rose-200 leading-relaxed">
                  {error}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'login' || !isSandboxMode ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-white">
                  Bem-vindo à sua Loja
                </h2>
                <p className="text-sm text-slate-300 mt-1">
                  Digite seu e-mail e senha para abrir o caixa e o estoque.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  E-mail
                </label>
                <input
                  type="email"
                  required
                  placeholder="seu@email.com"
                  value={loginEmail}
                  onChange={(e) => {
                    setLoginEmail(e.target.value);
                    clearFieldError('email');
                  }}
                  className={`w-full px-4 py-2.5 rounded-xl bg-slate-950 border ${fieldErrors.email
                    ? 'border-rose-500 ring-2 ring-rose-500/35 bg-rose-500/5'
                    : 'border-slate-700'
                    } text-base text-white focus:outline-none focus:border-amber-400`}
                />
                {fieldErrors.email && (
                  <p className="text-xs text-rose-400 mt-1 font-medium flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{fieldErrors.email[0]}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  Senha
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => {
                    setLoginPassword(e.target.value);
                    clearFieldError('password');
                  }}
                  className={`w-full px-4 py-2.5 rounded-xl bg-slate-950 border ${fieldErrors.password
                    ? 'border-rose-500 ring-2 ring-rose-500/35 bg-rose-500/5'
                    : 'border-slate-700'
                    } text-base text-white focus:outline-none focus:border-amber-400`}
                />
                {fieldErrors.password && (
                  <p className="text-xs text-rose-400 mt-1 font-medium flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{fieldErrors.password[0]}</span>
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-base transition shadow-lg shadow-indigo-950/50 cursor-pointer"
              >
                {submitting ? 'Abrindo loja...' : 'Entrar no Sistema'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSandboxSubmit} className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-white">
                  Cadastre sua Loja de Roupas
                </h2>
                <p className="text-sm text-slate-300 mt-1 leading-relaxed">
                  Sua loja já abre com <strong>peças de roupa, tamanhos, cores, clientes e vendedores</strong> pré-cadastrados para você testar.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    Nome Fantasia da Loja *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    maxLength={80}
                    placeholder="Ex: Boutique Bella Moda"
                    value={storeName}
                    onChange={(e) => {
                      setStoreName(e.target.value);
                      clearFieldError('storeName');
                    }}
                    className={`w-full px-4 py-2.5 rounded-xl bg-slate-950 border ${fieldErrors.storeName
                      ? 'border-rose-500 ring-2 ring-rose-500/35 bg-rose-500/5'
                      : 'border-slate-700'
                      } text-sm text-white focus:outline-none focus:border-amber-400`}
                  />
                  {fieldErrors.storeName && (
                    <p className="text-xs text-rose-400 mt-1 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{fieldErrors.storeName[0]}</span>
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    CNPJ ou CPF da Loja *
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    maxLength={18}
                    placeholder="00.000.000/0001-00"
                    value={storeDocument}
                    onChange={(e) => {
                      setStoreDocument(formatCpfCnpjMask(e.target.value));
                      clearFieldError('document');
                    }}
                    className={`w-full px-4 py-2.5 rounded-xl bg-slate-950 border ${fieldErrors.document
                      ? 'border-rose-500 ring-2 ring-rose-500/35 bg-rose-500/5'
                      : 'border-slate-700'
                      } text-sm text-white font-mono focus:outline-none focus:border-amber-400`}
                  />
                  {fieldErrors.document && (
                    <p className="text-xs text-rose-400 mt-1 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{fieldErrors.document[0]}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    Nome do Responsável *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={80}
                    placeholder="Ex: Ana Paula"
                    value={ownerName}
                    onChange={(e) => {
                      setOwnerName(e.target.value);
                      clearFieldError('ownerName');
                    }}
                    className={`w-full px-4 py-2.5 rounded-xl bg-slate-950 border ${fieldErrors.ownerName
                      ? 'border-rose-500 ring-2 ring-rose-500/35 bg-rose-500/5'
                      : 'border-slate-700'
                      } text-sm text-white focus:outline-none focus:border-amber-400`}
                  />
                  {fieldErrors.ownerName && (
                    <p className="text-xs text-rose-400 mt-1 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{fieldErrors.ownerName[0]}</span>
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    Telefone (Opcional)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={15}
                    placeholder="(11) 99999-9999"
                    value={storePhone}
                    onChange={(e) => {
                      setStorePhone(formatPhoneMask(e.target.value));
                      clearFieldError('phone');
                    }}
                    className={`w-full px-4 py-2.5 rounded-xl bg-slate-950 border ${fieldErrors.phone
                      ? 'border-rose-500 ring-2 ring-rose-500/35 bg-rose-500/5'
                      : 'border-slate-700'
                      } text-sm text-white font-mono focus:outline-none focus:border-amber-400`}
                  />
                  {fieldErrors.phone && (
                    <p className="text-xs text-rose-400 mt-1 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{fieldErrors.phone[0]}</span>
                    </p>
                  )}
                </div>
              </div>

              <StructuredAddressFields
                cep={storeAddrObj.cep}
                stateUf={storeAddrObj.stateUf}
                city={storeAddrObj.city}
                street={storeAddrObj.street}
                onChange={(next) => {
                  setStoreAddrObj(next);
                  clearFieldError('address');
                }}
                fieldErrors={fieldErrors}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    E-mail de Acesso *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="voce@sualoja.com"
                    value={sandboxEmail}
                    onChange={(e) => {
                      setSandboxEmail(e.target.value);
                      clearFieldError('email');
                    }}
                    className={`w-full px-4 py-2.5 rounded-xl bg-slate-950 border ${fieldErrors.email
                      ? 'border-rose-500 ring-2 ring-rose-500/35 bg-rose-500/5'
                      : 'border-slate-700'
                      } text-sm text-white focus:outline-none focus:border-amber-400`}
                  />
                  {fieldErrors.email && (
                    <p className="text-xs text-rose-400 mt-1 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{fieldErrors.email[0]}</span>
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    Crie uma Senha *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    placeholder="Mínimo 6 dígitos"
                    value={sandboxPassword}
                    onChange={(e) => {
                      setSandboxPassword(e.target.value);
                      clearFieldError('password');
                    }}
                    className={`w-full px-4 py-2.5 rounded-xl bg-slate-950 border ${fieldErrors.password
                      ? 'border-rose-500 ring-2 ring-rose-500/35 bg-rose-500/5'
                      : 'border-slate-700'
                      } text-sm text-white focus:outline-none focus:border-amber-400`}
                  />
                  {fieldErrors.password && (
                    <p className="text-xs text-rose-400 mt-1 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{fieldErrors.password[0]}</span>
                    </p>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-base transition shadow-lg shadow-emerald-950/40 cursor-pointer"
              >
                {submitting ? 'Preparando sua loja...' : 'Criar Minha Loja Agora'}
              </button>
            </form>
          )}

          {/* Acesso Rápido à Loja Demonstração */}
          {isSandboxMode && (
            <div className="pt-5 border-t border-slate-800 text-center space-y-3">
              <p className="text-sm text-slate-300">
                Quer conhecer uma loja pronta funcionando agora mesmo?
              </p>
              <button
                type="button"
                onClick={handleDemoAccess}
                disabled={submitting}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500/20 via-indigo-500/20 to-amber-500/20 hover:from-amber-500/30 hover:to-indigo-500/30 border border-amber-400/40 disabled:opacity-50 text-amber-200 hover:text-white font-semibold text-sm transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Visitar Loja de Roupas Demonstração (1 Clique)</span>
              </button>
            </div>
          )}
        </div>

        {/* Seção Inferior: Carrossel de Clientes Lojistas */}
        <div className="space-y-3 pt-2 overflow-hidden">
          <div className="text-center text-base font-bold text-amber-200 tracking-wide">
            Alguns de nossos clientes lojistas:
          </div>

          <div className="relative w-full overflow-hidden py-1">
            <div className="animate-store-marquee gap-4">
              {marqueeStores.map((store, idx) => {
                const initial = (store.name || 'L').trim().charAt(0).toUpperCase();
                return (
                  <div
                    key={`${store.id}-${idx}`}
                    className="w-80 shrink-0 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex items-center gap-3.5 shadow-lg backdrop-blur-md"
                  >
                    {store.logoUrl ? (
                      <img
                        src={store.logoUrl}
                        alt={store.name}
                        className="w-14 h-14 rounded-2xl object-cover border border-slate-700 shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-600 to-amber-600 flex items-center justify-center text-xl font-bold text-white border border-white/15 shrink-0 shadow-md">
                        {initial}
                      </div>
                    )}

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="text-base font-bold text-white truncate">
                        {store.name}
                      </div>

                      {store.address ? (
                        <div className="text-sm text-slate-300 flex items-center gap-1.5 truncate">
                          <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="truncate">{store.address}</span>
                        </div>
                      ) : (
                        <div className="text-sm text-slate-400">
                          Loja Parceira do Sistema
                        </div>
                      )}

                      {store.phone && (
                        <div className="text-sm text-slate-300 flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>{formatPhoneMask(store.phone)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
