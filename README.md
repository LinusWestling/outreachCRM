# Outreach CRM

A local-first CRM for **creator / influencer outreach** on Instagram and TikTok, built to be driven by both a human and AI coding agents.

It tracks every creator you've contacted or plan to contact, keeps DM and email templates (plus separate "generation rules" for AI personalization), queues prospects for personalized drafts, sends email follow-ups over SMTP, and can optionally report referral/creator-code conversions from an external Postgres database.

The repository also ships a set of **agent workflows** (`AGENTS.md`) and small, stable Node helper scripts so agents like Codex or Claude Code can run the prospecting pipeline end to end (crawl profile, update facts, personalize message, QA, mark ready) without ever sending anything on your behalf. A human always does the final send.

> **Status:** works well as a single-user, local tool. There is no authentication, so do not expose the API to a network.

---

## Contents

- [Features](#features)
- [Architecture](#architecture)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Your data stays local](#your-data-stays-local)
- [Concepts](#concepts)
- [Using the dashboard](#using-the-dashboard)
- [Importing creators from CSV](#importing-creators-from-csv)
- [AI agent workflows](#ai-agent-workflows)
- [API reference](#api-reference)
- [Optional: creator-code conversion tracking](#optional-creator-code-conversion-tracking)
- [Project structure](#project-structure)
- [Development](#development)
- [Known limitations](#known-limitations)
- [Outreach etiquette](#outreach-etiquette)
- [Contributing](#contributing)

---

## Features

- **Creator directory**: one record per creator with platform account(s), followers, email, Threads link, creator code, first/second message dates, last contact, response status, "resume contact" date, notes and full contact log.
- **Prospect queue**: paste an Instagram/TikTok profile URL, get a duplicate check against existing creators, attach a personalized draft, mark it *ready for action*, then mark it *complete* once you've actually sent it.
- **Templates with generation rules**: DM and Email templates, one active per kind. Each template has a message body plus separate generation rules (instructions for the AI, never pasted into the message).
- **Email follow-ups**: find contacted creators with an email address who haven't heard from you in N days, draft a follow-up, and send it through any SMTP server with a configurable signature.
- **Todo view**: creators whose follow-up / resume-contact date is due.
- **Stats**: reached out, responses and response rate, daily cold-outreach counts per platform, emails/Threads known, not-interested/archived.
- **CSV import & export**: preview (with validation, warnings and duplicate detection) before confirming an import; export the whole directory to CSV.
- **Live updates**: the dashboard subscribes to a server-sent events stream, so changes made by agents through the API show up instantly in the UI.
- **Creator codes (optional)**: create, extend, disable or delete referral codes in an external Postgres database and see redemptions → trials → paid conversions per creator.

## Architecture

```
┌──────────────────────────┐      HTTP + SSE       ┌──────────────────────────────┐
│  frontend (Vite + React) │ ────────────────────▶ │  Outreach.Api (ASP.NET Core) │
│  localhost:5173          │                       │  localhost:5168              │
└──────────────────────────┘                       └──────────────┬───────────────┘
                                                                  │ EF Core / Npgsql
            ┌───────────────────────┐                             ▼
            │ AI agent + .codex-*.mjs│ ──── HTTP ────▶  ┌──────────────────────────┐
            │ helpers (AGENTS.md)    │                  │ PostgreSQL 17 (Docker)    │
            └───────────────────────┘                   │ localhost:5433            │
                                                        └──────────────────────────┘
       optional ──▶ SMTP server (email follow-ups)
       optional ──▶ external Postgres with creator_codes / creator_attributions
```

| Layer | Tech |
|---|---|
| Backend | .NET 10, ASP.NET Core controllers, EF Core + Npgsql, CsvHelper, MailKit |
| Database | PostgreSQL 17 via `docker compose` (named volume `outreach-postgres-data`) |
| Frontend | React 19, TypeScript, Vite 6 (single-page dashboard, no UI framework) |
| Agent helpers | Plain Node.js (≥ 18) ES modules, no dependencies |

## Quick start

**Prerequisites:** Docker, .NET 10 SDK, Node.js 18+.

```bash
git clone https://github.com/LinusWestling/outreachCRM.git
cd outreachCRM

# 1. Start Postgres (data persists in a Docker volume)
docker compose up -d postgres

# 2. Run the API (creates the schema on first start in Development)
dotnet run --project src/Outreach.Api --launch-profile http

# 3. Run the dashboard
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The API listens on http://localhost:5168; check it with `curl http://localhost:5168/api/health/database`.

If you'd rather create the schema explicitly:

```bash
curl -X POST http://localhost:5168/api/health/database/initialize
```

## Configuration

Settings live in `src/Outreach.Api/appsettings.json`. **Put anything personal or secret in [.NET user secrets](https://learn.microsoft.com/aspnet/core/security/app-secrets)** (loaded automatically in Development), never in the committed file.

| Key | Required | Purpose |
|---|---|---|
| `ConnectionStrings:OutreachDatabase` | yes (default provided) | CRM database. Defaults to the docker-compose Postgres on `localhost:5433`. |
| `Smtp:Host`, `Smtp:Port` (465) | for email | SMTP server. Port 465 uses implicit TLS. |
| `Smtp:FromAddress`, `Smtp:FromName` | for email | Sender shown to recipients. |
| `Smtp:Username`, `Smtp:Password` | for email | SMTP credentials. |
| `Smtp:Signature:Lines:N` | no | Lines appended under every follow-up (e.g. your name, title). |
| `Smtp:Signature:Links:N:Label` / `:Url` | no | Links appended after the signature lines. |
| `ConnectionStrings:SupabaseRead` | no | Read-only connection for [conversion tracking](#optional-creator-code-conversion-tracking). |
| `ConnectionStrings:SupabaseWrite` | no | Write connection for managing creator codes. |

Example:

```bash
cd src/Outreach.Api
dotnet user-secrets set "Smtp:Host" "smtp.example.com"
dotnet user-secrets set "Smtp:FromAddress" "you@example.com"
dotnet user-secrets set "Smtp:FromName" "Alex"
dotnet user-secrets set "Smtp:Username" "you@example.com"
dotnet user-secrets set "Smtp:Password" "app-password"
dotnet user-secrets set "Smtp:Signature:Lines:0" "Alex"
dotnet user-secrets set "Smtp:Signature:Lines:1" "Founder, ExampleApp"
dotnet user-secrets set "Smtp:Signature:Links:0:Label" "Website"
dotnet user-secrets set "Smtp:Signature:Links:0:Url" "https://example.com"
```

Agent helpers talk to `http://127.0.0.1:5168` by default; override with `OUTREACH_API_BASE_URL`.

## Your data stays local

All CRM data (creators, drafts, contact logs, templates, import history) lives in the Postgres Docker volume `outreach-postgres-data`, not in the repository. It survives `docker compose down`, API restarts and `docker compose restart`.

```bash
# Back up
docker exec outreach-postgres pg_dump -U outreach outreach > outreach-backup.sql

# Reset everything (deletes all creators AND your templates)
docker compose down
docker volume rm outreach_outreach-postgres-data
```

Avoid `docker compose down -v` unless you mean to wipe the database.

`.gitignore` also keeps these local-only files out of git:

- `*.csv` (creator spreadsheets),
- `.codex-*.json` (per-run agent payloads, which contain real names, handles, emails and drafts),
- `.mcp.json`, `.env*` and `.claude/settings.local.json`.

## Concepts

**Creator**: a person you reach out to, with one or more platform accounts (Instagram / TikTok).

**Workflow status:**

| Status | Meaning |
|---|---|
| `Queued` | A prospect in the queue, not yet messaged. Can carry a draft and a *ready for action* flag. |
| `Contacted` | You actually sent the first message (set by *Complete*). |
| `FollowUpDue`, `NoResponse`, `Paused` | Follow-up tracking. |
| `Responded`, `Interested`, `NotInterested`, `Partnered` | Outcome after a reply. |
| `DoNotContact`, `Closed`, `Archived` | Never contact again / finished. |

**Ready for action**: a queued prospect whose follower count is known and whose saved draft differs from the raw template. The API refuses to mark a prospect ready otherwise. Ready does *not* mean sent.

**Templates**: `Dm` or `Email` kind, optionally per platform, with:
- `body`: the message copy, with placeholders like `[Name]` for the human/agent to fill in,
- `subject` (email only),
- `generationRules`: instructions for the AI (tone, language rules, what must stay verbatim). These are never copied into the message.

Only one template per kind is active at a time; the active one is what personalization starts from.

**Contact log**: every DM and email draft or send is stored as a contact log entry linked to the template it came from, so you can always see what was actually sent.

## Using the dashboard

| View | What it's for |
|---|---|
| **Reached out** | Every contacted creator. Filter by platform, status, response, email/Threads presence, dates; edit inline; bulk-update; send email follow-ups. |
| **Prospecting** | Add a profile URL (with duplicate check), see drafts and ready flags, copy the message, mark complete after sending. |
| **Todo** | Creators due for a follow-up or a "resume contact" date. |
| **Templates** | Create/edit/activate/delete DM and Email templates and their generation rules. |
| **Creator codes** | Optional, see below. |

## Importing creators from CSV

Use `POST /api/imports/preview` to validate a file and `POST /api/imports/confirm` to import it (multipart fields `file`, `channel` = `Instagram`|`TikTok`, optional `sourceName`). Rows are matched to existing creators by platform + normalized handle; low-confidence rows are flagged rather than silently dropped.

Recognised header names (case-insensitive; if there's no header row, the column index in brackets is used):

| Column | Header(s) |
|---|---|
| [0] | `Message version` |
| [1] | `Profile`, `Profile URL` (**required**) |
| [2] | `Followers` (accepts `12.5k`, `1,2M`, etc.) |
| [3] | `1st message` (date) |
| [4] | `Responded` (yes/no) |
| [5] | `Email` |
| [6] | `2nd message` (date) |
| [7] | `Last contact` (date) |
| [8] | `Code` |
| [9] | `Resume contact` |
| [10] | `Threads`, `Threads URL`, `Threads profile` |
| [11] | `Handle` (otherwise extracted from the profile URL) |

**Startup seeding:** in Development the API also looks for `Influencer tracking Instagram - Blad1.csv` and `Influencer tracking tiktok - Blad1.csv` in the repo root and imports them once (idempotent by handle). They're optional; if missing the step is skipped. Rename the constants in `BundledCreatorCsvInitializer.cs` to seed from your own files.

## AI agent workflows

[`AGENTS.md`](AGENTS.md) is the playbook for coding agents (Codex, Claude Code, etc.; `CLAUDE.md` simply imports it). It defines two workflows. Neither one ever sends a message or marks anything as contacted; a human does the final send.

### 1. Prospecting workflow

Triggered by prompts like *"Run the pipeline for the Instagram profiles"* or *"Generate messages for prospects"*.

It works through queued prospects in **strictly sequential batches of 5**, each batch going through the full cycle before the next batch starts:

1. **Orchestration agent**: reads the queue and the active DM template + generation rules, dispatches sub-agents, verifies results. It never edits records itself.
2. **Profile exploration**: opens *only* the exact profile URL attached to the prospect (no searching, no guessing alternate handles) and returns evidence: name, bio, language, followers, visible email, Threads link, partnership clues, and the access method used.
3. **Data update**: writes only facts with explicit evidence (followers, email, Threads).
4. **Message personalization**: writes a draft from the active DM template, in the creator's language only when visible creator-authored text supports it (with proper native spelling/diacritics), never inventing details.
5. **Missing-data collector + message review**: one last pass for blocked/incomplete profiles, then a review of those drafts against the template and rules.
6. **Follower-count cleanup QA**: final attempt for any prospect still missing followers.
7. **Readiness QA**: marks eligible prospects *ready for action* (never contacted/complete).

The first batch of every run is a **crawler verification gate**: if followers can't be read reliably, the whole run stops and asks the user for help instead of producing generic drafts.

### 2. Email follow-up workflow

Triggered by *"Personalize follow-up emails"* or similar. It lists contacted creators with an email and no contact for ≥ 7 days, then adapts the **previously sent personalized DM** into a short follow-up from the active Email template. No crawling or web searching. Drafts go only into the email fields; sending is a separate, explicit action.

### Helper scripts

Agents call stable helper commands instead of ad-hoc inline scripts, so a reusable approval rule (`node .codex-prospect-save.mjs` etc.) covers every run. Each per-run payload goes in a matching `.codex-*.json` file, which is git-ignored.

| Script | Purpose |
|---|---|
| `.codex-prospect-list.mjs` | List queued prospects (`--platform`, `--ids`, `--ready`, `--limit`, `--include-templates`). |
| `.codex-prospect-add.mjs` | Add prospects from `.codex-prospect-add.json`. |
| `.codex-profile-crawl.mjs` | Crawl the exact Instagram/TikTok URLs in `.codex-profile-crawl.json` (profile page, then Instagram `web_profile_info`). HTTPS Instagram/TikTok hosts only. |
| `.codex-prospect-save.mjs` | Save factual fields + drafts for queued prospects only (`.codex-prospect-save.json`). Can't change workflow state. |
| `.codex-prospect-verify.mjs` | Read-only check that touched prospects are still queued and match the expected fields. |
| `.codex-prospect-ready.mjs` | Mark QA-passed prospects ready for action (`.codex-prospect-ready.json`). |
| `.codex-prospect-audit.mjs`, `.codex-prospect-state-audit.mjs` | Read-only queue/state audits. |
| `.codex-prospect-export-for-send.mjs` | Export id/handle/URL/message for the given ids so a human can send them. |
| `.codex-prospect-complete.mjs` | Mark one prospect complete (`--id`). Only run when the user says it was sent. |
| `.codex-prospect-complete-unavailable-profile.mjs` | Complete prospects whose profile no longer exists, limited to an allow-list in `.codex-prospect-complete-unavailable.json`. |
| `.codex-email-followup-list.mjs` | Email follow-up candidates (`--days 7`). |
| `.codex-email-followup-save.mjs` / `-verify.mjs` | Save / verify email drafts. |
| `.codex-email-followup-send-audit.mjs` | Check that emails sent on a date include all signature links (`.codex-email-signature.json` or `OUTREACH_SIGNATURE_URLS`). |
| `.codex-email-followup-test-create.mjs` | Create a test creator for exercising the email flow. |
| `.codex-last-contact-update.mjs` | Update last-contact dates. |

Run any script with `--help` for its input format.

### Adapting it to your outreach

The workflow isn't tied to a particular product. To use it for your own campaign:

1. Create a DM template in the **Templates** view with your pitch (use `[Name]` and a personalization hook sentence), and write your hard rules into **generation rules** (e.g. "never promise X", "keep the offer paragraph verbatim", "no em dashes").
2. Optionally create an Email template for follow-ups.
3. Add prospects (UI, CSV import or `.codex-prospect-add.mjs`).
4. Ask your agent to *"run the prospecting pipeline"*.

## API reference

Base URL `http://localhost:5168`. An OpenAPI document is served at `/openapi/v1.json` in Development, and `src/Outreach.Api/Outreach.Api.http` has ready-made requests.

**Health**
- `GET /api/health`, `GET /api/health/database`
- `POST /api/health/database/initialize`: create/upgrade the schema and seed bundled CSVs

**Creators**
- `GET /api/creators`: paged, filterable, sortable list
- `GET /api/creators/stats`, `GET /api/creators/daily-outreach-counts`
- `PUT /api/creators/{id}`, `PUT /api/creators/bulk`
- `GET /api/creators/email-follow-up-candidates?daysWithoutContact=7`
- `POST /api/creators/{id}/email-follow-up/send`

**Prospects**
- `GET /api/creators/pending`
- `GET /api/creators/pending/duplicate-check?profileUrl=…`
- `POST /api/creators/pending`: `{ profileUrl, followers?, email?, threadsUrl?, code?, firstMessageDate? }`
- `DELETE /api/creators/pending/{id}`
- `POST /api/creators/pending/{id}/ready`
- `POST /api/creators/pending/{id}/complete`: call only after the message was actually sent

**Templates**
- `GET /api/templates`, `GET /api/templates/active?kind=Dm|Email`
- `POST /api/templates`, `PUT /api/templates/{id}`, `POST /api/templates/{id}/activate`, `DELETE /api/templates/{id}`

**Import / export / events**
- `POST /api/imports/preview`, `POST /api/imports/confirm`
- `GET /api/exports/creators.csv`
- `GET /api/events`: server-sent events for live dashboard updates

**Creator codes (optional)**
- `GET /api/creators/conversion-summary`
- `GET /api/creator-codes`, `POST /api/creator-codes`, `PATCH /api/creator-codes/{id}`, `POST /api/creator-codes/{id}/disable`, `DELETE /api/creator-codes/{id}` (only allowed for codes without redemptions)

## Optional: creator-code conversion tracking

If your product hands out referral / creator codes, the CRM can show per-creator redemptions, trials and paid conversions, and manage the codes themselves. It connects directly (server-side only) to an external Postgres database, for example your app's Supabase project, that has these tables:

- `creator_codes`: `id uuid`, `code_normalized text`, `creator_id text` (the CRM creator id), `creator_display_name text`, `status text` (`active`/`disabled`), `valid_from`, `valid_until`, `premium_duration_days int`, `created_at`, `updated_at`
- `creator_attributions`: `id`, `creator_code_id` → `creator_codes.id`, `status` (`revoked`/`conflict` rows are ignored), `redeemed_at`, `store_trial_started_at`, `paid_conversion_eligible_at`, `first_paid_renewal_at`

Set `ConnectionStrings:SupabaseRead` (read-only role) and `ConnectionStrings:SupabaseWrite` (least-privilege write role on `creator_codes`) in user secrets. Without them the feature is simply disabled. Never put these credentials in the frontend.

## Project structure

```
.
├── AGENTS.md                 # agent playbook (prospecting + email follow-up workflows)
├── CLAUDE.md                 # imports AGENTS.md for Claude Code
├── .codex-*.mjs              # stable helper commands used by agents
├── docker-compose.yml        # Postgres 17 on localhost:5433
├── OutreachDashboard.slnx    # .NET solution
├── docs/IMPLEMENTATION_PLAN.md
├── src/
│   ├── Outreach.Domain/          # entities: Creator, CreatorAccount, ContactLog, MessageTemplate, ImportBatch/Row
│   ├── Outreach.Application/     # DTOs, service interfaces, CSV normalization
│   ├── Outreach.Infrastructure/  # EF Core DbContext, services, CSV import/export, SMTP sender, creator codes
│   └── Outreach.Api/             # controllers, SSE realtime broker, Program.cs
└── frontend/                 # Vite + React + TypeScript dashboard (src/App.tsx)
```

The schema is created with `EnsureCreated` plus idempotent upgrade SQL in `BundledCreatorCsvInitializer.EnsureWorkflowSchemaAsync`; there are no EF migrations yet.

## Development

```bash
dotnet build OutreachDashboard.slnx      # backend
cd frontend && npm run build             # frontend type-check + production build
```

`.claude/launch.json` contains dev-server definitions (`frontend` on 5173, `api` on 5168) for editors and agents that support it.

## Known limitations

- **No authentication.** CORS only allows localhost origins; keep it on your machine.
- Instagram and TikTok are the only supported platforms. Their pages frequently hide or block data, so crawling is best-effort by design and the agent rules prefer "unknown" over guessing.
- Dates such as "today" for sent emails use the `Europe/Stockholm` time zone (`EmailFollowUpSender.StockholmToday`, helper `todayIso`). Change it if you're elsewhere.
- No automated test suite yet.

## Outreach etiquette

This tool deliberately keeps a human in the loop: agents prepare drafts, a person sends them. Please use it the same way. Respect platform terms of service and anti-spam laws (CAN-SPAM, GDPR/ePrivacy), honour opt-outs (`DoNotContact`), only collect what creators publish themselves, and don't use it for bulk unsolicited messaging.

## Contributing

Issues and pull requests are welcome. Please never commit real creator data. Keep CSVs, `.codex-*.json` payloads and secrets out of your commits (the `.gitignore` already does this).
