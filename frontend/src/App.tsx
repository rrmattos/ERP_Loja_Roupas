import React, { useState } from 'react';
import { ActivePage, Layout } from './components/Layout';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { InventoryPage } from './pages/InventoryPage';
import { OrdersPosPage } from './pages/OrdersPosPage';
import { ProductsPage } from './pages/ProductsPage';

const AppContent: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [activePage, setActivePage] = useState<ActivePage>('dashboard');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center text-sm">
        Inicializando Vértice ERP...
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <Layout activePage={activePage} onNavigate={setActivePage}>
      {activePage === 'dashboard' && (
        <DashboardPage onNavigate={setActivePage} />
      )}
      {activePage === 'products' && <ProductsPage />}
      {activePage === 'inventory' && <InventoryPage />}
      {activePage === 'orders' && <OrdersPosPage />}
    </Layout>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;

