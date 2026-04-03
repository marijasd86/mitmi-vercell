CREATE TABLE IF NOT EXISTS public.plans (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_id        UUID REFERENCES public.events(id) ON DELETE SET NULL,
    organizer_id    UUID REFERENCES public.organizers(id) ON DELETE SET NULL,
    venue_id        UUID REFERENCES public.venues(id) ON DELETE SET NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    category        TEXT,
    city            TEXT,
    location_name   TEXT,
    starts_at       TIMESTAMPTZ,
    spots_total     INTEGER NOT NULL DEFAULT 1,
    source_url      TEXT,
    status          TEXT NOT NULL DEFAULT 'open',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT plans_status_check CHECK (status IN ('open','closed','cancelled')),
    CONSTRAINT plans_spots_positive CHECK (spots_total > 0),
    CONSTRAINT plans_title_not_blank CHECK (BTRIM(title) <> '')
);

CREATE INDEX IF NOT EXISTS idx_plans_creator_status
    ON public.plans(creator_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plans_event_status
    ON public.plans(event_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plans_organizer_status
    ON public.plans(organizer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plans_starts_at
    ON public.plans(starts_at DESC);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "plans_public_select" ON public.plans
        FOR SELECT USING (
            status IN ('open','closed')
            OR creator_id = auth.uid()
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "plans_owner_insert" ON public.plans
        FOR INSERT WITH CHECK (creator_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "plans_owner_update" ON public.plans
        FOR UPDATE USING (creator_id = auth.uid())
        WITH CHECK (creator_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS trg_plans_updated_at ON public.plans;
CREATE TRIGGER trg_plans_updated_at
    BEFORE UPDATE ON public.plans
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
