-- Home page pricing showed "Basic"/"Standard" — founder wants "Starter"/"Growth"
-- as the customer-facing tier names. `plans.id`/`tier` values ('basic',
-- 'standard') stay unchanged since FKs (businesses.plan_id, payments.plan_id)
-- and call sites (updatePlan, startSubscription) key off them; only the
-- display_name shown to customers changes.
update plans set display_name = 'Starter' where tier = 'basic';
update plans set display_name = 'Growth' where tier = 'standard';
