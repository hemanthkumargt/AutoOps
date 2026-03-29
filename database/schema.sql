-- =============================================================================
-- AutoOps AI — PostgreSQL Schema
-- =============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- TABLE: meetings
-- =============================================================================

CREATE TABLE IF NOT EXISTS meetings (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  title       VARCHAR(500) NOT NULL,
  transcript  TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- TABLE: tasks
-- =============================================================================

CREATE TABLE IF NOT EXISTS tasks (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id  UUID         NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  title       VARCHAR(500) NOT NULL,
  owner       VARCHAR(255) NOT NULL,
  owner_email VARCHAR(255),
  deadline    TIMESTAMPTZ  NOT NULL,
  priority    VARCHAR(20)  NOT NULL
                CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status      VARCHAR(20)  NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'in_progress', 'completed', 'overdue')),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- TABLE: audit_logs
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  action      VARCHAR(255) NOT NULL,
  agent       VARCHAR(100) NOT NULL,
  task_id     UUID         REFERENCES tasks(id)    ON DELETE SET NULL,
  meeting_id  UUID         REFERENCES meetings(id) ON DELETE SET NULL,
  details     JSONB,
  timestamp   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- tasks indexes
CREATE INDEX IF NOT EXISTS idx_tasks_meeting_id ON tasks(meeting_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status     ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline   ON tasks(deadline);
CREATE INDEX IF NOT EXISTS idx_tasks_owner      ON tasks(owner);
CREATE INDEX IF NOT EXISTS idx_tasks_priority   ON tasks(priority);

-- Composite index for overdue queries
CREATE INDEX IF NOT EXISTS idx_tasks_overdue
  ON tasks(deadline, status)
  WHERE status NOT IN ('completed');

-- audit_logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_agent     ON audit_logs(agent);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_task_id   ON audit_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_audit_action    ON audit_logs(action);

-- =============================================================================
-- TRIGGER: auto-update tasks.updated_at on every UPDATE
-- =============================================================================

CREATE OR REPLACE FUNCTION update_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks;
CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_tasks_updated_at();

-- =============================================================================
-- TRIGGER: auto-mark tasks as 'overdue' when deadline passes
-- =============================================================================

CREATE OR REPLACE FUNCTION check_task_overdue()
RETURNS TRIGGER AS $$
BEGIN
  -- On insert or update, if deadline has passed and task is not done, mark overdue
  IF NEW.deadline < NOW() AND NEW.status NOT IN ('completed', 'overdue') THEN
    NEW.status = 'overdue';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tasks_overdue ON tasks;
CREATE TRIGGER trg_tasks_overdue
  BEFORE INSERT OR UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION check_task_overdue();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE meetings    IS 'Stores meeting metadata and full transcripts';
COMMENT ON TABLE tasks       IS 'AI-extracted action items from meetings';
COMMENT ON TABLE audit_logs  IS 'Immutable audit trail of all agent actions';
