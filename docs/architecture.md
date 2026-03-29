# AutoOps AI — System Architecture

## 1. System Overview

AutoOps AI is a multi-agent, event-driven system designed to close the accountability gap between meeting decisions and real-world execution. The system accepts raw meeting transcripts, processes them through a pipeline of specialized AI agents, and maintains a fully automated enforcement loop using scheduled jobs, email notifications, and a real-time audit trail.

The backend is a TypeScript + Express.js monolith organized into **7 distinct agents**, each owning a single responsibility. Agents communicate through a shared PostgreSQL database rather than message queues, keeping the architecture simple and hackathon-deployable while remaining extensible.

---

## 2. Agent Roles

| Agent | Trigger | Input | Output | Logs What |
|-------|---------|-------|--------|-----------|
| **MeetingIngestionAgent** | `POST /meetings` API call | `title`, `transcript` string | `meetings` row | `MEETING_INGESTED` |
| **TaskExtractorAgent** | `POST /meetings/:id/extract-tasks` | meeting ID → fetches transcript | N `tasks` rows | `TASK_EXTRACTED` (per task) |
| **OpenAIService** | Called by TaskExtractorAgent | transcript string | JSON array of `ExtractedTask` | (not logged directly) |
| **ReminderAgent** | Hourly cron (SchedulerAgent) | DB query for upcoming tasks | Emails sent | `REMINDER_SENT` |
| **EscalationAgent** | Every-minute cron + manual | DB query for overdue tasks | Status update + email | `TASK_ESCALATED`, `TASK_MARKED_OVERDUE` |
| **SchedulerAgent** | Server startup (`start()`) | Config (env vars) | Cron jobs running | `DAILY_DIGEST_TRIGGERED` |
| **AuditLoggerAgent** | Called by every other agent | `AuditEntry` object | `audit_logs` row | (is the logger itself) |
| **TaskManagerAgent** (virtual) | `PUT /tasks/:id/status` | task ID + new status | Updated `tasks` row | `STATUS_UPDATED` |

---

## 3. Data Flow Narrative

When a user submits a meeting transcript through the dashboard or API, the **MeetingIngestionAgent** validates the input (title ≤ 500 chars, transcript 50–50,000 chars, HTML stripped) and inserts it into the `meetings` table. The response includes the meeting ID.

The client then immediately calls `POST /meetings/:id/extract-tasks`. The **TaskExtractorAgent** fetches the meeting transcript, passes it to the **OpenAIService**, which calls GPT-4o with a strict system prompt requesting a JSON array of action items. The response is parsed, validated field-by-field, and each task is inserted into the `tasks` table with the extracted `owner`, `deadline`, and `priority`. Every insertion triggers a `TASK_EXTRACTED` audit log entry via **AuditLoggerAgent**.

From this point, the **SchedulerAgent** takes over. It runs three cron jobs:

- **Every minute**: Calls `EstalationAgent.detectAndMarkOverdue()` to SQL-update any task whose deadline has passed to `status = 'overdue'`, then sends escalation emails to the manager for any newly overdue task not already escalated in the past 24 hours.
- **Every hour**: Calls `ReminderAgent.sendReminders()` which queries tasks due within the configured window (default: 24 hours) and not already reminded in the past 20 hours, then sends HTML reminder emails.
- **Daily at 8 AM**: Triggers a digest email to the manager with all tasks grouped by status, and logs `DAILY_DIGEST_TRIGGERED` to the audit trail.

Every action by every agent is recorded in `audit_logs` via the **AuditLoggerAgent**, which is designed to never throw — if the database write fails, it logs to console and returns a fallback object, ensuring a single audit failure cannot crash the main flow.

---

## 4. Database Schema Summary

```
meetings (id, title, transcript, created_at)
    │
    └──< tasks (id, meeting_id, title, owner, owner_email, deadline, priority, status, created_at, updated_at)
              │
              └──< audit_logs (id, action, agent, task_id, meeting_id, details, timestamp)
```

**Key triggers:**
- `trg_tasks_updated_at` — auto-sets `updated_at = NOW()` on every UPDATE
- `trg_tasks_overdue` — auto-sets `status = 'overdue'` on INSERT/UPDATE if `deadline < NOW()` and status is not completed

---

## 5. Error Handling Strategy

| Error Type | HTTP Code | Behavior |
|------------|-----------|----------|
| `ValidationError` | 400 | Returns field-level messages; no logging |
| `NotFoundError` | 404 | Returns 404 with resource description |
| `TaskExtractionError` | 422 | Returns parsing failure details; original GPT response in dev |
| `DatabaseError` | 503 | Logged with full context; returns generic message in prod |
| Unhandled exceptions | 500 | Full stack logged to Winston; generic message to client |

Stack traces are **never** exposed in `NODE_ENV=production`. All 500-level errors are logged with request context (path, method, body, params).

The **AuditLoggerAgent** uses a `never-throw` pattern — it wraps all DB calls in `try/catch` and logs to console on failure, ensuring the audit system cannot become a cascading failure point.

Graceful shutdown handles `SIGTERM` and `SIGINT`: stops the cron scheduler, logs a `SERVER_SHUTDOWN` event to audit logs, then closes the database pool.

---

## 6. API Design

All endpoints are versioned under `/api/v1`. Responses follow a consistent shape:

```json
// Success
{ "success": true, "data": {...} }

// Paginated
{ "success": true, "data": [...], "total": 42, "page": 1, "limit": 20, "totalPages": 3 }

// Error
{ "success": false, "error": "Human-readable message", "code": "ERROR_CODE", "timestamp": "ISO8601" }
```

UUID format is validated on all `:id` parameters using `express-validator`. Input sanitization strips HTML tags from transcript fields.

---

## 7. Scalability Notes

The current architecture is **intentionally simple** for hackathon velocity. For production scale:

- **Agent queuing**: Replace direct function calls with a job queue (BullMQ + Redis) so agents can be scaled horizontally and retried independently.
- **Database**: Add read replicas for the audit log queries; partition `audit_logs` by `timestamp` monthly.
- **Multi-tenant**: Add an `organization_id` to all tables; use Row Level Security in PostgreSQL.
- **AI cost control**: Cache GPT-4o responses by transcript hash for re-extraction. Add token counting before API calls.
- **WebSockets**: Replace the 30-second audit log poll with a Server-Sent Events stream from the backend.
- **Rate limiting**: Add `express-rate-limit` middleware on the `/meetings` and `/extract-tasks` endpoints.

---

## 8. Key Dependencies

| Package | Version | Role |
|---------|---------|------|
| `express` | ^4.18 | HTTP server |
| `openai` | ^4.47 | GPT-4o API client |
| `pg` | ^8.11 | PostgreSQL client |
| `node-cron` | ^3.0 | Cron scheduler |
| `nodemailer` | ^6.9 | SMTP email |
| `winston` | ^3.13 | Structured logging |
| `express-validator` | ^7.2 | Input validation & sanitization |
| `next` | 14.2 | React framework with App Router |
| `tailwindcss` | ^3.4 | Utility-first CSS |
