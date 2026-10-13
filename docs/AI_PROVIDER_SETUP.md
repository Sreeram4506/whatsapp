# AI provider setup

The AI layer is a thin abstraction (`server/src/services/ai/provider.ts`). Switch providers with environment variables — no code changes. With no key configured the application runs in **demo mode** using deterministic rules, and says so in the UI (Settings, the demo page, and every AI-derived panel).

## What AI does here — and does not do

| AI **does** | AI **never** does |
|---|---|
| Summarise a complaint for staff (English) | Reject, close or resolve a complaint |
| Suggest a category and a responsible team | Make legal or eligibility decisions |
| Draft a citizen reply (staff review and send) | Promise a benefit, outcome or date |
| Turn *already-computed* dashboard figures into a short briefing | Invent counts, statistics or government performance data |

Deterministic, non-AI logic (always on): Telugu/English language detection, transparent priority rules (each fired rule is stored as a human-readable reason), duplicate suggestions, village visit scores, all numbers on every chart and table.

Every AI-generated item is labelled with its provider and timestamp. Narratives on the dashboard are shown as *"AI-generated interpretation"* above tables of figures computed by SQL; if the model call fails, the app falls back to the rule-based narrative and says *"Rule-based summary"*.

## Option A — Claude (Anthropic)

```bash
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=<key from console.anthropic.com>
ANTHROPIC_MODEL=claude-opus-5-5     # default; any Claude model id works
AI_EFFORT=low                       # low | medium | high — summaries need little reasoning
AI_TIMEOUT_MS=30000
```

Implemented with the official `@anthropic-ai/sdk`. Requests ask for schema-constrained JSON (summary/category/team), use the SDK's built-in retries, and opt in to Anthropic's server-side refusal fallback so a safety-classifier refusal doesn't fail an office workflow. Errors are caught by type (authentication, rate limit, API) and logged without leaking the key; the UI falls back to rules.

## Option B — any OpenAI-compatible endpoint

For self-hosted or third-party models that expose `/chat/completions`:

```bash
AI_PROVIDER=openai-compatible
OPENAI_COMPAT_BASE_URL=https://your-endpoint.example.com/v1
OPENAI_COMPAT_API_KEY=<key>
OPENAI_COMPAT_MODEL=<model name>
```

The provider asks for JSON output; malformed output is discarded and the rule-based result is used. *(This provider is not covered by automated tests — try it against your endpoint before relying on it. The rule-based fallback it degrades to is tested.)*

## Option C — no AI (demo mode)

`AI_PROVIDER=none` (default). Summaries are the first sentence of the complaint, category suggestions come from a Telugu/English keyword list, reply drafts use bilingual templates, and briefings are generated from templates over computed figures.

## Telugu speech-to-text (integration point)

```bash
STT_PROVIDER=openai-compatible
STT_BASE_URL=https://your-stt.example.com/v1     # must implement POST /audio/transcriptions
STT_API_KEY=<key>
STT_MODEL=<model, e.g. a Whisper-class model>
```

When configured, WhatsApp voice notes (and recordings made in the simulator) are downloaded, sent with a Telugu/English language hint, and the transcript is read back to the citizen ("We converted your voice note to text: …") before being processed as typed input. Without it, the bot politely asks the citizen to type. **Telugu accuracy must be evaluated on real recordings** before trusting this for grievances.

## Data protection when using an external model

- Complaint **text** (not phone numbers or names) is sent for summarisation/categorisation. Dashboard narration receives only **aggregates**. Reply drafting receives ticket, category, village, status and the staff member's one-line intent.
- Add the provider to your privacy notice and data-processing agreements; pick a region/retention setting that suits your obligations; do not enable models whose retention terms conflict with your policy.
- To keep all data in-country, use a self-hosted OpenAI-compatible model or stay in demo mode.

## Telugu quality

The bot's Telugu strings and the rule-based keyword lists were authored for this demo and **must be reviewed by a native Telugu speaker** (ideally someone from the office) before real citizens use them.
