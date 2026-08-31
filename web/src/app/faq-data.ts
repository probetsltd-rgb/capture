import type { FaqItem } from "@/lib/seo/faq-jsonld";

// One entry so far, added 2026-08-31 after a real first-non-tester Connect
// attempt dead-ended on Instagram's side (logged in, no permission screen,
// no redirect back — see dashboard/page.tsx's Connect Instagram callout for
// the same note). Not a speculative FAQ list — only add an entry here once
// it's answering a question that's actually come up.
export const HOME_FAQS: FaqItem[] = [
  {
    question: "Does Engage work with any Instagram account?",
    answer:
      "It needs a Professional Instagram account — Business or Creator, not Personal — since that's what Instagram requires to grant messaging permissions. If your account is Personal, switch it in the Instagram app under Settings → Account type, then connect from your Capture dashboard.",
  },
];
