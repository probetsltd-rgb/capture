"use client";

import { useState, useTransition } from "react";
import { createWhatsAppTemplate } from "./actions";

export function TemplateForm({ businessId }: { businessId: string }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"utility" | "marketing" | "authentication">("utility");
  const [language, setLanguage] = useState("en_US");
  const [bodyText, setBodyText] = useState("");
  const [bodyExample, setBodyExample] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="field" style={{ maxWidth: 480 }}>
      <label>
        Template name (lowercase, underscores only)
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="order_update" />
      </label>
      <label>
        Category
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
          <option value="utility">Utility</option>
          <option value="marketing">Marketing</option>
          <option value="authentication">Authentication</option>
        </select>
      </label>
      <label>
        Language code
        <input className="input" value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="en_US" />
      </label>
      <label>
        Body text (use {"{{1}}"}, {"{{2}}"} for variables)
        <textarea
          className="input"
          rows={3}
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          placeholder="Hi {{1}}, following up on your enquiry — still interested?"
        />
      </label>
      <label>
        Example values for variables (comma-separated, only needed if body has {"{{n}}"})
        <input className="input" value={bodyExample} onChange={(e) => setBodyExample(e.target.value)} placeholder="Adaeze" />
      </label>
      <button
        className="btn btn--primary"
        disabled={pending || !name.trim() || !bodyText.trim()}
        onClick={() =>
          startTransition(async () => {
            const result = await createWhatsAppTemplate(businessId, { name, category, language, bodyText, bodyExample });
            setMessage(result.message);
          })
        }
      >
        {pending ? "Creating…" : "Create template"}
      </button>
      {message && <p className="meta">{message}</p>}
    </div>
  );
}
