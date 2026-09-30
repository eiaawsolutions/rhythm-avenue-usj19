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
   | `NOTIFY_WEBHOOK_URL` / `NOTIFY_WEBHOOK_SECRET` | optional: an n8n webhook that alerts you on each enquiry |
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
```
