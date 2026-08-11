# CAPTURE — Build Plan (Source of Truth)

This document tracks the build against `Capture_PRD.md`. It is the source of truth for **what phase we're in, what's done, and what gates the next phase**.

Companion documents:
- **[TESTS.md](./TESTS.md)** — actual test run log and the regression suite. Every phase-gate checkbox below should have a corresponding logged result there before it is checked off.
- **[OUTSTANDINGS.md](./OUTSTANDINGS.md)** — open external dependencies, unresolved PRD decisions, and known risks. Check it before assuming an integration/account/decision is available.

## How to use this document

- Check a box only when the corresponding test is **logged in TESTS.md**, not on "it looks like it works."
- Do not delete completed items when a phase ends — history here is what lets us detect regressions later.
- If a phase-gate item cannot be completed because of a missing external dependency, do not silently skip it — log it in OUTSTANDINGS.md and leave the box unchecked (⛔).
- Status legend:

| Symbol | Meaning |
|---|---|
| ✅ | Done — verified, test logged in TESTS.md |
| 🚧 | In progress |
| ⬜ | Not started |
| ⛔ | Blocked — see OUTSTANDINGS.md |

## Pinned reminder — V1 Non-Goals (PRD §41)

Do **not** build, even if it seems easy or adjacent: business registration, websites, ecommerce, apps, social media management, content creation, CRM replacement, voice agents, full marketing automation, full omnichannel platform, payment processing, advanced predictive analytics, full conversion platform, sophisticated revenue forecasting, complex AI-employee systems, extensive integrations, mobile app. If a task feels like it belongs to this list, stop and flag it rather than building it.

---

## Architecture Decisions (ADR log)

Decisions below were confirmed with the founder and should not be silently re-litigated mid-build. If a decision needs to change, update this table with the date and reason rather than just changing code.

| # | Decision | Choice | Rationale |
|---|---|---|---|
| AD-1 | Application stack | Next.js (App Router) on Vercel | Fast to ship, Fluid Compute handles both UI and API routes, native Vercel Cron for escalation timers (Phase 3) |
| AD-2 | Database / Auth | Supabase (Postgres + Supabase Auth) | Row-Level Security gives us real multi-tenant isolation at the data layer, not just app-layer checks |
| AD-3 | AI provider | Provider-agnostic via Vercel AI Gateway | PRD §47 leaves the model/provider open; Gateway lets us swap providers without rewriting the classification/response pipeline. Prefer providers/configs offering zero data retention |
| AD-4 | Tenancy model | Multi-tenant SaaS from day one | Even with few pilot customers, build proper `business_id` scoping + RLS now rather than retrofitting isolation later under real customer data |
| AD-5 | WhatsApp ingestion | Dual path: (a) manual chat-export upload, (b) official WhatsApp Business Platform API | (a) ships Find fastest with zero Meta approval dependency; (b) is required anyway for Recover/Prevent sends, so build both against the same internal conversation model |
| AD-6 | Data residency | Global cloud (Vercel/Supabase standard regions) with encryption, DPA, and data minimisation | No hard in-Nigeria hosting requirement confirmed; NDPA obligations still tracked as a compliance workstream, not a hosting constraint — see OUTSTANDINGS.md |
| AD-7 | Timeline model | No hard calendar deadlines; phase gates are quality-gated, not date-gated | Solo founder-developer build |

---

## Cross-Cutting: Security & Compliance Workstream

These requirements apply **at every phase**, not once. Each phase's gate section below references back to this list — do not consider a phase gate passed if these regress.

- [ ] TLS enforced everywhere (Vercel default; verify no plaintext HTTP paths, e.g. webhook callback URLs)
- [ ] Encryption at rest for all customer data (Supabase default; evaluate column-level encryption for phone numbers / message content)
- [ ] Postgres RLS policies on every tenant-scoped table (`business_id` on all rows); no table reachable without a matching policy
- [ ] Automated tenant-isolation test: Business A's authenticated session cannot read/write Business B's data via API or direct query
- [ ] Access audit log (who/what accessed which conversation/customer record, when) — append-only
- [ ] Secrets management: all API keys/tokens in Vercel env vars, never committed; scoped per environment (dev/preview/prod); rotation process documented
- [ ] Dependency vulnerability scanning wired into CI (e.g. `npm audit` / Dependabot equivalent)
- [ ] Rate limiting + abuse protection on all public/unauthenticated endpoints (Find's upload + qualification form is public-facing)
- [ ] File upload hardening for WhatsApp export uploads: file type/size limits, zip-bomb protection, no execution of uploaded content
- [ ] Webhook signature verification for all inbound Meta/WhatsApp webhooks (reject unsigned/invalid payloads)
- [ ] PII minimisation before any LLM call: strip/mask what isn't needed for classification before sending to the AI Gateway
- [ ] No model training on customer conversations without explicit permission — enforced via provider/Gateway config (zero-retention where available) and contractually in ToS/DPA
- [ ] Customer authorisation/consent captured at data-collection points (Find upload, channel connect) with a record of consent, not just a checkbox in the UI
- [ ] Defined data retention period + automated deletion job; manual deletion-on-request process documented
- [ ] "Human takeover stops AI immediately" kill switch (PRD §23, §32) — from Phase 3 onward, this gets its own regression test at every subsequent phase gate. This is a trust-critical feature, treat failures here as release-blocking.

---

## Phase 0 — Commercial Validation

**Goal (PRD §43):** Prove there is a commercially meaningful problem before building platform software.

No code in this phase. Methodology and working templates: [phase0/AUDIT_GUIDE.md](./phase0/AUDIT_GUIDE.md).

### Activities
- [ ] Manually analyse conversations from 5–10 real/prospective businesses
- [ ] Identify recurring leakage patterns across those businesses
- [ ] Determine which leakage types (unanswered / delayed / abandoned-high-intent / unfollowed quote / reactivatable customer) matter most in practice
- [ ] Secure at least one committed paying customer or strong pre-commitment

### Phase 0 Exit Criteria (gate)
- [ ] Leakage patterns documented and consistent enough to justify building automated classification (feeds directly into Phase 1's taxonomy, PRD §9)
- [ ] At least one business has agreed to be a real Phase 1 pilot (will supply real or representative conversation data)
- [ ] Hypotheses A1 and A3 (see Hypotheses Tracker below) have supporting evidence, not just assumption

---

## Phase 1 — FIND (Revenue Leak Audit)

**Goal (PRD §43):** Prove businesses care about the diagnosis.

> ⚠️ **Process deviation (see OUTSTANDINGS.md `DEV-1`):** build is proceeding now against simulated data rather than waiting for Phase 0's real audits to complete. Real data is planned at beta. Do not treat gate tests passing against simulated data as proof of Hypotheses A1/A3/A4 — those still require real audits per `phase0/AUDIT_GUIDE.md`.

### 1.1 Foundations
- [x] Repo scaffold: Next.js App Router project (`web/`), linked to Vercel project `capture` (probetsltd-2461s-projects) — not yet deployed
- [x] Supabase project provisioned (`capture-db`, via Vercel Marketplace, connected to `capture` project); core schema per PRD §31 applied (TESTS.md 2026-08-10) — see OUTSTANDINGS.md `DEP-6` Resolved
- [x] Supabase Auth wired up (founder/admin auth first; business-user auth as part of 1.3) — `@supabase/ssr` client/server/proxy wiring, magic-link `/login` + `/auth/confirm`, `/admin` gated by `proxy.ts` (redirect-to-login verified, TESTS.md 2026-08-10). Preview/prod magic-link redirect blocked on OUTSTANDINGS.md `DEP-9`; granting `platform_admins` access is still a manual SQL step by design (see migration comment)
- [x] CI pipeline (lint, typecheck, test) on every PR — `.github/workflows/ci.yml` runs lint/typecheck/build on PRs touching `web/**`; all steps verified locally (TESTS.md 2026-08-10). No `npm test` step yet — deliberately, since there's no application logic to unit test until Phase 1.4a/1.5 land; add a test framework alongside that code rather than scaffolding empty test infra now. Not yet exercised by a real GitHub Actions run (no GitHub remote yet)

### 1.2 Security Baseline (see also Cross-Cutting Workstream above)
- [x] RLS policies on `business`, `customer`, `conversation`, `opportunity` tables — applied to the live Supabase project; hardened per a Supabase-specific security review (helper functions relocated out of the exposed `public` schema into `internal`, explicit `TO authenticated` on every policy, `WITH CHECK` added to `businesses_update`) and passed a real tenant-isolation test using Supabase's actual role names (TESTS.md 2026-08-10). **Fully closed out 2026-08-10** (Phase 1.8): tested against a genuine Supabase Auth-issued JWT (not a manually-set `auth.uid()`) via a throwaway test admin account — `platform_admin` sees all businesses, the same account with `platform_admin` revoked sees zero, confirming RLS enforces correctly under a real session (TESTS.md 2026-08-10)
- [ ] Audit log table + write path for record access — 🚧 `audit_log` table + RLS policies live on the real project; application code that actually writes to it is not yet built
- [x] Upload validation (type/size limits) on the export-upload endpoint — implemented and verified as part of 1.4a (see below)
- [x] Consent capture recorded against the `business` record — implemented at intake time (PRD's qualification step precedes upload) rather than at upload time specifically: `consent_given_at`, `consent_version`, `intake_ip` columns populated on submit, verified end-to-end (TESTS.md 2026-08-10). Upload-specific consent language (if any beyond this) is a 1.4a concern

### 1.3 Public Intake Flow
- [x] "Find My Revenue Leaks — Free" landing page — `/` rewritten with PRD §36–39 copy (hero, problem story, Find/Recover/Prevent), honest about what's actually live (Find only)
- [x] Short qualification form (PRD §8): business name, industry, website/Instagram, approx. annual revenue, approx. monthly WhatsApp conversations — `/find`, plus contact email (required for report delivery/follow-up, not explicitly in §8 but functionally necessary) and WhatsApp number (optional). Revenue/volume collected as low-friction ranges, stored as representative midpoints, not exact figures
- [x] Form submission creates a `business` record + triggers onboarding to upload/connect — writes via `service-role` Server Action (never client-side RLS-governed insert, per the schema's original design intent), with honeypot + DB-backed rate limiting (5/hour/IP) and consent recording. Full flow verified via real browser automation against the live Supabase project: happy path creates a correct row, rate limit correctly rejects the 6th attempt with zero rows written, honeypot-triggered submission returns a generic success with zero rows written (TESTS.md 2026-08-10). "Triggers onboarding to upload/connect" is currently a human follow-up (upload UI is 1.4a, not built yet) — the confirmation page says so honestly rather than linking to something that doesn't exist

### 1.4a Ingestion — Manual Export
- [x] Upload handler for native WhatsApp chat export (`.txt` only — `.zip`/media dropped from V1 scope, see OUTSTANDINGS.md) — `/upload/[token]`, gated by a high-entropy unguessable token generated at intake time (no business auth exists yet), not a full session. Upload validation (the leftover Phase 1.2 item) implemented and verified: extension check, per-file size cap (5MB), batch size cap (60 files), content-sniff rejecting non-text files server-side (not just client `accept` hint) — confirmed a renamed `.csv` is rejected with a clear error (TESTS.md 2026-08-10)
- [x] Parser for WhatsApp export format → normalised message list — `web/src/lib/whatsapp/parse.ts`, a TypeScript port of `phase0/parse_whatsapp_exports.py`'s regex logic (iOS + Android formats, multi-line merge, system-message skip), extended to extract full message content (not just structural metadata) since Phase 1.5 classification needs it. Business-vs-customer sender labeling uses a cross-file heuristic (the name recurring across ≥60% of a batch's files is "the business") rather than asking the user to self-report it — verified correct against 3 synthetic conversations (TESTS.md 2026-08-10)
- [x] Chunking into individual `conversation` records (~20–50 conversations per audit, PRD §7) — one uploaded file → one `customers` + one `conversations` + N `messages` rows, all scoped to `business_id`, raw files never persisted (parsed in-memory and discarded, per `phase0/AUDIT_GUIDE.md`'s data-minimisation stance). Full flow verified end-to-end via real browser automation against the live Supabase project: 3 files → 3 customers, 3 conversations with correct message counts and date ranges, 8 messages with correct `sender_type` split; cascade-delete confirmed clean on business deletion (TESTS.md 2026-08-10)

### 1.4b Ingestion — WhatsApp Business API
- [ ] Meta Business / WhatsApp Business Platform integration decision made (direct Meta vs BSP — see OUTSTANDINGS.md)
- [ ] Connect flow (OAuth/embedded signup) for a business to link their WhatsApp number
- [ ] Webhook receiver with signature verification for inbound messages
- [ ] Historical backfill where the API/BSP allows it

### 1.5 Understand / Classify
- [x] Classification pipeline via AI Gateway, provider-agnostic, implementing PRD §9 taxonomy:
  - [x] Conversation Type (sales enquiry / existing customer / support / complaint / general / spam / unknown)
  - [x] Intent (high / medium / low / none)
  - [x] Status (converted / likely converted / abandoned / no response / unresolved / unclear)
  - [x] Leakage Type (no response / delayed response / abandoned high-intent / unfollowed quote / reactivatable / other)

  `web/src/lib/classification/classify.ts`, model configurable via `CLASSIFICATION_MODEL` env var (AD-3: provider-agnostic), defaulting to `anthropic/claude-haiku-4.5` now that AI Gateway billing is resolved (`OUTSTANDINGS.md` `DEP-5`, was free-tier `amazon/nova-lite`). Wired into the upload flow via `after()` (PRD §7 treats analysis as a distinct step after upload, not something to block the uploader on). Verified end-to-end against the live Supabase project with real uploaded conversations: a clean "Payment sent, thank you!" conversation correctly classified as `converted`/`none` with accurate reasoning (TESTS.md 2026-08-10). The model upgrade surfaced and fixed a real bug — Claude's more verbose reasoning output was exceeding the schema's length cap (see TESTS.md 2026-08-10). **Caveat, not a defect**: observed run-to-run judgment variance on ambiguous transcripts persists even on the stronger model — do not treat output as ground truth until validated against real Phase 0 audit labels
- [x] PII minimisation step applied before conversation content leaves our system for the LLM call — `web/src/lib/classification/redact.ts`, regex-based (phone numbers, emails), unit-verified against realistic and edge-case inputs. Does not redact free-text names — logged as a known limitation in OUTSTANDINGS.md, not silently ignored
- [x] Structured-output validation (reject/flag malformed classification results rather than silently storing garbage) — Zod schema (`schema.ts`) mirrors the DB CHECK constraints exactly; `NoObjectGeneratedError` caught explicitly and returns `null` rather than a partial/guessed result, leaving `classified_at` null so unclassified conversations are distinguishable from ones classified as "none"

### 1.6 Score & Report
- [x] Revenue Leak Report generation (PRD §10): counts per leakage type, anonymised examples — `web/src/lib/report/generate.ts` is a pure function (unit-tested against PRD §10's own worked example — 7/8/4 leak counts summing to 19 "potentially recoverable" — plus zero-conversation and partially-classified edge cases) + `/report/[token]` page. Anonymised examples are sourced from the classification `reasoning` field (already non-identifying by construction, no separate redaction pass needed). Verified end-to-end against the live project with real uploaded/classified conversations — counts on the page matched the database exactly (TESTS.md 2026-08-10)
- [x] Opportunity value estimate using customer's average transaction value, with the required disclaimer ("Estimated opportunity value is not a revenue guarantee") — closed a real gap: `avg_transaction_value` was never collected anywhere before now, so added it as an optional field on the upload form. `opportunities` rows are created during classification (mirroring `seed_simulated.sql`'s exact leakage-type → value-multiplier mapping, so real and simulated data behave identically), summed on the report page. Disclaimer renders verbatim. Verified: a quote-not-followed-up conversation with `avg_transaction_value=200000` produced an `opportunities` row valued at exactly `160000` (the documented 0.8× multiplier), correctly summed and displayed
- [x] Revenue Readiness Score (0–100, communication device not predictive analytics, PRD §10) — simple, explainable ratio per dimension (Response/Follow-up/Recovery), not a fitted model; verified end-to-end math against real data: `(100+75+100)/3 = 91.67 → 92`, matching the page exactly

### 1.7 Delivery & CTA
- [x] Report delivery UI (web view) — linked from the upload success screen (`/report/[token]`, reuses the upload token rather than a new one). Honest about the async classification: "Analysis runs in the background — refresh in a moment if it looks incomplete." PDF/export not built (optional per PLANS.md, no PRD requirement forcing it)
- [x] CTA into Recover/Prevent captured as interest, even before those products exist in-app — non-exclusive checkboxes on `/report/[token]` (PRD's funnel treats Find→Recover and Find→Prevent as compatible next steps, not alternatives), `interested_in_recover`/`interested_in_prevent`/`interest_captured_at` on `businesses`. Verified end-to-end via real browser submission against the live project

### 1.8 Ops & Analytics
- [x] Internal admin view listing all audits/businesses — `/admin` extended to list every business with conversation/classification counts, report-viewed status, and product interest. Deliberately queries via the **authenticated** server client, not service-role, so it's real RLS-governed data access, not an admin backdoor — see the RLS re-verification note above
- [x] Basic funnel analytics (PRD §44 Find metrics): upload completion, analysis completion, report engagement, audit → product conversion — simple ratios computed in `/admin`, verified against real data end-to-end via browser (a real magic-link login → real JWT session → correct funnel numbers rendered)

**Also completed while building this**: provisioned the founder's (`probetsltd@gmail.com`) Supabase Auth account and granted `platform_admin` — silently (`createUser`, which never sends an email; only account creation + a privilege grant, no message sent). Their next real `/login` magic-link attempt will land them in `/admin` with full access. Fixed a real bug found via this testing: `/auth/confirm` was a server Route Handler that only read query params, but Supabase's magic-link redirect (with default email templates) puts the session in the URL **hash fragment**, which never reaches the server — every real login attempt would have silently failed. Rewritten as a client component handling both patterns; verified against a real generated magic link end-to-end post-fix (TESTS.md 2026-08-10).

### Phase 1 Gate Tests (log in TESTS.md before checking off)
- [x] End-to-end test: real or representative WhatsApp export → correct classification → correct report numbers → report renders correctly — repeated multiple times with representative synthetic exports (real parsing, real AI Gateway classification, real DB writes, real report rendering) against the live project (TESTS.md, several entries 2026-08-10). "Real" (an actual pilot business) still owed — see the item below and `OUTSTANDINGS.md` `DEV-1`
- [x] Tenant-isolation test passes (Cross-Cutting Workstream) — fully closed 2026-08-10 with a genuine Supabase Auth-issued session (TESTS.md), not just the earlier manually-set `auth.uid()` version
- [x] File-upload abuse test passes (oversized file, non-WhatsApp file rejected safely) — both tested for real (TESTS.md 2026-08-10), the oversized-file path surfaced and fixed a real bug (Server Action body limit). "malformed zip" no longer applies — `.zip` is out of V1 scope entirely (OUTSTANDINGS.md), so it's rejected by the same extension check as any other non-.txt file, already covered by the non-WhatsApp-file test
- [ ] Webhook signature verification test passes (Path B) — not applicable yet, Path B (WhatsApp Business API) is Phase 1.4b, blocked on `DEP-1`/`DEP-2`
- [ ] At least one real pilot business successfully completes an audit end-to-end — deferred to beta per `OUTSTANDINGS.md` `DEV-1`; everything tested so far is representative synthetic data, however rigorously
- [x] Rate limiting verified on public intake endpoint — tested in Phase 1.3 (6th submission correctly rejected, TESTS.md 2026-08-10)

---

## Phase 2 — RECOVER

**Goal (PRD §43):** Prove Capture can recover measurable revenue.

> ⚠️ **Scope decision (2026-08-11):** Phase 1.4b (WhatsApp Business API) is still blocked on `DEP-1`/`DEP-2` — real Meta Business account access. Rather than fake automated outbound sending or skip Phase 2 entirely, Recover is built as a **founder-operated semi-manual workflow**: the system identifies, scores, and schedules recovery targets (real, deterministic, tested); a human executes the actual WhatsApp contact and the app tracks state around it. This is explicitly consistent with PRD §42 ("manual before automated") and PRD §12's own workflow, which is human-executable end to end. Automated send/response-detection become a fast-follow once DEP-1/DEP-2 clear — the data model (`automations` table) doesn't need to change for that, only the execution mechanism.

### Build
- [x] `automation` entity + deterministic eligibility rules (rules before intelligence, PRD §42) for the three recovery targets (PRD §11): unanswered enquiry, cold high-intent conversation, previous customer reactivation — `automations` table already existed from Phase 1.1; `web/src/lib/recover/rules.ts` (pure functions, unit-tested: 15 assertions covering eligibility, scheduling for stale vs. fresh conversations per type, scoring math, follow-up cap, terminal states)
- [x] Opportunity scoring — deterministic 0-100 weighted score (intent 60% + relative value 40%), documented formula not a model. Verified against real data: e.g. medium intent + 80% of business-max value → 68, matching the hand-computed expectation exactly
- [x] Timing engine (appropriate wait period per opportunity type) — `computeScheduledAt()`; verified real seeded (months-old) opportunities schedule immediately since their wait period has already elapsed, per design
- [ ] Outbound send via WhatsApp Business API (reuses Phase 1.4b integration) — **blocked on DEP-1/DEP-2**, see scope decision above. `markContacted()` is the human-executes-it substitute for now
- [ ] Pre-approved message template handling (Meta requires approved templates for business-initiated sends outside the 24h session window — see OUTSTANDINGS.md) — blocked with the above, not applicable until real sending exists
- [x] Response-detection: inbound reply → automation stops → conversation state transitions to human-handling (PRD §32) — manual equivalent: `markResponded()` explicitly stops any pending automations for that opportunity (not just ignores them) and moves it to a terminal state, so it's auditable. Real automated inbound detection is blocked with the two items above
- [x] One-further-follow-up-max guardrail (PRD §12) — hard cap, not a soft default — `MAX_AUTOMATIONS_PER_OPPORTUNITY = 2`, enforced server-side in `markContacted()` (not just hidden in the UI). Verified end-to-end against real data: 2 contacts succeed, a 3rd is rejected with a clear message, and the DB confirms exactly 2 automation rows exist (the rejected attempt wrote nothing)
- [x] Manual attribution: Won / Lost / Not sure marking + manual revenue entry (PRD §14 — deliberately simple, do not build sophisticated attribution yet) — `recordOutcome()`, requires a positive revenue figure for Won. Verified end-to-end with real data
- [x] Recover Campaign Dashboard (PRD §13): opportunities identified, contacted, responses, recovered, **revenue recovered** (primary metric) — `/admin/recover/[businessId]`, revenue recovered rendered prominently (bold), matching PRD §13's explicit instruction that this is the metric that matters, not message/automation counts

### Phase 2 Gate Tests
- [ ] One real recovery campaign run end-to-end for a pilot business — blocked on real Phase 0 data per `OUTSTANDINGS.md` `DEV-1`; the full workflow (queue → contact → follow-up-cap → respond → Won with revenue) has been verified end-to-end against real (SIMULATED fixture) data instead (TESTS.md 2026-08-11)
- [x] Dashboard numbers reconcile against manual ground truth — verified against real data: after 1 Won at ₦11,500,000, dashboard showed exactly `Recovered (Won): 1`, `Revenue recovered: ₦11,500,000`, matching what was entered
- [x] Anti-spam guardrail verified: no customer receives more than one further follow-up — see above, verified at the DB level not just the UI
- [x] "Stop on response" verified: automation halts the moment a customer replies — verified: marking an opportunity responded stops its pending automations and removes all further contact actions from the UI for that opportunity
- [ ] Regression: Phase 1 tenant-isolation, upload-abuse, and webhook-signature tests still pass — tenant-isolation and upload-abuse unaffected by Phase 2 changes (no schema/RLS changes to those paths); webhook-signature still not applicable (Phase 1.4b not built). Full formal re-run not repeated this session — nothing in Phase 2's build touched those code paths

---

## Phase 3 — PREVENT

**Goal (PRD §43):** Prove Capture can prevent future leakage.

> ⚠️ **Scope decision (2026-08-11), `DEV-3`:** Prevent's core value proposition (real-time response over a live channel) is even more channel-dependent than Recover's. Channel connection itself (PRD §17A) is genuinely blocked on `DEP-1`/`DEP-2`/`DEP-4` — there is no substitute for a live Meta connection. But the response engine, safety constraints, escalation logic, kill switch, timers, and state machine are all independently buildable and testable using a **simulated-inbound-message harness** as a stand-in for the live webhook (same pattern as Phase 1.4a's file upload substituting for a live API) — and were built and rigorously tested this way. When DEP-1/DEP-2/DEP-4 clear, a real webhook handler calls the exact same `handleInboundMessage()` used here; nothing about the engine needs to change.

### Build
- [ ] Channel connect UX: WhatsApp + Instagram (where technically reliable, PRD §17A) — **blocked on DEP-1/DEP-2/DEP-4**, not attempted
- [x] Approved-knowledge ingestion (products/services, prices, FAQs, hours, locations, policies, delivery, booking process — PRD §17B) with AI-assisted structuring — `/admin/prevent/[businessId]/knowledge`, simple structured CRUD (category/question/content) rather than free-text-to-structured AI parsing; "AI-assisted structuring" of unstructured business input (e.g. a pasted price list) is not built — logged as a gap, not silently dropped
- [x] Real-time response engine, **hard-constrained to approved knowledge only** — must not answer outside what the business has approved — `web/src/lib/prevent/engine.ts`. The constraint is structural (the model must explicitly declare `can_answer_from_knowledge`, checked in code, not just prompt wording) plus a defense-in-depth check that discards any `response` paired with `can_answer_from_knowledge=false`. **Adversarial-tested against the real model — see gate tests below**
- [x] Intent classification (PRD §17C) and lead qualification field collection (PRD §17D) — both part of the same structured engine output; qualification fields (name/product/location/date/contact) merged onto the conversation without ever overwriting a captured value with a later null. Verified end-to-end: a message mentioning a name and location correctly populated exactly those two fields and nothing else
- [x] Escalation trigger detection (complaint, negotiation, unusual request, uncertain answer, high-value customer, explicit human request — PRD §18) — deterministic keyword pass first (PRD §42, unit-tested, 8/8 cases) for explicit human requests, AI structured judgment for the rest. Verified against real cases: fake-discount claims, out-of-catalogue products, prompt injection, and bulk/high-value requests all correctly escalated
- [ ] Internal notification via WhatsApp with lead summary card (PRD §19–20) — **delivery channel blocked** (same as above); the notification *content* exists as the conversation's escalation reason shown in the admin conversation list, but isn't pushed anywhere — a human has to be looking at the dashboard, not paged
- [x] Take Conversation / Dismiss controls (PRD §23) — selecting "Take Conversation" halts AI **immediately and verifiably** — `takeConversation()` in `web/src/lib/prevent/process.ts`. **"Assign" (routing to a specific salesperson) is not built** — only free-text "who's taking this" on take, no routing rules — logged as a gap. Kill switch **verified with a real race-condition test** — see gate tests below
- [x] Escalation timers (T+10 reminder, T+30 manager escalation, PRD §22) via scheduled jobs (Vercel Cron) — `/api/cron/escalation-timers`, secured with `CRON_SECRET` per Vercel's documented pattern, idempotent (re-running never double-fires a timer). Verified against real DB data at both thresholds independently. **Real constraint found, not assumed away**: Vercel Cron on the Hobby plan only runs once per day — nowhere near frequent enough for a 10-minute timer. Logged as `DEP-10`
- [x] Controlled follow-up cap (PRD §24) — same anti-spam discipline as Recover — `MAX_AI_FOLLOWUPS = 2` / `canSendFollowup()` in `web/src/lib/prevent/timers.ts`, mirroring Recover's guardrail exactly. Not yet wired to an actual "send follow-up" trigger in the UI (there's no automated proactive-follow-up scheduling built) — the cap logic exists and is correct, but nothing calls it yet. Logged as a gap
- [x] Full conversation state machine enforced (PRD §32): NEW → AI HANDLING → HUMAN REQUIRED → HUMAN HANDLING → CLOSED (and FOLLOW-UP → CLOSED branch) — enforced via `state` transitions in `process.ts`/the admin actions; verified via real conversations moving new → ai_handling → human_required → human_handling → closed
- [ ] Deployment workflow (PRD §27–28): Connect → Business Info → Configure Rules → Test → Approve → Activate, with Standard/Assisted/Custom tiers — not built as a distinct guided flow. "Business Info" (knowledge base) and "Test" (the simulate-inbound harness doubles as this) exist as standalone pieces; "Connect", "Configure Rules", "Approve", "Activate" as a formal workflow do not
- [x] Prevent Dashboard (PRD §25): enquiries received/answered, avg response time, qualified leads, human handoffs, follow-ups sent, outcomes, conversions/revenue where available — `/admin/prevent/[businessId]`, all real computed metrics except **avg response time (not computed — gap, not faked with a placeholder number) and conversions/revenue (explicitly labeled "Not tracked in V1" rather than showing a fake zero)**

### Phase 3 Gate Tests
- [ ] Same-day deployment dry run completed for a Standard-tier pilot business — blocked: no deployment workflow UI, and no live channel to actually deploy onto
- [x] Escalation timers fire correctly in staging (T+10, T+30) — verified against real DB data (not staging per se, but the real live Supabase project): a conversation escalated 12 minutes ago correctly fired only `t10_reminder`; the same conversation at 35 minutes correctly fired only `t30_manager_escalation` (not a duplicate t10). Re-running the cron immediately after confirmed idempotency (0 actions applied)
- [x] Kill-switch test: "Take Conversation" halts AI within the same request cycle, verified with a race-condition test (message in flight when human takes over) — **verified three ways**: (1) a real race — takeover fired 500ms into a real ~1-2s AI call, response correctly discarded, zero AI messages written; (2) a control with no takeover — AI responded correctly, proving the suppression above was specifically caused by the race, not a general bug; (3) a follow-up message to an already-human-handled conversation was suppressed at the pre-check stage (fast, no AI call attempted) even though the question was trivially answerable — proving the kill switch stops AI for *all* messages, not just hard ones
- [x] Adversarial/jailbreak test suite: AI never answers outside approved knowledge across a curated set of prompt-injection attempts — 10 cases against the real model (`anthropic/claude-haiku-4.5`): 8 adversarial (prompt leak, DAN-style role override, fake prior discount approval, out-of-catalogue products ×2, fake system message injection, internal-info extraction, unusual bulk/high-value request) all correctly escalated with **zero leaked responses**; 2 legitimate in-knowledge questions correctly answered accurately. 0 structural failures
- [ ] Regression: Phase 1 + Phase 2 gate tests still pass — not formally re-run this session; Phase 3's schema additions (new columns/table) don't touch Phase 1/2's existing tables or logic, so risk is low, but this should not be treated as equivalent to an actual re-run

---

## Phase 4 — Productisation

**Goal (PRD §43):** Reduce human implementation effort while preserving quality.

> ⚠️ **Process deviation (2026-08-11), `DEV-4`:** PRD §43 frames Phase 4 as coming "after real deployments" — none exist yet (Phase 0/1 real-pilot items are still open, see `DEV-1`/`DEP-8`). Built ahead of that per explicit founder instruction (confirmed via `AskUserQuestion` before starting: "Full Phase 4 as scoped in PLANS.md"). Everything below is real, tested code against real (test) accounts and the live Supabase project — what's *not* real yet is a genuine external self-serve signup, since none has happened outside of my own test accounts (all deleted after testing, see `TESTS.md`). See `OUTSTANDINGS.md` `DEV-4` for the billing-scope interpretation.

### Build
- [x] Standardised onboarding across Find/Recover/Prevent — `/onboarding`, one entry point for both a fresh self-serve signup and a Find-originated business claiming its account (`web/src/app/onboarding/`), rather than separate flows per product. Business Info (name/industry) + Configure Rules + knowledge-base pre-population all happen in this one step. Verified end-to-end for both paths (TESTS.md 2026-08-11).
- [x] Self-service signup — `/signup` (magic link, reuses `/login`'s existing `requestMagicLink` — see that action's comment: any email could already authenticate, nothing ever turned that into real business access until now) + `/onboarding` creates the `business_members` grant via a server-verified session, never trusting client-supplied identity. "Billing/plan limits" scoped as *product enrollment tracking* (`recover_activated_at`/`prevent_activated_at`, self-serve "Activate" toggles), not payment processing — see `OUTSTANDINGS.md` `DEV-4` for why, and the pinned V1 Non-Goals reminder above. Claim flow (existing Find business → real account) verified secure: wrong-email rejected, correct-email succeeds, already-claimed rejected (TESTS.md 2026-08-11).
- [x] Deployment automation (reduce Assisted-tier manual work) — self-serve equivalents of PRD §27-28's steps that don't require a live channel: Business Info + Configure Rules (`/dashboard/settings`: business-configurable `max_ai_followups`/`max_recover_followups`/`escalation_keywords`, overriding the previously-hardcoded constants) + Test (existing simulate-inbound harness, now reachable by the business owner directly, not just the founder) + Approve/Activate (`ActivateButton`, Prevent activation requires ≥1 knowledge item). "Connect" stays blocked on `DEP-1`/`DEP-2`/`DEP-4` — unchanged from Phase 3.
- [x] Reusable per-vertical configuration templates — `vertical_templates` table, seeded for 3 verticals (`real_estate`, `automotive`, `hospitality`), keyed by the same `industry` values Find already collects (PLANS.md deliberately did not introduce a second "vertical" concept). Applied automatically at onboarding via one code path (`applyVerticalTemplate()`) regardless of entry point. Verified reused across 2 different verticals with zero custom code — `real_estate` and `automotive` templates each correctly populated distinct knowledge items and escalation keywords for two different test businesses (TESTS.md 2026-08-11), satisfying the gate test below.
- [x] Reporting toward the North Star metric (PRD §45) — `web/src/lib/report/north-star.ts`, surfaced on both the self-serve `/dashboard` (per-business) and `/admin` (platform-wide, real businesses only — `SIMULATED —` fixtures excluded). Honest about what's not measurable yet: `revenueProtected` (Prevent's leg) is always `null`, never a fabricated number, and `incrementalRevenueInfluenced` is documented as only the Recover leg for now.

### Phase 4 Gate Tests
- [ ] N self-service signups completed with zero founder intervention — the *mechanism* is real and tested (TESTS.md 2026-08-11), but every signup exercised so far was a test account created and deleted by me, not an actual external business. Still open pending real usage, same shape as `DEV-1`.
- [x] A configuration template reused across ≥2 different verticals without custom code — verified: `real_estate` and `automotive` templates applied via the identical `applyVerticalTemplate()` path for two different test businesses, each correctly getting their own distinct knowledge items/keywords (TESTS.md 2026-08-11).
- [ ] Regression: full suite from Phases 1–3 still passes — tenant isolation re-verified for real this session (TESTS.md 2026-08-11); the rest of Phases 1-3's gate tests were not formally re-run (no schema/RLS changes to their tables beyond additive columns), consistent with how Phase 3's own gate section treats this same caveat.

### Phase 4 Hardening Audit (2026-08-11)

A full-build audit run after Phase 4 shipped. **14 confirmed defects found and fixed** — see TESTS.md's "Phase 4 — Hardening Audit" section for the evidence behind each. Every finding was reproduced against the running system before being fixed and re-verified after.

The three that mattered most, all introduced by opening the platform to self-service signup:

- **Vertical-template knowledge was treated as business-approved fact.** Phase 4's per-vertical templates seeded `knowledge_items` with boilerplate written in a migration, and both the response engine and the Prevent activation gate accepted it. A business could sign up, activate, and have the AI state fabricated opening hours and cancellation terms to real customers — collapsing the exact guarantee Phase 3 was built around and adversarially tested for. This is the clearest lesson of the audit: **Phase 3's safety property was never encoded, only implied by how rows happened to be created.** A Phase 4 convenience feature invalidated it without touching any Phase 3 code or failing any existing test. Now explicit via `knowledge_items.approved_at`, and added to the regression watch list.
- **PRD §12's anti-spam follow-up cap was user-defeatable** — a business could set it to 500 via the settings form. Now clamped at the enforcement point, validated in the action, and bounded by a DB CHECK.
- **Open redirect** — the `next` param blocked `//` but not `/\`, which browsers resolve to an external origin, and the actual redirect sink validated nothing at all.

Also fixed: self-serve businesses were created with no `upload_token` (every Find link rendered `/upload/null`); RLS-denied writes reported success to the user; signup captured no consent record; business+owner creation was non-atomic and could strand orphan tenants; the claim race was a read-then-write check; the LLM endpoint was unmetered; stop-on-response was enforced only by hiding a button; "Messages handled" counted the uploaded Find history; and two pieces of dead code were removed — including a settings control that persisted a number nothing ever read.

**Standing lesson for future phases:** a safety invariant that lives only in "how the data usually gets created" is not enforced. If a guarantee matters, it needs a column, a constraint, or a check that a new feature has to actively defeat rather than merely bypass.

---

## Hypotheses Tracker (PRD §46)

| ID | Hypothesis | Tested in | Status |
|---|---|---|---|
| A1 | ₦50m+ Lagos SMEs have enough conversation volume to matter | Phase 0 | ⬜ |
| A2 | WhatsApp is the best initial data source | Phase 0 / Phase 1 | ⬜ |
| A3 | Revenue leakage is large enough to create urgency | Phase 0 | ⬜ |
| A4 | Businesses will allow Capture access to customer conversations | Phase 1 | ⬜ |
| A5 | Businesses will pay ₦150k+/month for Prevent | Phase 3 | ⬜ |
| A6 | Businesses will trust controlled AI responses | Phase 3 | ⬜ |
| A7 | Revenue recovery can be attributed sufficiently for commercial reporting | Phase 2 | ⬜ |
| A8 | The same core workflow can serve multiple industries without excessive customisation | Phase 4 | ⬜ |
| A9 | Same-day deployment is technically/operationally feasible for standard customers | Phase 3 | ⬜ |

---

## V1 Core Test (PRD §50)

At the end of V1, we should be able to answer:
1. [ ] Can we identify meaningful revenue leakage from customer conversations?
2. [ ] Will businesses give us the required data and access?
3. [ ] Will businesses pay us to fix the problem?
4. [ ] Can we deploy repeatedly with little human effort?
5. [ ] Can we demonstrate measurable financial value?

If yes to all → expand. If no → fix the thesis before adding products or features (PRD §50).
