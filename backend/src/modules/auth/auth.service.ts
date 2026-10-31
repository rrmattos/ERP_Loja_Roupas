import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query, withTransaction } from '../../config/database';
import { env } from '../../config/env';
import { AppError } from '../../shared/errors/AppError';
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  UserRole,
  verifyRefreshToken,
} from '../../shared/utils/jwt';
import { logger } from '../../shared/utils/logger';

interface AuthSessionResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
  };
  tenant: {
    id: string;
    name: string;
    legalName: string | null;
    document: string | null;
    stateRegistration: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    logoUrl: string | null;
    slug: string;
    isDemo: boolean;
    isSandbox: boolean;
    maxProducts: number;
    expiresAt: string | null;
  };
}

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

export class AuthService {
  /**
   * Login padrão com proteção contra Brute-Force (Account Lockout + Log Fail2ban)
   */
  async login(params: {
    email: string;
    password: string;
    tenantSlug?: string;
    ip: string;
    userAgent?: string;
  }): Promise<AuthSessionResponse> {
    const emailNormalized = params.email.trim().toLowerCase();

    const userQuery = await query<{
      id: string;
      tenant_id: string;
      name: string;
      email: string;
      password_hash: string;
      role: UserRole;
      active: boolean;
      failed_login_attempts: number;
      locked_until: Date | null;
      tenant_name: string;
      tenant_slug: string;
      is_demo: boolean;
      is_sandbox: boolean;
      max_products: number;
      expires_at: Date | null;
      tenant_active: boolean;
    }>(
      `SELECT
         u.id, u.tenant_id, u.name, u.email, u.password_hash, u.role, u.active,
         u.failed_login_attempts, u.locked_until,
         t.name AS tenant_name, t.slug AS tenant_slug, t.is_demo, t.is_sandbox,
         t.max_products, t.expires_at, t.active AS tenant_active
       FROM users u
       INNER JOIN tenants t ON t.id = u.tenant_id
       WHERE LOWER(u.email) = $1
         AND ($2::varchar IS NULL OR t.slug = $2)
       ORDER BY t.is_demo ASC, u.created_at DESC
       LIMIT 1`,
      [emailNormalized, params.tenantSlug ?? null]
    );

    const user = userQuery.rows[0];

    if (!user || !user.active || !user.tenant_active) {
      logger.securityAuthFail(params.ip, 'USER_NOT_FOUND_OR_INACTIVE', emailNormalized);
      throw new AppError('Credenciais inválidas', 401, 'INVALID_CREDENTIALS');
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      logger.securityAuthFail(params.ip, 'ACCOUNT_LOCKED', emailNormalized);
      throw new AppError(
        'Conta temporariamente bloqueada por múltiplas tentativas inválidas. Tente novamente em 15 minutos.',
        423,
        'ACCOUNT_LOCKED'
      );
    }

    const passwordMatches = await bcrypt.compare(params.password, user.password_hash);

    if (!passwordMatches) {
      const attempts = user.failed_login_attempts + 1;
      const lockAccount = attempts >= 5;

      await query(
        `UPDATE users
         SET failed_login_attempts = $1,
             locked_until = CASE WHEN $2 THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END
         WHERE id = $3`,
        [attempts, lockAccount, user.id]
      );

      logger.securityAuthFail(params.ip, 'WRONG_PASSWORD', emailNormalized);
      throw new AppError('Credenciais inválidas', 401, 'INVALID_CREDENTIALS');
    }

    await query(
      `UPDATE users
       SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    return this.createSession({
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      role: user.role,
      tenantId: user.tenant_id,
      tenantName: user.tenant_name,
      tenantSlug: user.tenant_slug,
      isDemo: user.is_demo,
      isSandbox: user.is_sandbox,
      maxProducts: user.max_products,
      expiresAt: user.expires_at,
      ip: params.ip,
      userAgent: params.userAgent,
    });
  }

  /**
   * Acesso 1-Clique na Loja Demonstração (Exclusivo para APP_MODE=portfolio_sandbox)
   */
  async loginDemoStore(params: {
    ip: string;
    userAgent?: string;
  }): Promise<AuthSessionResponse> {
    if (!env.isPortfolioSandbox) {
      throw new AppError(
        'O modo de demonstração pública está desativado neste ambiente.',
        403,
        'DEMO_MODE_DISABLED'
      );
    }

    const result = await query<{
      id: string;
      tenant_id: string;
      name: string;
      email: string;
      role: UserRole;
      tenant_name: string;
      tenant_slug: string;
      is_demo: boolean;
      is_sandbox: boolean;
      max_products: number;
      expires_at: Date | null;
    }>(
      `SELECT
         u.id, u.tenant_id, u.name, u.email, u.role,
         t.name AS tenant_name, t.slug AS tenant_slug,
         t.is_demo, t.is_sandbox, t.max_products, t.expires_at
       FROM tenants t
       INNER JOIN users u ON u.tenant_id = t.id
       WHERE t.is_demo = TRUE AND t.active = TRUE
       ORDER BY u.created_at ASC
       LIMIT 1`
    );

    const demoUser = result.rows[0];
    if (!demoUser) {
      throw new AppError('Loja Demonstração ainda não inicializada.', 404, 'DEMO_STORE_NOT_FOUND');
    }

    return this.createSession({
      userId: demoUser.id,
      userName: demoUser.name,
      userEmail: demoUser.email,
      role: demoUser.role,
      tenantId: demoUser.tenant_id,
      tenantName: demoUser.tenant_name,
      tenantSlug: demoUser.tenant_slug,
      isDemo: demoUser.is_demo,
      isSandbox: demoUser.is_sandbox,
      maxProducts: demoUser.max_products,
      expiresAt: demoUser.expires_at,
      ip: params.ip,
      userAgent: params.userAgent,
    });
  }

  /**
   * Cria uma nova Loja Sandbox isolada para o Recrutador/Visitante
   * Já nasce com 2 produtos pré-cadastrados, matriz de cores/tamanhos e expira em 24h
   */
  async registerSandboxStore(params: {
    storeName: string;
    document: string;
    phone?: string;
    address?: string;
    ownerName: string;
    email: string;
    password: string;
    ip: string;
    userAgent?: string;
  }): Promise<AuthSessionResponse> {
    if (!env.isPortfolioSandbox) {
      throw new AppError(
        'O auto-cadastro de lojas de teste está desativado em produção comercial.',
        403,
        'SANDBOX_REGISTRATION_DISABLED'
      );
    }

    const emailNormalized = params.email.trim().toLowerCase();
    const baseSlug = slugify(params.storeName) || 'loja-teste';
    const uniqueSlug = `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`;
    const unityApiKey = `unity_sbx_${crypto.randomBytes(18).toString('hex')}`;
    const passwordHash = await bcrypt.hash(params.password, 12);

    const created = await withTransaction(async (client) => {
      const tenantRes = await client.query<{
        id: string;
        name: string;
        slug: string;
        is_demo: boolean;
        is_sandbox: boolean;
        max_products: number;
        expires_at: Date;
      }>(
        `INSERT INTO tenants (
           name, legal_name, document, email, phone, address,
           slug, is_demo, is_sandbox, max_products, unity_api_key, expires_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, TRUE, $8, $9, NOW() + ($10 || ' hours')::INTERVAL)
         RETURNING id, name, slug, is_demo, is_sandbox, max_products, expires_at`,
        [
          params.storeName.trim(),
          `${params.storeName.trim()} Comércio de Moda Ltda`,
          params.document.trim(),
          emailNormalized,
          params.phone?.trim() || null,
          params.address?.trim() || null,
          uniqueSlug,
          env.SANDBOX_TTL_HOURS ? env.SANDBOX_MAX_PRODUCTS : 15,
          unityApiKey,
          String(env.SANDBOX_TTL_HOURS),
        ]
      );

      const tenant = tenantRes.rows[0];

      const userRes = await client.query<{
        id: string;
        name: string;
        email: string;
        role: UserRole;
      }>(
        `INSERT INTO users (tenant_id, name, email, document, phone, job_title, password_hash, role)
         VALUES ($1, $2, $3, $4, $5, 'Proprietário / Gerente', $6, 'OWNER')
         RETURNING id, name, email, role`,
        [
          tenant.id,
          params.ownerName.trim(),
          emailNormalized,
          params.document.trim(),
          params.phone?.trim() || null,
          passwordHash,
        ]
      );

      const shortTenant = tenant.id.slice(0, 8);
      await client.query(
        `INSERT INTO users (tenant_id, name, email, phone, document, job_title, password_hash, role)
         VALUES
           ($1, 'Beatriz Santos', $2, '(11) 99223-3445', '234.567.890-11', 'Vendedora', $4, 'STAFF'),
           ($1, 'Diego Ferreira', $3, '(11) 99334-4556', '345.678.901-22', 'Vendedor / Caixa', $4, 'STAFF')
         ON CONFLICT (tenant_id, email) DO NOTHING`,
        [
          tenant.id,
          `beatriz.${shortTenant}@loja.com`,
          `diego.${shortTenant}@loja.com`,
          passwordHash,
        ]
      );

      // Executa a procedure SQL que popula os 2 produtos pré-cadastrados, cores, tamanhos e estoque
      await client.query(`SELECT seed_tenant_catalog($1, FALSE)`, [tenant.id]);

      return { tenant, user: userRes.rows[0] };
    });

    logger.info('Nova loja Sandbox criada para avaliação do portfólio', {
      tenantSlug: created.tenant.slug,
      expiresAt: created.tenant.expires_at,
    });

    return this.createSession({
      userId: created.user.id,
      userName: created.user.name,
      userEmail: created.user.email,
      role: created.user.role,
      tenantId: created.tenant.id,
      tenantName: created.tenant.name,
      tenantSlug: created.tenant.slug,
      isDemo: created.tenant.is_demo,
      isSandbox: created.tenant.is_sandbox,
      maxProducts: created.tenant.max_products,
      expiresAt: created.tenant.expires_at,
      ip: params.ip,
      userAgent: params.userAgent,
    });
  }

  /**
   * Rotaciona o Refresh Token emitindo novo par de tokens
   */
  async refreshSession(params: {
    rawRefreshToken: string;
    ip: string;
    userAgent?: string;
  }): Promise<AuthSessionResponse> {
    const payload = verifyRefreshToken(params.rawRefreshToken);
    const tokenHash = hashToken(params.rawRefreshToken);

    const tokenRes = await query<{
      id: string;
      user_id: string;
      tenant_id: string;
      revoked_at: Date | null;
      expires_at: Date;
    }>(
      `SELECT id, user_id, tenant_id, revoked_at, expires_at
       FROM refresh_tokens
       WHERE token_hash = $1 AND user_id = $2
       LIMIT 1`,
      [tokenHash, payload.sub]
    );

    const storedToken = tokenRes.rows[0];
    if (
      !storedToken ||
      storedToken.revoked_at !== null ||
      new Date(storedToken.expires_at) <= new Date()
    ) {
      throw new AppError('Sessão expirada. Faça login novamente.', 401, 'REFRESH_TOKEN_EXPIRED');
    }

    // Revoga o token anterior (Refresh Token Rotation)
    await query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [storedToken.id]);

    const userRes = await query<{
      id: string;
      name: string;
      email: string;
      role: UserRole;
      tenant_id: string;
      tenant_name: string;
      tenant_slug: string;
      is_demo: boolean;
      is_sandbox: boolean;
      max_products: number;
      expires_at: Date | null;
    }>(
      `SELECT
         u.id, u.name, u.email, u.role,
         t.id AS tenant_id, t.name AS tenant_name, t.slug AS tenant_slug,
         t.is_demo, t.is_sandbox, t.max_products, t.expires_at
       FROM users u
       INNER JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = $1 AND u.active = TRUE AND t.active = TRUE
       LIMIT 1`,
      [payload.sub]
    );

    const user = userRes.rows[0];
    if (!user) {
      throw new AppError('Usuário ou loja inativa.', 401, 'USER_INACTIVE');
    }

    return this.createSession({
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      role: user.role,
      tenantId: user.tenant_id,
      tenantName: user.tenant_name,
      tenantSlug: user.tenant_slug,
      isDemo: user.is_demo,
      isSandbox: user.is_sandbox,
      maxProducts: user.max_products,
      expiresAt: user.expires_at,
      ip: params.ip,
      userAgent: params.userAgent,
    });
  }

  async logout(rawRefreshToken?: string): Promise<void> {
    if (!rawRefreshToken) return;
    const tokenHash = hashToken(rawRefreshToken);
    await query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`, [tokenHash]);
  }

  private async createSession(data: {
    userId: string;
    userName: string;
    userEmail: string;
    role: UserRole;
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    isDemo: boolean;
    isSandbox: boolean;
    maxProducts: number;
    expiresAt: Date | null;
    ip: string;
    userAgent?: string;
  }): Promise<AuthSessionResponse> {
    const accessToken = signAccessToken({
      sub: data.userId,
      tenantId: data.tenantId,
      role: data.role,
      isDemo: data.isDemo,
      isSandbox: data.isSandbox,
    });

    const refresh = signRefreshToken(data.userId, data.tenantId);

    await query(
      `INSERT INTO refresh_tokens (user_id, tenant_id, token_hash, user_agent, ip_address, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        data.userId,
        data.tenantId,
        refresh.tokenHash,
        (data.userAgent ?? '').slice(0, 250),
        data.ip.slice(0, 60),
        refresh.expiresAt,
      ]
    );

    const tenantProfileRes = await query<{
      legal_name: string | null;
      document: string | null;
      state_registration: string | null;
      email: string | null;
      phone: string | null;
      address: string | null;
      logo_url: string | null;
    }>(
      `SELECT legal_name, document, state_registration, email, phone, address, logo_url
       FROM tenants
       WHERE id = $1
       LIMIT 1`,
      [data.tenantId]
    );
    const tp = tenantProfileRes.rows[0];

    return {
      accessToken,
      refreshToken: refresh.token,
      user: {
        id: data.userId,
        name: data.userName,
        email: data.userEmail,
        role: data.role,
      },
      tenant: {
        id: data.tenantId,
        name: data.tenantName,
        legalName: tp?.legal_name ?? null,
        document: tp?.document ?? null,
        stateRegistration: tp?.state_registration ?? null,
        email: tp?.email ?? null,
        phone: tp?.phone ?? null,
        address: tp?.address ?? null,
        logoUrl: tp?.logo_url ?? null,
        slug: data.tenantSlug,
        isDemo: data.isDemo,
        isSandbox: data.isSandbox,
        maxProducts: data.maxProducts,
        expiresAt: data.expiresAt ? new Date(data.expiresAt).toISOString() : null,
      },
    };
  }
}

export const authService = new AuthService();

