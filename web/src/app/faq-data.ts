import type { FaqItem } from "@/lib/seo/faq-jsonld";

// First entry added 2026-08-31 after a real first-non-tester Connect
// attempt dead-ended on Instagram's side (logged in, no permission screen,
// no redirect back — see dashboard/page.tsx's Connect Instagram callout for
// the same note). Not a speculative FAQ list in spirit — the rest added
// 2026-09-07 are a deliberate exception, founder-requested ("look at the
// product and determine what questions are likely to come"), but every
// answer below is still grounded in what the code actually does (billing
// gates in lib/prevent/process.ts, escalation routing, Recover pricing,
// the privacy page's AI-training line) — never a claim the product doesn't
// back up.
export const HOME_FAQS: FaqItem[] = [
  {
    question: "Does Engage work with any Instagram account?",
    answer:
      "It needs a Professional Instagram account — Business or Creator, not Personal — since that's what Instagram requires to grant messaging permissions. If your account is Personal, switch it in the Instagram app under Settings → Account type, then connect from your Capture dashboard.",
  },
  {
    question: "What happens when my free trial ends?",
    answer:
      "No card is collected upfront, so nothing is charged automatically. If you haven't picked a plan by the end of your 7 days, Engage stops auto-replying and new messages wait for your team instead — nothing is lost, it just needs a human until you subscribe.",
  },
  {
    question: "What happens when Engage doesn't know the answer?",
    answer:
      "It never guesses. Anything outside the knowledge base you've approved — or anything that needs judgement, like a price negotiation or a complaint — is handed straight to your team, and the actual question is logged so you can add the answer for next time.",
  },
  {
    question: "Can I take over a conversation myself?",
    answer:
      "Yes, any time. Taking over immediately and permanently stops automated replies on that conversation, and you can reply to the customer directly from your Capture dashboard — no need to switch over to Instagram itself. If a customer replies while you're still handling it, we'll notify you right away, plus a reminder if you haven't gotten back to them after 10 minutes — Engage won't jump back in on its own, since it can't see what you've already told them.",
  },
  {
    question: "How do escalations reach my team?",
    answer:
      "By email, in priority order across however many team members your plan allows — so it reaches an actual person, not just one shared inbox that has to happen to be watched.",
  },
  {
    question: "How much does Recover cost?",
    answer:
      "A one-time payment, not a subscription: ₦24,000 for a 6-month look back through your conversation history, or ₦49,000 for 24 months. You pay once per purchase, not on a recurring basis.",
  },
  {
    question: "Do you use my conversations to train AI models?",
    answer:
      "No — never without your explicit, separate permission. Your knowledge base and conversation content are used only to operate Engage for your business.",
  },
];
