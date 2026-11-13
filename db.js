// Database schema. Idempotent: runs on every boot, safe against the table production already has.
export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS enquiries (
    id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(),
    name text NOT NULL, nationality text NOT NULL, race text NOT NULL, religion text NOT NULL,
    occupants int NOT NULL, relation text NOT NULL, occupation text NOT NULL, pets text NOT NULL,
    duration text NOT NULL, move_in text NOT NULL, budget text NOT NULL, phone text NOT NULL,
    consent_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'new');
  CREATE INDEX IF NOT EXISTS idx_enquiries_created ON enquiries (created_at);

  -- Email outbox: a row is pending until emailed_at is set. Rows that existed before these
  -- columns were added start pending, so they are forwarded once on the next boot.
  ALTER TABLE enquiries
    ADD COLUMN IF NOT EXISTS emailed_at timestamptz,
    ADD COLUMN IF NOT EXISTS email_id text,
    ADD COLUMN IF NOT EXISTS email_attempts int NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS email_last_try timestamptz,
    ADD COLUMN IF NOT EXISTS email_error text;
  CREATE INDEX IF NOT EXISTS idx_enquiries_unsent ON enquiries (created_at) WHERE emailed_at IS NULL;

  CREATE TABLE IF NOT EXISTS rate_limits (k text PRIMARY KEY, n int NOT NULL, day date NOT NULL DEFAULT current_date);
  DELETE FROM rate_limits WHERE day < current_date - 1;`;
