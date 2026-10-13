# Deployment

Recommended topology:

```
Citizens ──WhatsApp──► Meta Cloud API ──HTTPS webhook──┐
                                                         ▼
Browser ──► Vercel (web/dist, static) ──/api, /webhooks rewrite──► Node API (Render / Railway / Fly.io / ECS)
                                                                        │
                                              MongoDB Atlas ◄───────────┤
                                              Private object storage ◄──┘   (see "Attachments")
```

Serving the web app and proxying `/api/*` and `/webhooks/*` through the same origin (Vercel rewrites) keeps the session cookie first-party (`SameSite=Lax`, `HttpOnly`, `Secure`) and avoids CORS and CSRF complications.

## 1. Database

Use a MongoDB Atlas cluster configured as a replica set, with backups enabled.

```bash
# from the repository root, with DATABASE_URL pointing at the target database
npm ci
npm run db:deploy          # syncs the Prisma schema to MongoDB
```

Never run `db:reset` against a shared or production database. Do **not** run `db:seed` in production: it deletes and recreates the two demo workspaces and creates accounts with a published password. Create real workspaces through the Platform Administrator screen instead.

## 2. API (Node.js)

Any host that runs Node ≥ 20.19 works. Build and start:

```bash
npm ci --include=dev && npm run build  # prisma generate + tsc → server/dist
npm run start                  # node server/dist/src/index.js  (listens on $PORT)
```

Health check: `GET /health`.

Required environment (see `server/.env.example`):

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` (turns on `Secure` cookies, hides demo-login hints, quiet logs) |
| `DATABASE_URL` | MongoDB Atlas URI ending in `/constituencyos` |
| `JWT_SECRET` | ≥ 32 random bytes, unique per environment |
| `WEB_ORIGIN`, `PUBLIC_WEB_URL` | your Vercel URL(s) |
| `SIMULATOR_ENABLED` | `true` for a public demo; `false` for live case management |
| `DEMO_LOGIN_HINTS` | `true` only for an intentional public demo; reveals the shared read-only sample login |
| `AI_PROVIDER` | `openai-compatible` |
| `OPENAI_API_KEY` | OpenAI project API key, stored as a Render secret |
| `OPENAI_COMPAT_BASE_URL` | `https://api.openai.com/v1` |
| `OPENAI_COMPAT_MODEL` | `gpt-4.1-mini` |
| `WHATSAPP_*`, `STT_*` | see the setup guides |
| `STORAGE_DIR` | persistent volume path (until object storage is wired — see below) |

The public simulator stores simulated conversations and any filed grievances in the configured database. Keep it disabled for live case-management deployments; enable it only when the database is dedicated to a demo. `DEMO_LOGIN_HINTS=true` publicly reveals the shared demo password and enables one-click prefill for the read-only MLA sample account only; never use real citizen data or expose privileged shared accounts.

Run **one** API instance unless you have addressed the single-instance items in [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) (in-memory per-conversation lock, rate limiter and webhook work queue).

Put the API behind HTTPS (the platform's load balancer). `trust proxy` is set to 1 so client IPs and secure-cookie detection work behind one proxy hop.

## 3. Web (Vercel)

1. Import the repository, set **Root Directory** to `web`, framework **Vite**, build command `npm run build`, output `dist`.
2. Edit `web/vercel.json`: replace `https://YOUR-API-HOST.example.com` with your API's public URL in the `/api` and `/webhooks` rewrites. (You can instead point Meta's webhook directly at the API host.)
3. Deploy. All SPA routes fall back to `index.html`.

Optional: `VITE_API_PROXY` only affects the local dev proxy (`web/.env.example`).

### Render Blueprint

The repository includes `render.yaml`. Create a Render Blueprint from the repository,
then enter the secret values for `DATABASE_URL`, `WEB_ORIGIN`, `PUBLIC_WEB_URL`, and
`OPENAI_API_KEY`. Set `WEB_ORIGIN` and `PUBLIC_WEB_URL` to the final Vercel URL, then
replace `YOUR-API-HOST.example.com` in `web/vercel.json` with the Render API URL before
deploying Vercel.

## 4. Attachments (private object storage)

`server/src/services/storage.ts` writes to local disk with random names, file mode 0600, outside any public path; files are only served by authenticated, tenant-scoped routes. For production:

- **Minimum**: mount a persistent, encrypted volume at `STORAGE_DIR` and back it up with the database.
- **Recommended**: implement the same three functions (`putObject`, `readObject`, `removeObject`) against S3/GCS/R2 with a *private* bucket, server-side encryption, and no public ACLs; keep serving through the API (or short-lived signed URLs). Add malware scanning on upload.

## 5. First platform administrator

```bash
# generate a bcrypt hash
node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 12))" '<a strong password>'
# insert the account (psql)
INSERT INTO "User" (id, email, name, "passwordHash", role, active, "createdAt", "updatedAt")
VALUES ('platform-admin-1', 'you@example.org', 'Platform Administrator', '<hash>', 'PLATFORM_ADMIN', true, now(), now());
```

Sign in at `/login`, open **MLA Workspaces → Onboard workspace**. The workspace is created with default teams/categories; the temporary password for its first office administrator is displayed once.

## 6. Go-live sequence

1. Deploy DB → API → web; verify `/health` and sign-in.
2. Create the workspace; set office profile, SLA rules and privacy settings.
3. Have a native speaker review the Telugu bot text and guidance entries; **verify each guidance entry against its official source** and mark it verified.
4. Connect WhatsApp ([WHATSAPP_SETUP.md](WHATSAPP_SETUP.md)); run its production checklist with a real handset.
5. Optionally connect an AI provider ([AI_PROVIDER_SETUP.md](AI_PROVIDER_SETUP.md)).
6. Train staff; walk through role boundaries (MLA read-only, field officers own cases only).
7. Publish the privacy notice URL (`/privacy/<workspace-slug>`) in the WhatsApp business profile.

## 7. Backup and recovery

- **MongoDB Atlas**: enable automated backups and point-in-time recovery where your Atlas tier supports it. Test a restore into a scratch database quarterly, run `npm run db:deploy`, then sign in and spot-check.
- **Attachments**: back up the volume/bucket alongside the database; restore both to the same point in time.
- **Secrets**: keep `JWT_SECRET`, WhatsApp tokens and AI keys in the platform's secret manager; rotating `JWT_SECRET` signs everyone out (acceptable, immediate).
- **Recovery objectives** to agree with the office: RPO (acceptable data loss, e.g. ≤ 15 min with PITR) and RTO (e.g. ≤ 4 h).

## 8. Data retention and deletion

- *Citizen Records → Erase data* removes name, phone, chat history, files and complaint text for one citizen (right to erasure), keeping anonymous counts.
- *Data retention* (same page) anonymises citizens whose cases are all closed and older than the workspace's retention period. It is manual and audited; schedule it monthly via your platform's cron calling an admin session, or add a scheduled job (see limitations).
- Webhook payload records (`WebhookEvent`) contain message content — prune them (e.g. > 30 days) with a scheduled SQL job.
