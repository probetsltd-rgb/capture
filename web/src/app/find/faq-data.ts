import type { FaqItem } from "@/lib/seo/faq-jsonld";

// Every answer here is grounded in what's already true elsewhere in the
// codebase (privacy/page.tsx's data-collection section, the upload flow's
// real accepted formats) — nothing here should ever assert more than what
// those already say.
export const FIND_FAQS: FaqItem[] = [
  {
    question: "Is Find really free?",
    answer:
      "Yes — Find is free, always. There's no cost and no obligation to buy anything afterward. It's also the natural first step into Recover, if you want us to start working through what we find.",
  },
  {
    question: "How long does it take?",
    answer:
      "About 10–15 minutes start to finish: roughly a minute to tell us about your business, then a few minutes to export and upload your conversations.",
  },
  {
    question: "What do I need to provide?",
    answer:
      "A conversation export — a WhatsApp chat export or an Instagram data export both work — plus a few basic details about your business (industry, approximate revenue, and conversation volume).",
  },
  {
    question: "What happens to my data?",
    answer:
      "Your conversation export is used only to produce your Revenue Leak Report, then deleted once the audit is complete and confirmed with you. See our Privacy & Data Handling terms for the full detail.",
  },
  {
    question: "What do I get back?",
    answer:
      "A priced Revenue Leak Report: real counts of unanswered or cold enquiries, concrete examples, and an estimated opportunity value — never a guessed number dressed up as fact.",
  },
  {
    question: "Do I need to already use Capture's other products?",
    answer:
      "No — Find works on its own, from your existing conversations. It's also how most businesses bring their history into Recover afterward.",
  },
];
