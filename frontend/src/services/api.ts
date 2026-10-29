const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

let accessTokenMemory: string | null = sessionStorage.getItem('erp_access_token');

export function setAccessToken(token: string | null): void {
  accessTokenMemory = token;
  if (token) {
    sessionStorage.setItem('erp_access_token', token);
  } else {
    sessionStorage.removeItem('erp_access_token');
  }
}

export function getAccessToken(): string | null {
  return accessTokenMemory;
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  isRetry = false
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (accessTokenMemory) {
    headers.set('Authorization', `Bearer ${accessTokenMemory}`);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include', // Envia cookie HttpOnly do Refresh Token
  });

  // Se Access Token expirou (401), tenta rotacionar automaticamente via Refresh Token
  if (
    response.status === 401 &&
    !isRetry &&
    !endpoint.startsWith('/auth/login') &&
    !endpoint.startsWith('/auth/demo-login') &&
    !endpoint.startsWith('/auth/sandbox-register') &&
    !endpoint.startsWith('/auth/refresh')
  ) {
    try {
      const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });

      if (refreshRes.ok) {
        const refreshData = (await refreshRes.json()) as { accessToken: string };
        setAccessToken(refreshData.accessToken);
        return apiRequest<T>(endpoint, options, true);
      } else {
        setAccessToken(null);
      }
    } catch {
      setAccessToken(null);
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMessage =
      data?.message || 'Ocorreu um erro ao processar a requisição.';
    throw new Error(errorMessage);
  }

  return data as T;
}

/**
 * Comprime e redimensiona qualquer imagem selecionada pelo usuário diretamente no navegador
 * para o formato WebP (máx 640x640px, ~35KB-70KB) antes de enviar à VPS!
 */
export async function compressImageToWebP(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler arquivo de imagem.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Arquivo selecionado não é uma imagem válida.'));
      img.onload = () => {
        const maxDim = 640;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Não foi possível inicializar compressor gráfico.'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Exporta em WebP (se suportado pelo browser) ou JPEG comprimido
        let dataUrl = canvas.toDataURL('image/webp', 0.82);
        if (!dataUrl.startsWith('data:image/webp')) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        }

        resolve(dataUrl);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);
}

export function formatDateTimeBR(isoString: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

