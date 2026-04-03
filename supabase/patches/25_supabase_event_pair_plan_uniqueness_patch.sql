ALTER TABLE public.event_pair_plans
    DROP CONSTRAINT IF EXISTS event_pair_plans_pair_unique;

DROP INDEX IF EXISTS idx_event_pair_plans_source_pair_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_pair_plans_source_pair_unique
    ON public.event_pair_plans(source_plan_id, user_a_id, user_b_id)
    WHERE source_plan_id IS NOT NULL;

DROP INDEX IF EXISTS idx_event_pair_plans_event_pair_fallback_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_pair_plans_event_pair_fallback_unique
    ON public.event_pair_plans(event_id, user_a_id, user_b_id)
    WHERE source_plan_id IS NULL;
