import { query } from '../services/database';
import { AuditEntry, AuditLog, AuditFilters, AgentSummary, PaginatedResult } from '../models/auditModel';
import logger from '../middleware/logger';

// ─── Audit Logger Agent ───────────────────────────────────────────────────────

class AuditLoggerAgent {
  /**
   * Log an audit entry to the database.
   * Never throws — wraps in try/catch to prevent cascading failures.
   */
  async log(entry: AuditEntry): Promise<AuditLog> {
    try {
      const result = await query<AuditLog>(
        `INSERT INTO audit_logs (action, agent, task_id, meeting_id, details)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          entry.action,
          entry.agent,
          entry.task_id ?? null,
          entry.meeting_id ?? null,
          entry.details ? JSON.stringify(entry.details) : null,
        ],
      );
      return result.rows[0];
    } catch (err) {
      const error = err as Error;
      // Never let audit logging crash the app
      logger.error('AuditLoggerAgent: Failed to write audit log', {
        error: error.message,
        entry,
      });
      // Return a fallback object so callers don't break
      return {
        id: 'unknown',
        action: entry.action,
        agent: entry.agent,
        task_id: entry.task_id ?? null,
        meeting_id: entry.meeting_id ?? null,
        details: entry.details ?? null,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Retrieve paginated audit logs with optional filters.
   */
  async getLogs(filters: AuditFilters): Promise<PaginatedResult<AuditLog>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.agent) {
      conditions.push(`agent = $${paramIndex++}`);
      params.push(filters.agent);
    }
    if (filters.action) {
      conditions.push(`action = $${paramIndex++}`);
      params.push(filters.action);
    }
    if (filters.task_id) {
      conditions.push(`task_id = $${paramIndex++}`);
      params.push(filters.task_id);
    }
    if (filters.meeting_id) {
      conditions.push(`meeting_id = $${paramIndex++}`);
      params.push(filters.meeting_id);
    }
    if (filters.from) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(filters.from);
    }
    if (filters.to) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      params.push(filters.to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM audit_logs ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await query<AuditLog>(
      `SELECT * FROM audit_logs ${whereClause}
       ORDER BY timestamp DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, limit, offset],
    );

    return {
      data: dataResult.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get all audit events for a specific task (chronological order).
   */
  async getTaskHistory(taskId: string): Promise<AuditLog[]> {
    const result = await query<AuditLog>(
      `SELECT * FROM audit_logs WHERE task_id = $1 ORDER BY timestamp ASC`,
      [taskId],
    );
    return result.rows;
  }

  /**
   * Summarize agent activity grouped by agent + action in a time window.
   */
  async getSummary(from: Date, to: Date): Promise<AgentSummary[]> {
    const result = await query<AgentSummary>(
      `SELECT agent, action, COUNT(*)::int as count
       FROM audit_logs
       WHERE timestamp BETWEEN $1 AND $2
       GROUP BY agent, action
       ORDER BY agent, action`,
      [from, to],
    );
    return result.rows;
  }
}

export const auditLoggerAgent = new AuditLoggerAgent();
export default AuditLoggerAgent;
