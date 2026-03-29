# AutoOps AI: Architecture & Impact Document

## 1. Architecture Document

### 1.1 Multi-Agent System Diagram & Flow
AutoOps AI utilizes an event-driven, 7-agent architecture designed to autonomously process, track, and enforce meeting deliverables.

**The Pipeline Flow:**
1. **User interaction:** User uploads a raw transcript.
2. **MeetingIngestionAgent:** Sanitizes and processes the raw text payload.
3. **TaskExtractorAgent:** Interacts with Google Gemini (via `@google/genai`) to syntactically parse the transcript and extract structured JSON deliverables (Assignee, Deadline, Priority).
4. **TaskManagerAgent:** Interfaces with PostgreSQL to instantiate these tasks and map them to their respective owners.
5. **SchedulerAgent:** An autonomous cron-driven heartbeat that wakes up periodically.
6. **ReminderAgent & EscalationAgent:** Triggered by the Scheduler. The ReminderAgent flags upcoming tasks, while the EscalationAgent intercepts missed deadlines, flags them as `OVERDUE` in real-time, and can trigger management warning emails.
7. **AuditLoggerAgent:** The central nervous system. Every single action taken by any agent is routed through this logger, which simultaneously writes to the immutable database log *and* broadcasts a WebSockets event (`io.emit`) to update the frontend Live Agent Dashboard instantly.

### 1.2 Communication & Tool Integrations
- **Agent Communication:** Agents operate decoupled from each other, communicating via database state changes and memory.
- **Frontend/Backend Sync:** Fully asynchronous real-time streaming using `socket.io`. When an agent works in the background, the UI updates instantly without polling.
- **AI Tool Integration:** Powered by **Google Gemini 2.5 Flash** for rapid, deterministic JSON extraction. Prompts are strictly engineered with system instructions to prevent hallucination.

### 1.3 Error-Handling Logic
- **Fail-Safe Logging:** The `AuditLoggerAgent` uses aggressive `try/catch` fallback blocks. If a log fails to write to the DB, it gracefully degrades rather than crashing the core application.
- **AI Rate Limiting:** The `TaskExtractorAgent` implements exponential backoff and retry logic handles any Gemini API rate limits or network dropouts during extraction.

---

## 2. Impact Model

### 2.1 Quantified Business Estimates
AutoOps AI targets the massive administrative overlap in modern corporate environments.

* **Time Saved:** 150 hours/week (for a 10-person PM team).
* **Cost Reduced:** $390,000 / year.
* **Revenue Recovered:** $250,000+ / year in prevented project delays.

### 2.2 The Math & Assumptions (Back-of-Envelope logic)
**Assumption 1: Administrative Time Cost**
- An average Project/Product Manager spends roughly 15 hours a week in meetings, subsequently manually extracting tasks, chasing employees for updates, and writing status reports.
- **Cost:** Assuming an average PM salary of $104,000/yr ($50/hour). 
- 15 hours * $50 = $750/week spent *per manager* on task-chasing.
- For a small enterprise team of 10 PMs, this equates to 150 hours/week, or **$390,000 per year** in pure administrative bloat. AutoOps AI completely automates the extraction and chasing phases, reducing this cost to near-zero.

**Assumption 2: Revenue Recovery & Missed Deadlines**
- Teams frequently miss critical project deadlines because verbal tasks assigned in meetings are undocumented and forgotten. 
- If a project launch is delayed by 1 month due to a forgotten dependency, the enterprise loses 1 month of time-to-market revenue. 
- **Cost:** Assuming a product generates $3M/year, one month of delay costs $250,000. 
- By utilizing the **EscalationAgent**, AutoOps AI guarantees 100% accountability. Deadlines cannot be silently missed because the background agent automatically flags the delay and escalates it to stakeholders before the deadline slips out of control, actively recovering delayed revenue.
