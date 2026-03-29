import nodemailer from 'nodemailer';
import { Task } from '../models/taskModel';
import logger from '../middleware/logger';

// ─── Priority Colors ──────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#DC2626',
  high: '#EA580C',
  medium: '#2563EB',
  low: '#6B7280',
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#6B7280',
  in_progress: '#2563EB',
  completed: '#16A34A',
  overdue: '#DC2626',
};

// ─── Email Service ─────────────────────────────────────────────────────────────

class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST ?? 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT ?? '587', 10),
      secure: parseInt(process.env.EMAIL_PORT ?? '587', 10) === 465,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  private formatDeadline(date: Date): string {
    return new Date(date).toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  private getHoursOverdue(deadline: Date): number {
    return Math.round((Date.now() - new Date(deadline).getTime()) / (1000 * 60 * 60));
  }

  private baseHtml(title: string, body: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f4f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.07); }
    .header { background: linear-gradient(135deg, #0f172a, #1e293b); padding: 28px 32px; }
    .header h1 { color: white; margin: 0; font-size: 20px; font-weight: 700; }
    .header p { color: #94a3b8; margin: 6px 0 0; font-size: 13px; }
    .body { padding: 32px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; color: white; }
    .field { margin-bottom: 16px; }
    .field label { display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 4px; }
    .field p { margin: 0; color: #1e293b; font-size: 15px; }
    .footer { background: #f8fafc; padding: 20px 32px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="container">
    ${body}
    <div class="footer">
      <p>🤖 This is an automated message from <strong>AutoOps AI</strong>. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Send a task reminder email.
   */
  async sendReminder(task: Task): Promise<void> {
    if (!task.owner_email) {
      logger.warn('EmailService: No email for task owner, skipping reminder', {
        task_id: task.id,
        owner: task.owner,
      });
      return;
    }

    const priorityColor = PRIORITY_COLORS[task.priority] ?? '#6B7280';
    const statusColor = STATUS_COLORS[task.status] ?? '#6B7280';

    const html = this.baseHtml(
      `Task Reminder: ${task.title}`,
      `
      <div class="header">
        <h1>⏰ Task Reminder</h1>
        <p>AutoOps AI — Automated Reminder</p>
      </div>
      <div class="body">
        <div class="field">
          <label>Task</label>
          <p><strong>${task.title}</strong></p>
        </div>
        <div class="field">
          <label>Assigned To</label>
          <p>${task.owner}</p>
        </div>
        <div class="field">
          <label>Deadline</label>
          <p>📅 ${this.formatDeadline(task.deadline)}</p>
        </div>
        <div class="field">
          <label>Priority</label>
          <p><span class="badge" style="background:${priorityColor}">${task.priority.toUpperCase()}</span></p>
        </div>
        <div class="field">
          <label>Current Status</label>
          <p><span class="badge" style="background:${statusColor}">${task.status.replace('_', ' ').toUpperCase()}</span></p>
        </div>
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin-top:24px;">
          <p style="margin:0;color:#1e40af;font-size:14px;">
            ℹ️ This is an automated reminder from AutoOps AI. Please update your task status as soon as possible.
          </p>
        </div>
      </div>`,
    );

    await this.transporter.sendMail({
      from: process.env.EMAIL_FROM ?? process.env.EMAIL_USER,
      to: task.owner_email,
      subject: `⏰ Task Reminder: ${task.title} is due soon`,
      html,
    });

    logger.info('EmailService: Reminder sent', { task_id: task.id, to: task.owner_email });
  }

  /**
   * Send an escalation email for overdue tasks.
   */
  async sendEscalation(task: Task, managerEmail: string): Promise<void> {
    const hoursOverdue = this.getHoursOverdue(task.deadline);
    const overdueText = hoursOverdue < 24
      ? `${hoursOverdue} hour(s)`
      : `${Math.round(hoursOverdue / 24)} day(s)`;

    const html = this.baseHtml(
      `OVERDUE TASK ESCALATION: ${task.title}`,
      `
      <div class="header" style="background:linear-gradient(135deg,#7f1d1d,#991b1b);">
        <h1>🚨 OVERDUE TASK ESCALATION</h1>
        <p>Immediate attention required</p>
      </div>
      <div class="body">
        <div style="background:#fef2f2;border:2px solid #fca5a5;border-radius:8px;padding:16px;margin-bottom:24px;">
          <p style="margin:0;color:#991b1b;font-size:15px;font-weight:600;">
            ⚠️ This task is ${overdueText} overdue. Immediate attention required.
          </p>
        </div>
        <div class="field">
          <label>Task</label>
          <p><strong>${task.title}</strong></p>
        </div>
        <div class="field">
          <label>Responsible Person</label>
          <p>${task.owner} ${task.owner_email ? `(${task.owner_email})` : ''}</p>
        </div>
        <div class="field">
          <label>Original Deadline</label>
          <p>📅 ${this.formatDeadline(task.deadline)}</p>
        </div>
        <div class="field">
          <label>Overdue By</label>
          <p style="color:#dc2626;font-weight:600;">⏱️ ${overdueText}</p>
        </div>
        <div class="field">
          <label>Priority</label>
          <p><span class="badge" style="background:${PRIORITY_COLORS[task.priority] ?? '#6b7280'}">${task.priority.toUpperCase()}</span></p>
        </div>
        <div style="background:#fef2f2;border-radius:8px;padding:16px;margin-top:24px;text-align:center;">
          <p style="color:#991b1b;font-weight:700;margin:0 0 8px;">🚨 CALL TO ACTION</p>
          <p style="color:#7f1d1d;margin:0;">Please contact ${task.owner} immediately and ensure this task is completed or reassigned as soon as possible.</p>
        </div>
      </div>`,
    );

    await this.transporter.sendMail({
      from: process.env.EMAIL_FROM ?? process.env.EMAIL_USER,
      to: managerEmail,
      subject: `🚨 OVERDUE TASK ESCALATION: ${task.title}`,
      html,
    });

    logger.info('EmailService: Escalation sent', { task_id: task.id, to: managerEmail });
  }

  /**
   * Send a daily digest email with all tasks grouped by status.
   */
  async sendDigest(tasks: Task[], recipientEmail: string): Promise<void> {
    const grouped = tasks.reduce((acc, task) => {
      if (!acc[task.status]) acc[task.status] = [];
      acc[task.status].push(task);
      return acc;
    }, {} as Record<string, Task[]>);

    const statuses = ['overdue', 'in_progress', 'pending', 'completed'];

    let tableRows = '';
    for (const status of statuses) {
      const statusTasks = grouped[status] ?? [];
      if (statusTasks.length === 0) continue;
      tableRows += `<tr><td colspan="4" style="background:#f8fafc;font-weight:600;padding:10px 12px;color:#374151;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">${status.replace('_', ' ')} (${statusTasks.length})</td></tr>`;
      for (const t of statusTasks) {
        tableRows += `<tr>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;">${t.title}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;">${t.owner}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;">${this.formatDeadline(t.deadline)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;"><span class="badge" style="background:${PRIORITY_COLORS[t.priority] ?? '#6b7280'}">${t.priority}</span></td>
        </tr>`;
      }
    }

    const html = this.baseHtml(
      'AutoOps Daily Task Digest',
      `
      <div class="header">
        <h1>📊 Daily Task Digest</h1>
        <p>${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>
      <div class="body">
        <p style="color:#475569;margin-bottom:24px;">Here is your daily summary of all tasks tracked by AutoOps AI.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr style="background:#0f172a;color:white;">
              <th style="padding:12px;text-align:left;">Task</th>
              <th style="padding:12px;text-align:left;">Owner</th>
              <th style="padding:12px;text-align:left;">Deadline</th>
              <th style="padding:12px;text-align:left;">Priority</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
        <div style="margin-top:24px;display:flex;gap:16px;flex-wrap:wrap;">
          <div style="flex:1;min-width:120px;background:#f8fafc;border-radius:8px;padding:16px;text-align:center;">
            <p style="margin:0;font-size:24px;font-weight:700;color:#0f172a;">${tasks.length}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#64748b;">Total Tasks</p>
          </div>
          <div style="flex:1;min-width:120px;background:#fef2f2;border-radius:8px;padding:16px;text-align:center;">
            <p style="margin:0;font-size:24px;font-weight:700;color:#dc2626;">${(grouped['overdue'] ?? []).length}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#64748b;">Overdue</p>
          </div>
          <div style="flex:1;min-width:120px;background:#eff6ff;border-radius:8px;padding:16px;text-align:center;">
            <p style="margin:0;font-size:24px;font-weight:700;color:#2563eb;">${(grouped['in_progress'] ?? []).length}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#64748b;">In Progress</p>
          </div>
          <div style="flex:1;min-width:120px;background:#f0fdf4;border-radius:8px;padding:16px;text-align:center;">
            <p style="margin:0;font-size:24px;font-weight:700;color:#16a34a;">${(grouped['completed'] ?? []).length}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#64748b;">Completed</p>
          </div>
        </div>
      </div>`,
    );

    await this.transporter.sendMail({
      from: process.env.EMAIL_FROM ?? process.env.EMAIL_USER,
      to: recipientEmail,
      subject: `📊 AutoOps Daily Task Digest — ${new Date().toLocaleDateString()}`,
      html,
    });

    logger.info('EmailService: Digest sent', { to: recipientEmail, task_count: tasks.length });
  }
}

export const emailService = new EmailService();
export default EmailService;
