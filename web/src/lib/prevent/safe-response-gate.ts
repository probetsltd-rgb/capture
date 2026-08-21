import type { EngineResponse } from "./schema";

// Addendum §11: "A model-generated confidence score is insufficient." This
// is the one named, auditable function that decides respond-vs-escalate —
// replacing the logic that was previously split between engine.ts's
// defense-in-depth check and process.ts's ad hoc `!result.escalate &&
// result.response` condition. Every one of §11's five conditions is checked
// here explicitly, in code, not inferred from the model's own tier label
// alone.
// The safe branch carries the validated response string itself, not just a
// boolean — this is what lets a caller use the gate's own guarantee (a
// safe verdict is only ever returned alongside real response text) instead
// of re-deriving that relationship from two separately-typed fields.
export type SafeResponseGateResult =
  | { safe: true; response: string; mediaUrl: string | null }
  | { safe: false; reason: string };

const SENSITIVE_INTENTS: EngineResponse["intent"][] = ["complaint", "human_assistance"];

// `validMediaUrls` is optional so callers that never pass approved-knowledge
// media (or existing tests) keep working — omitting it just means media_url
// is trusted as-is. When provided, a claimed media_url that doesn't match
// any approved item's actual attached file is dropped, not trusted — unlike
// free-text `response`, an exact-string match against known-good URLs is a
// cheap, deterministic check this gate actually can do, so it does.
export function evaluateSafeResponseGate(
  result: EngineResponse,
  validMediaUrls?: Set<string>,
): SafeResponseGateResult {
  // Condition 1 — intent is understood: guaranteed by this point, since a
  // schema-non-conformant model output never reaches this function (the
  // caller treats a failed `generateObject` parse as an escalation, not a
  // best-effort guess — see engine.ts).

  // Condition 5 — no sensitive/exception condition exists: checked before
  // the tier, since a model that mislabels a complaint as tier A/B is
  // exactly the "don't rely solely on model confidence" failure mode this
  // gate exists to catch.
  if (SENSITIVE_INTENTS.includes(result.intent)) {
    return { safe: false, reason: result.escalation_reason ?? `intent requires human judgement (${result.intent})` };
  }

  // Conditions 2 & 3 — required business info exists, and the answer can be
  // grounded in approved information: by definition, only tiers A ("safe to
  // answer") and B ("safe with constraint") represent a grounded answer.
  // Tiers C and D always escalate, regardless of what `response` contains.
  if (result.answerability === "C") {
    return { safe: false, reason: result.escalation_reason ?? "requires human judgement, authority, or negotiation" };
  }
  if (result.answerability === "D") {
    return { safe: false, reason: result.escalation_reason ?? "could not confidently determine the answer from approved knowledge" };
  }

  // Condition 4 — no escalation rule triggered: the model's own `escalate`
  // flag is a second, independent signal on top of the tier — a
  // discrepancy (tier A/B but escalate=true) is resolved conservatively in
  // favor of escalating, per the addendum §7 "safe incompleteness over
  // confident wrongness" principle.
  if (result.escalate) {
    return { safe: false, reason: result.escalation_reason ?? "model flagged for escalation" };
  }

  // A tier A/B, non-escalating result with no response text is a malformed
  // result, not a valid safe response — never send empty/null text to a
  // real customer.
  if (!result.response) {
    return { safe: false, reason: "no response text produced despite a safe-to-answer tier" };
  }

  const mediaUrl =
    result.media_url && (!validMediaUrls || validMediaUrls.has(result.media_url)) ? result.media_url : null;

  return { safe: true, response: result.response, mediaUrl };
}
