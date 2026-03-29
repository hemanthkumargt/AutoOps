import dotenv from 'dotenv';
dotenv.config();

import { createServer } from 'http';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import logger from './middleware/logger';
import { socketService } from './services/socketService';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { checkDatabaseConnection, closeDatabasePool, query } from './services/database';
import { schedulerAgent } from './agents/schedulerAgent';
import { auditLoggerAgent } from './agents/auditLoggerAgent';
import meetingRoutes from './routes/meetingRoutes';
import taskRoutes from './routes/taskRoutes';
import auditRoutes from './routes/auditRoutes';

// ─── App Bootstrap ─────────────────────────────────────────────────────────────

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const startTime = Date.now();

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({
  origin: process.env.CORS_ORIGIN ?? '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Request Logger ────────────────────────────────────────────────────────────

app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](`${req.method} ${req.originalUrl}`, {
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  });
  next();
});

// ─── Health Check ──────────────────────────────────────────────────────────────

app.get('/health', async (_req: Request, res: Response) => {
  const dbConnected = await checkDatabaseConnection();
  const schedulerStatus = schedulerAgent.getStatus();
  const uptime = Math.round((Date.now() - startTime) / 1000);

  const status = dbConnected ? 'ok' : 'degraded';

  res.status(dbConnected ? 200 : 503).json({
    status,
    database: dbConnected ? 'connected' : 'error',
    scheduler: schedulerStatus.running ? 'running' : 'stopped',
    uptime,
    timestamp: new Date().toISOString(),
  });
});

// ─── API Routes ────────────────────────────────────────────────────────────────

app.use('/api/v1/meetings', meetingRoutes);
app.use('/api/v1', taskRoutes);
app.use('/api/v1/audit', auditRoutes);

// ─── 404 & Error Handlers ──────────────────────────────────────────────────────

app.use(notFoundHandler);
app.use(errorHandler);

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  try {
    schedulerAgent.stop();

    await auditLoggerAgent.log({
      action: 'SERVER_SHUTDOWN',
      agent: 'System',
      details: { signal, uptime: Math.round((Date.now() - startTime) / 1000) },
    });

    await closeDatabasePool();

    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown', { error: (err as Error).message });
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason });
  process.exit(1);
});

// ─── Server Startup ────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  logger.info('Starting AutoOps AI backend...');

  // Verify database connection
  const dbConnected = await checkDatabaseConnection();
  if (!dbConnected) {
    logger.warn('Database connection failed — server starting in degraded mode');
  }

  // Start cron scheduler
  schedulerAgent.start();

  // Log startup event
  await auditLoggerAgent.log({
    action: 'SERVER_STARTED',
    agent: 'System',
    details: {
      port: PORT,
      node_env: process.env.NODE_ENV ?? 'development',
      version: '1.0.0',
    },
  });

  const httpServer = createServer(app);
  socketService.initialize(httpServer);

  httpServer.listen(PORT, () => {
    logger.info(`AutoOps AI backend running on http://localhost:${PORT}`, {
      port: PORT,
      environment: process.env.NODE_ENV ?? 'development',
      health: `http://localhost:${PORT}/health`,
      api: `http://localhost:${PORT}/api/v1`,
    });
  });
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', { error: (err as Error).message });
  process.exit(1);
});

export default app;
