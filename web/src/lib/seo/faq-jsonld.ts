export type FaqItem = { question: string; answer: string };

// Shared by /find and /recover — builds a schema.org FAQPage block from the
// exact same data array the visible accordion renders, so structured data
// can never assert something the page itself doesn't actually say (same
// discipline as the homepage's softwareApplicationJsonLd).
export function buildFaqJsonLd(faqs: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}
