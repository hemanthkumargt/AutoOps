# AutoOps AI

> **AI that doesn't just record meetings — it ensures decisions get executed.**

[![ET AI Hackathon 2026](https://img.shields.io/badge/ET%20AI%20Hackathon-2026-blue?style=flat-square)](https://github.com/autoops-ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)](https://nextjs.org/)

---

## 🚨 The Problem

Manual meeting follow-up is broken. Teams spend 30+ minutes per meeting manually summarizing action items, assigning owners, and sending reminders — only to have 40% of commitments fall through the cracks. There is no automated accountability layer between a meeting's decisions and their real-world execution.

---

## 💡 Solution Overview

AutoOps AI is a **7-agent autonomous system** that converts any meeting transcript into fully tracked, automatically enforced action items. Upload a transcript → Gemini 1.5 Flash extracts all tasks → owners are assigned → reminders and escalations fire automatically → a live dashboard shows you everything in real time. No manual follow-up. No missed deadlines.

The system uses a chain of specialized AI agents, each with a single responsibility: ingest, extract, remind, escalate, schedule, audit, and manage. Together they create a self-sustaining accountability loop.

---

## 🏗️ Architecture

```
                        ┌───────────────────────────────────────┐
                        │         Frontend (Next.js 14)          │
                        │  Homepage · Dashboard · Audit Log UI   │
                        └──────────────────┬────────────────────┘
                                           │ REST API
                        ┌──────────────────▼────────────────────┐
                        │         Backend (Express + TS)          │
                        │         POST /api/v1/meetings           │
                        │         POST /api/v1/meetings/:id/      │
                        │              extract-tasks              │
                        │         GET  /api/v1/tasks              │
                        │         PUT  /api/v1/tasks/:id/status   │
                        │         GET  /api/v1/audit              │
                        └──────┬────────────────────┬────────────┘
                               │                    │
          ┌────────────────────▼──┐         ┌──────▼──────────────────┐
          │   7-AGENT PIPELINE    │         │   PostgreSQL Database    │
          │                       │         │   meetings               │
          │ 1. MeetingIngestion   │         │   tasks                  │
          │ 2. TaskExtractor ─────┼─OpenAI─▶│   audit_logs            │
          │ 3. ReminderAgent      │         └─────────────────────────┘
          │ 4. EscalationAgent ───┼─Email──▶  owner / manager inbox
          │ 5. SchedulerAgent     │
          │    (node-cron)        │
          │ 6. AuditLoggerAgent   │
          │ 7. TaskManagerAgent   │
          └───────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer       | Technology                        | Purpose                            |
|-------------|-----------------------------------|------------------------------------|
| Backend     | Node.js 20 + TypeScript (strict)  | API server, agent orchestration    |
| Framework   | Express.js 4                      | REST API routing + middleware       |
| Database    | PostgreSQL 15 via `pg`            | Persistent data store              |
| AI          | Google Gemini via `@google/genai` | Task extraction from transcripts   |
| Scheduler   | `node-cron`                       | Automated reminders & escalations  |
| Email       | `nodemailer`                      | SMTP-based notifications           |
| Logging     | `winston`                         | Structured JSON + console logs     |
| Frontend    | Next.js 14 (App Router)           | Dashboard & homepage               |
| Styling     | Tailwind CSS v3                   | Utility-first dark-mode UI         |
| Containers  | Docker + Docker Compose           | Dev & production deployment        |

---

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/autoops-ai.git
cd autoops-ai
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env and fill in your values (see Environment Variables table below)
```

### 3. Start PostgreSQL (Docker)

```bash
docker-compose up -d postgres
```

### 4. Install & Run Backend

```bash
cd backend
npm install
npm run dev
# Server starts at http://localhost:3001
```

### 5. Install & Run Frontend

```bash
cd frontend
npm install
npm run dev
# Dashboard at http://localhost:3000
```

### 6. Initialize Database Schema

```bash
# After postgres is running:
psql -U postgres -d autoops -f database/schema.sql
psql -U postgres -d autoops -f database/seed.sql
```

### 7. Full Stack with Docker

```bash
docker-compose up --build
# Frontend: http://localhost:3000
# Backend:  http://localhost:3001
# Health:   http://localhost:3001/health
```

---

## 🔑 Environment Variables

| Variable               | Required | Default                              | Description                                |
|------------------------|----------|--------------------------------------|--------------------------------------------|
| `NODE_ENV`             | No       | `development`                        | Runtime environment                        |
| `PORT`                 | No       | `3001`                               | Backend server port                        |
| `DATABASE_URL`         | Yes*     | —                                    | Full PostgreSQL connection string          |
| `DB_HOST`              | Yes*     | `localhost`                          | Database host                              |
| `DB_PORT`              | No       | `5432`                               | Database port                              |
| `DB_NAME`              | Yes      | `autoops`                            | Database name                              |
| `DB_USER`              | Yes      | `postgres`                           | Database user                              |
| `DB_PASS`              | Yes      | —                                    | Database password                          |
| `GEMINI_API_KEY`       | Yes      | —                                    | Gemini API key for task extraction         |
| `EMAIL_HOST`           | Yes      | `smtp.gmail.com`                     | SMTP server hostname                       |
| `EMAIL_PORT`           | No       | `587`                                | SMTP port                                  |
| `EMAIL_USER`           | Yes      | —                                    | SMTP username/email                        |
| `EMAIL_PASS`           | Yes      | —                                    | SMTP password / app password               |
| `EMAIL_FROM`           | No       | same as `EMAIL_USER`                 | Display name for sent emails               |
| `MANAGER_EMAIL`        | Yes      | —                                    | Escalation recipient email                 |
| `REMINDER_HOURS_BEFORE`| No       | `24`                                 | Hours before deadline to send reminder     |
| `NEXT_PUBLIC_API_URL`  | No       | `http://localhost:3001/api/v1`       | Frontend API base URL                      |
| `LOG_LEVEL`            | No       | `info`                               | Winston log level (debug/info/warn/error)  |
| `CORS_ORIGIN`          | No       | `*`                                  | Allowed CORS origin                        |

*Use either `DATABASE_URL` **or** the individual `DB_*` variables.

---

## 📡 API Endpoints

| Method | Endpoint                          | Description                                 |
|--------|-----------------------------------|---------------------------------------------|
| GET    | `/health`                         | Health check with DB and scheduler status   |
| POST   | `/api/v1/meetings`                | Create and ingest a new meeting             |
| GET    | `/api/v1/meetings`                | List meetings (paginated)                   |
| GET    | `/api/v1/meetings/:id`            | Get meeting with its tasks                  |
| POST   | `/api/v1/meetings/:id/extract-tasks` | Run AI task extraction on a meeting      |
| GET    | `/api/v1/tasks`                   | List tasks (filter by status/owner/priority)|
| GET    | `/api/v1/tasks/overdue`           | List all overdue tasks                      |
| GET    | `/api/v1/tasks/:id`               | Get task with full audit history            |
| PUT    | `/api/v1/tasks/:id/status`        | Update task status                          |
| GET    | `/api/v1/audit`                   | Paginated audit logs with filters           |
| GET    | `/api/v1/audit/task/:taskId`      | Audit history for a specific task           |
| GET    | `/api/v1/audit/summary`           | Agent activity summary (grouped counts)     |

---

## 🎬 Demo Flow

1. 🏠 **Visit** `http://localhost:3000` — see the homepage with live stats
2. 📤 **Upload Meeting** — paste a team meeting transcript (minimum 50 chars)
3. 🧠 **AI Extraction** — Gemini identifies tasks, owners, and deadlines automatically
4. ✅ **Review Tasks** — switch to the Tasks tab; see extracted items with priority badges
5. ✏️ **Update Status** — use the inline dropdown to mark a task as `in_progress`
6. 📋 **Audit Log** — switch to Audit tab; watch every agent action logged in real time
7. 🚨 **Watch Escalation** — any task past its deadline auto-moves to `overdue` via the scheduler (runs every minute)

---

## 📊 Impact Model

See [docs/impact-model.md](docs/impact-model.md) for full ROI calculations.

**Summary**: For a 50-person team with 20 meetings/week:
- **10 hours/week** saved in manual follow-up
- **$10,400/year** in direct labor cost savings
- **40% improvement** in task completion rate (quantified at $28,600/year in value)
- **Total annual impact: ~$39,000+**

---

## 📐 Architecture

See [docs/architecture.md](docs/architecture.md) for the full system design document.

---

## 👥 Team

Built at the **ET AI Hackathon 2026**.

| Name | Role |
|------|------|
| Team AutoOps | Full-stack AI Engineering |

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.
