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

  // Graceful Shutdown para deploys seguros no Docker Compose
  const shutdown = async (signal: string) => {
    logger.info(`Sinal ${signal} recebido. Encerrando servidor com segurança...`);
    server.close(async () => {
      await dbPool.end();
      logger.info('Pool de conexões PostgreSQL encerrado.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void startServer();

