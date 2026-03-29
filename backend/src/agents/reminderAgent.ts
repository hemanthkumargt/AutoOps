import { query } from '../services/database';
import { emailService } from '../services/emailService';
import { auditLoggerAgent } from './auditLoggerAgent';
import { Task } from '../models/taskModel';
import logger from '../middleware/logger';

// ─── Reminder Agent ────────────────────────────────────────────────────────────

class ReminderAgent {
  private get reminderHours(): number {
    return parseInt(process.env.REMINDER_HOURS_BEFORE ?? '24', 10);
  }

  /**
   * Send reminders for tasks due within the configured window.
   * Deduplicates: skips tasks already reminded in the last 20 hours.
   */
  async sendReminders(): Promise<number> {
    logger.info('ReminderAgent: Checking for tasks needing reminders', {
      window_hours: this.reminderHours,
    });

    const result = await query<Task>(
      `SELECT t.*
       FROM tasks t
       WHERE t.status IN ('pending', 'in_progress')
         AND t.deadline BETWEEN NOW() AND NOW() + INTERVAL '${this.reminderHours} hours'
         AND t.id NOT IN (
           SELECT al.task_id
           FROM audit_logs al
           WHERE al.action = 'REMINDER_SENT'
             AND al.timestamp > NOW() - INTERVAL '20 hours'
             AND al.task_id IS NOT NULL
         )`,
    );

    const tasks = result.rows;
    logger.info('ReminderAgent: Found tasks requiring reminders', { count: tasks.length });

    let sentCount = 0;
    for (const task of tasks) {
      try {
        await emailService.sendReminder(task);

        await auditLoggerAgent.log({
          action: 'REMINDER_SENT',
          agent: 'ReminderAgent',
          task_id: task.id,
          meeting_id: task.meeting_id,
          details: {
            owner: task.owner,
            owner_email: task.owner_email,
            deadline: task.deadline,
          },
        });

        sentCount++;
      } catch (err) {
        const error = err as Error;
        logger.error('ReminderAgent: Failed to send reminder', {
          task_id: task.id,
          error: error.message,
        });
      }
    }

    logger.info('ReminderAgent: Reminder batch complete', { sent: sentCount, skipped: tasks.length - sentCount });
    return sentCount;
  }
}

export const reminderAgent = new ReminderAgent();
export default ReminderAgent;
