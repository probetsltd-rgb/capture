-- Campaign start previously only computed scheduling/priority metadata —
-- a human still had to write every outreach message from scratch. A
-- founder caught this directly ("should create customized messages... not
-- just surface them"). This stores an AI-drafted, ready-to-send message per
-- queued opportunity, generated from the actual conversation history.
alter table automations
  add column draft_message text;

comment on column automations.draft_message is 'AI-drafted outreach message for this opportunity, generated at campaign-start time from the source conversation. A human reviews and sends it themselves (no automated send yet — see startCampaign''s own comment on DEP-1/DEP-2). Null if generation failed or this automation predates the feature.';
