import { app } from './app';
import { checkDatabaseConnection, dbPool } from './config/database';
import { env } from './config/env';
import { bootstrapInitialTenants } from './jobs/bootstrap';
import {
  cleanupExpiredSandboxes,
  startSandboxCleanupScheduler,
} from './jobs/sandboxCleanup.job';
import { logger } from './shared/utils/logger';

async function startServer(): Promise<void> {
  const isDbConnected = await checkDatabaseConnection();
  if (!isDbConnected) {
    logger.error('Não foi possível iniciar a API: Banco de dados PostgreSQL indisponível.');
    process.exit(1);
  }

  // Inicializa Loja Oficial e Loja Demonstração (se APP_MODE=portfolio_sandbox)
  await bootstrapInitialTenants();

  // Executa limpeza inicial de sandboxes vencidas e inicia o agendador 24h
  await cleanupExpiredSandboxes();
  startSandboxCleanupScheduler();

  const server = app.listen(env.PORT, () => {
    logger.info('🚀 Servidor ERP Loja de Roupas iniciado com sucesso', {
      port: env.PORT,
      environment: env.NODE_ENV,
      appMode: env.APP_MODE,
    });
  });

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info('Encerrando servidor', { signal });
    const deadline = setTimeout(() => { server.closeAllConnections(); process.exit(1); }, 10000);
    deadline.unref();
    server.close(() => {
      void dbPool.end().then(() => { clearTimeout(deadline); process.exit(0); })
        .catch(error => { logger.error('Falha ao encerrar banco', { error: String(error) }); process.exit(1); });
    });
  };
  server.on('error', error => { logger.error('Falha no servidor HTTP', { error: String(error) }); shutdown('HTTP_ERROR'); });
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

void startServer().catch(async error => {
  logger.error('Falha na inicialização', { error: String(error) });
  try { await dbPool.end(); } finally { process.exit(1); }
});
