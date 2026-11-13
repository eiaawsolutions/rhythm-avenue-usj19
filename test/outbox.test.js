import { test } from "node:test";
import assert from "node:assert/strict";
import { createForwarder, rowToFields, CLAIM_SQL, MARK_SENT_SQL, MARK_FAILED_SQL, RUN_START_SQL } from "../outbox.js";

const silent = { log() {}, error() {} };
const noSleep = async () => {};
const DB_NOW = new Date("2026-11-13T08:40:00Z");

// Minimal stand-in for pg.Pool: CLAIM_SQL hands out queued rows; every other statement is recorded.
function fakeDb(rows) {
  const queue = [...rows];
  const writes = [];
  const claims = [];
  return {
    writes, claims, queue,
    async query(sql, params) {
      if (sql === RUN_START_SQL) return { rows: [{ t: DB_NOW }] };
      if (sql === CLAIM_SQL) { claims.push(params); return { rows: queue.length ? [queue.shift()] : [] }; }
      writes.push({ sql, params });
      return { rows: [] };
    },
  };
}

test("a normal run respects backoff; a retryAll run passes the DB's own start time as cutoff", async () => {
  const db = fakeDb([]);
  const forward = createForwarder({ db, send: async () => ({}), log: silent, sleep: noSleep });
  await forward();
  await forward({ retryAll: true });
  assert.deepEqual(db.claims, [[null], [DB_NOW]]);
});

test("a key from the wrong Resend account pauses all sending in this process", async () => {
  const db = fakeDb([{ id: "a" }, { id: "b" }]);
  const wrong = Object.assign(new Error("RESEND_API_KEY belongs to the Resend account of x@y.com"), { code: "RESEND_WRONG_ACCOUNT" });
  let sends = 0;
  const forward = createForwarder({ db, send: async () => { sends++; throw wrong; }, log: silent, sleep: noSleep });
  const r = await forward();
  assert.equal(r.sent, 0);
  assert.equal(r.failed, 1);
  assert.match(r.paused, /wrong|belongs to/i);
  assert.deepEqual(await forward(), { paused: r.paused });
  assert.equal(sends, 1, "no further enquiry data is sent to the wrong account");
  assert.equal(db.queue.length, 1, "row b stays pending for after the key is fixed");
});

test("forwards every pending row and records success and failure separately", async () => {
  const db = fakeDb([{ id: "a" }, { id: "b" }]);
  const send = async (row) => {
    if (row.id === "b") throw new Error("resend 500: boom");
    return { emailId: "re_a", via: "primary" };
  };
  const r = await createForwarder({ db, send, log: silent, sleep: noSleep })();
  assert.deepEqual(r, { sent: 1, failed: 1 });
  assert.deepEqual(db.writes, [
    { sql: MARK_SENT_SQL, params: ["a", "re_a"] },
    { sql: MARK_FAILED_SQL, params: ["b", "resend 500: boom"] },
  ]);
});

test("an overlapping run is skipped instead of racing the first", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const db = fakeDb([{ id: "a" }]);
  const forward = createForwarder({ db, send: async () => { await gate; return { emailId: "x", via: "primary" }; }, log: silent, sleep: noSleep });
  const first = forward();
  assert.deepEqual(await forward(), { skipped: true });
  release();
  assert.deepEqual(await first, { sent: 1, failed: 0 });
  assert.deepEqual(await forward(), { sent: 0, failed: 0 }); // guard released after the run
});

test("caps the number of rows handled per run", async () => {
  const db = fakeDb([{ id: "a" }, { id: "b" }, { id: "c" }]);
  const r = await createForwarder({ db, send: async () => ({ emailId: "x", via: "primary" }), log: silent, sleep: noSleep, maxPerRun: 2 })();
  assert.deepEqual(r, { sent: 2, failed: 0 });
});

test("rowToFields maps DB columns back to form field ids as strings", () => {
  const f = rowToFields({
    name: "N", nationality: "Malaysian", race: "R", religion: "Rel", occupants: 2, relation: "Couple",
    occupation: "O", pets: "No", duration: "1 year", move_in: "2026-12-01", budget: "RM1", phone: "0123456789",
  });
  assert.equal(f.moveIn, "2026-12-01");
  assert.equal(f.occupants, "2");
  assert.equal(f.phone, "0123456789");
});
