-- ============================================================
-- MITMI v2 reset baseline
-- 05. Event tags patch for already created v2 projects
-- ============================================================

-- Koristi ovaj fajl samo ako je v2 baza vec pustena sa 01-04,
-- pa zelis naknadno da dodas event tags bez resetovanja projekta.

ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS event_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

ALTER TABLE public.plans
    ADD COLUMN IF NOT EXISTS event_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

ALTER TABLE public.event_drafts
    ADD COLUMN IF NOT EXISTS event_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

CREATE INDEX IF NOT EXISTS idx_events_event_tags
    ON public.events USING GIN(event_tags);

CREATE INDEX IF NOT EXISTS idx_plans_event_tags
    ON public.plans USING GIN(event_tags);

CREATE OR REPLACE FUNCTION public.approve_event_draft(
    p_draft_id UUID,
    p_creator_id UUID DEFAULT NULL,
    p_publish BOOLEAN DEFAULT FALSE
)
RETURNS UUID AS $$
DECLARE
    v_draft public.event_drafts%ROWTYPE;
    v_event_id UUID;
    v_creator_id UUID;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only admins can approve event drafts';
    END IF;

    SELECT * INTO v_draft
    FROM public.event_drafts
    WHERE id = p_draft_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Draft not found';
    END IF;

    IF v_draft.review_status <> 'pending' THEN
        RAISE EXCEPTION 'Only pending drafts can be approved';
    END IF;

    IF BTRIM(COALESCE(v_draft.title, '')) = '' THEN
        RAISE EXCEPTION 'Draft title is required';
    END IF;

    IF v_draft.starts_at IS NULL THEN
        RAISE EXCEPTION 'Draft starts_at is required';
    END IF;

    v_creator_id := COALESCE(p_creator_id, v_draft.submitted_by, auth.uid());

    INSERT INTO public.events (
        title,
        description,
        category,
        event_tags,
        city,
        location_name,
        starts_at,
        ends_at,
        creator_id,
        venue_id,
        organizer_id,
        organizer_name_override,
        is_published
    ) VALUES (
        v_draft.title,
        COALESCE(v_draft.ai_summary, v_draft.description),
        v_draft.category,
        COALESCE(v_draft.event_tags, '{}'::TEXT[]),
        v_draft.city,
        v_draft.location_name,
        v_draft.starts_at,
        v_draft.ends_at,
        v_creator_id,
        v_draft.venue_id,
        v_draft.organizer_id,
        CASE WHEN v_draft.organizer_id IS NULL THEN v_draft.proposed_organizer_name ELSE NULL END,
        p_publish
    )
    RETURNING id INTO v_event_id;

    UPDATE public.event_drafts
    SET review_status = 'approved',
        approved_event_id = v_event_id,
        reviewed_by = auth.uid(),
        reviewed_at = NOW()
    WHERE id = p_draft_id;

    UPDATE public.events
    SET imported_from_draft_id = p_draft_id
    WHERE id = v_event_id;

    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP VIEW IF EXISTS public.v_event_feed CASCADE;
CREATE VIEW public.v_event_feed AS
SELECT
    e.id,
    e.title,
    e.description,
    e.category,
    e.event_tags,
    e.city,
    e.location_name,
    e.starts_at,
    e.ends_at,
    e.capacity,
    e.attendee_count,
    e.cover_url,
    e.cover_gradient,
    e.is_cancelled,
    e.created_at,
    e.organizer_id,
    o.name AS organizer_name,
    v.id AS venue_id,
    v.venue_name,
    v.cover_url AS venue_cover_url,
    v.status AS venue_status,
    p.id AS creator_id,
    p.username AS creator_username,
    p.avatar_url AS creator_avatar,
    p.avg_rating AS creator_rating,
    CASE
        WHEN e.capacity IS NULL THEN NULL
        ELSE GREATEST(e.capacity - e.attendee_count, 0)
    END AS spots_available,
    (e.starts_at::date = CURRENT_DATE) AS is_urgent,
    (
        SELECT COUNT(*)
        FROM public.invites i
        WHERE i.event_id = e.id
          AND i.status = 'open'
    ) AS open_invites_count,
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
    ) AS is_saved_by_me,
    (
        SELECT photo_url
        FROM public.event_photos ep
        WHERE ep.event_id = e.id
        ORDER BY ep.display_order ASC, ep.created_at ASC
        LIMIT 1
    ) AS first_photo_url
FROM public.events e
LEFT JOIN public.venues v ON v.id = e.venue_id
LEFT JOIN public.organizers o ON o.id = e.organizer_id
LEFT JOIN public.profiles p ON p.id = e.creator_id
WHERE e.is_published = TRUE
  AND e.is_cancelled = FALSE
  AND COALESCE(e.is_hidden, FALSE) = FALSE
  AND e.starts_at >= NOW() - INTERVAL '2 hours';
