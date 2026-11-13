// Enquiry email outbox. The enquiries table is the queue: a row is pending until emailed_at is set.
// Failed sends back off 5 min per attempt (capped at 1 h) and keep retrying, so no lead is dropped.
import { FORM_FIELDS } from "./public/facts.js";

// Atomically claims the oldest pending row that is due. SKIP LOCKED + bumping email_last_try means
// two overlapping runs (or two instances during a deploy) never send the same row twice at once.
export const CLAIM_SQL = `
  UPDATE enquiries SET email_attempts = email_attempts + 1, email_last_try = now()
  WHERE id = (
    SELECT id FROM enquiries
    WHERE emailed_at IS NULL
      AND (email_last_try IS NULL OR email_last_try < now() - make_interval(mins => 5 * least(email_attempts, 12)))
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED)
  RETURNING *`;
export const MARK_SENT_SQL = "UPDATE enquiries SET emailed_at = now(), email_id = $2, email_error = NULL WHERE id = $1";
export const MARK_FAILED_SQL = "UPDATE enquiries SET email_error = $2 WHERE id = $1";

const column = (fieldId) => fieldId.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`); // moveIn -> move_in
export const rowToFields = (row) => Object.fromEntries(FORM_FIELDS.map((f) => [f.id, String(row[column(f.id)] ?? "")]));

export function createForwarder({ db, send, log = console, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), maxPerRun = 25, gapMs = 1500 }) {
  let running = false;
  return async function forwardPending() {
    if (running) return { skipped: true };
    running = true;
    let sent = 0, failed = 0;
    try {
      for (let i = 0; i < maxPerRun; i++) {
        const { rows: [row] } = await db.query(CLAIM_SQL);
        if (!row) break;
        try {
          const r = await send(row);
          await db.query(MARK_SENT_SQL, [row.id, r.emailId ?? null]);
          sent++;
          log.log("enquiry_emailed", row.id, `via=${r.via}`, r.primaryError ? `primary_error=${r.primaryError}` : "");
        } catch (e) {
          const msg = String(e?.message || e).slice(0, 300);
          await db.query(MARK_FAILED_SQL, [row.id, msg]);
          failed++;
          log.error("email_failed", row.id, `attempt=${row.email_attempts}`, msg);
        }
        await sleep(gapMs); // stay well under Resend's per-second rate limit
      }
    } finally {
      running = false;
    }
    return { sent, failed };
  };
}
