import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHandle, resolveSecrets } from "../secrets.js";

const BOOT = { INFISICAL_RESOLVER_ENABLED: "true", INFISICAL_APP_CLIENT_ID: "cid", INFISICAL_APP_CLIENT_SECRET: "csec", INFISICAL_PROJECT_ID: "ws1" };
const HANDLE = "secret://eiaaw-all-projects/prod/RESEND_API_KEY";

function fakeInfisical({ value = "re_resolved", getStatus = 200 } = {}) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET", headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : null });
    if (String(url).endsWith("/api/v1/auth/universal-auth/login")) return Response.json({ accessToken: "tok", expiresIn: 3600 });
    if (getStatus !== 200) return new Response("{}", { status: getStatus });
    return Response.json({ secret: { secretValue: value } });
  };
  fn.calls = calls;
  return fn;
}
const quietLog = () => { const lines = []; return { lines, warn: (...a) => lines.push(a.join(" ")), error: (...a) => lines.push(a.join(" ")), log: (...a) => lines.push(a.join(" ")) }; };

test("parseHandle follows the house handle format", () => {
  assert.deepEqual(parseHandle(HANDLE), { project: "eiaaw-all-projects", environment: "prod", path: "/", name: "RESEND_API_KEY" });
  assert.equal(parseHandle("secret://p/prod/mail/RESEND_API_KEY").path, "/mail");
  assert.equal(parseHandle("secret://p/RESEND_API_KEY"), null);
  assert.equal(parseHandle("re_raw_value"), null);
});

test("disabled resolver leaves env untouched and makes no network call", async () => {
  const env = { RESEND_API_KEY: HANDLE };
  const f = fakeInfisical();
  await resolveSecrets(env, { fetchImpl: f, log: quietLog() });
  assert.equal(env.RESEND_API_KEY, HANDLE);
  assert.equal(f.calls.length, 0);
});

test("enabled but bootstrap creds incomplete → untouched", async () => {
  const env = { ...BOOT, INFISICAL_APP_CLIENT_SECRET: "", RESEND_API_KEY: HANDLE };
  const f = fakeInfisical();
  await resolveSecrets(env, { fetchImpl: f, log: quietLog() });
  assert.equal(env.RESEND_API_KEY, HANDLE);
  assert.equal(f.calls.length, 0);
});

test("resolves allow-listed handles only; raw values and unlisted vars are untouched", async () => {
  const env = { ...BOOT, RESEND_API_KEY: HANDLE, ANTHROPIC_API_KEY: "raw-value", SOMETHING_ELSE: "secret://p/prod/SOMETHING_ELSE" };
  const f = fakeInfisical();
  const r = await resolveSecrets(env, { fetchImpl: f, log: quietLog() });
  assert.deepEqual(r, { resolved: ["RESEND_API_KEY"], failed: [] });
  assert.equal(env.RESEND_API_KEY, "re_resolved");
  assert.equal(env.ANTHROPIC_API_KEY, "raw-value");
  assert.equal(env.SOMETHING_ELSE, "secret://p/prod/SOMETHING_ELSE");
  assert.equal(f.calls[0].url, "https://app.infisical.com/api/v1/auth/universal-auth/login");
  assert.deepEqual(f.calls[0].body, { clientId: "cid", clientSecret: "csec" });
  const get = new URL(f.calls[1].url);
  assert.equal(get.pathname, "/api/v3/secrets/raw/RESEND_API_KEY");
  assert.deepEqual(Object.fromEntries(get.searchParams), { workspaceId: "ws1", environment: "prod", secretPath: "/" });
  assert.equal(f.calls[1].headers.authorization, "Bearer tok");
});

test("a failed lookup leaves the handle in place (fail-open) and never logs a value", async () => {
  const env = { ...BOOT, RESEND_API_KEY: HANDLE };
  const log = quietLog();
  const r = await resolveSecrets(env, { fetchImpl: fakeInfisical({ getStatus: 404 }), log });
  assert.deepEqual(r, { resolved: [], failed: ["RESEND_API_KEY"] });
  assert.equal(env.RESEND_API_KEY, HANDLE);
  assert.ok(log.lines.some((l) => l.includes("RESEND_API_KEY")));
  assert.ok(!log.lines.some((l) => l.includes("csec")));
});
