"use client";

import { useState } from "react";

export function CopyDraftMessage({ message }: { message: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="stack" style={{ gap: "0.375rem" }}>
      <p style={{ margin: 0, fontStyle: "italic" }}>&ldquo;{message}&rdquo;</p>
      <button onClick={handleCopy} style={{ alignSelf: "flex-start" }}>
        {copied ? "Copied" : "Copy message"}
      </button>
    </div>
  );
}
