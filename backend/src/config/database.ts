import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env } from './env';
import { logger } from '../shared/utils/logger';

export const dbPool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10, // Pool enxuto para preservar memória na VPS de 1GB RAM
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

dbPool.on('error', (err) => {
  logger.error('Erro inesperado em cliente ocioso do PostgreSQL', { error: err.message });
});

/**
 * Executa uma query parametrizada segura contra SQL Injection
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return dbPool.query<T>(text, params);
}

/**
 * Executa um bloco de código dentro de uma transação ACID do PostgreSQL
 * (BEGIN -> COMMIT ou ROLLBACK automático em caso de erro)
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await dbPool.query('SELECT 1');
    return true;
  } catch (error) {
    logger.error('Falha ao conectar ao banco PostgreSQL', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

