import type { FaqItem } from "@/lib/seo/faq-jsonld";

// Deliberately no hardcoded prices/tier names here — those are
// admin-editable and already shown live in the pricing section above this
// (recover_plans via createServiceRoleClient); a FAQ answer naming a
// specific figure would go stale the moment a price changes.
export const RECOVER_FAQS: FaqItem[] = [
  {
    question: "Is this a subscription?",
    answer:
      "No — Recover is a one-time payment. You pick a history window once and it's yours; there's no recurring charge.",
  },
  {
    question: "Do I need to use Find first?",
    answer:
      "Recover works from your existing conversation history, and Find — free, 10–15 minutes — is how most businesses bring that history in. Start there if you haven't already.",
  },
  {
    question: "Does Recover send messages automatically?",
    answer:
      "Not yet — there's no automated WhatsApp sending. Capture ranks and times each opportunity and enforces the outreach limit; you send the actual message yourself, and outreach for that opportunity stops automatically the moment someone replies.",
  },
  {
    question: "How is pricing decided?",
    answer:
      "By how much conversation history you want worked through — a shorter window costs less than a longer one. These are early prices we're testing with real customers, not a fixed catalogue.",
  },
  {
    question: "What if someone replies before I've followed up?",
    answer:
      "Outreach for that opportunity stops immediately — no risk of double-messaging someone who's already responded.",
  },
];
