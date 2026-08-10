-- CAPTURE — SIMULATED fixture data for Phase 1 development/testing only.
--
-- Per OUTSTANDINGS.md DEV-1: Phase 0's real commercial validation (real
-- businesses, real WhatsApp exports, phase0/AUDIT_GUIDE.md) is deferred to
-- beta. This script generates synthetic businesses/customers/conversations/
-- opportunities so Phase 1 code (report generation, dashboard, RLS) can be
-- built and tested now. Every row is flagged is_simulated = true.
--
-- IMPORTANT:
--   - Do NOT rename this file to `seed.sql` — the Supabase CLI's
--     `supabase db reset` auto-runs seed.sql, and simulated data must never
--     be auto-seeded, especially not into a project also used for real data.
--   - Do NOT run this against a production/live-customer project. Local/dev
--     only.
--   - This does not substitute for real Phase 0 audits. Passing Phase 1
--     gate tests against this fixture data is not evidence for hypotheses
--     A1/A3/A4 (PLANS.md Hypotheses Tracker) — only real audits are.

begin;

select setseed(0.42); -- deterministic so re-running produces the same fixtures

insert into businesses (id, name, industry, website, contact_email, approx_annual_revenue, approx_monthly_conversations, avg_transaction_value, is_simulated)
values
  ('00000000-0000-0000-0000-000000000001', 'SIMULATED — Lagos Prime Realty', 'real estate', 'https://example.invalid/lagos-prime-realty', 'demo@example.invalid', 500000000, 80, 12000000, true),
  ('00000000-0000-0000-0000-000000000002', 'SIMULATED — Drive Motors NG', 'automotive', 'https://example.invalid/drive-motors-ng', 'demo@example.invalid', 300000000, 120, 8500000, true),
  ('00000000-0000-0000-0000-000000000003', 'SIMULATED — Bloom Events Co', 'events', 'https://example.invalid/bloom-events-co', 'demo@example.invalid', 90000000, 60, 2500000, true)
on conflict (id) do nothing;

do $$
declare
  biz record;
  cust_id uuid;
  conv_id uuid;
  i int;
  n_conversations int := 15;
  ctype text;
  intent_v text;
  status_v text;
  leak_v text;
  est_value numeric;
  r double precision;
begin
  for biz in select id, avg_transaction_value from businesses where is_simulated loop
    for i in 1..n_conversations loop
      cust_id := gen_random_uuid();
      insert into customers (id, business_id, name, phone, source, metadata)
      values (
        cust_id, biz.id,
        'Simulated Customer ' || i,
        '+234800' || lpad(i::text, 7, '0'),
        'manual_export',
        jsonb_build_object('simulated', true)
      );

      -- Distribution loosely modeled on the PRD §10 example report shape
      -- (a mix of no-response, abandoned-high-intent, reactivation,
      -- unfollowed-quote, delayed, clean conversions and noise).
      r := random();
      if r < 0.15 then
        ctype := 'sales_enquiry'; intent_v := 'high'; status_v := 'no_response'; leak_v := 'no_response'; est_value := biz.avg_transaction_value;
      elsif r < 0.32 then
        ctype := 'sales_enquiry'; intent_v := 'high'; status_v := 'abandoned'; leak_v := 'abandoned_high_intent'; est_value := biz.avg_transaction_value;
      elsif r < 0.40 then
        ctype := 'existing_customer'; intent_v := 'medium'; status_v := 'unclear'; leak_v := 'reactivatable'; est_value := biz.avg_transaction_value * 0.6;
      elsif r < 0.48 then
        ctype := 'sales_enquiry'; intent_v := 'medium'; status_v := 'unresolved'; leak_v := 'quote_not_followed_up'; est_value := biz.avg_transaction_value * 0.8;
      elsif r < 0.60 then
        ctype := 'sales_enquiry'; intent_v := 'medium'; status_v := 'unresolved'; leak_v := 'delayed_response'; est_value := biz.avg_transaction_value * 0.5;
      elsif r < 0.85 then
        ctype := 'sales_enquiry'; intent_v := 'high'; status_v := 'converted'; leak_v := 'none'; est_value := null;
      else
        ctype := 'general'; intent_v := 'none'; status_v := 'unclear'; leak_v := 'none'; est_value := null;
      end if;

      conv_id := gen_random_uuid();
      insert into conversations (
        id, business_id, customer_id, channel, source,
        first_message_at, last_message_at, message_count,
        conversation_type, intent, status, leakage_type, state, is_simulated
      )
      values (
        conv_id, biz.id, cust_id, 'whatsapp', 'manual_export',
        now() - (i || ' days')::interval - interval '2 hours',
        now() - (i || ' days')::interval,
        2 + (random() * 6)::int,
        ctype, intent_v, status_v, leak_v,
        case when leak_v = 'none' then 'closed' else 'new' end,
        true
      );

      if leak_v <> 'none' then
        insert into opportunities (
          business_id, customer_id, source_conversation_id, type, intent, status, estimated_value, is_simulated
        )
        values (
          biz.id, cust_id, conv_id,
          case leak_v
            when 'no_response' then 'unanswered_enquiry'
            when 'abandoned_high_intent' then 'cold_high_intent'
            when 'reactivatable' then 'previous_customer_reactivation'
            else 'other'
          end,
          intent_v, 'identified', est_value, true
        );
      end if;
    end loop;
  end loop;
end $$;

commit;
