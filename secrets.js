// EIAAW house secrets pattern for Node: resolves `secret://project/env[/path]/NAME` handles in
// process.env at boot from Infisical. Port of the reference Laravel InfisicalResolver +
// SecretsServiceProvider (All-in-one-business-suite).
// - Inert unless INFISICAL_RESOLVER_ENABLED=true and all three bootstrap creds are set.
// - Only the allow-listed variables below are touched, and only when they hold a handle.
// - Fail-open: an unresolvable handle stays in place and is logged by name (never by value);
//   the integration that needs it then reports its own error.
export const RESOLVABLE = ["RESEND_API_KEY", "ANTHROPIC_API_KEY", "NOTIFY_WEBHOOK_SECRET"];
const TIMEOUT_MS = 5000;

export function parseHandle(handle) {
  const m = /^secret:\/\/([^/]+)\/([^/]+)(\/.*)?\/([A-Z0-9_]+)$/.exec(String(handle));
  return m ? { project: m[1], environment: m[2], path: m[3] || "/", name: m[4] } : null;
}

export async function resolveSecrets(env = process.env, { fetchImpl = fetch, log = console } = {}) {
  const out = { resolved: [], failed: [] };
  if (env.INFISICAL_RESOLVER_ENABLED !== "true") return out;
  const { INFISICAL_APP_CLIENT_ID: clientId, INFISICAL_APP_CLIENT_SECRET: clientSecret, INFISICAL_PROJECT_ID: projectId } = env;
  if (!clientId || !clientSecret || !projectId) {
    log.warn("secrets: Infisical resolver enabled but bootstrap creds incomplete; handles left unresolved");
    return out;
  }
  const pending = RESOLVABLE.filter((k) => String(env[k] || "").startsWith("secret://"));
  if (!pending.length) return out;

  const site = (env.INFISICAL_SITE_URL || "https://app.infisical.com").replace(/\/$/, "");
  let token;
  try {
    const res = await fetchImpl(`${site}/api/v1/auth/universal-auth/login`, {
      method: "POST", signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret }),
    });
    token = res.ok ? (await res.json()).accessToken : null;
    if (!token) throw new Error(`login ${res.status}`);
  } catch (e) {
    log.error("secrets: Infisical login failed:", e?.message || e);
    out.failed.push(...pending);
    return out;
  }

  for (const key of pending) {
    const h = parseHandle(env[key]);
    try {
      if (!h) throw new Error("malformed handle");
      const q = new URLSearchParams({ workspaceId: projectId, environment: h.environment, secretPath: h.path });
      const res = await fetchImpl(`${site}/api/v3/secrets/raw/${encodeURIComponent(h.name)}?${q}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS), headers: { authorization: `Bearer ${token}` },
      });
      const value = res.ok ? (await res.json())?.secret?.secretValue : null;
      if (typeof value !== "string") throw new Error(`lookup ${res.status}`);
      env[key] = value;
      out.resolved.push(key);
    } catch (e) {
      log.error(`secrets: could not resolve ${key}; handle left in place:`, e?.message || e);
      out.failed.push(key);
    }
  }
  return out;
}
