import { query } from '../services/database';
import { Meeting, CreateMeetingDTO } from '../models/meetingModel';
import { auditLoggerAgent } from './auditLoggerAgent';
import logger from '../middleware/logger';
import { ValidationError, NotFoundError } from '../middleware/errorHandler';

// ─── Meeting Ingestion Agent ──────────────────────────────────────────────────

class MeetingIngestionAgent {
  private readonly TITLE_MAX_LENGTH = 500;
  private readonly TRANSCRIPT_MAX_LENGTH = 50_000;
  private readonly TRANSCRIPT_MIN_LENGTH = 50;

  /**
   * Validate and ingest a meeting transcript into the database.
   */
  async ingestMeeting(title: string, transcript: string): Promise<Meeting> {
    // Validate title
    if (!title || title.trim().length === 0) {
      throw new ValidationError('Meeting title is required');
    }
    if (title.trim().length > this.TITLE_MAX_LENGTH) {
      throw new ValidationError(`Meeting title must not exceed ${this.TITLE_MAX_LENGTH} characters`);
    }

    // Validate transcript
    const cleanTranscript = transcript.replace(/<[^>]*>/g, '').trim();
    if (cleanTranscript.length < this.TRANSCRIPT_MIN_LENGTH) {
      throw new ValidationError(`Transcript must be at least ${this.TRANSCRIPT_MIN_LENGTH} characters`);
    }
    if (cleanTranscript.length > this.TRANSCRIPT_MAX_LENGTH) {
      throw new ValidationError(`Transcript must not exceed ${this.TRANSCRIPT_MAX_LENGTH} characters`);
    }

    logger.info('MeetingIngestionAgent: Ingesting new meeting', { title: title.trim() });

    // Insert meeting into database
    const result = await query<Meeting>(
      `INSERT INTO meetings (title, transcript)
       VALUES ($1, $2)
       RETURNING *`,
      [title.trim(), cleanTranscript],
    );

    const meeting = result.rows[0];

    // Log to audit trail
    await auditLoggerAgent.log({
      action: 'MEETING_INGESTED',
      agent: 'MeetingIngestionAgent',
      meeting_id: meeting.id,
      details: {
        title: meeting.title,
        transcript_length: cleanTranscript.length,
      },
    });

    logger.info('MeetingIngestionAgent: Meeting ingested successfully', {
      meeting_id: meeting.id,
      title: meeting.title,
    });

    return meeting;
  }

  /**
   * Fetch a single meeting by ID.
   */
  async getMeetingById(id: string): Promise<Meeting> {
    const result = await query<Meeting>(
      `SELECT * FROM meetings WHERE id = $1`,
      [id],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Meeting with ID ${id} not found`);
    }

    return result.rows[0];
  }
}

export const meetingIngestionAgent = new MeetingIngestionAgent();
export default MeetingIngestionAgent;
