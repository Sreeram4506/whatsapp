# API reference

Base URL (local): `http://localhost:4000`. JSON everywhere except file uploads (multipart) and CSV downloads.

## Conventions

- **Auth**: cookie `cos_session` (HttpOnly, SameSite=Lax, Secure in production) set by `POST /api/auth/login`. Sessions are re-validated against the database on every request, so deactivating a user or workspace takes effect immediately.
- **CSRF**: every non-GET request to `/api/*` must send header `x-requested-with: ConstituencyOS`, otherwise `403`.
- **Errors**: `{ "error": { "code": "bad_request|unauthorized|forbidden|not_found|conflict|rate_limited|internal", "message": "…", "details": … } }`. Validation failures return `400` with Zod field errors in `details`.
- **Tenant scoping**: the workspace is derived from the signed-in user — never from the request. Another workspace's records return `404` (not `403`) so their existence isn't revealed.
- **Rate limits** (per IP): login 10 / 15 min · API 300 / min · public lookups 20 / min · simulator 90 / min · webhook 1200 / min.
- **Pagination**: `?page=1&pageSize=20` → `{ total, page, pageSize, items }`.

Roles: `PA` Platform admin · `OA` Office admin · `MLA` · `FO` Field officer · `—` public.

## Public

| Method & path | Role | Description |
|---|---|---|
| `GET /health` | — | Liveness |
| `GET /api/public/status` | — | Simulator flag, AI mode, STT, webhook config, demo accounts (only if `DEMO_LOGIN_HINTS` and not production) |
| `GET /api/public/tenants` · `/tenants/:slug` | — | Public workspace profile (name, office info, sample-branding flag). No secrets. |
| `POST /api/public/track` | — | `{slug, ticket, phoneLast4}` → status + citizen-visible timeline. Same `404` for unknown ticket or wrong digits (no enumeration). |

## WhatsApp webhook (Meta → server)

| Method & path | Description |
|---|---|
| `GET /webhooks/whatsapp` | Verification handshake (`hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`) |
| `POST /webhooks/whatsapp` | Event delivery. Requires valid `X-Hub-Signature-256`; idempotent; acknowledged with `200` then processed asynchronously |

## Simulator (demo only — `SIMULATOR_ENABLED=true`)

Messages are processed by the same bot engine; replies are stored `SIMULATED` and never sent.

| Method & path | Description |
|---|---|
| `GET /api/simulator/:slug/messages?phone=&after=` | Conversation messages (and state) |
| `POST /api/simulator/:slug/messages` | `{phone, input}` where `input` is `{kind:"text",text}` · `{kind:"reply",id,title}` · `{kind:"media",mediaType,attachmentId}` · `{kind:"location",latitude,longitude}`; returns the bot's replies |
| `POST /api/simulator/:slug/media` | multipart `phone`, `file` (JPG/PNG/WEBP/PDF ≤ `MAX_UPLOAD_MB`, signature-checked) → `{attachmentId}` |
| `POST /api/simulator/:slug/voice` | multipart voice note → transcribed if STT configured |
| `GET /api/simulator/:slug/media/:id?phone=` | Citizen's own upload |
| `POST /api/simulator/:slug/reset` | Clear that simulated chat (filed grievances are kept) |

## Auth

| Method & path | Description |
|---|---|
| `POST /api/auth/login` | `{email, password}` → sets session cookie. Failed attempts are audited. |
| `POST /api/auth/logout` | Clears the cookie |
| `GET /api/auth/me` | Current user, role, workspace and settings |

## Grievances

| Method & path | Roles | Description |
|---|---|---|
| `GET /api/grievances` | OA MLA FO | Server-side filters: `status` (comma list), `priority`, `categoryId`, `mandalId`, `villageId`, `teamId` (`none`=unassigned), `assigneeId`, `source`, `open`, `overdue`, `escalated`, `pendingResolution`, `q`, `sort` (`created_desc|created_asc|priority|due|updated`), `page`, `pageSize`. FO only ever receives cases assigned to them. |
| `POST /api/grievances` | OA | Record a walk-in/phone grievance (requires `consentConfirmed: true`) |
| `GET /api/grievances/:id` | OA MLA FO | Full case: timeline, attachments, AI suggestions, allowed transitions, permissions, delivery log (OA) |
| `POST /api/grievances/:id/reveal-contact` | OA FO (MLA only if enabled) | Returns name + phone; **audit-logged** |
| `POST /api/grievances/:id/status` | OA FO* | `{to, citizenMessage?, internalNote?, resolutionNotes?}`. Enforces the workflow graph and per-role targets (*FO may set only IN_PROGRESS / AWAITING_INFO). `RESOLVED` needs notes; `CLOSED`/`AWAITING_INFO` need a message. |
| `POST /api/grievances/:id/assign` | OA | `{teamId, assigneeId?, dueAt?, note?}` — default due date from the SLA for the priority |
| `POST /api/grievances/:id/priority` | OA | `{priority, reason}` — reason is audited |
| `POST /api/grievances/:id/category` | OA | `{categoryId}` |
| `POST /api/grievances/:id/notes` | OA FO | `{message, visibility: INTERNAL|CITIZEN}` — only OA may message citizens |
| `POST /api/grievances/:id/inspection` | OA FO | `{notes}` |
| `POST /api/grievances/:id/field-visit` | OA FO | `{when}` |
| `POST /api/grievances/:id/request-resolution` | FO | `{notes}` — office still confirms |
| `GET /api/grievances/:id/ai-draft?intent=` | OA | Draft reply (AI or template) — not sent |
| `POST /api/grievances/:id/attachments` | OA FO | multipart `kind=BEFORE|AFTER|EVIDENCE`, `file` |
| `GET /api/attachments/:id` | OA MLA FO | Private download, tenant + assignment scoped |

Workflow: `RECEIVED → VERIFICATION → ASSIGNED → IN_PROGRESS ⇄ AWAITING_INFO → RESOLVED → CLOSED`, with `REOPENED` from `RESOLVED`/`CLOSED`. Every change writes a `GrievanceUpdate` and an `AuditLog` row with actor and time.

## Intelligence & reports (OA, MLA)

| Method & path | Description |
|---|---|
| `GET /api/dashboard?days=7|30|90|365&mandalId=` | KPIs, trend, categories, mandals, villages, status, team workload, repeated problems. `avgResolutionDays` is `null` unless ≥ 5 resolved cases. |
| `POST /api/ai/ask` | `{question, villageId?}` → `{title, narrative, narrativeSource: "ai"|"rules", tables[], caveats[], isDemoData}`. Figures are SQL-computed. |
| `GET /api/ai/status` | Provider and mode |
| `GET /api/villages/intelligence?days=` | Village scores, recurring issues, map points (only citizen-shared or office-verified coordinates) |
| `PATCH /api/villages/:id` (OA) | Enter verified coordinates `{latitude, longitude, source}` |
| `GET /api/reports/grievances.csv` | Filters `from,to,status,categoryId,mandalId`; phones masked; formula-injection safe; audited |
| `GET /api/reports/aggregate.csv?by=village|category|mandal` | Counts only; values < 3 suppressed |
| `GET /api/reports/briefing?type=monday|weekly|daily` | Data for the printable report page (use browser *Print → Save as PDF*) |

## Office administration

| Method & path | Roles | Description |
|---|---|---|
| `GET /api/meta` | all staff | Categories, teams, mandals/villages, field officers (for forms/filters) |
| `GET/POST /api/users`, `PATCH /api/users/:id`, `POST /api/users/:id/reset-password` | OA | Staff management; temporary passwords shown once; cannot demote/deactivate yourself |
| `POST /api/teams`, `PATCH /api/teams/:id` · `POST /api/categories`, `PATCH /api/categories/:id` | OA | Per-workspace configuration |
| `GET/PATCH /api/settings` | OA (GET: OA, MLA) | Office profile, SLA days, escalation hours, retention, MLA contact visibility, WhatsApp IDs, integration status |
| `GET /api/audit` | OA | Filter `entityType, entityId, action` (prefix) |
| `GET /api/messages`, `POST /api/messages/:id/retry` | OA | Outbound delivery log (`SIMULATED/SENT/DELIVERED/READ/FAILED/NOT_CONFIGURED/SUPPRESSED`); retry failed WhatsApp sends |
| `GET /api/appointments`, `PATCH /api/appointments/:id` | GET: OA MLA · PATCH: OA | Confirm/decline/complete; citizen is notified |
| `GET/POST /api/guidance`, `PATCH /api/guidance/:id`, `POST /api/guidance/:id/verify` | OA (GET: OA MLA) | Editing resets verification; verify records who/when/what was checked |
| `GET /api/citizens`, `POST /api/citizens/:id/erase` | OA | Masked list; erasure needs `{reason, confirm:"ERASE"}` |
| `GET /api/retention/preview`, `POST /api/retention/apply` | OA | `{confirm:"APPLY"}` anonymises eligible citizens |
| `POST /api/escalations/run` | OA | Run the overdue-escalation sweep now (also runs every `ESCALATION_JOB_INTERVAL_MINUTES`) |

## Platform administration (PA only — cannot read any workspace's records)

| Method & path | Description |
|---|---|
| `GET /api/platform/tenants` | Workspaces with counts |
| `POST /api/platform/tenants` | Onboard: slug, names, ticket prefix, mandals/villages, first admin. Without `brandingAuthorization` the workspace is created with **sample branding**. Returns the admin's temporary password once. |
| `PATCH /api/platform/tenants/:id` | Enable/disable; record branding authorisation; revert to sample branding |
