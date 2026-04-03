ALTER TABLE public.event_pair_plans
    ADD COLUMN IF NOT EXISTS source_plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_event_pair_plans_source_plan
    ON public.event_pair_plans(source_plan_id)
    WHERE source_plan_id IS NOT NULL;
