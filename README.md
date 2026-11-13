# Rhythm Avenue USJ19 — rental website (Railway)

A one-page rental listing with an AI chat that answers only from the house facts, a photo gallery, an enquiry form in the owners' WhatsApp template, and social sharing (link previews for WhatsApp, Facebook, Telegram and X).

**Stack:** Node 22+ · Hono · Railway Postgres · Anthropic API (Claude Haiku 4.5)
**Files:** `server.js` (web server + API) · `public/` (page, photos, share image) · `public/facts.js` (single source of truth for listing facts)

## Deploy on Railway (EIAAW workspace)
1. Railway → **New Project → Deploy from GitHub repo** → `eiaawsolutions/rhythm-avenue-usj19`
2. In the same project: **+ New → Database → PostgreSQL**
3. Web service → **Variables**:
   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference variable) |
   | `ANTHROPIC_API_KEY` | your key from console.anthropic.com (the chat falls back to built-in answers without it) |
   | `AI_MODEL` | optional, default `claude-haiku-4-5` |
   | `PUBLIC_URL` | optional, e.g. `https://rent.eiaawsolutions.com` once a custom domain is added |
   | `RESEND_API_KEY` | emails each enquiry. Value lives in Infisical; Railway holds the `secret://` handle (see `.env.example`) |
   | `NOTIFY_EMAIL` | optional **extra** recipients, comma-separated. `eiaawsolutions@gmail.com` always receives every enquiry |
   | `EMAIL_FROM` | optional branded sender on a Resend-verified domain, e.g. `Rhythm Avenue <rent@eiaawsolutions.com>`. If Resend rejects it (403, e.g. domain not verified), the email is re-sent from `onboarding@resend.dev` to `eiaawsolutions@gmail.com` only, and the log shows `via=fallback` |
   | `NOTIFY_WEBHOOK_URL` / `NOTIFY_WEBHOOK_SECRET` | optional: an n8n webhook that alerts you on each enquiry |
   | `INFISICAL_RESOLVER_ENABLED`, `INFISICAL_APP_CLIENT_ID`, `INFISICAL_APP_CLIENT_SECRET`, `INFISICAL_PROJECT_ID` | Infisical bootstrap creds (the only raw secrets in Railway). With these set, `secret://` handles in `RESEND_API_KEY`, `ANTHROPIC_API_KEY` and `NOTIFY_WEBHOOK_SECRET` are resolved at boot (`secrets.js`) |
4. Web service → **Settings → Networking → Generate Domain** (or add a custom domain)
5. After it deploys, open `/healthz`. It should return `ok`.

Tables are created automatically on first boot. `railway.json` sets the build (Railpack), start command, health check and restart policy. Share-link previews use whatever domain serves the page (or `PUBLIC_URL`), so no manual URL edits are needed.

## Updating listing facts
Edit `public/facts.js` (WhatsApp number, parking, pets, available date, minimum tenancy, utilities), then commit and push. Railway redeploys automatically. Any value left as `null` shows "Ask owners" on the page, and the AI replies that the owners will confirm.

## Viewing enquiries
Railway → Postgres → **Data** tab → `enquiries`, or run this query:
```sql
SELECT created_at, name, occupation, occupants, move_in, budget, phone, status
FROM enquiries ORDER BY created_at DESC;
```
Tenants also send their details to your WhatsApp in one tap after submitting.

### Enquiry emails (outbox)
The `enquiries` table is the email queue. A row stays pending until `emailed_at` is set. New enquiries are emailed straight away. A failed send is retried with backoff (5 min per attempt, capped at 1 h) and never dropped. Every deploy or restart retries everything still pending at once, ignoring backoff, so fixing a mail setting takes effect straight away.

If the Resend key belongs to someone else's Resend account (Resend names the owner in its 403), sending **pauses** with `email_paused` in the log, so applicant data isn't handed to another account. Enquiries keep queueing and go out on the next deploy once `RESEND_API_KEY` points at EIAAW's account. Check delivery with:
```sql
SELECT created_at, name, emailed_at, email_attempts, email_error FROM enquiries ORDER BY created_at DESC;
```
Logs: `enquiry_emailed <id> via=primary|fallback` on success, and `email_failed <id> attempt=N <reason>` on failure.

## Privacy (PDPA 2010, amended 2024)
- Religion is sensitive personal data, so the form requires an explicit consent tick, and `consent_at` is stored with each enquiry.
- No raw IP addresses are stored; rate limiting uses a daily-salted hash.
- Delete old enquiries periodically, and delete someone's data if they ask:
  `DELETE FROM enquiries WHERE created_at < now() - interval '6 months' AND status IN ('new','rejected');`

## Security
Strict CSP and HSTS, same-origin check on the API, honeypot on the form, rate limits (40 chat messages and 5 enquiries per visitor per day), input length caps, and a prompt-injection-resistant system prompt. The AI has no tools and no data beyond the fact sheet.

## Local development
```bash
npm install
DATABASE_URL=postgres://... ANTHROPIC_API_KEY=... npm run dev   # http://localhost:3000
npm test                                                         # unit tests
docker run -d --rm --name ra-test-pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=ra_test -p 55432:5432 postgres:18-alpine
TEST_DATABASE_URL=postgres://postgres:test@localhost:55432/ra_test npm test   # + outbox SQL against real Postgres (drops tables)
```

## SEO / GEO / AEO
- All listing facts, the neighbourhood guide, the FAQ and BM/Chinese summaries are **rendered on the server** (`seo.js`), so search engines and AI crawlers that don't run JavaScript still read them.
- Structured data (`@graph`): WebSite, WebPage, RealEstateListing + Offer (MYR, monthly), Apartment, ApartmentComplex, FAQPage. Everything is generated from `public/facts.js`.
- `/robots.txt` explicitly allows search and AI crawlers. `/sitemap.xml` includes image entries. `/llms.txt` gives AI assistants a plain-text fact sheet.
- **IndexNow:** on every deploy the server pings Bing/IndexNow (key file at `/<key>.txt`). Google uses the sitemap and Search Console instead.
- The Railway default domain returns a 301 to `PUBLIC_URL`, so there is a single canonical host.
