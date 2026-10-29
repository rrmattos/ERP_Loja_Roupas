import React from 'react';
import {
  ArrowLeftRight,
  LayoutDashboard,
  LogOut,
  Package,
  ShoppingCart,
  Store,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export type ActivePage = 'dashboard' | 'products' | 'inventory' | 'orders';

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
      subtitle: 'Vendas, estoque e avisos',
      icon: <LayoutDashboard className="w-5 h-5" />,
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
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      {/* Menu Lateral */}
      <aside className="w-full md:w-72 bg-slate-900 border-b md:border-b-0 md:border-r border-slate-800 flex flex-col justify-between shrink-0">
        <div>
          {/* Logo e Nome do Sistema */}
          <div className="p-6 border-b border-slate-800 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-lg text-white shadow-md shadow-indigo-950">
              V
            </div>
            <div>
              <div className="text-base font-bold text-white tracking-tight">
                Vértice Gestão
              </div>
              <div className="text-sm text-slate-400">
                Sistema para Loja de Roupas
              </div>
            </div>
          </div>

          {/* Identificação da Loja Ativa */}
          {tenant && (
            <div className="mx-4 mt-5 p-4 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-sm text-slate-400 mb-1">Loja ativa:</div>
              <div className="flex items-center gap-2 text-base font-bold text-white">
                <Store className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="truncate">{tenant.name}</span>
              </div>
            </div>
          )}

          {/* Links do Menu */}
          <nav className="p-4 space-y-2 mt-2">
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
                      className={`text-sm truncate ${
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
