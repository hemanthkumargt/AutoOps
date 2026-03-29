import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { meetingIngestionAgent } from '../agents/meetingAgent';
import { query as dbQuery } from '../services/database';
import { Meeting, MeetingWithTasks } from '../models/meetingModel';
import { Task } from '../models/taskModel';
import { NotFoundError, ValidationError } from '../middleware/errorHandler';
import logger from '../middleware/logger';

const router = Router();

// ─── Validation Middleware ─────────────────────────────────────────────────────

function handleValidation(req: Request, _res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError(errors.array().map((e) => e.msg).join(', '));
  }
  next();
}

// ─── POST /meetings ───────────────────────────────────────────────────────────

router.post(
  '/',
  [
    body('title')
      .trim()
      .notEmpty().withMessage('Title is required')
      .isLength({ max: 500 }).withMessage('Title must not exceed 500 characters'),
    body('transcript')
      .trim()
      .notEmpty().withMessage('Transcript is required')
      .isLength({ min: 50 }).withMessage('Transcript must be at least 50 characters')
      .isLength({ max: 50000 }).withMessage('Transcript must not exceed 50,000 characters'),
  ],
  handleValidation,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { title, transcript } = req.body as { title: string; transcript: string };
      const meeting = await meetingIngestionAgent.ingestMeeting(title, transcript);
      res.status(201).json({
        success: true,
        meeting_id: meeting.id,
        message: 'Meeting ingested successfully. Run POST /api/v1/meetings/:id/extract-tasks to extract tasks.',
        meeting,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /meetings ────────────────────────────────────────────────────────────

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  ],
  handleValidation,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query['page'] as string ?? '1', 10);
      const limit = parseInt(req.query['limit'] as string ?? '10', 10);
      const offset = (page - 1) * limit;

      const [countResult, dataResult] = await Promise.all([
        dbQuery<{ count: string }>('SELECT COUNT(*) as count FROM meetings'),
        dbQuery<Meeting>(
          'SELECT * FROM meetings ORDER BY created_at DESC LIMIT $1 OFFSET $2',
          [limit, offset],
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

// ─── GET /meetings/:id ────────────────────────────────────────────────────────

router.get(
  '/:id',
  [param('id').isUUID().withMessage('Invalid meeting ID format')],
  handleValidation,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const meetingResult = await dbQuery<Meeting>(
        'SELECT * FROM meetings WHERE id = $1',
        [id],
      );

      if (meetingResult.rows.length === 0) {
        throw new NotFoundError(`Meeting with ID ${id} not found`);
      }

      const meeting = meetingResult.rows[0];
      const tasksResult = await dbQuery<Task>(
        'SELECT * FROM tasks WHERE meeting_id = $1 ORDER BY created_at ASC',
        [id],
      );

      const meetingWithTasks: MeetingWithTasks = {
        ...meeting,
        tasks: tasksResult.rows,
      };

      res.json({ success: true, data: meetingWithTasks });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
