CREATE TABLE IF NOT EXISTS public.review_tasks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id         UUID NOT NULL REFERENCES public.event_pair_plans(id) ON DELETE CASCADE,
    reviewer_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_id        UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    target_type     TEXT NOT NULL,
    target_user_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    available_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT review_tasks_target_type_check CHECK (target_type IN ('peer','event')),
    CONSTRAINT review_tasks_status_check CHECK (status IN ('pending','done','skipped')),
    CONSTRAINT review_tasks_unique UNIQUE (plan_id, reviewer_id, target_type)
);

CREATE INDEX IF NOT EXISTS idx_review_tasks_reviewer_status
    ON public.review_tasks(reviewer_id, status, available_at DESC);

CREATE INDEX IF NOT EXISTS idx_review_tasks_plan
    ON public.review_tasks(plan_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_review_tasks_event
    ON public.review_tasks(event_id, created_at DESC);

ALTER TABLE public.review_tasks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "review_tasks_select_owner" ON public.review_tasks
        FOR SELECT USING (
            auth.uid() IS NOT NULL
            AND reviewer_id = auth.uid()
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "review_tasks_insert_owner" ON public.review_tasks
        FOR INSERT WITH CHECK (
            auth.uid() IS NOT NULL
            AND reviewer_id = auth.uid()
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "review_tasks_update_owner" ON public.review_tasks
        FOR UPDATE USING (
            auth.uid() IS NOT NULL
            AND reviewer_id = auth.uid()
        )
        WITH CHECK (
            auth.uid() IS NOT NULL
            AND reviewer_id = auth.uid()
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS trg_review_tasks_updated_at ON public.review_tasks;
CREATE TRIGGER trg_review_tasks_updated_at
    BEFORE UPDATE ON public.review_tasks
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
