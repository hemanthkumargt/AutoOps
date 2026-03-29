import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import dotenv from 'dotenv';
import logger from '../middleware/logger';
import { DatabaseError } from '../middleware/errorHandler';

dotenv.config();

// ─── Pool Configuration ────────────────────────────────────────────────────────

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  database: process.env.DB_NAME ?? 'autoops',
  user: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASS,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ─── Pool Event Listeners ──────────────────────────────────────────────────────

pool.on('connect', (client: PoolClient) => {
  logger.debug('New database client connected', {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  });
});

pool.on('error', (err: Error) => {
  logger.error('Unexpected database pool error', { error: err.message, stack: err.stack });
});

pool.on('remove', () => {
  logger.debug('Database client removed from pool');
});

// ─── Query Helper ─────────────────────────────────────────────────────────────

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    logger.debug('Database query executed', {
      query: text.substring(0, 100),
      rows: result.rowCount,
      duration: `${duration}ms`,
    });
    return result;
  } catch (err) {
    const error = err as Error;
    logger.error('Database query failed', {
      query: text.substring(0, 100),
      error: error.message,
      duration: `${Date.now() - start}ms`,
    });
    throw new DatabaseError(`Database query failed: ${error.message}`);
  }
}

// ─── Transaction Helper ───────────────────────────────────────────────────────

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Health Check ─────────────────────────────────────────────────────────────

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    logger.info('Database connection verified successfully');
    return true;
  } catch (err) {
    const error = err as Error;
    logger.error('Database connection check failed', { error: error.message });
    return false;
  }
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

export async function closeDatabasePool(): Promise<void> {
  logger.info('Closing database connection pool...');
  await pool.end();
  logger.info('Database pool closed');
}

export default pool;
