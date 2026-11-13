import { test } from "node:test";
import assert from "node:assert/strict";
import { ADMIN_EMAIL, FALLBACK_FROM, recipients, buildEnquiryEmail, sendEnquiryEmail } from "../mailer.js";

const FIELDS = {
  name: "Aisyah <b>", nationality: "Malaysian", race: "Malay", religion: "Islam", occupants: "2",
  relation: "Couple", occupation: "Engineer", pets: "No", duration: "1 year", moveIn: "2026-12-01",
  budget: "RM1,400", phone: "012-345 6789",
};

// Records each Resend call and replays canned responses in order.
function fakeFetch(...responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    const r = responses.shift() ?? { status: 500, body: { message: "unexpected extra call" } };
    return new Response(JSON.stringify(r.body), { status: r.status });
  };
  fn.calls = calls;
  return fn;
}
const enquiry = (over = {}) => ({ id: "abc", fields: FIELDS, submittedAt: new Date("2026-10-27T11:06:50Z"), attempt: 1, ...over });

test("admin inbox is eiaawsolutions@gmail.com", () => {
  assert.equal(ADMIN_EMAIL, "eiaawsolutions@gmail.com");
});

test("recipients always include the admin inbox first, trimmed and deduped", () => {
  assert.deepEqual(recipients({}), [ADMIN_EMAIL]);
  assert.deepEqual(recipients({ NOTIFY_EMAIL: " owner@x.com, EIAAWSolutions@gmail.com ,," }), [ADMIN_EMAIL, "owner@x.com"]);
});

test("email escapes applicant input and carries ref, submitted time (MYT) and WhatsApp link", () => {
  const m = buildEnquiryEmail(enquiry());
  assert.match(m.subject, /^New enquiry: Aisyah <b> – .+ \(move-in 2026-12-01\)$/);
  assert.ok(m.html.includes("Aisyah &lt;b&gt;"));
  assert.ok(!m.html.includes("Aisyah <b>"));
  assert.match(m.text, /Submitted: 27 Oct 2026, 7:06 pm MYT/);
  assert.match(m.text, /wa\.me\/60123456789/);
  assert.match(m.text, /Ref: abc/);
});

test("sends from EMAIL_FROM to every recipient with auth and a per-attempt idempotency key", async () => {
  const f = fakeFetch({ status: 200, body: { id: "re_1" } });
  const env = { RESEND_API_KEY: "k", EMAIL_FROM: "RA <rent@eiaawsolutions.com>", NOTIFY_EMAIL: "owner@x.com" };
  const r = await sendEnquiryEmail(enquiry({ attempt: 2 }), { env, fetchImpl: f });
  assert.deepEqual(r, { emailId: "re_1", via: "primary" });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, "https://api.resend.com/emails");
  assert.equal(f.calls[0].headers.authorization, "Bearer k");
  assert.equal(f.calls[0].headers["Idempotency-Key"], "abc-2");
  assert.equal(f.calls[0].body.from, env.EMAIL_FROM);
  assert.deepEqual(f.calls[0].body.to, [ADMIN_EMAIL, "owner@x.com"]);
});

test("403 (unverified sender domain) falls back to Resend's shared sender, admin inbox only", async () => {
  const f = fakeFetch(
    { status: 403, body: { message: "The eiaawsolutions.com domain is not verified." } },
    { status: 200, body: { id: "re_2" } },
  );
  const env = { RESEND_API_KEY: "k", EMAIL_FROM: "RA <rent@eiaawsolutions.com>", NOTIFY_EMAIL: "owner@x.com" };
  const r = await sendEnquiryEmail(enquiry(), { env, fetchImpl: f });
  assert.equal(r.via, "fallback");
  assert.equal(r.emailId, "re_2");
  assert.match(r.primaryError, /domain is not verified/);
  assert.equal(f.calls[1].body.from, FALLBACK_FROM);
  assert.deepEqual(f.calls[1].body.to, [ADMIN_EMAIL]);
  assert.equal(f.calls[1].headers["Idempotency-Key"], "abc-1-fallback");
});

test("non-403 failures throw without a fallback so the forwarder retries later", async () => {
  const f = fakeFetch({ status: 500, body: { message: "boom" } });
  await assert.rejects(sendEnquiryEmail(enquiry(), { env: { RESEND_API_KEY: "k", EMAIL_FROM: "a@b.com" }, fetchImpl: f }), /resend 500/);
  assert.equal(f.calls.length, 1);
});

test("both senders rejected → error reports both", async () => {
  const f = fakeFetch(
    { status: 403, body: { message: "domain is not verified" } },
    { status: 403, body: { message: "You can only send testing emails to your own email address" } },
  );
  await assert.rejects(
    sendEnquiryEmail(enquiry(), { env: { RESEND_API_KEY: "k", EMAIL_FROM: "a@eiaawsolutions.com" }, fetchImpl: f }),
    /domain is not verified.*fallback 403.*own email address/,
  );
});

test("already on the shared sender to the admin only → no pointless second attempt", async () => {
  const f = fakeFetch({ status: 403, body: { message: "nope" } });
  await assert.rejects(sendEnquiryEmail(enquiry(), { env: { RESEND_API_KEY: "k" }, fetchImpl: f }), /resend 403/);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].body.from, FALLBACK_FROM);
});

test("a key from someone else's Resend account is reported as RESEND_WRONG_ACCOUNT", async () => {
  const f = fakeFetch(
    { status: 403, body: { message: "The eiaawsolutions.com domain is not verified." } },
    { status: 403, body: { message: "You can only send testing emails to your own email address (admin@nurengroup.com). To send emails to other recipients, please verify a domain" } },
  );
  await assert.rejects(
    sendEnquiryEmail(enquiry(), { env: { RESEND_API_KEY: "k", EMAIL_FROM: "a@eiaawsolutions.com" }, fetchImpl: f }),
    (e) => e.code === "RESEND_WRONG_ACCOUNT" && e.owner === "admin@nurengroup.com",
  );
});

test("wrong account is detected on the first try when already on the shared sender", async () => {
  const f = fakeFetch({ status: 403, body: { message: "You can only send testing emails to your own email address (Admin@NurenGroup.com)." } });
  await assert.rejects(
    sendEnquiryEmail(enquiry(), { env: { RESEND_API_KEY: "k" }, fetchImpl: f }),
    (e) => e.code === "RESEND_WRONG_ACCOUNT" && e.owner === "admin@nurengroup.com",
  );
  assert.equal(f.calls.length, 1);
});

test("own-address 403 naming the admin inbox is not a wrong-account error", async () => {
  const f = fakeFetch(
    { status: 403, body: { message: `You can only send testing emails to your own email address (${ADMIN_EMAIL}).` } },
    { status: 200, body: { id: "re_3" } },
  );
  const r = await sendEnquiryEmail(enquiry(), { env: { RESEND_API_KEY: "k", NOTIFY_EMAIL: "owner@x.com" }, fetchImpl: f });
  assert.equal(r.via, "fallback");
});

test("missing API key throws before any network call", async () => {
  const f = fakeFetch();
  await assert.rejects(sendEnquiryEmail(enquiry(), { env: {}, fetchImpl: f }), /RESEND_API_KEY not set/);
  assert.equal(f.calls.length, 0);
});
