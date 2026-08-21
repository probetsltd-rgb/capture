# Meta App Review — Submission Package (Instagram, `DEP-4`)

Drafted 2026-08-17/18, in response to the founder's direct request. This is what's needed to submit for **production, multi-tenant access** to the Instagram API with Instagram Login product — the thing that lets any real business connect their own Instagram account to Engage, instead of only accounts the founder has manually added as testers in the Meta App Dashboard.

Everything below was checked against Meta's own current developer docs (not memorized/stale training data) and against this codebase's actual shipped OAuth/webhook code — see `OUTSTANDINGS.md` `DEP-4` for how that verification was done and why it matters (this session already found Meta's docs disagreeing with live behavior once, on the token-exchange HTTP method).

**I did not submit anything.** Submitting starts Meta's review clock and puts the business's name in front of a live reviewer — that's a real, semi-irreversible action on an external platform, and it also requires the founder's own Meta login. Everything here is ready to paste into the App Dashboard's App Review flow once you open it.

---

## 0. Blocking prerequisite — resolved 2026-08-19

**Was**: `/privacy` was labeled "Draft, not final legal terms... pending legal review," described only the Find/WhatsApp-export flow, and no Data Deletion Instructions existed anywhere.

**Now live**, per the founder's explicit 2026-08-19 instruction to update it directly:

- `/privacy` rewritten as one combined **Capture — Terms & Privacy** document (`web/src/app/privacy/page.tsx`) — deliberately framed around **Capture** as the single service, with Find/Recover/Engage described as its products, not three separate policies. Covers what each product does/doesn't do, Instagram-specific data handling (§5's draft below, now published), AI usage, and retention/deletion. The old "draft, not final legal terms" banner was removed and replaced with a lighter, honest note (plain-language, not lawyer-reviewed, contact us with questions) — **this is a real judgement call, not a legal sign-off**: the founder asked for this content live, but nothing here has had an actual lawyer review it. Worth real legal review before this matters at scale, same as before.
- **A real, working, self-serve Data Deletion workflow was built**, not just an instructions page: `/dashboard/settings` → "Data & privacy" → "Delete my Instagram data" — a business owner can immediately and permanently delete every customer, conversation, and message sourced from their Instagram connection, plus the connection itself (`web/src/lib/channels/instagram.ts`'s `deleteInstagramData()`, wired through `dashboard/actions.ts`'s `deleteInstagramDataAction`). Logs to the (previously-unused) `audit_log` table. This means Meta's **Data Deletion Instructions URL** variant is satisfied with a real mechanism behind it, not just a promise — see `web/src/app/data-deletion/page.tsx`, live at `capture.com.ng/data-deletion`.
- **Two placeholders from the original draft were filled with real values**, not left open: support contact is `probetsltd@gmail.com` (the founder's own address — swap for a dedicated support inbox later if you want one, it's a one-line change in two files), and the manual-request processing window is stated as 30 days (a standard, defensible period — not contractually reviewed, just a reasonable default).

Business Verification is confirmed completed and accepted (founder, 2026-08-19) — the other half of this prerequisite chain is now clear too. Both blockers from the original §0 are resolved; nothing outstanding is blocking submission on the "prerequisites" side anymore except the screencast (§4) actually being recorded.

---

## 1. Prerequisites checklist (confirm before opening the App Review flow)

- [x] **Meta Business Verification completed** — confirmed by the founder 2026-08-19 (completed and accepted).
- [x] **Tech Provider access verification approved** — confirmed by the founder 2026-08-20. Distinct from Business Verification (which it requires as a prerequisite) and from App Review itself — per Meta's own docs, "access verification is independent of App Review and permission access levels," so this **does not** bypass or shorten the `instagram_business_manage_messages` review below. Genuinely relevant to the multi-tenant model regardless (lets Capture call certain endpoints on behalf of client businesses without them needing an app role) — see `OUTSTANDINGS.md` `DEP-4` for the full note, including the honest caveat that it's unconfirmed whether this resolves the Instagram tester-pre-registration friction specifically.
- [x] **Privacy Policy URL** — `capture.com.ng/privacy`, live, rewritten 2026-08-19 (see §0).
- [x] **Data Deletion Instructions URL** — `capture.com.ng/data-deletion`, live, backed by a real self-serve deletion action (see §0).
- [ ] **A test Instagram professional account you can demonstrate with on camera** — `rentit_online` (already connected). Its conversation history was deliberately reset to zero on 2026-08-20 for a clean screencast — the Simulate form or a real fresh DM can populate a demonstrable conversation before recording. Log out and back in on camera per Meta's own instruction below, don't skip the logged-out state.
- [ ] **Screen recording software** ready — Meta explicitly wants mouse movements visible (not keyboard shortcuts), no audio, 1080p or better, browser window narrowed to ≤1440px wide so UI elements read clearly at review resolution.

---

## 2. Permission scopes being requested

Confirmed directly from the code already built and verified end-to-end this session (`web/src/lib/channels/instagram-api.ts`'s `SCOPES` constant, with its own comment noting these are "current (post-Jan-2025) scope names — the older `business_basic`/`business_manage_messages` names were deprecated"), cross-checked against Meta's live Instagram Platform docs today:

| Scope | What it does | Why Engage needs it |
|---|---|---|
| `instagram_business_basic` | Read the connected account's basic profile metadata (username, ID, profile picture) | Needed to identify which Instagram account connected, display it back to the business owner (`rentit_online` shown in the dashboard's connection status), and attribute inbound messages to the right `channel_connections` row |
| `instagram_business_manage_messages` | Receive and send Instagram Direct messages via the Messaging API | This is Engage's entire premise — receiving a customer's DM in real time via webhook and sending an AI-drafted reply back, or routing to a human when the message needs judgement |

Two scopes only. Not requesting `instagram_business_content_publish` or `instagram_business_manage_comments` — Engage doesn't publish content or manage comments, and requesting unused scopes is a documented rejection risk (reviewers test that an app actually exercises everything it asks for).

**One thing I could not verify from docs and want to flag rather than assume**: some third-party sources claim Instagram Business accounts must be linked to a Facebook Page for messaging permissions. I checked Meta's own Instagram API with Instagram Login documentation directly (the specific product this app uses, chosen originally *because* it's the no-Facebook-Page-required flow) and found no such requirement stated there — but Meta's own docs also didn't explicitly rule it out. `rentit_online`'s real, working, already-verified OAuth connection (TESTS.md, 2026-08-15) is itself pretty strong evidence no Page link was needed for the connection to work, but that doesn't guarantee App Review won't ask about it. Worth a five-minute check on Meta's Business Verification/App Review dashboard when you get there, not worth blocking the submission over.

---

## 3. Per-permission written justification (paste into the App Dashboard)

Meta's submission flow requires a specific, honest description of *why* the app needs each permission, and separately tests that the app actually uses it as described. Draft text below — edit freely, but keep it concrete and specific (Meta's own guidance: "be as specific as possible").

### `instagram_business_basic`

> Capture is a customer-conversation platform for small and medium businesses. When a business owner connects their Instagram account to Capture's Engage product, we use `instagram_business_basic` to read the connected account's username, ID, and profile picture — solely to confirm which account is connected and display that confirmation back to the business owner in their own dashboard (e.g. "Connected: @rentit_online"). We do not use this data for any purpose beyond identifying and displaying the connected account.

### `instagram_business_manage_messages`

> Capture's Engage product helps small businesses respond to Instagram Direct Message enquiries instantly instead of leaving customers waiting. With `instagram_business_manage_messages`, once a business owner has connected their own Instagram account and explicitly approved a knowledge base of factual business information (hours, pricing, policies, product details), Capture:
>
> 1. Receives the business's own incoming Instagram DMs in real time via webhook.
> 2. Classifies each message using an AI model constrained to answer only from that business's explicitly approved knowledge — never general knowledge, never an invented answer. Anything the system can't confidently ground in approved knowledge, or that requires human judgement (a complaint, a price negotiation, an unusual request), is automatically escalated to the business's own team instead of answered.
> 3. Sends the AI-drafted reply back to the customer as the business's own account, only when the system determined the answer is safe and fully grounded.
>
> This is a same-business, same-account loop throughout: the business owner's own Instagram account receives its own customers' messages and replies to them through Capture's interface, with the business owner able to take over any conversation manually at any time (which immediately and permanently suppresses further automated replies on that conversation).

---

## 4. Screencast script

Meta's own submission guide, verified directly (not assumed): the recording must show the **entire login flow from logged-out to logged-in**, the user **granting each permission**, and then **actual use of the resulting functionality** — in that order, English UI, mouse visible, no audio, no keyboard shortcuts, one continuous take is safest (multiple clips per permission is allowed but a single walkthrough is simpler to keep coherent).

**Recommended flow, using `rentit_online` as the demo account:**

1. **Start logged out.** Open `capture.com.ng/dashboard` in a fresh/incognito-style window (or actually sign out first) so the login screen is the first thing on camera.
2. **Sign in** as the Rentit business owner account (real magic-link or password flow, whichever is live) — show the dashboard landing on `/dashboard/engage`, Instagram shown as **not connected** (disconnect first if it's currently connected, so the Connect flow is genuinely demonstrated, not just described).
3. **Click "Connect Instagram"** (or the equivalent CTA on `/dashboard/engage`) — this redirects to Meta's real OAuth consent screen.
4. **On Meta's consent screen**, let the full permission list render and pause a beat so a reviewer can read it — this is the actual moment `instagram_business_basic` and `instagram_business_manage_messages` are granted. Approve.
5. **Redirect back to Capture**, showing the connection now live: `rentit_online` displayed as connected (this is `instagram_business_basic` in use — the username/profile data being read and shown).
6. **Show the historical 30-day baseline** populating on `/dashboard` ("Your last 30 days on Instagram") — real data pulled via the connection.
7. **Send a real DM** to `rentit_online` from a second, personal Instagram account (screen-recorded on a phone or a second browser window/tab if using Instagram web) — a question answerable from Rentit's approved knowledge (e.g. "what are your hours?").
8. **Cut back to Capture's dashboard** and show the conversation appearing in `/dashboard/engage`, and the AI's reply visible in the conversation thread — this is `instagram_business_manage_messages` fully exercised: receive plus send, in the flow the justification text above describes.
9. **Optional but strengthens the submission**: send a second DM that should escalate (e.g. "can I get a discount?") and show it landing in the dashboard as "Human required" with no AI reply sent — demonstrates the safety behavior described in the justification text, which reviewers do sometimes credit.
10. **End on the Disconnect control** (`DisconnectInstagramButton`) — briefly show it exists, without necessarily clicking it, as evidence the business owner can revoke the connection at will.

Total length: aim for under 3 minutes. Longer isn't better — Meta's guidance is about completeness (every permission shown in use), not thoroughness for its own sake.

---

## 5. Data handling — now live on `/privacy` and `/data-deletion` (2026-08-19)

This section originally drafted proposed Instagram-data-handling copy for legal review before publishing. Per the founder's explicit 2026-08-19 instruction, it's since been written into the real, live pages instead of staying a draft:

- **`capture.com.ng/privacy`** — rewritten as one combined Terms & Privacy document, with an "Engage — Instagram data specifically" section covering exactly what's described below (what's collected, how it's used, that it's never used for AI training, that only the specific message being answered is sent to the AI provider, not full history).
- **`capture.com.ng/data-deletion`** — new, dedicated page. Describes the real self-serve mechanism (§0) for business owners, plus a manual path (email `probetsltd@gmail.com`, processed within 30 days) for anyone who can't sign in.

The `[SUPPORT EMAIL]`/`[X days]` placeholders from the original draft are resolved: `probetsltd@gmail.com` and 30 days, both real, working, published values now — not still open.

---

## 6. What happens after submission

- Confirmed via research this session: typical review timelines run **4–6 weeks**, though messaging permissions (`*_manage_messages`) are noted as one of the more heavily-scrutinized permission categories, so budget toward the longer end and expect at least one round of reviewer follow-up questions as normal, not a sign something's wrong.
- Business Verification (§1) can bounce back with document requests — respond promptly, it blocks the whole chain.
- Once approved, re-verify the assumption already logged in `OUTSTANDINGS.md` `DEP-4`: that any business can complete OAuth directly without being pre-added as a tester. Don't assume it — test it with a real, non-tester Instagram account the moment approval lands.
