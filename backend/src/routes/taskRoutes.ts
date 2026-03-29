import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query as queryValidator, validationResult } from 'express-validator';
import { taskExtractorAgent } from '../agents/taskExtractorAgent';
import { auditLoggerAgent } from '../agents/auditLoggerAgent';
import { query as dbQuery } from '../services/database';
import { Task, TaskStatus, TaskPriority } from '../models/taskModel';
import { AuditLog } from '../models/auditModel';
import { NotFoundError, ValidationError } from '../middleware/errorHandler';
import logger from '../middleware/logger';

const router = Router({ mergeParams: true });

// ─── Validation Helper ─────────────────────────────────────────────────────────

function handleValidation(req: Request, _res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError(errors.array().map((e) => e.msg).join(', '));
  }
  next();
}

// ─── POST /meetings/:id/extract-tasks ─────────────────────────────────────────

router.post(
  '/meetings/:id/extract-tasks',
  [param('id').isUUID().withMessage('Invalid meeting ID format')],
  handleValidation,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      logger.info('TaskRoutes: Extracting tasks for meeting', { meeting_id: id });
      const tasks = await taskExtractorAgent.extractAndStore(id);
      res.json({
        success: true,
        tasks_created: tasks.length,
        tasks,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /tasks ───────────────────────────────────────────────────────────────

router.get(
  '/tasks',
  [
    queryValidator('status').optional().isIn(['pending', 'in_progress', 'completed', 'overdue']),
    queryValidator('priority').optional().isIn(['low', 'medium', 'high', 'critical']),
    queryValidator('page').optional().isInt({ min: 1 }),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  handleValidation,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt((req.query['page'] as string) ?? '1', 10);
      const limit = parseInt((req.query['limit'] as string) ?? '20', 10);
      const offset = (page - 1) * limit;
      const { status, owner, priority } = req.query as {
        status?: TaskStatus;
        owner?: string;
        priority?: TaskPriority;
      };

      const conditions: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
      if (owner) { conditions.push(`owner ILIKE $${idx++}`); params.push(`%${owner}%`); }
      if (priority) { conditions.push(`priority = $${idx++}`); params.push(priority); }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const [countResult, dataResult] = await Promise.all([
        dbQuery<{ count: string }>(`SELECT COUNT(*) as count FROM tasks ${where}`, params),
        dbQuery<Task>(
          `SELECT * FROM tasks ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
          [...params, limit, offset],
        ),
      ]);

      const total = parseInt(countResult.rows[0].count, 10);
      res.json({
        success: true,
        data: dataResult.rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /tasks/overdue ───────────────────────────────────────────────────────

router.get(
  '/tasks/overdue',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await dbQuery<Task>(
        `SELECT * FROM tasks
         WHERE deadline < NOW() AND status != 'completed'
         ORDER BY deadline ASC`,
      );
      res.json({ success: true, data: result.rows, total: result.rowCount });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /tasks/:id ───────────────────────────────────────────────────────────

router.get(
  '/tasks/:id',
  [param('id').isUUID().withMessage('Invalid task ID format')],
  handleValidation,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const taskResult = await dbQuery<Task>('SELECT * FROM tasks WHERE id = $1', [id]);

      if (taskResult.rows.length === 0) {
        throw new NotFoundError(`Task with ID ${id} not found`);
      }

      const auditHistory = await auditLoggerAgent.getTaskHistory(id);

      res.json({
        success: true,
        data: {
          ...taskResult.rows[0],
          auditHistory,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── PUT /tasks/:id/status ────────────────────────────────────────────────────

router.put(
  '/tasks/:id/status',
  [
    param('id').isUUID().withMessage('Invalid task ID format'),
    body('status')
      .isIn(['pending', 'in_progress', 'completed'])
      .withMessage('Status must be one of: pending, in_progress, completed'),
  ],
  handleValidation,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { status } = req.body as { status: TaskStatus };

      const existing = await dbQuery<Task>('SELECT * FROM tasks WHERE id = $1', [id]);
      if (existing.rows.length === 0) {
        throw new NotFoundError(`Task with ID ${id} not found`);
      }

      const previousStatus = existing.rows[0].status;

      const result = await dbQuery<Task>(
        `UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [status, id],
      );

      await auditLoggerAgent.log({
        action: 'STATUS_UPDATED',
        agent: 'TaskManagerAgent',
        task_id: id,
        meeting_id: existing.rows[0].meeting_id,
        details: {
          previous_status: previousStatus,
          new_status: status,
        },
      });

      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
