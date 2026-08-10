# Phase 0 — Manual Conversation Audit Guide

Companion to [PLANS.md](../PLANS.md) Phase 0. This is the methodology for the 5–10 manual business audits that gate entry into Phase 1. Follow this consistently across every business so the results are comparable and the recurring-pattern analysis (the actual Phase 0 goal) is real, not anecdotal.

Templates that go with this guide:
- **[candidate_business_tracker.csv](./candidate_business_tracker.csv)** — one row per business you approach, logging outreach and outcome (agreed / declined / no response). Start here.
- **[conversation_log_template.csv](./conversation_log_template.csv)** — one row per conversation, classified using the exact PRD §9 taxonomy. This becomes labeled ground-truth data you can later validate the Phase 1 AI classifier against.
- **[business_summary_template.csv](./business_summary_template.csv)** — one row per audited business, rolling up the conversation log into the Revenue Leak Report shape (PRD §10).

---

## 1. Business selection

Target the ICP as defined in PRD §3, not just any willing business:

- Approx. ₦50m+ annual revenue
- Already spending money to acquire customers
- Meaningful inbound enquiry volume
- Customers communicate via WhatsApp and/or Instagram
- Relatively high customer value (transaction size matters — low-value/high-volume retail will understate opportunity value)
- Someone (owner, sales rep, or team) is currently managing enquiries manually

Deliberately vary the sample across 2–3 of the candidate verticals in PRD §3 (e.g. real estate, automotive, travel, professional services) rather than auditing 8 businesses in one vertical — you're testing hypothesis A8 (cross-industry applicability) as well as A1/A3.

Log each candidate business and outcome (agreed / declined / no response) in [candidate_business_tracker.csv](./candidate_business_tracker.csv) as you go — this data feeds `DEP-8` in OUTSTANDINGS.md and the agreed/declined/no-response ratio is itself a signal on A4 (will businesses grant access at all). Aim to approach more than 5–10 businesses, since not everyone will say yes — the tracker's outcome column is what tells you your real conversion rate.

### Outreach template

Keep the ask low-friction and framed exactly as the free diagnostic it is (PRD §36's positioning: "Don't leave money on the table"). Adapt to your relationship with the contact — a warm intro can be shorter than this.

> Hi [Name], I'm building something called Capture — it looks at a business's WhatsApp conversations and shows where enquiries are going unanswered or going cold before they turn into sales. It's free, takes about 15 minutes of your time, and I'll show you the actual numbers for your business, not a generic pitch.
>
> All I'd need is: an export of 20–50 of your WhatsApp conversations (I'll show you exactly how — it's a couple of taps in WhatsApp itself, no account or access needed), your rough average sale value, and your rough monthly enquiry volume. Everything you share is confidential to this review and I'll delete the raw export once we've gone through the results together.
>
> Would you be open to it this week?

Points to hit regardless of exact wording, since these map directly to what makes a business a valid Phase 0 subject and what the consent record needs to cover:
- **Free** — no ambiguity about being sold something at this stage.
- **What you need from them** — export, avg transaction value, monthly volume (§2 below) — set expectations up front so the ask doesn't feel open-ended.
- **Confidentiality / deletion commitment** — this is the verbal consent you're capturing; note the date and channel it was given in the tracker's `notes` column, since that's your record for DEP-8 and the data-handling commitments in §2 below.
- **You'll show them real numbers from their own data** — this is the hook; avoid generic AI/automation framing per PRD §36 ("the website should sell one idea").

## 2. Getting the data

Use the same manual export path planned for Phase 1 (PRD §7) — this doubles as a dry run of that UX:

1. Ask the business owner/manager to export their WhatsApp chat history (native "Export Chat" per conversation thread, without media to keep files manageable).
2. Request **20–50 representative conversations** (PRD §7) — not just the 20 most recent. Ask specifically for a mix of: recent conversations, conversations from 2–6 months ago (to catch abandoned/reactivation cases), and if possible a couple of known "we lost this one" examples the business already knows about (useful for calibration).
3. Ask for their approximate **average transaction value** — needed for opportunity-value estimation (PRD §10) and can't be derived from the conversations alone.
4. Ask for their approximate **monthly WhatsApp conversation volume** — needed for A1 (volume hypothesis) and to sanity-check how representative the 20–50 sample is.

### Optional: bulk-parse exports before classifying

[parse_whatsapp_exports.py](./parse_whatsapp_exports.py) reads a folder of raw `.txt` exports (one file per conversation, WhatsApp's native per-chat export) and auto-fills the structural columns of `conversation_log_template.csv` — `customer_ref`, `conversation_id`, `channel`, `first_message_date`, `last_message_date`, `message_count` — leaving the classification columns blank for you to fill in by hand while reading each conversation. It never reads message content, only timestamps/senders, so it doesn't do any classification itself. It also writes a separate `conversation_id → source filename` mapping file so you can trace a row back to the right export while reviewing — keep that mapping file access-restricted per the data-handling rules below, same as the raw exports.

```
python3 parse_whatsapp_exports.py \
  --business "Business Name" \
  --input ./raw_exports/ \
  --output ./conversation_log_template.csv
```

Safe to re-run on the same input folder (already-parsed files are skipped, no duplicate rows).

### Data handling (do this even though Phase 0 has no code)

This is real customer data belonging to a third party. Treat it with the same discipline the Cross-Cutting Security Workstream in PLANS.md will later enforce in software:

- Store raw exports in a single access-controlled location (not scattered across email/Drive/Downloads).
- Do not forward raw exports to anyone outside the audit; if you need a second opinion, share the anonymised conversation log, not the raw export.
- Delete the raw export once the audit and business summary are complete and confirmed with the business, unless the business has explicitly agreed it can be retained (e.g. as a Phase 1 pilot dataset — track that agreement in OUTSTANDINGS.md `DEP-8`).
- When filling in `conversation_log_template.csv`, put customer names/numbers in the `customer_ref` column as a short pseudonym (e.g. `C1`, `C2`), not the real name/number — keep a separate, more tightly held mapping file only if you need to trace back to the original export.

## 3. Classifying each conversation

Use the exact PRD §9 taxonomy — do not invent categories, since this needs to line up with what Phase 1's classifier will later be validated against.

| Field | Values |
|---|---|
| **Conversation Type** | sales enquiry / existing customer / support / complaint / general / spam-irrelevant / unknown |
| **Intent** | high / medium / low / none |
| **Status** | converted / likely converted / abandoned / no response / unresolved / unclear |
| **Leakage Type** | business failed to respond / delayed response / customer showed buying intent but conversation ended / quote or enquiry not followed up / previous customer potentially reactivatable / other / none |

Notes on judgment calls:
- If a conversation has *no* leakage (business responded promptly, followed through, converted or was cleanly closed), set Leakage Type to `none` — don't force every row into a leak category. The interesting number is the leak rate, which requires a true denominator.
- "Delayed response" vs "business failed to respond": use delayed when a reply eventually came but late enough that a reasonable customer might have moved on (use judgment; if the business can tell you their expected response window, use that as the threshold).
- Record a short **why** in `notes` for every row classified as a leak — this becomes the anonymised example material for the eventual Revenue Leak Report (PRD §10) and is the raw material a future classifier prompt will be built/tested against.

## 4. Estimating opportunity value

Per conversation flagged with a leak and a plausible transaction outcome, estimate value using the business's stated average transaction value (not a guess). Put this in the `estimated_value` column. Sum per business in the business summary.

Always carry the disclaimer forward into any output you share with the business:

> **Estimated opportunity value is not a revenue guarantee.**

Do not build or present anything more sophisticated than this for Phase 0 — PRD §10 is explicit that the Readiness Score and value estimate are communication devices, not predictive analytics.

## 5. Per-business roll-up

After classifying all conversations for a business, fill in one row of `business_summary_template.csv`:
- Total conversations reviewed
- Count per Leakage Type
- Estimated total opportunity value
- A rough Revenue Readiness Score (0–100) per PRD §10's Response / Follow-up / Recovery dimensions — this is a judgment call, not a formula; be consistent in how you weight the three dimensions across businesses so scores are comparable
- Qualitative notes: would this business plausibly buy Recover? Prevent? Both? Any objections raised when discussing the findings?

## 6. Cross-business synthesis (the actual Phase 0 output)

After all businesses are audited, write up a short synthesis (add a `SYNTHESIS.md` in this folder once you have ≥3 businesses done) covering:

1. **Recurring leakage patterns** — which Leakage Types show up across most/all businesses? This is what justifies automating classification in Phase 1 — if leakage patterns are idiosyncratic per business, that's a signal to slow down before building Phase 1.
2. **Which leakage type matters most** — by frequency and by estimated value — across the sample. This should directly inform which leakage types get emphasised in the Phase 1 report design.
3. **Hypothesis evidence** — go through A1, A2, A3, A4 explicitly (see PLANS.md Hypotheses Tracker) and state what this audit round supports, contradicts, or leaves open. Update PLANS.md's tracker status column once you have a real position.
4. **Commercial signal** — did any business express real willingness to pay after seeing their numbers? This is the Phase 0 exit criterion, not just "the data was interesting."

## 7. Phase 0 exit

Once synthesis is done, go back to [PLANS.md](../PLANS.md) Phase 0 and check off the exit criteria there, with the evidence living in this folder (`SYNTHESIS.md` + the per-business/per-conversation CSVs) as the backing record. Log the qualitative outcome in [TESTS.md](../TESTS.md)'s Phase 0 table even though these aren't automated tests — the point is to keep a dated record of what was actually validated.
