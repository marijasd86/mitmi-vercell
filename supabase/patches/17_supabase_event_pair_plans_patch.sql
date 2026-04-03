-- ============================================================
--  mitmi - Event pair plans foundation patch
--  Korak 1 za:
--   - "Idemo zajedno" u event-context DM
--   - potvrđen zajednički odlazak
--   - kasniji review queue
-- ============================================================

CREATE TABLE IF NOT EXISTS public.event_pair_plans (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id            UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    invite_id           UUID REFERENCES public.invites(id) ON DELETE SET NULL,
    chat_id             UUID REFERENCES public.chats(id) ON DELETE SET NULL,
    user_a_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    user_b_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status              TEXT NOT NULL DEFAULT 'talking',
    proposed_by_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    confirmed_by_a_at   TIMESTAMPTZ,
    confirmed_by_b_at   TIMESTAMPTZ,
    confirmed_at        TIMESTAMPTZ,
    cancelled_by_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    cancelled_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT event_pair_plans_users_distinct CHECK (user_a_id <> user_b_id),
    CONSTRAINT event_pair_plans_status_check CHECK (status IN ('talking','maybe','confirmed','cancelled')),
    CONSTRAINT event_pair_plans_pair_unique UNIQUE (event_id, user_a_id, user_b_id)
);

CREATE INDEX IF NOT EXISTS idx_event_pair_plans_event_status
    ON public.event_pair_plans(event_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_pair_plans_user_a
    ON public.event_pair_plans(user_a_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_pair_plans_user_b
    ON public.event_pair_plans(user_b_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_pair_plans_chat
    ON public.event_pair_plans(chat_id)
    WHERE chat_id IS NOT NULL;

ALTER TABLE public.event_pair_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_pair_plans_select_participants" ON public.event_pair_plans;
CREATE POLICY "event_pair_plans_select_participants" ON public.event_pair_plans
    FOR SELECT USING (
        auth.uid() IS NOT NULL
        AND (
            user_a_id = auth.uid()
            OR user_b_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "event_pair_plans_insert_participants" ON public.event_pair_plans;
CREATE POLICY "event_pair_plans_insert_participants" ON public.event_pair_plans
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL
        AND (
            user_a_id = auth.uid()
            OR user_b_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "event_pair_plans_update_participants" ON public.event_pair_plans;
CREATE POLICY "event_pair_plans_update_participants" ON public.event_pair_plans
    FOR UPDATE USING (
        auth.uid() IS NOT NULL
        AND (
            user_a_id = auth.uid()
            OR user_b_id = auth.uid()
        )
    )
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND (
            user_a_id = auth.uid()
            OR user_b_id = auth.uid()
        )
    );

DROP TRIGGER IF EXISTS trg_event_pair_plans_updated_at ON public.event_pair_plans;
CREATE TRIGGER trg_event_pair_plans_updated_at
    BEFORE UPDATE ON public.event_pair_plans
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
