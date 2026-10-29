import { CookieOptions, Router } from 'express';
import { z } from 'zod';
import { query } from '../../config/database';
import { env } from '../../config/env';
import { AppError } from '../../shared/errors/AppError';
import { requireAuth } from '../../shared/middlewares/auth.middleware';
import {
  authRateLimiter,
  sandboxCreationLimiter,
} from '../../shared/middlewares/rateLimiter';
import { authService } from './auth.service';

export const authRouter = Router();

const REFRESH_COOKIE_NAME = 'erp_refresh_token';

function getRefreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: !env.isDevelopment,
    sameSite: 'strict',
    path: '/api/v1/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
  };
}

const loginSchema = z.object({
  email: z.string().email('Informe um e-mail válido').max(160),
  password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres').max(128),
  tenantSlug: z.string().max(80).optional(),
});

const sandboxRegisterSchema = z.object({
  storeName: z
    .string()
    .min(3, 'Nome da loja deve ter no mínimo 3 caracteres')
    .max(80, 'Nome da loja muito longo'),
  ownerName: z
    .string()
    .min(2, 'Informe seu nome')
    .max(80, 'Nome muito longo'),
  email: z.string().email('Informe um e-mail válido').max(160),
  password: z
    .string()
    .min(6, 'A senha deve ter pelo menos 6 caracteres')
    .max(100),
});

/**
 * GET /api/v1/auth/mode
 * Informa ao Front-end em qual modo o sistema está operando (Portfólio Sandbox vs Produção Comercial)
 */
authRouter.get('/mode', (_req, res) => {
  res.json({
    appMode: env.APP_MODE,
    isPortfolioSandbox: env.isPortfolioSandbox,
    sandboxTtlHours: env.SANDBOX_TTL_HOURS,
    sandboxMaxProducts: env.SANDBOX_MAX_PRODUCTS,
    maxUploadSizeKb: env.MAX_UPLOAD_SIZE_KB,
  });
});

/**
 * POST /api/v1/auth/login
 */
authRouter.post('/login', authRateLimiter, async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const session = await authService.login({
      email: body.email,
      password: body.password,
      tenantSlug: body.tenantSlug,
      ip: req.ip ?? 'unknown',
      userAgent: req.headers['user-agent'],
    });

    res.cookie(REFRESH_COOKIE_NAME, session.refreshToken, getRefreshCookieOptions());

    res.json({
      accessToken: session.accessToken,
      user: session.user,
      tenant: session.tenant,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/auth/demo-login
 * Acesso 1-Clique na Loja Demonstração para Recrutadores / Visitantes
 */
authRouter.post('/demo-login', authRateLimiter, async (req, res, next) => {
  try {
    const session = await authService.loginDemoStore({
      ip: req.ip ?? 'unknown',
      userAgent: req.headers['user-agent'],
    });

    res.cookie(REFRESH_COOKIE_NAME, session.refreshToken, getRefreshCookieOptions());

    res.json({
      accessToken: session.accessToken,
      user: session.user,
      tenant: session.tenant,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/auth/sandbox-register
 * Cria uma Loja Sandbox isolada para o visitante com 2 produtos pré-cadastrados (expira em 24h)
 */
authRouter.post(
  '/sandbox-register',
  sandboxCreationLimiter,
  async (req, res, next) => {
    try {
      const body = sandboxRegisterSchema.parse(req.body);
      const session = await authService.registerSandboxStore({
        storeName: body.storeName,
        ownerName: body.ownerName,
        email: body.email,
        password: body.password,
        ip: req.ip ?? 'unknown',
        userAgent: req.headers['user-agent'],
      });

      res.cookie(REFRESH_COOKIE_NAME, session.refreshToken, getRefreshCookieOptions());

      res.status(201).json({
        accessToken: session.accessToken,
        user: session.user,
        tenant: session.tenant,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/auth/refresh
 */
authRouter.post('/refresh', async (req, res, next) => {
  try {
    const rawRefreshToken =
      req.cookies?.[REFRESH_COOKIE_NAME] ?? req.body?.refreshToken;

    if (typeof rawRefreshToken !== 'string' || !rawRefreshToken) {
      throw new AppError('Refresh token ausente', 401, 'MISSING_REFRESH_TOKEN');
    }

    const session = await authService.refreshSession({
      rawRefreshToken,
      ip: req.ip ?? 'unknown',
      userAgent: req.headers['user-agent'],
    });

    res.cookie(REFRESH_COOKIE_NAME, session.refreshToken, getRefreshCookieOptions());

    res.json({
      accessToken: session.accessToken,
      user: session.user,
      tenant: session.tenant,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/auth/logout
 */
authRouter.post('/logout', async (req, res, next) => {
  try {
    const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    await authService.logout(rawRefreshToken);
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/auth/me
 */
authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { userId, tenantId } = req.auth!;
    const result = await query(
      `SELECT
         u.id, u.name, u.email, u.role,
         t.id AS tenant_id, t.name AS tenant_name, t.slug AS tenant_slug,
         t.is_demo, t.is_sandbox, t.max_products, t.expires_at
       FROM users u
       INNER JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = $1 AND t.id = $2
       LIMIT 1`,
      [userId, tenantId]
    );

    const row = result.rows[0];
    if (!row) {
      throw new AppError('Sessão inválida', 401, 'SESSION_NOT_FOUND');
    }

    res.json({
      user: {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
      },
      tenant: {
        id: row.tenant_id,
        name: row.tenant_name,
        slug: row.tenant_slug,
        isDemo: row.is_demo,
        isSandbox: row.is_sandbox,
        maxProducts: row.max_products,
        expiresAt: row.expires_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

