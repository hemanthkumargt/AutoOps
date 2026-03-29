import { query } from '../services/database';
import { openaiService } from '../services/openaiService';
import { auditLoggerAgent } from './auditLoggerAgent';
import { Task, TaskPriority } from '../models/taskModel';
import { Meeting } from '../models/meetingModel';
import logger from '../middleware/logger';
import { NotFoundError } from '../middleware/errorHandler';

// ─── Task Extractor Agent ─────────────────────────────────────────────────────

class TaskExtractorAgent {
  /**
   * Fetch meeting transcript, extract tasks via AI, and store them.
   */
  async extractAndStore(meetingId: string): Promise<Task[]> {
    // Fetch the meeting from DB
    const meetingResult = await query<Meeting>(
      `SELECT * FROM meetings WHERE id = $1`,
      [meetingId],
    );

    if (meetingResult.rows.length === 0) {
      throw new NotFoundError(`Meeting with ID ${meetingId} not found`);
    }

    const meeting = meetingResult.rows[0];
    logger.info('TaskExtractorAgent: Starting task extraction', {
      meeting_id: meetingId,
      title: meeting.title,
    });

    // Call OpenAI to extract tasks
    const extractedTasks = await openaiService.extractTasksFromTranscript(meeting.transcript);
    logger.info('TaskExtractorAgent: AI extracted tasks', {
      meeting_id: meetingId,
      count: extractedTasks.length,
    });

    // Insert each task into the database
    const createdTasks: Task[] = [];
    for (const extracted of extractedTasks) {
      const taskResult = await query<Task>(
        `INSERT INTO tasks (meeting_id, title, owner, owner_email, deadline, priority)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          meetingId,
          extracted.title,
          extracted.owner,
          extracted.owner_email,
          extracted.deadline,
          extracted.priority,
        ],
      );

      const task = taskResult.rows[0];
      createdTasks.push(task);

      // Log to audit trail
      await auditLoggerAgent.log({
        action: 'TASK_EXTRACTED',
        agent: 'TaskExtractorAgent',
        task_id: task.id,
        meeting_id: meetingId,
        details: {
          title: task.title,
          owner: task.owner,
          priority: task.priority,
          reasoning: extracted.reasoning,
        },
      });
    }

    logger.info('TaskExtractorAgent: All tasks stored successfully', {
      meeting_id: meetingId,
      tasks_created: createdTasks.length,
    });

    return createdTasks;
  }

  /**
   * Delete pending tasks and re-run AI extraction on the same meeting.
   */
  async reExtract(meetingId: string): Promise<Task[]> {
    logger.info('TaskExtractorAgent: Re-extracting tasks for meeting', { meetingId });

    // Delete only pending tasks (preserve in_progress/completed/overdue)
    const deleted = await query(
      `DELETE FROM tasks WHERE meeting_id = $1 AND status = 'pending' RETURNING id`,
      [meetingId],
    );

    logger.info('TaskExtractorAgent: Deleted pending tasks', {
      meeting_id: meetingId,
      deleted_count: deleted.rowCount,
    });

    await auditLoggerAgent.log({
      action: 'TASKS_RE_EXTRACTED',
      agent: 'TaskExtractorAgent',
      meeting_id: meetingId,
      details: { deleted_pending_tasks: deleted.rowCount },
    });

    return this.extractAndStore(meetingId);
  }
}

export const taskExtractorAgent = new TaskExtractorAgent();
export default TaskExtractorAgent;
