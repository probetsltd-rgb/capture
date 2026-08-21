-- Founder-caught 2026-08-21 (real Rentit test: only 2 cars entered, asked
-- about a Ferrari, engine confidently said "no" instead of escalating). A
-- knowledge base is rarely complete on day one, and a gap in it is not
-- evidence the business doesn't offer something — the engine should
-- default to treating it as partial and escalate on unlisted-but-plausible
-- requests, not confidently deny them. This flag lets a business owner
-- explicitly confirm their catalog IS exhaustive, at which point the
-- engine is allowed to give a confident negative instead of escalating
-- everything not listed. Null = not confirmed (the safe default).

alter table businesses
  add column knowledge_base_confirmed_complete_at timestamptz;

comment on column businesses.knowledge_base_confirmed_complete_at is
  'Business owner has explicitly confirmed their approved knowledge is a complete, exhaustive catalog of what they offer. Null (default) = treat the catalog as partial — the response engine must escalate unlisted-but-plausible requests rather than confidently deny them.';
