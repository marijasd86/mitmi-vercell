ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS avg_rating NUMERIC(3,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.peer_reviews (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id             UUID NOT NULL REFERENCES public.event_pair_plans(id) ON DELETE CASCADE,
    reviewer_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reviewed_user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_id            UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    did_show_up         BOOLEAN,
    communication_rating SMALLINT NOT NULL CHECK (communication_rating BETWEEN 1 AND 5),
    would_go_again      BOOLEAN,
    comment             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (plan_id, reviewer_id),
    CONSTRAINT peer_reviews_no_self CHECK (reviewer_id <> reviewed_user_id)
);

CREATE INDEX IF NOT EXISTS idx_peer_reviews_reviewed_user
    ON public.peer_reviews(reviewed_user_id, created_at DESC);

ALTER TABLE public.peer_reviews ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "peer_reviews_select" ON public.peer_reviews
        FOR SELECT USING (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "peer_reviews_insert" ON public.peer_reviews
        FOR INSERT WITH CHECK (reviewer_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.event_reviews (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id             UUID NOT NULL REFERENCES public.event_pair_plans(id) ON DELETE CASCADE,
    reviewer_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_id            UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    venue_id            UUID REFERENCES public.venues(id) ON DELETE SET NULL,
    rating_overall      SMALLINT NOT NULL CHECK (rating_overall BETWEEN 1 AND 5),
    rating_atmosphere   SMALLINT CHECK (rating_atmosphere BETWEEN 1 AND 5),
    rating_organization SMALLINT CHECK (rating_organization BETWEEN 1 AND 5),
    comment             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (plan_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_event_reviews_event
    ON public.event_reviews(event_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_reviews_venue
    ON public.event_reviews(venue_id, created_at DESC);

ALTER TABLE public.event_reviews ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "event_reviews_select" ON public.event_reviews
        FOR SELECT USING (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "event_reviews_insert" ON public.event_reviews
        FOR INSERT WITH CHECK (reviewer_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.update_profile_rating_from_peer_reviews()
RETURNS TRIGGER AS $$
DECLARE
    target_profile_id UUID;
BEGIN
    target_profile_id := COALESCE(NEW.reviewed_user_id, OLD.reviewed_user_id);
    IF target_profile_id IS NULL THEN RETURN NULL; END IF;

    UPDATE public.profiles
    SET
        avg_rating = COALESCE((
            SELECT ROUND(AVG(communication_rating)::numeric, 2)
            FROM public.peer_reviews
            WHERE reviewed_user_id = target_profile_id
        ), 0),
        rating_count = (
            SELECT COUNT(*)
            FROM public.peer_reviews
            WHERE reviewed_user_id = target_profile_id
        )
    WHERE id = target_profile_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_peer_reviews_profile_rating ON public.peer_reviews;
CREATE TRIGGER trg_peer_reviews_profile_rating
    AFTER INSERT OR UPDATE OR DELETE ON public.peer_reviews
    FOR EACH ROW EXECUTE FUNCTION public.update_profile_rating_from_peer_reviews();

CREATE OR REPLACE FUNCTION public.update_event_rating_from_reviews()
RETURNS TRIGGER AS $$
DECLARE
    target_event_id UUID;
    target_venue_id UUID;
BEGIN
    target_event_id := COALESCE(NEW.event_id, OLD.event_id);
    target_venue_id := COALESCE(NEW.venue_id, OLD.venue_id);
    IF target_event_id IS NULL THEN RETURN NULL; END IF;

    UPDATE public.events
    SET
        avg_rating = COALESCE((
            SELECT ROUND(AVG(rating_overall)::numeric, 2)
            FROM public.event_reviews
            WHERE event_id = target_event_id
        ), 0),
        rating_count = (
            SELECT COUNT(*)
            FROM public.event_reviews
            WHERE event_id = target_event_id
        )
    WHERE id = target_event_id;

    IF target_venue_id IS NOT NULL THEN
        UPDATE public.venues
        SET
            avg_rating = COALESCE((
                SELECT ROUND(AVG(rating_overall)::numeric, 2)
                FROM public.event_reviews
                WHERE venue_id = target_venue_id
            ), 0),
            rating_count = (
                SELECT COUNT(*)
                FROM public.event_reviews
                WHERE venue_id = target_venue_id
            )
        WHERE id = target_venue_id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_event_reviews_event_rating ON public.event_reviews;
CREATE TRIGGER trg_event_reviews_event_rating
    AFTER INSERT OR UPDATE OR DELETE ON public.event_reviews
    FOR EACH ROW EXECUTE FUNCTION public.update_event_rating_from_reviews();
