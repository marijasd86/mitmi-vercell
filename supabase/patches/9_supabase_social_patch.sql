-- ============================================================
-- mitmi - Social patch
-- Dodaje:
-- 1. event_follows za pracenje/sacuvane dogadjaje
-- 2. dopunu reports tabele sa target kolonama
-- 3. followers_count za venues ako nedostaje
-- 4. bogatije profile/venue view-je sa count poljima
-- Idempotentno: moze da se pusti vise puta
-- ============================================================

-- ------------------------------------------------------------
-- 1. Venue followers_count kolona (trigger u 3_supabase_final.sql
--    je vec koristi, pa je dobro da postoji sigurno)
-- ------------------------------------------------------------
ALTER TABLE public.venues
    ADD COLUMN IF NOT EXISTS followers_count INTEGER NOT NULL DEFAULT 0;

UPDATE public.venues v
SET followers_count = src.cnt
FROM (
    SELECT venue_id, COUNT(*)::INTEGER AS cnt
    FROM public.venue_follows
    GROUP BY venue_id
) src
WHERE v.id = src.venue_id;

UPDATE public.venues
SET followers_count = 0
WHERE followers_count IS NULL;


-- ------------------------------------------------------------
-- 2. Event follows / saved events
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_follows (
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_id    UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_event_follows_user
    ON public.event_follows(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_follows_event
    ON public.event_follows(event_id);

ALTER TABLE public.event_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_follows_select" ON public.event_follows;
CREATE POLICY "event_follows_select" ON public.event_follows
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "event_follows_insert" ON public.event_follows;
CREATE POLICY "event_follows_insert" ON public.event_follows
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "event_follows_delete" ON public.event_follows;
CREATE POLICY "event_follows_delete" ON public.event_follows
    FOR DELETE USING (auth.uid() = user_id);


-- ------------------------------------------------------------
-- 3. Reports dopuna
--    Stara reports tabela postoji, ali joj fale target kolone
-- ------------------------------------------------------------
ALTER TABLE public.reports
    ADD COLUMN IF NOT EXISTS reported_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.reports
    ADD COLUMN IF NOT EXISTS reported_venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL;

ALTER TABLE public.reports
    ADD COLUMN IF NOT EXISTS reported_event_id UUID REFERENCES public.events(id) ON DELETE SET NULL;

ALTER TABLE public.reports
    ADD COLUMN IF NOT EXISTS details TEXT;

CREATE INDEX IF NOT EXISTS idx_reports_target_profile
    ON public.reports(reported_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_target_venue
    ON public.reports(reported_venue_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_target_event
    ON public.reports(reported_event_id, created_at DESC);


-- ------------------------------------------------------------
-- 4. View-jevi sa follower/following count poljima
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.v_venue_profile CASCADE;
CREATE VIEW public.v_venue_profile AS
SELECT
    v.*,
    p.username,
    p.display_name,
    p.avatar_url,
    p.bio,
    p.status AS profile_status,
    (
        SELECT COUNT(*)
        FROM public.events e
        WHERE e.venue_id = v.id
          AND e.is_published = TRUE
          AND e.is_cancelled = FALSE
          AND e.starts_at > NOW()
    ) AS upcoming_events_count,
    (
        SELECT COUNT(*)
        FROM public.events e
        WHERE e.venue_id = v.id
          AND e.is_published = TRUE
          AND e.is_cancelled = FALSE
    ) AS public_events_count,
    (
        SELECT EXISTS (
            SELECT 1
            FROM public.venue_follows vf
            WHERE vf.venue_id = v.id
              AND vf.user_id = auth.uid()
        )
    ) AS is_followed_by_me
FROM public.venues v
JOIN public.profiles p ON v.profile_id = p.id;

DROP VIEW IF EXISTS public.v_user_profile CASCADE;
CREATE VIEW public.v_user_profile AS
SELECT
    p.*,
    (
        SELECT COUNT(*)
        FROM public.follows f
        WHERE f.following_id = p.id
    ) AS followers_count,
    (
        SELECT COUNT(*)
        FROM public.follows f
        WHERE f.follower_id = p.id
    ) AS following_count,
    (
        SELECT EXISTS (
            SELECT 1
            FROM public.follows f
            WHERE f.follower_id = auth.uid()
              AND f.following_id = p.id
        )
    ) AS is_followed_by_me,
    (
        SELECT EXISTS (
            SELECT 1
            FROM public.blocks b
            WHERE b.blocker_id = auth.uid()
              AND b.blocked_id = p.id
        )
    ) AS is_blocked_by_me,
    (
        SELECT COUNT(*)
        FROM public.events e
        WHERE e.creator_id = p.id
          AND e.is_published = TRUE
          AND e.is_cancelled = FALSE
    ) AS public_events_count,
    (
        SELECT COUNT(*)
        FROM public.invites i
        JOIN public.events e ON i.event_id = e.id
        WHERE i.creator_id = p.id
          AND i.status = 'open'
          AND e.starts_at > NOW()
    ) AS active_invites_count
FROM public.profiles p
WHERE p.status = 'active';

DROP VIEW IF EXISTS public.v_event_social CASCADE;
CREATE VIEW public.v_event_social AS
SELECT
    e.*,
    (
        SELECT COUNT(*)
        FROM public.event_follows ef
        WHERE ef.event_id = e.id
    ) AS saved_count,
    (
        SELECT EXISTS (
            SELECT 1
            FROM public.event_follows ef
            WHERE ef.event_id = e.id
              AND ef.user_id = auth.uid()
        )
    ) AS is_saved_by_me
FROM public.events e;

DROP VIEW IF EXISTS public.v_venue_analytics CASCADE;
CREATE VIEW public.v_venue_analytics AS
SELECT
    v.id AS venue_id,
    v.profile_id,
    v.venue_name,
    COALESCE(v.followers_count, 0) AS followers_count,
    (
        SELECT COUNT(*)
        FROM public.events e
        WHERE (e.venue_id = v.id OR e.creator_id = v.profile_id)
          AND e.is_published = TRUE
          AND e.is_cancelled = FALSE
    ) AS total_events_count,
    (
        SELECT COUNT(*)
        FROM public.events e
        WHERE (e.venue_id = v.id OR e.creator_id = v.profile_id)
          AND e.is_published = TRUE
          AND e.is_cancelled = FALSE
          AND e.starts_at > NOW()
    ) AS active_events_count,
    (
        SELECT COALESCE(SUM(e.attendee_count), 0)
        FROM public.events e
        WHERE (e.venue_id = v.id OR e.creator_id = v.profile_id)
          AND e.is_published = TRUE
          AND e.is_cancelled = FALSE
    ) AS total_registrations,
    (
        SELECT COALESCE(SUM(e.attendee_count), 0)
        FROM public.events e
        WHERE (e.venue_id = v.id OR e.creator_id = v.profile_id)
          AND e.is_published = TRUE
          AND e.is_cancelled = FALSE
          AND e.starts_at > NOW()
    ) AS upcoming_registrations,
    (
        SELECT COUNT(*)
        FROM public.event_follows ef
        JOIN public.events e ON e.id = ef.event_id
        WHERE (e.venue_id = v.id OR e.creator_id = v.profile_id)
          AND e.is_published = TRUE
          AND e.is_cancelled = FALSE
    ) AS saved_events_count
FROM public.venues v;
