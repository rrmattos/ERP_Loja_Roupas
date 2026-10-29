import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { withTransaction } from '../config/database';
import { env } from '../config/env';
import { logger } from '../shared/utils/logger';

/**
 * Inicializa de forma idempotente:
 * 1. A Loja Oficial (Admin Master que nunca expira)
 * 2. A Loja Demonstração Pública (quando APP_MODE=portfolio_sandbox)
 */
export async function bootstrapInitialTenants(): Promise<void> {
  await withTransaction(async (client) => {
    // 1. Loja Oficial (Admin Master)
    const masterTenantRes = await client.query<{ id: string }>(
      `SELECT id FROM tenants WHERE slug = 'loja-oficial' LIMIT 1`
    );

    let masterTenantId = masterTenantRes.rows[0]?.id;

    if (!masterTenantId) {
      const createdMaster = await client.query<{ id: string }>(
        `INSERT INTO tenants (name, slug, is_demo, is_sandbox, max_products, unity_api_key)
         VALUES ('Vértice Urban Wear (Oficial)', 'loja-oficial', FALSE, FALSE, 1000, $1)
         RETURNING id`,
        [env.UNITY_DEFAULT_API_KEY]
      );
      masterTenantId = createdMaster.rows[0].id;

      const adminHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
      await client.query(
        `INSERT INTO users (tenant_id, name, email, password_hash, role)
         VALUES ($1, 'Rafael Mattos (Admin)', $2, $3, 'OWNER')`,
        [masterTenantId, env.ADMIN_EMAIL.toLowerCase(), adminHash]
      );

      await client.query(`SELECT seed_tenant_catalog($1, TRUE)`, [masterTenantId]);
      logger.info('Loja Oficial (Master) inicializada com sucesso.');
    }

    // 2. Loja Demonstração Pública (apenas se APP_MODE=portfolio_sandbox)
    if (env.isPortfolioSandbox) {
      const demoTenantRes = await client.query<{ id: string }>(
        `SELECT id FROM tenants WHERE slug = 'demo-store' LIMIT 1`
      );

      if (!demoTenantRes.rows[0]) {
        const createdDemo = await client.query<{ id: string }>(
          `INSERT INTO tenants (name, slug, is_demo, is_sandbox, max_products, unity_api_key)
           VALUES ('Loja Demonstração (Portfólio)', 'demo-store', TRUE, FALSE, $1, $2)
           RETURNING id`,
          [env.SANDBOX_MAX_PRODUCTS, `${env.UNITY_DEFAULT_API_KEY}_demo`]
        );

        const demoTenantId = createdDemo.rows[0].id;
        const randomDemoSecret = crypto.randomBytes(24).toString('hex');
        const demoPasswordHash = await bcrypt.hash(randomDemoSecret, 10);

        await client.query(
          `INSERT INTO users (tenant_id, name, email, password_hash, role)
           VALUES ($1, 'Visitante / Recrutador (Demo)', 'demo@rafaelrmattos.com', $2, 'ADMIN')`,
          [demoTenantId, demoPasswordHash]
        );

        await client.query(`SELECT seed_tenant_catalog($1, TRUE)`, [demoTenantId]);
        logger.info('Loja Demonstração Pública (1-Click) inicializada com sucesso.');
      }
    }
  });
}

