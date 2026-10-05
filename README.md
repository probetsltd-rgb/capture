# Capture

Capture is a revenue-execution platform for established, already-trading Nigerian businesses (Lagos-focused) that helps them stop losing sales from slow or missed customer responses on the channels they already use — Instagram and WhatsApp DMs.

It's made up of three independent products:

- **Engage** — responds instantly to Instagram, WhatsApp, and Facebook Page Messenger enquiries, qualifies them (name, product, timing), and escalates anything sensitive (price negotiation, complaints, unusual requests) to a person by email and WhatsApp instead of guessing. Answers are hard-constrained to only what a business has explicitly approved — never invented, never guessed.
- **Find** — reads a business's existing WhatsApp or Instagram conversation export (or a connected channel's real history) and prices the revenue sitting in enquiries that went unanswered or unfollowed-up. Free, and doesn't require Engage.
- **Recover** — ranks a business's dormant leads and past customers, times outreach to each opportunity, and stops automatically the moment someone replies. Independent of Engage, but needs Find's conversation-history report as a prerequisite.

## Stack

- **Next.js 16** (App Router), **React 19**, TypeScript
- **Supabase** (Postgres + Auth), accessed via `@supabase/ssr`/`@supabase/supabase-js`, RLS-governed multi-tenancy
- **Vercel** for hosting, cron jobs, and Blob storage
- **AI SDK** (`ai` / Zod schemas) against an Anthropic model for the Engage response engine
- **Meta Graph API** integrations: Instagram Messaging, WhatsApp Cloud API (Embedded Signup), Facebook Page Messenger
- **Resend** for transactional email, **Paystack** for billing

## Repo layout

```
web/                    Next.js app (the actual product)
  src/app/              Routes — dashboard, admin, onboarding, public marketing pages, API routes
  src/lib/               Core logic — prevent/ (Engage's response engine), channels/, recover/, report/, notifications/
  src/components/        Shared view components
supabase/migrations/     SQL migrations, applied directly to the linked Supabase project
phase0/                  Early validation materials (audit guides, outreach scripts)
Capture_PRD.md           Product requirements
PLANS.md                 Build plan / phase tracker
OUTSTANDINGS.md          Running log of what's shipped, what's open, and known dependencies/risks
TESTS.md                 Verification log
```

## Getting started

```bash
cd web
npm install
npm run dev
```

You'll need a `.env.local` in `web/` — see the Supabase, Meta (Instagram/WhatsApp/Facebook), Resend, and Paystack credentials referenced throughout `src/lib/`. Nothing is hardcoded; every integration reads from environment variables.

Database migrations live in `supabase/migrations/` and are applied directly to the linked Supabase project via the Supabase CLI — there's no separate local Postgres setup.

## Where to look first

- `OUTSTANDINGS.md` is the single source of truth for what's actually shipped versus still open — read it before assuming a feature, integration, or decision is already in place.
- `Capture_PRD.md` and `PLANS.md` carry the product rationale and phased build sequence.
