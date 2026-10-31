import React, { useState } from 'react';
import { ActivePage, Layout } from './components/Layout';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { InventoryPage } from './pages/InventoryPage';
import { MetricsReportsPage } from './pages/MetricsReportsPage';
import { OrdersPosPage } from './pages/OrdersPosPage';
import { PartnersPage } from './pages/PartnersPage';
import { ProductsPage } from './pages/ProductsPage';
import { StoreProfilePage } from './pages/StoreProfilePage';
import { MetricsSectionFocus } from './types/erp';

const AppContent: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [activePage, setActivePage] = useState<ActivePage>('dashboard');
  const [metricsFocus, setMetricsFocus] =
    useState<MetricsSectionFocus | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center text-base">
        Inicializando Vértice Gestão de Moda...
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  const handleNavigate = (page: ActivePage) => {
    if (page !== 'metrics') {
      setMetricsFocus(null);
    }
    setActivePage(page);
  };

  const handleOpenMetricsSection = (section: MetricsSectionFocus) => {
    setMetricsFocus(section);
    setActivePage('metrics');
  };

  return (
    <Layout activePage={activePage} onNavigate={handleNavigate}>
      {activePage === 'dashboard' && (
        <DashboardPage
          onNavigate={handleNavigate}
          onOpenMetricsSection={handleOpenMetricsSection}
        />
      )}
      {activePage === 'metrics' && (
        <MetricsReportsPage
          focusSection={metricsFocus}
          onClearFocus={() => setMetricsFocus(null)}
        />
      )}
      {activePage === 'products' && <ProductsPage />}
      {activePage === 'partners' && <PartnersPage />}
      {activePage === 'inventory' && <InventoryPage />}
      {activePage === 'orders' && <OrdersPosPage />}
      {activePage === 'store-profile' && <StoreProfilePage />}
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

