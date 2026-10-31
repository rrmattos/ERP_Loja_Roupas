const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

export class ApiError extends Error {
  statusCode: number;
  code?: string;
  fieldErrors: Record<string, string[]>;

  constructor(
    message: string,
    statusCode: number,
    code?: string,
    fieldErrors: Record<string, string[]> = {}
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

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
    const fieldErrors: Record<string, string[]> =
      data?.details && typeof data.details === 'object' ? data.details : {};

    let errorMessage =
      data?.message || 'Ocorreu um erro ao processar a requisição.';

    // Se for mensagem genérica de validação mas vierem os campos detalhados
    if (
      (errorMessage === 'Dados de entrada inválidos' ||
        errorMessage.includes('inválidos')) &&
      Object.keys(fieldErrors).length > 0
    ) {
      const messagesList = Object.values(fieldErrors).flat().filter(Boolean);
      if (messagesList.length > 0) {
        errorMessage = `Revise os campos: ${messagesList.join(' • ')}`;
      }
    }

    throw new ApiError(errorMessage, response.status, data?.code, fieldErrors);
  }

  return data as T;
}

export const MAX_IMAGE_UPLOAD_BYTES = 3 * 1024 * 1024; // Limite máximo de 3 MB

/**
 * Valida o tamanho máximo de 3 MB, redimensiona com suavização alta e comprime qualquer imagem
 * (PNG, JPG, JPEG, WebP) para o formato leve WebP mantendo ótima nitidez e o menor tamanho possível (~15KB a 45KB).
 */
export async function compressImageToWebP(
  file: File,
  maxDim = 600
): Promise<string> {
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2).replace('.', ',');
    throw new Error(
      `A imagem selecionada possui ${sizeMb} MB e ultrapassa o limite máximo permitido de 3 MB. Escolha uma imagem menor.`
    );
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error('Falha ao ler arquivo de imagem.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () =>
        reject(new Error('Arquivo selecionado não é uma imagem válida.'));
      img.onload = () => {
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
          reject(
            new Error('Não foi possível inicializar compressor gráfico.')
          );
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Converte para WebP com compressão adaptativa para manter qualidade razoável com o menor tamanho possível
        let quality = 0.78;
        let dataUrl = canvas.toDataURL('image/webp', quality);

        // Se ainda passar de ~90KB em base64, reduz suavemente a taxa mantendo nitidez
        if (dataUrl.length > 120_000) {
          quality = 0.68;
          dataUrl = canvas.toDataURL('image/webp', quality);
        }

        if (!dataUrl.startsWith('data:image/webp')) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.76);
        }

        resolve(dataUrl);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Calcula o tamanho aproximado em KB de uma imagem Base64 já comprimida em WebP
 */
export function getDataUrlSizeKB(dataUrl: string): number {
  const base64Part = dataUrl.split(',')[1] || '';
  const bytes = Math.round((base64Part.length * 3) / 4);
  return Math.max(1, Math.round(bytes / 1024));
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

