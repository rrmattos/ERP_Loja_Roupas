import fs from 'fs/promises';
import path from 'path';
import { query, withTransaction } from '../config/database';
import { env } from '../config/env';
import { logger } from '../shared/utils/logger';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

/**
 * Remove com segurança um arquivo de imagem customizado do disco da VPS
 */
async function deleteUploadedFileSafely(imageUrl: string | null): Promise<void> {
  if (!imageUrl || !imageUrl.startsWith('/uploads/')) return;

  const fileName = path.basename(imageUrl);
  const fullPath = path.resolve(UPLOADS_DIR, fileName);

  // Previne Path Traversal garantindo que o arquivo está dentro de UPLOADS_DIR
  if (!fullPath.startsWith(UPLOADS_DIR)) return;

  try {
    await fs.unlink(fullPath);
  } catch {
    // Arquivo já não existe no disco
  }
}

/**
 * 1. Exclui Lojas Sandbox expiradas (> 24h) e apaga suas imagens do disco
 * 2. Remove Refresh Tokens expirados/revogados para manter o banco enxuto
 */
export async function cleanupExpiredSandboxes(): Promise<void> {
  if (!env.isPortfolioSandbox) return;

  try {
    // Busca imagens customizadas pertencentes a lojas sandbox expiradas
    const expiredImages = await query<{ image_url: string }>(
      `SELECT p.image_url
       FROM products p
       INNER JOIN tenants t ON t.id = p.tenant_id
       WHERE t.is_sandbox = TRUE
         AND t.expires_at IS NOT NULL
         AND t.expires_at <= NOW()
         AND p.is_custom_upload = TRUE
         AND p.image_url IS NOT NULL`
    );

    for (const row of expiredImages.rows) {
      await deleteUploadedFileSafely(row.image_url);
    }

    // Exclui as lojas sandbox expiradas (ON DELETE CASCADE limpa produtos, variações, pedidos e usuários)
    const deletedTenants = await query<{ id: string; slug: string }>(
      `DELETE FROM tenants
       WHERE is_sandbox = TRUE
         AND expires_at IS NOT NULL
         AND expires_at <= NOW()
       RETURNING id, slug`
    );

    if (deletedTenants.rowCount && deletedTenants.rowCount > 0) {
      logger.info('Faxina automática: Lojas Sandbox expiradas removidas', {
        count: deletedTenants.rowCount,
        slugs: deletedTenants.rows.map((r) => r.slug),
      });
    }

    // Limpa refresh tokens vencidos há mais de 24h
    await query(
      `DELETE FROM refresh_tokens
       WHERE expires_at <= NOW() - INTERVAL '24 hours'
          OR (revoked_at IS NOT NULL AND revoked_at <= NOW() - INTERVAL '24 hours')`
    );
  } catch (error) {
    logger.error('Erro ao executar limpeza de Lojas Sandbox', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Reseta a Loja Demonstração Pública (is_demo = TRUE) para o estado original de fábrica a cada 24h
 * e remove quaisquer imagens customizadas enviadas por visitantes nela.
 */
export async function resetPublicDemoStore(): Promise<void> {
  if (!env.isPortfolioSandbox) return;

  try {
    const demoImages = await query<{ image_url: string }>(
      `SELECT p.image_url
       FROM products p
       INNER JOIN tenants t ON t.id = p.tenant_id
       WHERE t.is_demo = TRUE
         AND p.is_custom_upload = TRUE
         AND p.image_url IS NOT NULL`
    );

    for (const row of demoImages.rows) {
      await deleteUploadedFileSafely(row.image_url);
    }

    await withTransaction(async (client) => {
      const demoRes = await client.query<{ id: string }>(
        `SELECT id FROM tenants WHERE is_demo = TRUE LIMIT 1`
      );
      const demoTenantId = demoRes.rows[0]?.id;
      if (!demoTenantId) return;

      // Limpa movimentações, pedidos, variações, produtos, cores, tamanhos, clientes, fornecedores e categorias da Demo
      await client.query(`DELETE FROM stock_movements WHERE tenant_id = $1`, [demoTenantId]);
      await client.query(`DELETE FROM orders WHERE tenant_id = $1`, [demoTenantId]);
      await client.query(`DELETE FROM customers WHERE tenant_id = $1`, [demoTenantId]);
      await client.query(`DELETE FROM product_variants WHERE tenant_id = $1`, [demoTenantId]);
      await client.query(`DELETE FROM products WHERE tenant_id = $1`, [demoTenantId]);
      await client.query(`DELETE FROM colors WHERE tenant_id = $1`, [demoTenantId]);
      await client.query(`DELETE FROM sizes WHERE tenant_id = $1`, [demoTenantId]);
      await client.query(`DELETE FROM suppliers WHERE tenant_id = $1`, [demoTenantId]);
      await client.query(`DELETE FROM categories WHERE tenant_id = $1`, [demoTenantId]);

      // Recria o seed padrão da Loja Demonstração
      await client.query(`SELECT seed_tenant_catalog($1, TRUE)`, [demoTenantId]);
    });

    logger.info('Loja Demonstração Pública restaurada para o padrão de fábrica (Reset 24h).');
  } catch (error) {
    logger.error('Erro ao resetar Loja Demonstração Pública', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Inicia os agendadores leves em memória (sem depender de Redis/BullMQ para economizar RAM da VPS)
 */
export function startSandboxCleanupScheduler(): void {
  if (!env.isPortfolioSandbox) {
    logger.info('APP_MODE=commercial_production: Agendador de reset Sandbox/Demo desativado.');
    return;
  }

  // Verifica lojas sandbox expiradas a cada 1 hora
  const ONE_HOUR_MS = 60 * 60 * 1000;
  setInterval(() => {
    void cleanupExpiredSandboxes();
  }, ONE_HOUR_MS).unref();

  // Reseta a Loja Demonstração Pública a cada 24 horas
  const DEMO_RESET_INTERVAL_MS = env.SANDBOX_TTL_HOURS * 60 * 60 * 1000;
  setInterval(() => {
    void resetPublicDemoStore();
  }, DEMO_RESET_INTERVAL_MS).unref();

  logger.info('Agendador de limpeza Sandbox e Reset 24h da Loja Demo ativado.', {
    ttlHours: env.SANDBOX_TTL_HOURS,
  });
}

