# Known limitations and production-readiness checklist

This is a credible, working demonstration and a foundation for a production system — **not yet a production system**. Please read this before showing it as anything more than a demo.

## What was verified, and how

| Verified | How |
|---|---|
| Backend workflows, RBAC, tenant isolation, webhook security/idempotency/retries, BSUID handling, erasure | 27 automated tests (`npm test`) against a real PostgreSQL test database; Meta's API is mocked |
| Citizen WhatsApp chat (Telugu), office assignment → phone notification, charts, Ask AI, field-officer list, mobile layout | Exercised manually in a browser during development |
| TypeScript type-checks and production builds of API and web | `npm run typecheck`, `npm run build`; compiled API boots and serves `/health` |

**Not verified / not available in this environment**

- **No live WhatsApp.** The Cloud API client follows Meta's documentation (Graph API v26.0, as read October 2026) but has never talked to Meta. Expect to fix small payload/policy details when you run the checklist in [WHATSAPP_SETUP.md](WHATSAPP_SETUP.md).
- **No live AI calls.** The Claude and OpenAI-compatible providers were written to their SDK/API specs but not run with real keys; the rule-based fallback *is* tested.
- **No speech-to-text.** Integration point only; Telugu accuracy is unknown.
- **No automated browser/UI tests.** The frontend has no unit or end-to-end tests; it was checked by hand. No formal accessibility audit (WCAG) has been done, though contrast, labels, focus rings and keyboard-operable controls were considered.
- **No load or performance testing.**
- **Telugu text** (bot messages, keyword lists, sample complaints) was authored for the demo and **needs review by a native speaker**.
- **Government guidance content is sample text** with real portal links, deliberately shown as *Not verified* until an office admin checks it against the official source. Nothing here is an official statement.

## Architectural limitations

| Area | Limitation | Recommended fix |
|---|---|---|
| Scaling | Per-conversation lock, rate limiter and webhook work queue are **in-process** → run a single API instance | Move to Redis/BullMQ (or Postgres advisory locks + a durable queue) |
| Webhook durability | Events are persisted before processing, but a crash mid-processing is not automatically retried | Add a worker that re-processes `WebhookEvent` rows with `processedAt IS NULL` |
| Attachments | Stored on local disk; no malware scanning | S3/GCS/R2 private bucket + virus scan (see DEPLOYMENT.md) |
| Tenant isolation | Enforced in every application query and covered by tests, but not by Postgres Row-Level Security | Add RLS policies as defence in depth |
| Audit log | Append-only by convention (no update/delete API); not tamper-evident at DB level | DB roles without UPDATE/DELETE, or ship to WORM storage |
| Authentication | Email + password only; no MFA, no self-service password reset, no lockout beyond IP rate-limit; 8-hour session with no server-side revocation list (deactivation is checked every request) | Add an identity provider (OIDC/SSO) with MFA |
| Retention/erasure | Run manually by an admin; backups keep erased data until they expire | Scheduled job; document backup expiry in the privacy notice |
| WhatsApp window | Out-of-window updates need an approved template; none are created for you | Create/approve templates (see setup guide) |
| BSUID / usernames | Implemented from Meta's docs, which say details may change; BSUID-only users can't use the web "track by last 4 digits" page | Re-verify before go-live |
| Duplicate detection | Suggests the most recent open complaint in the same village + category (30 days); token-overlap similarity is only used to rank | Embedding-based similarity if needed |
| Reports | PDF is produced via the browser's *Print → Save as PDF* | Server-side PDF (headless Chromium) if scheduled PDFs are required |
| Maps | Leaflet with OpenStreetMap tiles; fine for demos | Use a tile provider whose terms fit production traffic |
| Dependencies | `npm audit` reports 3 *high* findings, all one chain in the **Prisma CLI** (`prisma → @prisma/config → deepmerge-ts`, stack exhaustion on recursive objects). It is a build/migration-time tool, never loaded by the running API, and npm's suggested "fix" is a downgrade. | Re-check on each Prisma upgrade; keep CLI usage to trusted config. Run `npm audit` in CI. |
| Prisma config | `package.json#prisma` is deprecated and moves to `prisma.config.ts` in Prisma 7 | Migrate when upgrading |
| Localisation | UI chrome is English; Telugu appears in bot messages, user data and selected labels | Full i18n for staff screens if required |

## Product guardrails you must keep

- Do not present the simulator or sample data as live. The UI labels them; keep those labels.
- Do not enable real MLA names, photos, logos or designations without written permission (the platform admin records the authorisation reference).
- Do not use grievance data for political profiling, campaign targeting or unrelated messaging; do not add features that do.
- AI output stays advisory. Keep humans in the loop for status changes, eligibility and communications.

## Production-readiness checklist

**Legal & policy**
- [ ] Written authorisation for any real MLA branding; legal business owner identified for the WhatsApp account
- [ ] Privacy notice reviewed by counsel (data fiscal/processor roles, India's DPDP Act obligations, retention, grievance redressal contact); consent text approved
- [ ] Data-processing terms with hosting, WhatsApp/Meta and any AI provider
- [ ] Decision on data residency; document where data and backups live

**Security**
- [ ] `NODE_ENV=production`, strong unique `JWT_SECRET`, secrets in a secret manager
- [ ] For live case management, keep `SIMULATOR_ENABLED` and `DEMO_LOGIN_HINTS` off and keep demo accounts absent. Public demo shortcuts include platform-administrator and cross-tenant access; isolate the database and use fictional data only.
- [ ] HTTPS everywhere; database SSL; private network between API and DB
- [ ] MFA/SSO for office admins and the MLA; password policy
- [ ] Row-Level Security enabled; DB role for the app has no superuser rights
- [ ] Dependency scanning and updates; container/image scanning
- [ ] Penetration test, including tenant-isolation and file-upload tests
- [ ] Malware scanning for uploads; private bucket with encryption

**Reliability**
- [ ] Managed Postgres with PITR; restore drill completed; RPO/RTO agreed
- [ ] Durable queue/worker for webhook processing; multi-instance safe locks and rate limits
- [ ] Monitoring and alerts (5xx rate, webhook failures, `FAILED`/`NOT_CONFIGURED` message counts, escalation job errors, disk usage)
- [ ] Log aggregation with PII redaction verified
- [ ] Load test at expected peak (e.g. a flood of messages after a local incident)

**WhatsApp**
- [ ] Business verification done; display name approved; quality rating monitored
- [ ] Production checklist in WHATSAPP_SETUP.md passed on real devices (Android + iOS, Telugu + English)
- [ ] Utility templates approved in both languages
- [ ] Messaging limits understood; opt-out honoured

**Quality & operations**
- [ ] Native-speaker review of every Telugu string; usability test with real citizens (including low-literacy users and voice-note users)
- [ ] Accessibility audit (WCAG 2.1 AA) of staff screens
- [ ] Guidance entries verified against official sources by the office, with a review cadence
- [ ] Staff training and a published escalation/SLA policy
- [ ] Runbook: incident response, key rotation, onboarding a workspace, erasure requests
- [ ] Automated browser tests for the critical citizen→office path
