import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { query } from '../../config/database';
import { AppError } from '../errors/AppError';
import { UserRole, verifyAccessToken } from '../utils/jwt';
import { logger } from '../utils/logger';

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: UserRole;
  isDemo: boolean;
  isSandbox: boolean;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      unityTenantId?: string;
    }
  }
}

/**
 * Middleware de autenticação JWT com isolamento de Tenant obrigatório
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Token de autenticação não fornecido', 401, 'MISSING_TOKEN');
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new AppError('Token de autenticação malformado', 401, 'MALFORMED_TOKEN');
    }

    const payload = verifyAccessToken(token);

    req.auth = {
      userId: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
      isDemo: payload.isDemo,
      isSandbox: payload.isSandbox,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware RBAC (Role-Based Access Control)
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      return next(new AppError('Não autenticado', 401, 'UNAUTHORIZED'));
    }

    if (!allowedRoles.includes(req.auth.role)) {
      return next(
        new AppError('Permissão insuficiente para executar esta operação', 403, 'FORBIDDEN')
      );
    }

    next();
  };
}

/**
 * Middleware para autenticar chamadas vindas do motor gráfico Unity 3D (Meta Quest)
 * Valida o header `X-Unity-Api-Key` vinculando-o ao Tenant correspondente
 */
export async function requireUnityApiKey(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const apiKeyHeader = req.headers['x-unity-api-key'];
    const tenantSlugHeader = req.headers['x-tenant-slug'] ?? 'demo-store';

    if (typeof apiKeyHeader !== 'string' || apiKeyHeader.length < 16) {
      const ip = req.ip ?? 'unknown';
      logger.securityAuthFail(ip, 'MISSING_OR_INVALID_UNITY_API_KEY');
      throw new AppError('Chave de API Unity inválida ou ausente', 401, 'INVALID_UNITY_KEY');
    }

    const slug = typeof tenantSlugHeader === 'string' ? tenantSlugHeader : 'demo-store';

    const result = await query<{ id: string; unity_api_key: string | null }>(
      `SELECT id, unity_api_key
       FROM tenants
       WHERE slug = $1 AND active = TRUE
       LIMIT 1`,
      [slug]
    );

    const tenant = result.rows[0];
    if (!tenant || !tenant.unity_api_key) {
      throw new AppError('Loja não encontrada ou integração Unity desabilitada', 404, 'TENANT_NOT_FOUND');
    }

    // Comparação em tempo constante contra Timing Attacks
    const providedBuf = Buffer.from(apiKeyHeader, 'utf8');
    const expectedBuf = Buffer.from(tenant.unity_api_key, 'utf8');

    if (
      providedBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(providedBuf, expectedBuf)
    ) {
      const ip = req.ip ?? 'unknown';
      logger.securityAuthFail(ip, 'UNITY_KEY_MISMATCH');
      throw new AppError('Chave de API Unity não autorizada', 401, 'UNAUTHORIZED_UNITY_KEY');
    }

    req.unityTenantId = tenant.id;
    next();
  } catch (error) {
    next(error);
  }
}

