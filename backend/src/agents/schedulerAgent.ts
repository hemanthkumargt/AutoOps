import cron, { ScheduledTask } from 'node-cron';
import { reminderAgent } from './reminderAgent';
import { escalationAgent } from './escalationAgent';
import { auditLoggerAgent } from './auditLoggerAgent';
import { query } from '../services/database';
import { emailService } from '../services/emailService';
import { Task } from '../models/taskModel';
import logger from '../middleware/logger';

// ─── Scheduler Agent ──────────────────────────────────────────────────────────

class SchedulerAgent {
  private jobs: ScheduledTask[] = [];
  private isRunning = false;

  /**
   * Start all scheduled cron jobs.
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('SchedulerAgent: Already running, skipping start');
      return;
    }

    logger.info('SchedulerAgent: Starting all scheduled jobs');

    // Job 1: Every minute — detect overdue and escalate
    const escalationJob = cron.schedule('* * * * *', async () => {
      logger.debug('SchedulerAgent: Running escalation job');
      try {
        await escalationAgent.escalateOverdueTasks();
      } catch (err) {
        const error = err as Error;
        logger.error('SchedulerAgent: Escalation job failed', { error: error.message });
      }
    });
    this.jobs.push(escalationJob);

    // Job 2: Every hour — send reminders
    const reminderJob = cron.schedule('0 * * * *', async () => {
      logger.info('SchedulerAgent: Running reminder job');
      try {
        const count = await reminderAgent.sendReminders();
        logger.info('SchedulerAgent: Reminder job complete', { reminders_sent: count });
      } catch (err) {
        const error = err as Error;
        logger.error('SchedulerAgent: Reminder job failed', { error: error.message });
      }
    });
    this.jobs.push(reminderJob);

    // Job 3: Daily at 8am — daily digest and summary
    const dailyJob = cron.schedule('0 8 * * *', async () => {
      logger.info('SchedulerAgent: Running daily digest job');
      try {
        await auditLoggerAgent.log({
          action: 'DAILY_DIGEST_TRIGGERED',
          agent: 'SchedulerAgent',
          details: { triggered_at: new Date().toISOString() },
        });

        // Send digest to manager
        const managerEmail = process.env.MANAGER_EMAIL;
        if (managerEmail) {
          const taskResult = await query<Task>('SELECT * FROM tasks ORDER BY status, deadline');
          await emailService.sendDigest(taskResult.rows, managerEmail);
        }

        logger.info('SchedulerAgent: Daily digest complete');
      } catch (err) {
        const error = err as Error;
        logger.error('SchedulerAgent: Daily digest job failed', { error: error.message });
      }
    });
    this.jobs.push(dailyJob);

    this.isRunning = true;
    logger.info('SchedulerAgent: All jobs started', {
      jobs: ['escalation (every minute)', 'reminders (every hour)', 'digest (8am daily)'],
    });
  }

  /**
   * Gracefully stop all cron jobs.
   */
  stop(): void {
    logger.info('SchedulerAgent: Stopping all scheduled jobs');
    for (const job of this.jobs) {
      job.stop();
    }
    this.jobs = [];
    this.isRunning = false;
    logger.info('SchedulerAgent: All jobs stopped');
  }

  getStatus(): { running: boolean; jobCount: number } {
    return { running: this.isRunning, jobCount: this.jobs.length };
  }
}

export const schedulerAgent = new SchedulerAgent();
export default SchedulerAgent;
