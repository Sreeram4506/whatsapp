# ConstituencyOS AI

AI-assisted citizen grievance management and constituency intelligence for MLA offices in Andhra Pradesh.
Citizens talk to the office on **WhatsApp** (Telugu or English); staff turn those messages into tracked cases; the MLA sees a data-driven command center.

> **Demonstration build.** All branding is *sample* branding and all data is *fictional*. Nothing here represents, or is endorsed by, any real MLA.

The home page (`/`) shows **a phone with WhatsApp running inside it** — you chat with the helpdesk bot there, and everything you do is processed by the real backend.

---

## What is implemented, simulated, and awaiting credentials

| Capability | Status | Notes |
|---|---|---|
| WhatsApp-style phone UI + chatbot conversation (reply buttons, list pickers, photos, PDFs, location, voice-note recording, delivery ticks, notification banners) | **Implemented** | `web/src/components/whatsapp/` |
| Bot engine: Telugu/English, 8-step complaint flow, consent, validation, resume, duplicate suggestion, tracking, schemes/certificates, appointments, opt-out | **Implemented** | `server/src/services/bot/` — same engine serves the simulator and the real webhook |
| Ticketing (`COS-2026-000001`), case workflow, audit trail, SLA/escalation, citizen confirmation/reopen | **Implemented** | MongoDB Atlas via Prisma |
| Roles: Platform admin, Office admin, MLA (read-only), Field officer (own cases only) | **Implemented** | Server-enforced; tested |
| Multi-tenant isolation | **Implemented** | Every query scoped by the authenticated user's tenant; cross-tenant access returns 404; tested |
| MLA command center, village intelligence, "Ask Constituency AI", CSV exports, printable PDF briefings | **Implemented** | Numbers come from the database; narrative labelled rule-based vs AI |
| WhatsApp Cloud API integration (webhook verification, HMAC signature check, idempotency, interactive messages, media download, status tracking, retries, templates, opt-out, BSUID/username users) | **Implemented, verified against mocked Meta API** | **Awaiting your credentials** to run against live WhatsApp — see [docs/WHATSAPP_SETUP.md](docs/WHATSAPP_SETUP.md) |
| WhatsApp messages in the demo | **Simulated** | Stored with status `SIMULATED`; never sent. The UI says so everywhere. |
| AI provider abstraction (Claude via official SDK, any OpenAI-compatible endpoint, rule-based fallback) | **Implemented** | Runs in **demo mode** (rules only) until a key is set — see [docs/AI_PROVIDER_SETUP.md](docs/AI_PROVIDER_SETUP.md) |
| Telugu speech-to-text | **Integration point only** | Needs an OpenAI-compatible `/audio/transcriptions` endpoint; otherwise the bot asks the citizen to type |
| Government scheme/certificate guidance | **Implemented, content unverified** | Sample entries are marked *Not verified* until an office admin checks the official source |
| Private attachment storage | **Implemented on local disk** | Swap `storage.ts` for S3/GCS/R2 in production |

Read [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md) for the production-readiness checklist before any real deployment.

---

## Quick start

Requirements: **Node.js ≥ 20.19** and a **MongoDB Atlas** cluster (or a MongoDB replica set).

```bash
# 1. Install dependencies (npm workspaces: server + web)
npm install

# 2. Configure the server
cp server/.env.example server/.env
#    then set DATABASE_URL to your Atlas URI, ending in /constituencyos
#      TEST_DATABASE_URL   → same, database "constituencyos_test"
#      JWT_SECRET          → node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3. Create the schema and load fictional demo data
npm run db:deploy
npm run db:seed

# 4. Run API (http://localhost:4000) and web app (http://localhost:5180)
npm run dev
```

Open **http://localhost:5180** — the phone with WhatsApp is on the home page.

### MongoDB Atlas database

To provision the accompanying MongoDB database, keep the Atlas credentials outside
the repository and run:

```bash
set -a; source "/path/to/atlas-credentials.env"; set +a
MONGODB_DB=constituencyos npm run db:mongodb:init
```

This creates the `constituencyos` database, its collections, and tenant-aware
indexes. The API uses MongoDB through Prisma; run `npm run db:deploy` afterwards
to synchronize the Prisma schema, then `npm run db:seed` to load demo data.

### Demo accounts (password for all: `Demo@2026`, local development only)

| Role | Email |
|---|---|
| Office administrator | `admin@seethapuram.demo` |
| MLA (executive, read-only) | `mla@seethapuram.demo` |
| Field officer (Roads) | `ravi@seethapuram.demo` |
| Field officer (Water) | `lakshmi@seethapuram.demo` |
| Admin of a *different* MLA workspace (isolation demo) | `admin@lankapalli.demo` |
| Platform administrator | `platform@constituencyos.demo` |

The sign-in page lists these accounts as one-click buttons in local development. In a production demo, `DEMO_LOGIN_HINTS=true` exposes sample-tenant Office Admin, Field Officer and read-only MLA shortcuts; the shared password is public and changes are visible to all visitors, so use fictional data only.

### The 5-minute end-to-end demo

1. **Home page** → say **Hi** → pick **తెలుగు** → *Register a complaint* → answer the 8 steps (try attaching a photo and sharing location) → note the ticket number.
2. Sign in as **Office Admin** → *Grievance Register* → open the ticket → read the AI suggestions and transparent priority reasons → **Assign** a team and field officer.
3. Watch the phone: a notification banner arrives and the update appears in the chat (marked simulated).
4. Sign in as **Field Officer** → *My Assignments* → mark **In progress**, add inspection notes, upload before/after photos, **Submit for office confirmation**.
5. Back as **Office Admin** → **Mark resolved** with notes → the phone asks *"Has your problem been solved?"* → tap 👍, rate.
6. Sign in as **MLA** → *Command Center* updates from the database → *Ask Constituency AI* → "Prepare the Monday grievance review." → *Reports* → printable PDF.
7. Sign in as `admin@lankapalli.demo` → confirm you cannot see Seethapuram's records (tenant isolation).

---

## Project layout

```
server/                 Express + TypeScript + Prisma API
  prisma/               schema, migrations, fictional seed data
  src/services/bot/     conversation engine + Telugu/English message catalogue
  src/services/whatsapp Cloud API client, dispatcher, webhook parser
  src/services/ai/      provider abstraction (Claude / OpenAI-compatible / rules), STT hook
  src/routes/           REST endpoints
  tests/                Vitest + Supertest (27 tests)
web/                    React + Vite + Tailwind + Recharts + React Router
  src/components/whatsapp/   the phone + WhatsApp UI
docs/                   setup, API, deployment, limitations
scripts/mongodb-init.mjs MongoDB Atlas collection/index initializer
```

## Common commands

| Command | What it does |
|---|---|
| `npm run dev` | API (4000) + web (5180) with hot reload |
| `npm test` | Backend test suite against `TEST_DATABASE_URL` (database name **must end in `_test`**) |
| `npm run typecheck` | TypeScript checks for both workspaces |
| `npm run build` | Compile API to `server/dist`, build web to `web/dist` |
| `npm run start` | Run the compiled API |
| `npm run db:deploy` | Apply migrations (safe; use in every environment) |
| `npm run db:migrate` | Create a new migration (interactive terminal, development only) |
| `npm run db:seed` | Reload the fictional demo workspaces (replaces the two demo tenants only) |
| `npm run db:reset` | **Destructive** — drops and recreates the dev database. Never run against a shared or production database. |

## Safety rules built into the product

- AI **suggests**; it never rejects complaints, decides eligibility, promises benefits, or marks a case resolved. Only authorised staff change status.
- The bot never claims a complaint was filed with a government department; the confirmation message says it is registered with the MLA office only and promises no resolution date.
- Citizen phone numbers are masked for everyone except roles authorised to reveal them; each reveal is audit-logged. MLAs see contacts only if the office explicitly enables it.
- Grievance data is not used for profiling, campaigns or unrelated messaging; exports are masked and audited; aggregate reports suppress counts below 3.
- Real MLA names/branding can only be enabled by a platform admin with a recorded authorisation reference; otherwise workspaces carry visible sample-branding labels.

## Documentation

- [WhatsApp setup (Meta Cloud API)](docs/WHATSAPP_SETUP.md)
- [AI provider setup](docs/AI_PROVIDER_SETUP.md)
- [Deployment](docs/DEPLOYMENT.md)
- [API reference](docs/API.md)
- [Known limitations & production-readiness checklist](docs/KNOWN_LIMITATIONS.md)
