"use client";

import { useState, useTransition } from "react";
import { answerKnowledgeGapQuestion, dismissKnowledgeGapQuestion } from "./actions";

type GapQuestion = { id: string; category: string; question: string };

// Founder request 2026-08-26: shown above "Needs your review" — these are
// AI-inferred gaps from the 30-day history seed, not AI-guessed facts, so
// answering (or skipping) is a single inline action rather than a
// separate review step. See answerKnowledgeGapQuestion in ./actions.ts for
// why an answer is approved immediately.
export function KnowledgeGapQuestions({
  businessId,
  questions,
}: {
  businessId: string;
  questions: GapQuestion[];
}) {
  if (questions.length === 0) return null;

  return (
    <div className="panel" style={{ marginTop: "var(--s5)" }}>
      <div className="panel__body">
      <h2 className="h3" style={{ marginTop: 0 }}>A few questions to strengthen your knowledge base</h2>
      <p className="meta">
        Based on your past replies, the AI noticed these weren&apos;t fully covered. Answer what you can — each
        answer is used right away. Skip anything that doesn&apos;t apply.
      </p>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {questions.map((q) => (
          <GapQuestionRow key={q.id} businessId={businessId} question={q} />
        ))}
      </ul>
      </div>
    </div>
  );
}

function GapQuestionRow({ businessId, question }: { businessId: string; question: GapQuestion }) {
  const [answer, setAnswer] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) return null;

  return (
    <li style={{ borderBottom: "1px solid var(--rule)", padding: "var(--s3) 0" }}>
      <strong>[{question.category}]</strong> {question.question}
      <div className="row" style={{ marginTop: "var(--s2)", gap: "var(--s2)" }}>
        <input
          type="text"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Your answer"
          disabled={pending}
          className="input"
          style={{ flex: "1 1 auto" }}
        />
        <button
          disabled={pending || !answer.trim()}
          className="btn btn--primary"
          onClick={() =>
            startTransition(async () => {
              const result = await answerKnowledgeGapQuestion(businessId, question.id, answer);
              if (result.ok) setDone(true);
              else setError(result.message);
            })
          }
        >
          {pending ? "Saving…" : "Save answer"}
        </button>
        <button
          disabled={pending}
          className="btn"
          onClick={() =>
            startTransition(async () => {
              const result = await dismissKnowledgeGapQuestion(businessId, question.id);
              if (result.ok) setDone(true);
              else setError(result.message);
            })
          }
        >
          Skip
        </button>
      </div>
      {error && <span className="meta" style={{ color: "#8c2f2f" }}>{error}</span>}
    </li>
  );
}
