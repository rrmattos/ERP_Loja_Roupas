import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { AppError } from '../errors/AppError';

export type UserRole = 'OWNER' | 'ADMIN' | 'STAFF' | 'DEMO_VIEWER';

export interface JwtAccessPayload {
  sub: string;       // user_id
  tenantId: string;  // tenant_id (Isolamento Multi-Tenant)
  role: UserRole;
  isDemo: boolean;
  isSandbox: boolean;
}

export interface JwtRefreshPayload {
  sub: string;
  tenantId: string;
  jti: string;
}

export function signAccessToken(payload: JwtAccessPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: '15m',
    issuer: 'erp-loja-roupas-api',
    audience: 'erp-loja-roupas-client',
  });
}

export function signRefreshToken(userId: string, tenantId: string): {
  token: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const jti = crypto.randomUUID();
  const token = jwt.sign(
    { sub: userId, tenantId, jti } satisfies JwtRefreshPayload,
    env.JWT_REFRESH_SECRET,
    {
      expiresIn: '7d',
      issuer: 'erp-loja-roupas-api',
    }
  );

  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  return { token, tokenHash, expiresAt };
}

export function verifyAccessToken(token: string): JwtAccessPayload {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'erp-loja-roupas-api',
      audience: 'erp-loja-roupas-client',
    }) as JwtAccessPayload;
  } catch {
    throw new AppError('Sessão inválida ou expirada', 401, 'INVALID_ACCESS_TOKEN');
  }
}

export function verifyRefreshToken(token: string): JwtRefreshPayload {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET, {
      issuer: 'erp-loja-roupas-api',
    }) as JwtRefreshPayload;
  } catch {
    throw new AppError('Refresh token inválido ou expirado', 401, 'INVALID_REFRESH_TOKEN');
  }
}

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

