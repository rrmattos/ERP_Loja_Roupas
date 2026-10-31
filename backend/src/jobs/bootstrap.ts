import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { withTransaction } from '../config/database';
import { env } from '../config/env';
import { logger } from '../shared/utils/logger';

/**
 * Inicializa de forma idempotente:
 * 1. Migrações incrementais seguras (tabela customers e coluna customer_id em orders)
 * 2. A Loja Oficial (Admin Master que nunca expira)
 * 3. A Loja Demonstração Pública (quando APP_MODE=portfolio_sandbox)
 */
export async function bootstrapInitialTenants(): Promise<void> {
  await withTransaction(async (client) => {
    // 0. Garante que a tabela de Clientes (customers) e a coluna customer_id em orders existam
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(120) NOT NULL,
        email VARCHAR(160) NULL,
        phone VARCHAR(30) NULL,
        document VARCHAR(30) NULL,
        notes VARCHAR(255) NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers (tenant_id);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id UUID NULL REFERENCES customers(id) ON DELETE SET NULL;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_document VARCHAR(30) NULL;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(30) NULL;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_series VARCHAR(10) NULL DEFAULT '001';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_access_key VARCHAR(60) NULL;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_issued_at TIMESTAMPTZ NULL;

      ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(40) NULL;
      ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS tag_code VARCHAR(60) NULL;

      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30) NULL;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS document VARCHAR(30) NULL;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS address VARCHAR(255) NULL;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title VARCHAR(80) NULL DEFAULT 'Vendedor(a)';

      ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS address VARCHAR(255) NULL;

      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS legal_name VARCHAR(160) NULL;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS document VARCHAR(30) NULL;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS state_registration VARCHAR(40) NULL;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email VARCHAR(160) NULL;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS phone VARCHAR(30) NULL;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address VARCHAR(255) NULL;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT NULL;
    `);

    // Preenche dados fiscais e cadastrais padrão nas lojas existentes que ainda não possuem CNPJ/Endereço
    await client.query(`
      UPDATE tenants
      SET legal_name = COALESCE(legal_name, name || ' Comércio de Vestuário Ltda'),
          document = REGEXP_REPLACE(COALESCE(document, CASE WHEN is_demo THEN '28456789000155' ELSE '14890123000188' END), '\\D', '', 'g'),
          state_registration = COALESCE(state_registration, '114892330119'),
          email = COALESCE(email, CASE WHEN is_demo THEN 'contato@lojademo.com.br' ELSE 'atendimento@verticemoda.com.br' END),
          phone = REGEXP_REPLACE(COALESCE(phone, '1134567890'), '\\D', '', 'g'),
          address = COALESCE(address, 'Rua Oscar Freire, 840 - Jardim Paulista | São Paulo - SP | CEP: 01426-000')
      WHERE document IS NULL OR document LIKE '%.%';

      UPDATE suppliers
      SET document = REGEXP_REPLACE(document, '\\D', '', 'g'),
          phone = REGEXP_REPLACE(phone, '\\D', '', 'g'),
          address = COALESCE(address, 'Rua Ribeiro de Lima, 450 - Bom Retiro | São Paulo - SP | CEP: 01122-000')
      WHERE document IS NOT NULL OR address IS NULL;

      UPDATE customers
      SET document = CASE WHEN document IS NOT NULL THEN REGEXP_REPLACE(document, '\\D', '', 'g') ELSE NULL END,
          phone = CASE WHEN phone IS NOT NULL THEN REGEXP_REPLACE(phone, '\\D', '', 'g') ELSE NULL END;
    `);

    // Atualiza nomes genéricos antigos de demonstração para nome real de funcionária/gerente
    await client.query(`
      UPDATE users
      SET name = 'Camila Mendes',
          job_title = 'Gerente de Loja',
          document = REGEXP_REPLACE(COALESCE(document, '12345678900'), '\\D', '', 'g'),
          phone = REGEXP_REPLACE(COALESCE(phone, '11991122334'), '\\D', '', 'g'),
          address = COALESCE(address, 'Rua Augusta, 1500 - Consolação | São Paulo - SP | CEP: 01304-001')
      WHERE name ILIKE '%Visitante%' OR name ILIKE '%Loja Demo%';

      UPDATE users
      SET job_title = 'Proprietário / Gerente',
          document = REGEXP_REPLACE(COALESCE(document, '11122233344'), '\\D', '', 'g'),
          phone = REGEXP_REPLACE(COALESCE(phone, '11990001122'), '\\D', '', 'g'),
          address = COALESCE(address, 'Av. Paulista, 1000 - Bela Vista | São Paulo - SP | CEP: 01310-100')
      WHERE role = 'OWNER' AND (job_title IS NULL OR job_title = 'Vendedor(a)' OR document LIKE '%.%');

      UPDATE users
      SET document = REGEXP_REPLACE(document, '\\D', '', 'g'),
          phone = REGEXP_REPLACE(phone, '\\D', '', 'g'),
          address = COALESCE(address, 'Rua Frei Caneca, 500 - Consolação | São Paulo - SP | CEP: 01307-000')
      WHERE document IS NOT NULL;
    `);

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
          `INSERT INTO users (tenant_id, name, email, phone, document, job_title, password_hash, role)
           VALUES ($1, 'Camila Mendes', 'demo@rafaelrmattos.com', '(11) 99112-2334', '123.456.789-00', 'Gerente de Loja', $2, 'ADMIN')`,
          [demoTenantId, demoPasswordHash]
        );

        await client.query(`SELECT seed_tenant_catalog($1, TRUE)`, [demoTenantId]);
        logger.info('Loja Demonstração Pública (1-Click) inicializada com sucesso.');
      }
    }

    // 3. Popula clientes padrão em lojas já existentes que ainda não tenham clientes
    const existingTenants = await client.query<{ id: string }>(`SELECT id FROM tenants`);
    for (const t of existingTenants.rows) {
      const custCount = await client.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM customers WHERE tenant_id = $1`,
        [t.id]
      );
      if (Number(custCount.rows[0]?.count ?? 0) === 0) {
        await client.query(
          `INSERT INTO customers (tenant_id, name, email, phone, document, notes)
           VALUES
             ($1, 'Marina Costa', 'marina.costa@email.com', '(11) 99887-6655', '345.678.901-22', 'Cliente fiel de lançamentos'),
             ($1, 'Lucas Oliveira', 'lucas.oliveira@email.com', '(21) 98877-5544', '456.789.012-33', 'Prefere tamanhos G e GG')`,
          [t.id]
        );
      }

      // Popula funcionários/vendedores padrão em lojas que só possuem 1 usuário
      const empCount = await client.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM users WHERE tenant_id = $1 AND active = TRUE`,
        [t.id]
      );
      const shortTenant = t.id.slice(0, 8);
      if (Number(empCount.rows[0]?.count ?? 0) < 3) {
        const defaultStaffHash =
          '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
        const beatrizRes = await client.query<{ id: string }>(
          `INSERT INTO users (tenant_id, name, email, phone, document, job_title, password_hash, role)
           VALUES ($1, 'Beatriz Santos', $2, '(11) 99223-3445', '234.567.890-11', 'Vendedora', $3, 'STAFF')
           ON CONFLICT (tenant_id, email) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [t.id, `beatriz.${shortTenant}@loja.com`, defaultStaffHash]
        );
        const diegoRes = await client.query<{ id: string }>(
          `INSERT INTO users (tenant_id, name, email, phone, document, job_title, password_hash, role)
           VALUES ($1, 'Diego Ferreira', $2, '(11) 99334-4556', '345.678.901-22', 'Vendedor / Caixa', $3, 'STAFF')
           ON CONFLICT (tenant_id, email) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [t.id, `diego.${shortTenant}@loja.com`, defaultStaffHash]
        );

        const beatrizId = beatrizRes.rows[0]?.id;
        const diegoId = diegoRes.rows[0]?.id;

        if (beatrizId && diegoId) {
          await client.query(
            `UPDATE orders
             SET created_by_user_id = CASE WHEN (order_number % 2) = 1 THEN $2::uuid ELSE $3::uuid END
             WHERE tenant_id = $1`,
            [t.id, beatrizId, diegoId]
          );
          await client.query(
            `UPDATE stock_movements
             SET created_by_user_id = $2::uuid
             WHERE tenant_id = $1 AND movement_type = 'SALE_OUT'`,
            [t.id, beatrizId]
          );
        }
      }

      // Garante que movimentações e vendas iniciais tenham o responsável vinculado
      await client.query(
        `UPDATE stock_movements sm
         SET created_by_user_id = (
           SELECT u.id FROM users u WHERE u.tenant_id = sm.tenant_id ORDER BY u.created_at ASC LIMIT 1
         )
         WHERE sm.tenant_id = $1 AND sm.created_by_user_id IS NULL`,
        [t.id]
      );

      await client.query(
        `UPDATE orders o
         SET created_by_user_id = (
           SELECT u.id FROM users u WHERE u.tenant_id = o.tenant_id ORDER BY u.created_at ASC LIMIT 1
         )
         WHERE o.tenant_id = $1 AND o.created_by_user_id IS NULL`,
        [t.id]
      );

      // Garante que vendas existentes tenham Número de Nota Fiscal (NF) e Chave de Acesso para emissão/devolução
      await client.query(
        `UPDATE orders
         SET invoice_number = 'NF-' || LPAD((100 + order_number)::text, 6, '0'),
             invoice_series = COALESCE(invoice_series, '001'),
             invoice_access_key = COALESCE(invoice_access_key, '3526102845678900015555001000' || LPAD((100 + order_number)::text, 8, '0') || '10000190'),
             invoice_issued_at = COALESCE(invoice_issued_at, created_at),
             customer_document = COALESCE(customer_document, '345.678.901-22')
         WHERE tenant_id = $1 AND invoice_number IS NULL`,
        [t.id]
      );

      // Preenche tag_code e invoice_number nas movimentações antigas caso estejam vazias
      await client.query(
        `UPDATE stock_movements sm
         SET tag_code = COALESCE(sm.tag_code, (SELECT pv.sku FROM product_variants pv WHERE pv.id = sm.variant_id)),
             invoice_number = COALESCE(
               sm.invoice_number,
               CASE
                 WHEN sm.order_id IS NOT NULL THEN (SELECT o.invoice_number FROM orders o WHERE o.id = sm.order_id)
                 WHEN sm.movement_type IN ('INITIAL_BALANCE', 'PURCHASE_IN') THEN 'NF-FORN-00412'
                 ELSE NULL
               END
             )
         WHERE sm.tenant_id = $1 AND (sm.tag_code IS NULL OR sm.invoice_number IS NULL)`,
        [t.id]
      );
    }
  });
}
