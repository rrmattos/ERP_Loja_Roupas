import React from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  LayoutDashboard,
  LogOut,
  Package,
  Settings,
  ShoppingCart,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatCpfCnpjMask } from '../utils/formatters';

export type ActivePage =
  | 'dashboard'
  | 'metrics'
  | 'products'
  | 'inventory'
  | 'orders'
  | 'partners'
  | 'store-profile';

interface LayoutProps {
  activePage: ActivePage;
  onNavigate: (page: ActivePage) => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({
  activePage,
  onNavigate,
  children,
}) => {
  const { user, tenant, logout } = useAuth();

  const navItems: Array<{
    id: ActivePage;
    label: string;
    subtitle: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'dashboard',
      label: 'Início / Resumo',
      subtitle: 'Visão geral do dia',
      icon: <LayoutDashboard className="w-5 h-5" />,
    },
    {
      id: 'metrics',
      label: 'Métricas e Relatórios',
      subtitle: 'Gráficos, índices e planilhas',
      icon: <BarChart3 className="w-5 h-5" />,
    },
    {
      id: 'products',
      label: 'Produtos e Roupas',
      subtitle: 'Modelos, tamanhos e cores',
      icon: <Package className="w-5 h-5" />,
    },
    {
      id: 'inventory',
      label: 'Controle de Estoque',
      subtitle: 'Entradas e saídas de peças',
      icon: <ArrowLeftRight className="w-5 h-5" />,
    },
    {
      id: 'orders',
      label: 'Caixa e Vendas',
      subtitle: 'Registrar venda e histórico',
      icon: <ShoppingCart className="w-5 h-5" />,
    },
    {
      id: 'partners',
      label: 'Cadastros (CPF / CNPJ)',
      subtitle: 'Clientes, Fornecedores e Funcionários',
      icon: <Users className="w-5 h-5" />,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      {/* Menu Lateral */}
      <aside className="w-full md:w-72 bg-slate-900 border-b md:border-b-0 md:border-r border-slate-800 flex flex-col justify-between shrink-0 print:hidden">
        <div>
          {/* Topo do Menu Lateral: Perfil e Cadastro da Loja (Clicável) */}
          <div className="p-4 border-b border-slate-800">
            <button
              type="button"
              onClick={() => onNavigate('store-profile')}
              className={`w-full text-left p-3.5 rounded-2xl border transition flex items-center gap-3.5 cursor-pointer group ${
                activePage === 'store-profile'
                  ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-md'
                  : 'bg-slate-950/90 hover:bg-slate-800/80 border-slate-800 hover:border-slate-700'
              }`}
              title="Clique para editar o perfil, logo e CNPJ da loja"
            >
              {tenant?.logoUrl ? (
                <img
                  src={tenant.logoUrl}
                  alt={tenant.name}
                  className="w-12 h-12 rounded-xl object-cover border border-slate-700 shrink-0 shadow-md"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-amber-600 flex items-center justify-center font-bold text-xl text-white shadow-md shrink-0">
                  {(tenant?.name || 'V').trim().charAt(0).toUpperCase()}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="text-base font-bold text-white truncate group-hover:text-amber-300 transition">
                  {tenant?.name || 'Minha Loja'}
                </div>
                <div className="text-sm text-slate-400 truncate">
                  {tenant?.document
                    ? `Doc: ${formatCpfCnpjMask(tenant.document)}`
                    : 'Perfil da Loja'}
                </div>
                <div className="text-sm text-indigo-400 font-medium flex items-center gap-1 mt-0.5">
                  <Settings className="w-3.5 h-3.5" />
                  <span>Editar Perfil da Loja</span>
                </div>
              </div>
            </button>
          </div>

          {/* Links do Menu */}
          <nav className="p-4 space-y-1.5 mt-1">
            {navItems.map((item) => {
              const active = activePage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl transition flex items-center gap-3.5 cursor-pointer ${
                    active
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/60'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg ${
                      active ? 'bg-indigo-500/40' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {item.icon}
                  </div>
                  <div className="overflow-hidden">
                    <div className="text-sm font-semibold truncate">
                      {item.label}
                    </div>
                    <div
                      className={`text-sm leading-snug ${
                        active ? 'text-indigo-200' : 'text-slate-400'
                      }`}
                    >
                      {item.subtitle}
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Rodapé do Menu: Usuário Logado + Botão Sair */}
        <div className="p-5 border-t border-slate-800 bg-slate-950/50">
          <div className="flex items-center justify-between gap-3">
            <div className="overflow-hidden">
              <div className="text-sm font-semibold text-white truncate">
                {user?.name}
              </div>
              <div className="text-sm text-slate-400 truncate">
                {user?.email}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              title="Sair do sistema"
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-200 hover:text-white text-sm font-medium transition flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Conteúdo Principal da Página */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 p-6 lg:p-8 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
};
