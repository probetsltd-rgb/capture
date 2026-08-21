# Capture PRD Addendum v2 — Engage as Primary Front Door & Conversation-to-Revenue Direction

**Status:** Build-direction addendum v2  
**Date:** 2026-08-14  
**Parent specification:** Existing `Capture_PRD.md`  
**Supersedes:** `Capture_PRD_Addendum_Engage_Direction.md` where the two documents differ  
**Purpose:** The build agent must consume this document together with the original `PRD.md`. This addendum incorporates the latest strategic direction for Engage, Find and Recover. It is intentionally additive: do not discard working functionality from the parent PRD unless explicitly directed below.

---

# 1. Strategic Correction

Capture remains the master product/company brand.

The product architecture is:

- **Find** — identify where revenue is leaking
- **Recover** — recover opportunities that have already gone cold
- **Engage** — keep new customer enquiries moving toward revenue

The strategic framing remains:

> **Find the leak → Recover what is already lost → Prevent new opportunities from going cold.**

However, **Prevent is not the customer-facing product name. Engage is.**

The primary Capture thesis is NOT:

> "Capture is an attention-routing system."

It is:

> **Capture tracks and drives customer conversations toward revenue.**

Human attention is an important step within that process. It is not the ultimate objective.

The core commercial journey is:

`Customer demand → Conversation → Action → Conversion → Revenue`

Capture should progressively own this layer.

---

# 2. Engage Is the Primary Capture Front Door

The **Engage landing page should become the primary landing page for Capture.**

This is a commercial decision based on friction and speed-to-value, not because Engage is inherently more important than Find.

Engage has a simpler initial customer journey:

`Connect → Configure → Activate → Experience value`

Find currently has a more cumbersome ingestion workflow:

`Export → download → upload → analyse → report`

Therefore:

- **Engage** should be the primary website experience.
- **Find** should remain a separate landing page for outreach, campaigns and diagnostic-led acquisition.
- **Recover** should remain independently purchasable.
- A customer should NOT need Engage in order to purchase Find or Recover.

The primary Capture website should make the three capabilities visible without becoming a generic product catalogue.

---

# 3. Approved Product Architecture

## Engage

**Job:** Move new customer conversations toward revenue.

Engage:

- responds instantly
- answers approved questions
- qualifies enquiries
- follows up appropriately
- identifies conversations requiring human intervention
- keeps the team in the loop
- tracks conversation progress
- records outcomes where possible

## Find

**Job:** Discover existing revenue leakage.

Find analyses historical conversations and surfaces:

- unanswered enquiries
- slow responses
- weak follow-up
- abandoned opportunities
- reactivation opportunities
- other revenue leakage

Find can be purchased independently of Engage.

## Recover

**Job:** Reactivate dormant opportunities.

Recover identifies suitable dormant leads/customers and runs controlled recovery campaigns.

Recover can be purchased independently of Engage.

---

# 4. Customer-Facing Engage Positioning

The preferred direction is:

> # Stop letting customer enquiries go cold.

Supporting message:

> **We respond instantly, qualify enquiries and follow up while keeping your team in the loop.**

Primary CTA:

> **Try Engage Free**

This is preferred over abstract language such as:

- AI-powered revenue execution
- attention orchestration
- customer conversation intelligence
- AI workforce
- AI employee

Those may describe the architecture internally, but the customer should understand the product immediately.

Do not lead with "AI".

The customer is buying better handling and progression of customer enquiries, not AI technology.

---

# 5. The Team Amplification Principle

Avoid positioning Engage as:

> "Your team doesn't have to do the work."

That implies replacement and creates unnecessary trust resistance.

The stronger model is:

> **Engage handles the volume. Your team handles the conversations that require judgement.**

But even this is a means, not the end.

The ultimate objective is:

> **Keep customer conversations moving toward revenue.**

The workflow is:

`New enquiry`
→ `Immediate response`
→ `Qualification`
→ `Routine handling where safe`
→ `Human intervention when needed`
→ `Follow-up`
→ `Conversion`
→ `Revenue`

Human attention is one step in this system.

---

# 6. The Product Should Track Conversation Progression

Capture should eventually be able to answer:

> **What is happening with this conversation?**

and:

> **What needs to happen next?**

and ultimately:

> **Did this conversation produce a commercial outcome?**

This means the conversation model should not merely record messages.

It should support:

- intent
- customer state
- opportunity state
- next action
- owner
- escalation reason
- follow-up state
- outcome
- revenue attribution where measurable

The long-term model is:

`Conversation → Opportunity → Action → Outcome → Revenue`

This is the foundation of Capture's potential defensibility.

---

# 7. Engage Real-Time Safety Requirement

Engage operates on live inbound customer conversations.

This materially changes the risk profile from Find.

A historical classification error in Find is undesirable.

A hallucinated live response can directly damage:

- a sale
- customer trust
- pricing expectations
- reputation
- operational commitments

Therefore:

> **Hallucination resistance is a P0 product requirement.**

Engage must optimise for:

> **Safe incompleteness over confident wrongness.**

---

# 8. Source-of-Truth Architecture

Engage may make factual claims only from approved business information.

Possible sources:

- website
- catalogue
- approved FAQs
- pricing
- operating hours
- business information
- policies
- product/service descriptions
- explicitly configured rules
- approved dynamic data sources

The model must NOT use general world knowledge as authority about the business.

If the business has not provided an answer:

> Engage must not invent it.

---

# 9. Answerability Classification

Before responding, classify the inbound message.

## A — SAFE TO ANSWER

Known information with sufficient grounding.

Examples:

- opening hours
- address
- approved product description
- approved fixed price
- basic service information

→ Respond automatically.

## B — SAFE WITH CONSTRAINT

Known topic but bounded by configured rules.

Examples:

- basic product comparison
- qualification
- quoting where a defined quoting rule exists

→ Respond only within approved boundaries.

## C — HUMAN REQUIRED

Requires judgement, authority, negotiation or live information.

Examples:

- "What's your best price?"
- unusual discount requests
- complaints
- refunds
- uncertain availability
- complex booking
- high-value transactions
- dissatisfied customers
- unusual requests

→ Do not improvise.

→ Escalate.

## D — UNKNOWN

The system cannot confidently determine the answer.

→ State that confirmation is needed.

→ Escalate.

---

# 10. Hard No-Hallucination Rules

Engage must never fabricate:

- prices
- discounts
- stock/inventory
- availability
- delivery times
- policies
- guarantees
- promotions
- specifications
- bookings
- refunds
- payment confirmations
- completed actions
- commitments by the business

The system must not claim to have done something it has not actually done.

If information is unknown, it should say so and route appropriately.

---

# 11. Do Not Rely Solely on Model Confidence

A model-generated confidence score is insufficient.

A response should be considered safe only when:

1. intent is understood,
2. required business information exists,
3. the answer can be grounded in approved information,
4. no escalation rule is triggered,
5. no sensitive/exception condition exists.

If these conditions fail, escalate.

---

# 12. Human Handoff Is a Revenue Step

Human escalation is not a failure state.

It is a deliberate step in the revenue journey.

Example:

> 🔔 **High-intent enquiry**
>
> Customer: John  
> Interested in: Prado  
> Requested: Friday booking  
> Intent: Ready to buy  
> Reason for handoff: Customer wants best available price  
>
> **Respond within 10 minutes**

The internal notification should contain enough context for the human to act quickly.

Include where available:

- customer
- product/service
- intent
- conversation summary
- reason for escalation
- urgency
- relevant customer details

---

# 13. Explicit Human Takeover

Conversation state should remain explicit:

`NEW → AI HANDLING → HUMAN REQUIRED → HUMAN HANDLING → CLOSED`

Alternative:

`AI HANDLING → FOLLOW-UP → CLOSED`

Once the human takes ownership:

> **Engage must stop sending customer-facing messages.**

Do not infer whether the human response was "good enough."

Use an explicit takeover state/action.

---

# 14. Attention Allocation Within the Revenue Journey

Use three practical handling tiers.

### Tier 1 — Engage handles

- greetings
- FAQs
- basic information
- simple qualification
- routine follow-up

### Tier 2 — Engage qualifies, human handles

- serious buying intent
- pricing negotiation
- bookings
- high-value opportunities
- complicated requirements

### Tier 3 — Human immediately

- complaints
- dissatisfaction
- sensitive situations
- exceptions
- uncertainty
- requests outside approved authority

The point is not simply to reduce human workload.

The point is to ensure **the right action happens at the right point in the customer journey.**

---

# 15. Instagram Engage

Instagram is the first live Engage channel.

Current JSON export/import may remain as an interim testing/development workflow.

However, do not architect the product around:

`Export → wait → download → locate file → upload`

The intended product experience is:

`Connect Instagram`
→ authorise
→ retrieve available conversation data
→ establish baseline
→ configure
→ test
→ activate
→ operate in real time

The existing connected Instagram API capability can read recent messages and should be used for the product experience where available.

---

# 16. 30-Day Baseline

The connected Instagram experience creates an important advantage over the current Find ingestion flow.

Use the available historical window to establish a baseline before Engage activation.

Example:

> ### Your last 30 days
>
> 247 conversations  
> 183 enquiries  
> 12 unanswered  
> 24 slow-response conversations  
> 18 conversations that went cold  
>
> Average response time: 47 minutes

Only show metrics that can actually be calculated from available data.

Do not fabricate revenue estimates.

Where revenue is estimated, label it clearly as an estimate and not a guarantee.

---

# 17. Seven-Day Trial

The initial Engage trial should be **7 days**, not 14 days by default.

Reason:

- creates urgency
- reduces trial lethargy
- forces a clear evaluation period
- gets the customer to experience the product quickly

Do not extend the standard trial merely to create more time.

An extension can be offered later when insufficient conversation volume makes evaluation impossible.

---

# 18. Day-5 Progress Report

A critical conversion mechanism should occur around Day 5.

Do not wait until Day 7.

Example:

> ## Your first 5 days with Engage
>
> 63 conversations received  
> 51 enquiries identified  
> 49 received a response within 1 minute  
> 14 leads qualified  
> 9 conversations escalated to your team  
> 6 appropriate follow-ups sent
>
> ### Compared with your previous 30 days
>
> Response time: 47 min → 38 sec  
> Unanswered enquiries: 12 → 0
>
> **2 days left in your trial.**

The report must distinguish:

- actual observed outcomes
- operational metrics
- estimates

Do not manufacture a revenue claim merely to improve conversion.

---

# 19. Day-7 Conversion

At trial completion show:

### What Engage handled

- conversations
- responses
- qualifications
- follow-ups
- escalations

### What changed

Baseline vs trial performance.

### What required humans

Show the conversations that still required human intervention.

This reinforces the product philosophy:

> **Engage keeps conversations moving. Your team steps in where human judgement matters.**

Then present the paid plan.

---

# 20. Engage Pricing Experiment

The previous assumption of ₦150k+/month should no longer be treated as a launch requirement.

Test a materially lower entry price.

Initial hypothesis:

- ₦49k/month
- potentially ₦59k/month

The objective is to validate recurring willingness to pay, not maximise early ARPU.

Do not price so low that Engage becomes perceived as a generic chatbot.

Longer-term pricing can be tied to:

- conversation volume
- qualified opportunities
- business size
- commercial value
- advanced capabilities

---

# 21. Self-Serve / Self-Deploy Remains a Hard Constraint

The company should not become an implementation-heavy AI agency.

Desired onboarding:

`Connect channel`
→ `Provide business knowledge`
→ `Configure escalation rules`
→ `Generate test conversations`
→ `Approve`
→ `Activate`

Same-day activation should be the default for standard configurations.

Human assistance can exist, but should be the exception.

Internal operating test:

> **Can one Capture operator onboard many customers without becoming the implementation bottleneck?**

---

# 22. WhatsApp Engage

WhatsApp should be treated as a major future Engage channel.

The strategic play is not simply:

> "AI replies to WhatsApp."

It is:

> **Capture tracks and drives the business's WhatsApp customer conversations toward revenue.**

Desired workflow:

`Inbound WhatsApp`
→ `Intent`
→ `Answerability`
→ `Qualification`
→ `Action`
→ `Human handoff when needed`
→ `Follow-up`
→ `Outcome`
→ `Revenue measurement`

The system must respect WhatsApp platform rules, customer-service windows and approved outbound-message mechanisms.

Do not design Engage around uncontrolled outbound messaging.

---

# 23. WhatsApp as a Sales-Inbox Layer

The long-term WhatsApp opportunity is to sit above the business's sales/service conversations as a **conversation-to-revenue layer**.

Potential capabilities over time:

- identify high-intent enquiries
- answer routine questions
- qualify prospects
- identify dissatisfaction
- route important conversations
- remind humans about unresolved opportunities
- trigger controlled follow-up
- track opportunity state
- connect conversation outcomes to revenue

This is substantially more valuable than a chatbot.

---

# 24. Shared Channel Architecture

Instagram and WhatsApp should feed the same internal conversation model.

Do not create separate business logic for each channel.

Architecture:

`Channel Adapter`
→ `Normalised Conversation`
→ `Intent`
→ `Risk / Answerability`
→ `Opportunity State`
→ `Action`
→ `Handoff`
→ `Outcome`
→ `Revenue Measurement`

Build the abstraction early even if only Instagram is live.

---

# 25. 5× Value — What Capture Should Become

The current Engage proposition:

> AI responds to customer enquiries.

is useful but easily copied.

The 5× proposition is:

> **Capture tracks every meaningful customer conversation, determines what needs to happen next, executes safe actions automatically, brings humans into the journey when they add value, follows through, and measures what happened commercially.**

That means Capture evolves from:

**message automation**

to:

**conversation-to-revenue execution.**

The eventual product should be able to show something like:

> ### Today
>
> 84 conversations  
> 51 handled automatically  
> 12 high-intent opportunities  
> 7 requiring human action  
> 3 dissatisfied customers  
> 2 follow-ups due  
> 1 high-value opportunity waiting
>
> ### Commercial outcome
>
> 8 qualified opportunities  
> 3 bookings  
> ₦X revenue influenced

The last section should only exist when the system has credible data.

---

# 26. Defensibility / Moat

"AI responds to Instagram DMs" is not a moat.

The potential moat should emerge from repeatedly solving the full workflow:

`Conversation → Intent → Action → Human intervention → Outcome → Revenue`

Potential defensibility comes from:

### 1. Business-specific knowledge

Deep configuration around:

- products
- pricing
- policies
- customer types
- workflows
- escalation rules

### 2. Conversation intelligence

Understanding:

- intent
- urgency
- customer state
- opportunity state
- dissatisfaction
- likelihood of progression

### 3. Outcome data

Learning what happened after conversations:

- replied
- qualified
- booked
- purchased
- abandoned
- complained
- recovered

### 4. Revenue attribution

Eventually connecting:

`Conversation → Opportunity → Handoff → Outcome → Revenue`

This is potentially one of the strongest differentiators.

### 5. Execution history

Capture should eventually know:

> What action did we take?

> What happened next?

> Which actions actually work for this business?

That creates a proprietary operational dataset.

### 6. Vertical playbooks

Only after repeated customer patterns emerge, package repeatable workflows for industries such as:

- automotive
- hospitality
- fashion
- real estate
- professional services
- education
- healthcare

Do not prematurely build industry-specific products.

---

# 27. Existing Find Landing Page

The existing Find landing page should remain intact.

It is valuable because it can be used for:

- outbound campaigns
- direct outreach
- diagnostic offers
- historical data-led sales
- prospects who are not ready to connect a live channel

Its workflow can remain distinct.

The Find page should still cross-sell:

- Engage
- Recover

Likewise, the Engage page should cross-sell:

- Find
- Recover

Neither should imply that all products must be bought together.

---

# 28. Primary Engage Landing Page Structure

Recommended narrative:

### Hero

> **Stop letting customer enquiries go cold.**

> We respond instantly, qualify enquiries and follow up while keeping your team in the loop.

CTA:

> **Try Engage Free**

### Problem

Every unanswered or poorly followed-up enquiry can become lost revenue.

### How Engage works

`Respond → Qualify → Follow up → Escalate → Progress → Measure`

### Team role

> **Engage handles the volume. Your team handles what matters.**

### Seven-day proof

Show the 30-day baseline and Day-5 progress mechanism.

### Find

> **Want to see where you're already losing revenue?**

CTA:

> Find My Revenue Leaks

### Recover

> **Have old leads or customers worth going back to?**

CTA:

> Explore Recover

### Final CTA

> **Stop letting enquiries go cold.**

> Try Engage free for 7 days.

---

# 29. Landing Page Experiment Metrics

Do not judge acquisition based on CTR alone.

Track:

1. visitor → signup
2. signup → channel connection
3. connection → activation
4. activation → meaningful conversation volume
5. Day-5 engagement
6. trial → paid conversion
7. paid retention
8. onboarding intervention required
9. support effort per customer
10. customer-perceived value
11. conversations progressed
12. qualified opportunities
13. measurable commercial outcomes

The winning proposition is the one that creates **activated, paying customers with measurable value and low Capture operational effort.**

---

# 30. V1 Scope Guardrails

Do not let the Engage expansion trigger scope creep.

Do not build yet:

- full CRM
- complex sales territory management
- voice AI
- full omnichannel inbox
- payment processing
- autonomous negotiation
- autonomous refunds
- autonomous bookings without controlled integrations
- elaborate customer-success dashboards
- mobile app
- huge integration catalogue
- sophisticated predictive revenue modelling

The immediate proof is:

> **Can Engage safely handle real inbound conversations, move them toward outcomes, and demonstrate enough value for a business to keep paying?**

---

# 31. Build Priority

### P0 — Safety

- grounding
- answerability
- no-hallucination rules
- escalation
- explicit conversation states
- human takeover
- AI suppression after takeover

### P1 — Engage activation

- Instagram connection
- business knowledge
- configuration
- test conversations
- approval
- activation

### P1 — Measurement

- 30-day baseline
- live trial metrics
- Day-5 progress report
- Day-7 final report
- baseline comparison

### P1 — Handoff

- internal notification
- urgency
- summary
- human takeover
- AI suppression

### P1 — Conversation progression

- intent
- opportunity state
- next action
- follow-up state
- outcome capture

### P2 — Commercial

- trial countdown
- pricing
- conversion
- subscription state

### P2 — Cross-sell

- Find CTA
- Recover CTA
- surface relevant opportunities from Engage data

### P3 — WhatsApp

Build the channel abstraction/data model now, but do not let WhatsApp block Instagram Engage launch.

---

# 32. Success Criteria

Capture should prove:

## Find

Can we identify meaningful revenue leakage?

## Engage

Can we safely handle routine inbound conversations and progress them toward commercial outcomes?

## Commercial

Will businesses pay to keep Engage active?

## Operational

Can businesses connect and deploy without significant Capture intervention?

## Value

Can we demonstrate measurable improvement in response, qualification, follow-up and eventually revenue outcomes?

## Expansion

Does Engage naturally create demand for Find and Recover?

If yes, the emerging Capture loop is:

`Engage`
→ `ongoing conversation data`
→ `Find deeper leakage`
→ `Recover dormant opportunities`
→ `measure outcomes`
→ `improve Engage`

---

# 33. Final Capture Thesis

Capture should not become another AI chatbot company.

The emerging thesis is:

> **Capture helps businesses turn customer conversations into revenue by tracking conversations, moving them toward commercial outcomes, handling what can be handled automatically, bringing humans into the journey when they add value, and recovering opportunities that would otherwise be lost.**

Find tells the business:

> **Where are we leaking?**

Recover asks:

> **What can we win back?**

Engage asks:

> **How do we make sure new opportunities keep moving?**

The long-term ambition is not to own a chatbot.

It is to own the layer between:

> **Customer Demand → Conversation → Action → Revenue**

The destination is revenue.

---

# 34. Non-Negotiable Interpretation for the Build Agent

When making implementation decisions, use the following hierarchy:

1. **Revenue progression**
2. **Conversation safety and accuracy**
3. **Customer value / measurable outcomes**
4. **Self-serve deployment**
5. **Human-in-the-loop where judgement is required**
6. **Automation**
7. **Operational efficiency**

Do not optimise for automation at the expense of revenue, safety or customer trust.

Do not turn human handoff into a product failure condition.

Do not turn Engage into a generic chatbot.

Do not make Find or Recover dependent on Engage.

Do not make the customer understand Capture's internal architecture before they understand the value.

The product should feel simple on the surface while the underlying system becomes progressively sophisticated.
