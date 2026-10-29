import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiRequest, getAccessToken, setAccessToken } from '../services/api';
import { AuthTenant, AuthUser, SystemModeConfig } from '../types/erp';

interface AuthSessionPayload {
  accessToken: string;
  user: AuthUser;
  tenant: AuthTenant;
}

interface AuthContextValue {
  user: AuthUser | null;
  tenant: AuthTenant | null;
  modeConfig: SystemModeConfig | null;
  isLoading: boolean;
  login: (email: string, password: string, tenantSlug?: string) => Promise<void>;
  loginDemoStore: () => Promise<void>;
  registerSandboxStore: (input: {
    storeName: string;
    ownerName: string;
    email: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenant, setTenant] = useState<AuthTenant | null>(null);
  const [modeConfig, setModeConfig] = useState<SystemModeConfig | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function initialize() {
      try {
        const mode = await apiRequest<SystemModeConfig>('/auth/mode');
        setModeConfig(mode);
      } catch {
        // Fallback padrão se API ainda estiver subindo
        setModeConfig({
          appMode: 'portfolio_sandbox',
          isPortfolioSandbox: true,
          sandboxTtlHours: 24,
          sandboxMaxProducts: 15,
          maxUploadSizeKb: 500,
        });
      }

      const existingToken = getAccessToken();
      if (existingToken) {
        try {
          const me = await apiRequest<{ user: AuthUser; tenant: AuthTenant }>('/auth/me');
          setUser(me.user);
          setTenant(me.tenant);
        } catch {
          setAccessToken(null);
        }
      }
      setIsLoading(false);
    }

    void initialize();
  }, []);

  const login = async (email: string, password: string, tenantSlug?: string) => {
    const res = await apiRequest<AuthSessionPayload>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, tenantSlug: tenantSlug || undefined }),
    });
    setAccessToken(res.accessToken);
    setUser(res.user);
    setTenant(res.tenant);
  };

  const loginDemoStore = async () => {
    const res = await apiRequest<AuthSessionPayload>('/auth/demo-login', {
      method: 'POST',
    });
    setAccessToken(res.accessToken);
    setUser(res.user);
    setTenant(res.tenant);
  };

  const registerSandboxStore = async (input: {
    storeName: string;
    ownerName: string;
    email: string;
    password: string;
  }) => {
    const res = await apiRequest<AuthSessionPayload>('/auth/sandbox-register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setAccessToken(res.accessToken);
    setUser(res.user);
    setTenant(res.tenant);
  };

  const logout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // Ignora erro de rede no logout
    } finally {
      setAccessToken(null);
      setUser(null);
      setTenant(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        tenant,
        modeConfig,
        isLoading,
        login,
        loginDemoStore,
        registerSandboxStore,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return ctx;
}

