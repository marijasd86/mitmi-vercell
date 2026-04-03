-- ============================================================
--  mitmi - Event cover_url patch
--  Svrha:
--   1. Dodaje public.events.cover_url ako nedostaje
--   2. Osvježava v_event_feed da uključuje event cover_url
-- ============================================================

ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS cover_url TEXT;

DROP VIEW IF EXISTS public.v_event_feed CASCADE;
CREATE VIEW public.v_event_feed AS
SELECT
    e.id, e.title, e.description, e.category, e.city,
    e.location_name, e.starts_at, e.ends_at,
    e.capacity, e.attendee_count, e.cover_url, e.cover_gradient,
    e.is_cancelled, e.created_at,
    v.id          AS venue_id,
    v.venue_name,
    v.cover_url   AS venue_cover_url,
    v.status      AS venue_status,
    p.id          AS creator_id,
    p.username    AS creator_username,
    p.avatar_url  AS creator_avatar,
    p.avg_rating  AS creator_rating,
    CASE WHEN e.capacity IS NULL THEN NULL
         ELSE GREATEST(e.capacity - e.attendee_count, 0)
    END AS spots_available,
    (e.starts_at::date = CURRENT_DATE) AS is_urgent,
    (SELECT COUNT(*) FROM public.invites
     WHERE event_id = e.id AND status = 'open') AS open_invites_count,
    (SELECT photo_url FROM public.event_photos
     WHERE event_id = e.id
     ORDER BY display_order ASC, created_at ASC
     LIMIT 1) AS first_photo_url
FROM public.events e
LEFT JOIN public.venues v   ON v.id = e.venue_id
LEFT JOIN public.profiles p ON p.id = e.creator_id
WHERE e.is_published = TRUE;
