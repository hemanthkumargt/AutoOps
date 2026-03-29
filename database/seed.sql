-- =============================================================================
-- AutoOps AI — Seed Data for Testing
-- =============================================================================

-- Clear existing data (in dependency order)
TRUNCATE TABLE audit_logs, tasks, meetings RESTART IDENTITY CASCADE;

-- =============================================================================
-- MEETINGS
-- =============================================================================

INSERT INTO meetings (id, title, transcript, created_at) VALUES
(
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'Q2 Product Roadmap Planning — March 2026',
  'Attendees: Sarah Chen (Product Lead), Marcus Williams (Engineering), Priya Sharma (Design), Tom Anderson (QA), Lisa Patel (Marketing)

Sarah: Good morning everyone. Today we need to finalize our Q2 roadmap and assign ownership for each deliverable. Let us start with our highest priority item — the mobile app redesign.

Marcus: The backend APIs for the new mobile app are 80% complete. I need to finish the authentication module by March 31st. That is a hard deadline because the app store submission has to happen by April 5th.

Priya: I have the design mockups ready for review. Lisa, can you review them by tomorrow? We need sign-off from marketing before we can hand them to the developers.

Lisa: Absolutely, I will review the mockups by March 30th and send feedback. Also, I need someone to write the press release for the app launch. Tom can you handle that?

Tom: I can write the press release. I will have a draft ready by April 10th. Also my QA report for the current sprint is due by March 29th. I will make sure that gets done.

Sarah: Great. One more critical item — we need to migrate our database to PostgreSQL 15. Marcus, that needs to happen before April 15th; it is critical priority.

Marcus: Understood. I will schedule the migration window and have it done by April 12th.

Sarah: Perfect. Let us also make sure our weekly standup notes are posted in Confluence every Friday. Priya, can you own that process going forward?

Priya: Sure, I will start this Friday.',
  NOW() - INTERVAL '2 days'
),
(
  'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  'Customer Success Review — March 2026',
  'Attendees: David Kim (Customer Success Lead), Rachel Moore (Support), James Torres (Sales), Emma Watson (Finance)

David: Thanks for joining. We have three key action items from last week that need owners today.

Rachel: I need to complete the customer satisfaction survey analysis by March 28th. We have over 200 responses that need to be processed and summarized for the board meeting.

David: That is high priority. James, what is the status on the enterprise contract renewals?

James: I am tracking 8 enterprise renewals this quarter. The most urgent one is TechCorp — their contract expires April 1st. I need to send them a renewal proposal by March 27th. That is critical.

Emma: Finance needs the Q1 expense reports from all departments by March 31st. I will send reminders but each department head needs to submit their reports. James, that includes your sales expense report.

James: Got it. I will submit the sales expense report to Emma by March 30th.

David: One more item — we need to update our customer onboarding documentation to reflect the new product changes. Rachel, can you handle that?

Rachel: I can do it. I will have the updated onboarding docs ready by April 5th. Medium priority since the changes are not shipping until mid-April.

David: Thank you all. Let us make sure these get done.',
  NOW() - INTERVAL '1 day'
);

-- =============================================================================
-- TASKS
-- =============================================================================

INSERT INTO tasks (meeting_id, title, owner, owner_email, deadline, priority, status) VALUES
(
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'Complete authentication module for mobile app backend APIs',
  'Marcus Williams',
  'marcus.williams@autoops.ai',
  NOW() + INTERVAL '2 days',
  'high',
  'in_progress'
),
(
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'Review mobile app design mockups and provide marketing feedback',
  'Lisa Patel',
  'lisa.patel@autoops.ai',
  NOW() + INTERVAL '1 day',
  'high',
  'pending'
),
(
  'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  'Send renewal proposal to TechCorp before contract expiration',
  'James Torres',
  'james.torres@autoops.ai',
  NOW() - INTERVAL '2 days',
  'critical',
  'overdue'
),
(
  'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  'Complete customer satisfaction survey analysis — 200+ responses for board meeting',
  'Rachel Moore',
  'rachel.moore@autoops.ai',
  NOW() + INTERVAL '3 days',
  'high',
  'in_progress'
);

-- =============================================================================
-- AUDIT LOGS (seed entries)
-- =============================================================================

INSERT INTO audit_logs (action, agent, meeting_id, details, timestamp) VALUES
(
  'MEETING_INGESTED',
  'MeetingIngestionAgent',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  '{"title": "Q2 Product Roadmap Planning", "transcript_length": 1842}',
  NOW() - INTERVAL '2 days'
),
(
  'MEETING_INGESTED',
  'MeetingIngestionAgent',
  'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  '{"title": "Customer Success Review", "transcript_length": 1523}',
  NOW() - INTERVAL '1 day'
);
