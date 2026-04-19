-- ============================================================
-- Patch 10: approve_event_draft data integrity
-- Cilj:
-- - ne gubiti draft cover pri approval-u
-- - opis iz draft forme ima prioritet nad AI summary
-- - preuzeti public_address i ticket_price_rsd iz raw_payload kada postoje
-- ============================================================

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
    v_public_address TEXT;
    v_ticket_price_rsd INTEGER;
    v_description TEXT;
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

    -- User-entered description should win over AI summary.
    v_description := CASE
        WHEN BTRIM(COALESCE(v_draft.description, '')) <> '' THEN v_draft.description
        ELSE NULLIF(BTRIM(COALESCE(v_draft.ai_summary, '')), '')
    END;

    -- Optional enrichment from raw payload (when provided by import flows).
    v_public_address := NULLIF(BTRIM(COALESCE(v_draft.raw_payload->>'public_address', '')), '');

    v_ticket_price_rsd := CASE
        WHEN COALESCE(v_draft.raw_payload->>'ticket_price_rsd', '') ~ '^[0-9]+$'
            THEN (v_draft.raw_payload->>'ticket_price_rsd')::INTEGER
        ELSE NULL
    END;

    INSERT INTO public.events (
        title,
        description,
        category,
        event_tags,
        city,
        location_name,
        public_address,
        starts_at,
        ends_at,
        creator_id,
        venue_id,
        organizer_id,
        organizer_name_override,
        cover_url,
        ticket_price_rsd,
        is_published
    ) VALUES (
        v_draft.title,
        v_description,
        v_draft.category,
        COALESCE(v_draft.event_tags, '{}'::TEXT[]),
        v_draft.city,
        v_draft.location_name,
        v_public_address,
        v_draft.starts_at,
        v_draft.ends_at,
        v_creator_id,
        v_draft.venue_id,
        v_draft.organizer_id,
        CASE WHEN v_draft.organizer_id IS NULL THEN v_draft.proposed_organizer_name ELSE NULL END,
        NULLIF(BTRIM(COALESCE(v_draft.cover_image_url, '')), ''),
        v_ticket_price_rsd,
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
