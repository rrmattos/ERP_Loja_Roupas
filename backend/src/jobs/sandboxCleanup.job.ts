import { query, withTenantTransaction } from '../config/database';
import { env } from '../config/env';
import { logger } from '../shared/utils/logger';
import { getOwnedUpload, OwnedUpload, removeCustomUploadIfExists } from '../shared/utils/imageUpload';

async function collectUploads(client: import('pg').PoolClient, tenantId: string): Promise<OwnedUpload[]> {
  const result = await client.query<{ image_url: string }>(`SELECT image_url FROM products WHERE tenant_id = $1 AND image_url LIKE '/uploads/%'
    UNION SELECT logo_url AS image_url FROM tenants WHERE id = $1 AND logo_url LIKE '/uploads/%'`, [tenantId]);
  const uploads: OwnedUpload[] = [];
  for (const row of result.rows) {
    try { const owned = await getOwnedUpload(row.image_url, tenantId, client); if (owned) uploads.push(owned); }
    catch (error) { logger.error('Referência de upload inválida na limpeza', { tenantId, error: String(error) }); }
  }
  return uploads;
}

async function cleanupExpiredTokens(): Promise<void> {
  await query(`DELETE FROM refresh_tokens WHERE expires_at <= NOW() - INTERVAL '24 hours'
    OR (revoked_at IS NOT NULL AND revoked_at <= NOW() - INTERVAL '24 hours')`);
}

export async function cleanupExpiredSandboxes(): Promise<void> {
  try {
    await cleanupExpiredTokens();
    if (!env.isPortfolioSandbox) return;
    const expired = await query<{ id: string }>('SELECT id FROM tenants WHERE is_sandbox = TRUE AND expires_at <= NOW()');
    for (const tenant of expired.rows) {
      const uploads = await withTenantTransaction(tenant.id, async client => {
        const current = await client.query('SELECT id FROM tenants WHERE id = $1 AND is_sandbox = TRUE AND expires_at <= NOW() FOR UPDATE', [tenant.id]);
        if (!current.rowCount) return [];
        const files = await collectUploads(client, tenant.id);
        await client.query('DELETE FROM tenants WHERE id = $1', [tenant.id]);
        return files;
      });
      for (const upload of uploads) await removeCustomUploadIfExists(upload);
    }
  } catch (error) { logger.error('Falha na limpeza periódica', { error: String(error) }); }
}

export async function resetPublicDemoStore(): Promise<void> {
  if (!env.isPortfolioSandbox) return;
  try {
    const tenants = await query<{ id: string }>('SELECT id FROM tenants WHERE is_demo = TRUE');
    for (const tenant of tenants.rows) {
      const uploads = await withTenantTransaction(tenant.id, async client => {
        const current = await client.query('SELECT id FROM tenants WHERE id = $1 AND is_demo = TRUE FOR UPDATE', [tenant.id]);
        if (!current.rowCount) return [];
        const files = await collectUploads(client, tenant.id);
        for (const table of ['stock_movements', 'orders', 'customers', 'product_variants', 'products', 'colors', 'sizes', 'suppliers', 'categories']) {
          await client.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenant.id]);
        }
        await client.query('UPDATE tenants SET logo_url = NULL WHERE id = $1', [tenant.id]);
        await client.query('SELECT seed_tenant_catalog($1, TRUE)', [tenant.id]);
        return files;
      });
      for (const upload of uploads) await removeCustomUploadIfExists(upload);
    }
    logger.info('Demonstração restaurada com sucesso.');
  } catch (error) { logger.error('Falha ao restaurar demonstração', { error: String(error) }); }
}

export function startSandboxCleanupScheduler(): void {
  let cleaning = false;
  setInterval(() => {
    if (cleaning) return;
    cleaning = true;
    void cleanupExpiredSandboxes().finally(() => { cleaning = false; });
  }, 60 * 60 * 1000).unref();
  if (!env.isPortfolioSandbox) return;
  let resetting = false;
  setInterval(() => {
    if (resetting) return;
    resetting = true;
    void resetPublicDemoStore().finally(() => { resetting = false; });
  }, env.SANDBOX_TTL_HOURS * 60 * 60 * 1000).unref();
}
