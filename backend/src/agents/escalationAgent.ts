import { query } from '../services/database';
import { emailService } from '../services/emailService';
import { auditLoggerAgent } from './auditLoggerAgent';
import { Task } from '../models/taskModel';
import logger from '../middleware/logger';

// ─── Escalation Agent ─────────────────────────────────────────────────────────

class EscalationAgent {
  private get managerEmail(): string {
    return process.env.MANAGER_EMAIL ?? 'manager@example.com';
  }

  /**
   * Detect tasks past deadline and mark them as 'overdue' in the database.
   * Returns count of tasks marked overdue.
   */
  async detectAndMarkOverdue(): Promise<number> {
    const result = await query<{ id: string }>(
      `UPDATE tasks
       SET status = 'overdue', updated_at = NOW()
       WHERE status NOT IN ('completed', 'overdue')
         AND deadline < NOW()
       RETURNING id`,
    );

    const markedCount = result.rowCount ?? 0;

    if (markedCount > 0) {
      logger.info('EscalationAgent: Marked tasks as overdue', { count: markedCount });
      for (const row of result.rows) {
        await auditLoggerAgent.log({
          action: 'TASK_MARKED_OVERDUE',
          agent: 'EscalationAgent',
          task_id: row.id,
          details: { auto_detected: true },
        });
      }
    }

    return markedCount;
  }

  /**
   * Find and escalate all overdue tasks.
   * Deduplicates: skips tasks already escalated in the last 24 hours.
   */
  async escalateOverdueTasks(): Promise<void> {
    // First detect and mark any newly overdue tasks
    await this.detectAndMarkOverdue();

    logger.info('EscalationAgent: Processing overdue task escalations');

    const result = await query<Task>(
      `SELECT t.*
       FROM tasks t
       WHERE t.status NOT IN ('completed')
         AND t.deadline < NOW()
         AND t.id NOT IN (
           SELECT al.task_id
           FROM audit_logs al
           WHERE al.action = 'TASK_ESCALATED'
             AND al.timestamp > NOW() - INTERVAL '24 hours'
             AND al.task_id IS NOT NULL
         )`,
    );

    const tasks = result.rows;
    logger.info('EscalationAgent: Found new tasks to escalate', { count: tasks.length });

    for (const task of tasks) {
      const previousStatus = task.status;
      const hoursOverdue = Math.round(
        (Date.now() - new Date(task.deadline).getTime()) / (1000 * 60 * 60),
      );

      try {
        // Update task status to overdue
        await query(
          `UPDATE tasks SET status = 'overdue', updated_at = NOW() WHERE id = $1`,
          [task.id],
        );

        // Send escalation email
        await emailService.sendEscalation(task, this.managerEmail);

        // Log escalation
        await auditLoggerAgent.log({
          action: 'TASK_ESCALATED',
          agent: 'EscalationAgent',
          task_id: task.id,
          meeting_id: task.meeting_id,
          details: {
            hours_overdue: hoursOverdue,
            previous_status: previousStatus,
            escalated_to: this.managerEmail,
          },
        });

        logger.info('EscalationAgent: Task escalated', {
          task_id: task.id,
          hours_overdue: hoursOverdue,
        });
      } catch (err) {
        const error = err as Error;
        logger.error('EscalationAgent: Failed to escalate task', {
          task_id: task.id,
          error: error.message,
        });
      }
    }
  }
}

export const escalationAgent = new EscalationAgent();
export default EscalationAgent;
