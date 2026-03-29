import { Router, Request, Response, NextFunction } from 'express';
import { query as queryValidator, param, validationResult } from 'express-validator';
import { auditLoggerAgent } from '../agents/auditLoggerAgent';
import { AuditFilters } from '../models/auditModel';
import { ValidationError } from '../middleware/errorHandler';

const router = Router();

function handleValidation(req: Request, _res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError(errors.array().map((e) => e.msg).join(', '));
  }
  next();
}

// ─── GET /audit ───────────────────────────────────────────────────────────────

router.get(
  '/',
  [
    queryValidator('page').optional().isInt({ min: 1 }),
    queryValidator('limit').optional().isInt({ min: 1, max: 200 }),
    queryValidator('from').optional().isISO8601(),
    queryValidator('to').optional().isISO8601(),
  ],
  handleValidation,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { agent, action, task_id, meeting_id, from, to } = req.query as Record<string, string>;
      const page = parseInt(req.query['page'] as string ?? '1', 10);
      const limit = parseInt(req.query['limit'] as string ?? '50', 10);

      const filters: AuditFilters = {
        agent,
        action,
        task_id,
        meeting_id,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        page,
        limit,
      };

      const result = await auditLoggerAgent.getLogs(filters);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /audit/summary ───────────────────────────────────────────────────────

router.get('/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const fromDate = from ? new Date(from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const summary = await auditLoggerAgent.getSummary(fromDate, toDate);
    res.json({ success: true, data: summary, from: fromDate, to: toDate });
  } catch (err) {
    next(err);
  }
});

// ─── GET /audit/task/:taskId ──────────────────────────────────────────────────

router.get(
  '/task/:taskId',
  [param('taskId').isUUID().withMessage('Invalid task ID format')],
  handleValidation,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { taskId } = req.params;
      const history = await auditLoggerAgent.getTaskHistory(taskId);
      res.json({ success: true, data: history, total: history.length });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
