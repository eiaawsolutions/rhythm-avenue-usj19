// Integration test for the outbox SQL against a real Postgres.
// Runs only when TEST_DATABASE_URL is set (e.g. a throwaway `docker run postgres:18-alpine`). It DROPS the tables.
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { SCHEMA_SQL } from "../db.js";
import { createForwarder, CLAIM_SQL, MARK_SENT_SQL, MARK_FAILED_SQL } from "../outbox.js";

const url = process.env.TEST_DATABASE_URL;
const silent = { log() {}, error() {} };

// The table exactly as production created it before the outbox columns existed.
const LEGACY_SCHEMA = `
  CREATE TABLE enquiries (
    id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(),
    name text NOT NULL, nationality text NOT NULL, race text NOT NULL, religion text NOT NULL,
    occupants int NOT NULL, relation text NOT NULL, occupation text NOT NULL, pets text NOT NULL,
    duration text NOT NULL, move_in text NOT NULL, budget text NOT NULL, phone text NOT NULL,
    consent_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'new');`;
const insert = (db, id, createdAt = "now()") => db.query(
  `INSERT INTO enquiries (id,created_at,name,nationality,race,religion,occupants,relation,occupation,pets,duration,move_in,budget,phone,consent_at)
   VALUES ($1, ${createdAt}, 'N','Malaysian','R','Rel',1,'Couple','O','No','1 year','2026-12-01','RM1','0123456789',now())`, [id]);
const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003"];

test("outbox SQL on real Postgres", { skip: !url && "TEST_DATABASE_URL not set" }, async (t) => {
  const db = new pg.Pool({ connectionString: url });
  t.after(() => db.end());
  await db.query("DROP TABLE IF EXISTS enquiries; DROP TABLE IF EXISTS rate_limits;");
  await db.query(LEGACY_SCHEMA);
  await insert(db, ids[0], "now() - interval '17 days'"); // the enquiry stuck before this fix

  await t.test("migration is idempotent and back-fills existing rows as pending", async () => {
    await db.query(SCHEMA_SQL);
    await db.query(SCHEMA_SQL);
    const { rows } = await db.query("SELECT emailed_at, email_attempts, email_last_try FROM enquiries WHERE id = $1", [ids[0]]);
    assert.deepEqual(rows[0], { emailed_at: null, email_attempts: 0, email_last_try: null });
  });

  await t.test("claim takes the oldest pending row and backs off after a failure", async () => {
    let { rows } = await db.query(CLAIM_SQL);
    assert.equal(rows[0].id, ids[0]);
    assert.equal(rows[0].email_attempts, 1);
    assert.equal(rows[0].move_in, "2026-12-01");
    await db.query(MARK_FAILED_SQL, [ids[0], "resend 403: nope"]);
    ({ rows } = await db.query(CLAIM_SQL));
    assert.equal(rows.length, 0, "a just-failed row must wait for its backoff");
    await db.query("UPDATE enquiries SET email_last_try = now() - interval '6 minutes' WHERE id = $1", [ids[0]]);
    ({ rows } = await db.query(CLAIM_SQL));
    assert.equal(rows[0]?.id, ids[0], "eligible again once the backoff has passed");
    assert.equal(rows[0].email_attempts, 2);
  });

  await t.test("a sent row is never claimed again", async () => {
    await db.query(MARK_SENT_SQL, [ids[0], "re_1"]);
    await db.query("UPDATE enquiries SET email_last_try = now() - interval '1 day' WHERE id = $1", [ids[0]]);
    const { rows } = await db.query(CLAIM_SQL);
    assert.equal(rows.length, 0);
    const { rows: [r] } = await db.query("SELECT email_id, email_error, emailed_at IS NOT NULL AS sent FROM enquiries WHERE id = $1", [ids[0]]);
    assert.deepEqual(r, { email_id: "re_1", email_error: null, sent: true });
  });

  await t.test("concurrent claims never hand out the same row", async () => {
    await insert(db, ids[1]);
    await insert(db, ids[2]);
    const [a, b] = await Promise.all([db.query(CLAIM_SQL), db.query(CLAIM_SQL)]);
    const got = [a.rows[0]?.id, b.rows[0]?.id].filter(Boolean);
    assert.equal(new Set(got).size, got.length);
  });

  await t.test("forwarder end-to-end marks everything pending as emailed", async () => {
    await db.query("UPDATE enquiries SET emailed_at = NULL, email_last_try = NULL");
    const sent = [];
    const forward = createForwarder({ db, send: async (row) => { sent.push(row.id); return { emailId: `re_${row.id.slice(-1)}`, via: "primary" }; }, log: silent, sleep: async () => {} });
    assert.deepEqual(await forward(), { sent: 3, failed: 0 });
    assert.deepEqual(sent, ids, "oldest first");
    const { rows: [c] } = await db.query("SELECT count(*)::int AS n FROM enquiries WHERE emailed_at IS NULL");
    assert.equal(c.n, 0);
  });
});
