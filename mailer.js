// Enquiry notification email via Resend.
// Every enquiry goes to the admin inbox. If Resend rejects the branded sender (403, e.g. its domain
// is not verified), the email is re-sent from Resend's shared sender, which only delivers to the
// Resend account owner, so that copy goes to the admin inbox alone.
import { HOUSE, FORM_FIELDS } from "./public/facts.js";

export const ADMIN_EMAIL = "eiaawsolutions@gmail.com";
export const FALLBACK_FROM = "Rhythm Avenue Enquiries <onboarding@resend.dev>";
const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 15000;

export function recipients(env = process.env) {
  const extra = String(env.NOTIFY_EMAIL || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return [...new Set([ADMIN_EMAIL, ...extra])];
}

const esc = (v) => String(v).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const myt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
});

export function buildEnquiryEmail({ id, fields, submittedAt }) {
  const rows = FORM_FIELDS.map((f) => [f.label, fields[f.id] ?? ""]);
  const waDigits = String(fields.phone).replace(/\D/g, "").replace(/^0/, "60");
  const submitted = `${myt.format(new Date(submittedAt))} MYT`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px">
    <h2 style="margin:0 0 4px">New rental enquiry</h2>
    <p style="margin:0 0 16px;color:#555">${esc(HOUSE.title)} · RM ${HOUSE.rent.toLocaleString("en-MY")}/month · submitted ${esc(submitted)}</p>
    <table cellpadding="8" style="border-collapse:collapse;width:100%;font-size:14px">
      ${rows.map(([k, v]) => `<tr><td style="border-bottom:1px solid #eee;color:#555;width:45%">${esc(k)}</td><td style="border-bottom:1px solid #eee"><b>${esc(v)}</b></td></tr>`).join("")}
    </table>
    <p style="margin:20px 0"><a href="https://wa.me/${waDigits}" style="background:#25d366;color:#062b14;padding:12px 18px;border-radius:24px;text-decoration:none;font-weight:bold">Reply on WhatsApp</a></p>
    <p style="color:#888;font-size:12px">Ref ${esc(id)}. The applicant consented to the collection of these details under PDPA 2010, for this tenancy only.</p></div>`;
  const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n")
    + `\n\nSubmitted: ${submitted}\nWhatsApp: https://wa.me/${waDigits}\nRef: ${id}`;
  return { subject: `New enquiry: ${fields.name} – ${HOUSE.title} (move-in ${fields.moveIn})`, html, text };
}

async function post(fetchImpl, apiKey, idempotencyKey, payload) {
  const res = await fetchImpl(RESEND_URL, {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}`, "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(payload),
  });
  const raw = await res.text();
  let body = {};
  try { body = JSON.parse(raw); } catch { /* non-JSON error page */ }
  return { ok: res.ok, status: res.status, id: body.id, error: (body.message || raw).slice(0, 200) };
}

/** Sends one enquiry. Resolves { emailId, via: "primary" | "fallback" }; throws when nothing was sent. */
export async function sendEnquiryEmail({ id, fields, submittedAt, attempt = 1 }, { env = process.env, fetchImpl = fetch } = {}) {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY not set");
  const msg = buildEnquiryEmail({ id, fields, submittedAt });
  const from = env.EMAIL_FROM || FALLBACK_FROM;
  const to = recipients(env);

  const primary = await post(fetchImpl, env.RESEND_API_KEY, `${id}-${attempt}`, { from, to, ...msg });
  if (primary.ok) return { emailId: primary.id, via: "primary" };

  const fallbackWouldDiffer = !(from === FALLBACK_FROM && to.length === 1 && to[0] === ADMIN_EMAIL);
  if (primary.status !== 403 || !fallbackWouldDiffer) throw new Error(`resend ${primary.status}: ${primary.error}`);

  const fb = await post(fetchImpl, env.RESEND_API_KEY, `${id}-${attempt}-fallback`, { from: FALLBACK_FROM, to: [ADMIN_EMAIL], ...msg });
  if (fb.ok) return { emailId: fb.id, via: "fallback", primaryError: primary.error };
  throw new Error(`resend 403: ${primary.error}; fallback ${fb.status}: ${fb.error}`);
}
