import React, { useState } from 'react';
import { KeyRound, Sparkles, Store } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const AuthPage: React.FC = () => {
  const { modeConfig, login, loginDemoStore, registerSandboxStore } = useAuth();
  const isSandboxMode = modeConfig?.isPortfolioSandbox ?? true;

  const [activeTab, setActiveTab] = useState<'login' | 'sandbox'>('login');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Campos de Login
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Campos de Criar Nova Loja
  const [storeName, setStoreName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [sandboxEmail, setSandboxEmail] = useState('');
  const [sandboxPassword, setSandboxPassword] = useState('');

  const handleDemoAccess = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await loginDemoStore();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao acessar a loja de demonstração.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(loginEmail, loginPassword);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'E-mail ou senha incorretos.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSandboxSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await registerSandboxStore({
        storeName,
        ownerName,
        email: sandboxEmail,
        password: sandboxPassword,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar sua loja.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg space-y-6">
        {/* Cabeçalho Centralizado da Marca */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-indigo-600 mx-auto flex items-center justify-center font-bold text-2xl text-white shadow-lg shadow-indigo-950">
            V
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Vértice <span className="text-indigo-400">Gestão de Moda</span>
          </h1>
          <p className="text-base text-slate-300 max-w-md mx-auto leading-relaxed">
            Controle de produtos, tamanhos, cores, estoque e vendas da sua loja de roupas em um só lugar.
          </p>
        </div>

        {/* Card Central de Login / Criar Loja */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
          {/* Abas: Entrar vs Criar Minha Loja */}
          {isSandboxMode && (
            <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-950 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('login');
                  setError(null);
                }}
                className={`py-2.5 px-4 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'login'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <KeyRound className="w-4 h-4" />
                <span>Entrar na Conta</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('sandbox');
                  setError(null);
                }}
                className={`py-2.5 px-4 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'sandbox'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Store className="w-4 h-4" />
                <span>Criar Loja Grátis</span>
              </button>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm font-medium">
              {error}
            </div>
          )}

          {activeTab === 'login' || !isSandboxMode ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-white">Acesse sua Loja</h2>
                <p className="text-sm text-slate-400 mt-1">
                  Digite seu e-mail e senha para abrir o painel de gestão.
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
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white focus:outline-none focus:border-indigo-500"
                />
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
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-base transition cursor-pointer"
              >
                {submitting ? 'Entrando...' : 'Entrar no Sistema'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSandboxSubmit} className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-white">
                  Cadastre sua Loja para Testar
                </h2>
                <p className="text-sm text-slate-300 mt-1 leading-relaxed">
                  Sua loja já começa pronta com <strong>2 produtos de exemplo</strong> cadastrados para você testar como quiser.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  Nome da sua Loja
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={80}
                  placeholder="Ex: Loja Estilo Urbano"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  Seu Nome
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder="Ex: João Silva"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    Seu E-mail
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="voce@email.com"
                    value={sandboxEmail}
                    onChange={(e) => setSandboxEmail(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    Crie uma Senha
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    placeholder="Mínimo 6 dígitos"
                    value={sandboxPassword}
                    onChange={(e) => setSandboxPassword(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-base transition cursor-pointer"
              >
                {submitting ? 'Criando sua loja...' : 'Criar Minha Loja Agora'}
              </button>
            </form>
          )}

          {/* Acesso Rápido à Loja Demonstração */}
          {isSandboxMode && (
            <div className="pt-5 border-t border-slate-800 text-center space-y-3">
              <p className="text-sm text-slate-300">
                Prefere conhecer o sistema sem criar conta?
              </p>
              <button
                type="button"
                onClick={handleDemoAccess}
                disabled={submitting}
                className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-50 text-indigo-300 hover:text-white font-semibold text-sm transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Acessar Loja de Demonstração (1 Clique)</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
