"use client";

import { useActionState, useTransition } from "react";
import { addCampaignKeyword, deleteCampaignKeyword, type ActionResult } from "../actions";

const initialState: ActionResult = { ok: false, message: "" };

export type CampaignKeywordRow = {
  id: string;
  keyword: string;
  campaign_name: string;
  qualifying_prompt: string | null;
};

function DeleteCampaignKeywordButton({ businessId, keywordId }: { businessId: string; keywordId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      className="btn"
      onClick={() =>
        startTransition(async () => {
          await deleteCampaignKeyword(businessId, keywordId);
        })
      }
    >
      Delete
    </button>
  );
}

export function CampaignKeywordsForm({ businessId, campaignKeywords }: { businessId: string; campaignKeywords: CampaignKeywordRow[] }) {
  const action = addCampaignKeyword.bind(null, businessId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <div>
      <p className="meta">
        Running an ad or post that tells people to DM a specific word? When a customer&apos;s <strong>first
        message is just that word</strong>, Engage replies warmly and asks what they&apos;re looking for —
        instead of treating it as an unanswerable question and going quiet.
      </p>

      {campaignKeywords.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "var(--s4) 0" }}>
          {campaignKeywords.map((ck) => (
            <li key={ck.id} style={{ borderBottom: "1px solid var(--rule)", padding: "var(--s3) 0" }}>
              <strong>&quot;{ck.keyword}&quot;</strong> → {ck.campaign_name}
              {ck.qualifying_prompt && <div className="meta">Asks: {ck.qualifying_prompt}</div>}
              <span style={{ marginLeft: "var(--s3)" }}>
                <DeleteCampaignKeywordButton businessId={businessId} keywordId={ck.id} />
              </span>
            </li>
          ))}
        </ul>
      )}

      <form action={formAction}>
        <label className="field">
          Keyword
          <input type="text" name="keyword" placeholder="e.g. capture" className="input" required />
          <span className="field__hint">Must be the customer&apos;s entire first message to trigger, not just part of it.</span>
        </label>

        <label className="field">
          Campaign name
          <input type="text" name="campaign_name" placeholder="e.g. September Instagram Ad" className="input" required />
          <span className="field__hint">For your own reporting — see Campaign performance below.</span>
        </label>

        <label className="field">
          Qualifying question (optional)
          <input
            type="text"
            name="qualifying_prompt"
            placeholder="e.g. Ask which product they saw in the ad"
            className="input"
          />
          <span className="field__hint">Left blank, Engage just asks what they&apos;re looking for.</span>
        </label>

        {state.message && <p className={state.ok ? "notice notice--ok" : "notice notice--error"}>{state.message}</p>}
        <button type="submit" disabled={pending} className="btn btn--primary">
          {pending ? "Adding…" : "Add keyword"}
        </button>
      </form>
    </div>
  );
}
