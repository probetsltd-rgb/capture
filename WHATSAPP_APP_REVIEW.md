# Meta App Review — Submission Package (WhatsApp, `DEP-12`)

Drafted 2026-09-08, in response to a real, live error: connecting Rentit's WhatsApp Business Account through the real Embedded Signup flow failed silently at the Facebook Login step ("capture.com.ng can't continue using facebook.com — This option is unavailable right now").

**Root cause** (confirmed against Meta's current docs, not guessed): `whatsapp_business_management` and `whatsapp_business_messaging` both start at **Standard Access**, which only works on WABAs Capture's own Business already owns — exactly why "Engage by Capture" (Capture's own number) works, and exactly why Rentit's genuinely separate WABA doesn't. This is not an app-mode or tester-role issue — the app was already switched to Live before this was hit. The only fix is **Advanced Access**, granted through App Review.

**✅ Submitted 2026-09-08** (founder-confirmed). Now in Meta's review queue — see §5 below for expected turnaround and what to do once a decision lands. Everything below is the actual submission content, kept as the record, not a draft.

---

## 1. What's already in place

- Business Verification: done (shared across the whole Meta Business, same as the Instagram submission relied on).
- App is Live (confirmed by the founder while hitting this exact error).
- A real, working connection already exists on Capture's own WABA — used for the demo videos below, since Rentit's is exactly the thing currently blocked.
- A real, working message-template creation feature now exists (`/admin/whatsapp-templates`, founder-only) — a genuine template (`engage_followup_nudge`, UTILITY category, one `{{1}}` variable) was created against the live API while building this and is sitting `PENDING` in WhatsApp Manager, ready to show in the video rather than needing a fresh one recorded live.

## 2. Permissions being requested (Advanced Access)

| Permission | What it does | Why Engage needs it |
|---|---|---|
| `whatsapp_business_management` | Manage a connected business's WABA settings and message templates | Reads the connected number's display details to confirm the connection back to the business owner, and creates/manages message templates needed for business-initiated messages outside WhatsApp's 24-hour customer-service window (Recover follow-ups, Prevent nudges — `DEP-3`) |
| `whatsapp_business_messaging` | Send and receive messages on a connected business's WhatsApp number | Engage's entire premise — receiving a customer's message in real time via webhook and sending an AI-drafted reply back, or routing to a human when the message needs judgement |

## 3. Written justification (paste into the App Dashboard)

### `whatsapp_business_messaging`

> Capture's Engage product helps small businesses respond to WhatsApp enquiries instantly instead of leaving customers waiting. Once a business owner connects their own WhatsApp Business Account via Embedded Signup and explicitly approves a knowledge base of factual business information (hours, pricing, policies, product details), Capture:
>
> 1. Receives the business's own incoming WhatsApp messages in real time via webhook.
> 2. Classifies each message using an AI model constrained to answer only from that business's explicitly approved knowledge — never general knowledge, never an invented answer. Anything the system can't confidently ground in approved knowledge, or that requires human judgement (a complaint, a price negotiation, an unusual request), is automatically escalated to the business's own team instead of answered.
> 3. Sends the AI-drafted reply back to the customer as the business's own account, only when the system determined the answer is safe and fully grounded.
>
> This is a same-business, same-account loop throughout: the business owner's own WhatsApp number receives its own customers' messages and replies to them through Capture's interface, with the business owner able to take over any conversation manually at any time.

### `whatsapp_business_management`

> Capture is a customer-conversation platform for small and medium businesses, built as a Tech Provider on the WhatsApp Business Platform. When a business owner connects their own WhatsApp Business Account via Embedded Signup, Capture uses `whatsapp_business_management` to read the connected number's basic details (display name, phone number) to confirm the connection back to the business owner, and to create and manage message templates on that business's behalf — needed for business-initiated messages sent outside WhatsApp's 24-hour customer-service window (for example, following up on a dormant enquiry the business asked Capture to re-engage). Every template is created for, and used only by, the specific business that granted access to it — Capture never accesses or manages a WABA it hasn't been explicitly connected to.

## 4. Video requirements (per Meta's current docs)

Each permission needs its own separate screen recording — not combined, no screenshots.

- **`whatsapp_business_management`**: show the app creating a message template. `/admin/whatsapp-templates` already has a real, working form against Capture's own connected WABA — the `engage_followup_nudge` template already created is real proof this works, but Meta likely wants the creation itself on camera, so recording a second one live is the safer choice.
- **`whatsapp_business_messaging`**: show the app sending a message and the recipient receiving it. Use Capture's own connected number as the sender (`/dashboard` → Engage → send a real message, or trigger a real inbound conversation and let Engage reply) and a personal WhatsApp on a second phone/number as the recipient.

**Which account to use**: Capture's own WhatsApp number ("Engage by Capture"), not Rentit's — Rentit's is the one currently blocked, so it can't be the demo account.

## 5. What happens after submission

- Typical turnaround for this specific review: **~24 hours** per Meta's current docs — meaningfully faster than Instagram's 4-6 weeks (`META_APP_REVIEW.md` §6).
- Once Advanced Access is granted, re-test Rentit's Connect WhatsApp flow — that's the actual confirmation this is fully resolved, not just the App Dashboard showing "Approved."
- **Status: Submitted 2026-09-08, pending Meta's decision** (`OUTSTANDINGS.md` `DEP-12`). Update this line and `DEP-12`'s status once a decision lands, and re-test Rentit's Connect flow immediately either way — an approval that doesn't actually work for a real, unaffiliated business isn't actually closed.
- For context if useful later: by the time this was submitted, a real end-to-end WhatsApp exchange (inbound message → AI reply → human takeover → human reply, `OUTSTANDINGS.md` `DEV-39`) already existed on Capture's own number — the `whatsapp_business_messaging` justification text above describes exactly what that exchange demonstrated.
