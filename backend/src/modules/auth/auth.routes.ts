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
import {
  processStoreLogo,
  removeCustomUploadIfExists,
} from '../../shared/utils/imageUpload';
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
  document: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine(
      (v) => v.length === 11 || v.length === 14,
      'Informe um CPF (11 números) ou CNPJ (14 números) válido'
    ),
  phone: z
    .string()
    .optional()
    .transform((v) => (v ? v.replace(/\D/g, '').slice(0, 11) : '')),
  address: z.string().max(255).optional().or(z.literal('')),
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

const updateStoreProfileSchema = z.object({
  name: z
    .string()
    .min(2, 'Informe o Nome Fantasia da loja')
    .max(120),
  legalName: z.string().max(160).optional().or(z.literal('')),
  document: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine(
      (v) => v.length === 11 || v.length === 14,
      'O CPF (11 números) ou CNPJ (14 números) da loja é obrigatório'
    ),
  stateRegistration: z.string().max(40).optional().or(z.literal('')),
  email: z.string().email('Informe um e-mail válido').max(160).optional().or(z.literal('')),
  phone: z
    .string()
    .optional()
    .transform((v) => (v ? v.replace(/\D/g, '').slice(0, 11) : '')),
  address: z.string().max(255).optional().or(z.literal('')),
  logoInput: z.string().optional().nullable(),
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
        document: body.document,
        phone: body.phone,
        address: body.address,
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
 * GET /api/v1/auth/public-stores
 * Retorna lojas clientes para exibir na vitrine da tela de login ("Alguns de nossos clientes lojistas")
 */
authRouter.get('/public-stores', async (_req, res, next) => {
  try {
    const dbStores = await query<{
      id: string;
      name: string;
      logoUrl: string | null;
      address: string | null;
      phone: string | null;
    }>(
      `SELECT
         id,
         name,
         logo_url AS "logoUrl",
         address,
         phone
       FROM tenants
       WHERE active = TRUE
       ORDER BY created_at DESC
       LIMIT 6`
    );

    const showcaseClients = [
      {
        id: 'partner-1',
        name: 'Boutique Bella Donna',
        logoUrl: null,
        address: 'Rua Oscar Freire, 412 - Jardins, São Paulo/SP',
        phone: '(11) 3082-4410',
      },
      {
        id: 'partner-2',
        name: 'Atelier Fio Nobre Alfaiataria',
        logoUrl: null,
        address: 'Av. Batel, 1280 - Batel, Curitiba/PR',
        phone: '(41) 3342-8890',
      },
      {
        id: 'partner-3',
        name: 'Kroma Streetwear & Jeans',
        logoUrl: null,
        address: 'Rua Visconde de Pirajá, 310 - Ipanema, Rio de Janeiro/RJ',
        phone: '(21) 2523-7712',
      },
      {
        id: 'partner-4',
        name: 'Lumina Moda Feminina',
        logoUrl: null,
        address: 'Rua Padre Chagas, 220 - Moinhos de Vento, Porto Alegre/RS',
        phone: null,
      },
      {
        id: 'partner-5',
        name: 'Casa do Algodão Básico',
        logoUrl: null,
        address: 'Av. Savassi, 950 - Belo Horizonte/MG',
        phone: '(31) 3281-5500',
      },
    ];

    res.json([...dbStores.rows, ...showcaseClients]);
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
         t.id AS tenant_id, t.name AS tenant_name,
         t.legal_name, t.document, t.state_registration,
         t.email AS tenant_email, t.phone AS tenant_phone,
         t.address AS tenant_address, t.logo_url,
         t.slug AS tenant_slug,
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
        legalName: row.legal_name,
        document: row.document,
        stateRegistration: row.state_registration,
        email: row.tenant_email,
        phone: row.tenant_phone,
        address: row.tenant_address,
        logoUrl: row.logo_url,
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

/**
 * GET /api/v1/auth/store-profile
 * Obtém o cadastro completo da loja ativa
 */
authRouter.get('/store-profile', requireAuth, async (req, res, next) => {
  try {
    const { tenantId } = req.auth!;
    const result = await query(
      `SELECT
         id,
         name,
         legal_name AS "legalName",
         document,
         state_registration AS "stateRegistration",
         email,
         phone,
         address,
         logo_url AS "logoUrl",
         slug
       FROM tenants
       WHERE id = $1
       LIMIT 1`,
      [tenantId]
    );

    if (!result.rows[0]) {
      throw new AppError('Loja não encontrada.', 404, 'STORE_NOT_FOUND');
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/auth/store-profile
 * Atualiza o cadastro do perfil do lojista (Nome Fantasia, Razão Social, CNPJ, IE, Endereço, Telefone e Logo)
 */
authRouter.put('/store-profile', requireAuth, async (req, res, next) => {
  try {
    const { tenantId } = req.auth!;
    const body = updateStoreProfileSchema.parse(req.body);

    const currentRes = await query<{ logo_url: string | null }>(
      `SELECT logo_url FROM tenants WHERE id = $1 LIMIT 1`,
      [tenantId]
    );
    const currentLogo = currentRes.rows[0]?.logo_url ?? null;

    let finalLogoUrl = currentLogo;
    if (body.logoInput !== undefined) {
      if (body.logoInput === null || body.logoInput.trim() === '') {
        await removeCustomUploadIfExists(currentLogo);
        finalLogoUrl = null;
      } else if (body.logoInput !== currentLogo) {
        finalLogoUrl = await processStoreLogo(body.logoInput, tenantId);
        if (currentLogo && currentLogo !== finalLogoUrl) {
          await removeCustomUploadIfExists(currentLogo);
        }
      }
    }

    const updated = await query(
      `UPDATE tenants
       SET name = $1,
           legal_name = $2,
           document = $3,
           state_registration = $4,
           email = $5,
           phone = $6,
           address = $7,
           logo_url = $8,
           updated_at = NOW()
       WHERE id = $9
       RETURNING
         id,
         name,
         legal_name AS "legalName",
         document,
         state_registration AS "stateRegistration",
         email,
         phone,
         address,
         logo_url AS "logoUrl",
         slug,
         is_demo AS "isDemo",
         is_sandbox AS "isSandbox",
         max_products AS "maxProducts",
         expires_at AS "expiresAt"`,
      [
        body.name.trim(),
        body.legalName?.trim() || null,
        body.document.trim(),
        body.stateRegistration?.trim() || null,
        body.email?.trim() || null,
        body.phone?.trim() || null,
        body.address?.trim() || null,
        finalLogoUrl,
        tenantId,
      ]
    );

    res.json(updated.rows[0]);
  } catch (error) {
    next(error);
  }
});

