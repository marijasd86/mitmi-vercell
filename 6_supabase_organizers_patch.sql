-- ============================================================
--  mitmi - Organizers patch v6
--  Svrha:
--  - zadrzava ghost organizer -> claim/merge later flow
--  - zateze RLS za drafts / claims / organizers update
--  - ne dira postojece tabele ni podatke
--  - bezbedno za run iz Supabase SQL Editora
-- ============================================================

BEGIN;

-- ============================================================
--  1. RLS POLICY ZAMENE
-- ============================================================

ALTER TABLE IF EXISTS public.organizers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.event_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.organizer_claim_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizers_select" ON public.organizers;
CREATE POLICY "organizers_select" ON public.organizers
    FOR SELECT USING (status != 'archived');

DROP POLICY IF EXISTS "organizers_insert" ON public.organizers;
CREATE POLICY "organizers_insert" ON public.organizers
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL
        AND (
            public.is_admin(auth.uid())
            OR created_by = auth.uid()
        )
    );

DROP POLICY IF EXISTS "organizers_update" ON public.organizers;
CREATE POLICY "organizers_update" ON public.organizers
    FOR UPDATE USING (
        public.is_admin(auth.uid())
        OR claimed_by_profile_id = auth.uid()
    )
    WITH CHECK (
        public.is_admin(auth.uid())
        OR claimed_by_profile_id = auth.uid()
    );

DROP POLICY IF EXISTS "event_drafts_select" ON public.event_drafts;
CREATE POLICY "event_drafts_select" ON public.event_drafts
    FOR SELECT USING (
        public.is_admin(auth.uid())
        OR submitted_by = auth.uid()
        OR organizer_id IN (
            SELECT id
            FROM public.organizers
            WHERE claimed_by_profile_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "event_drafts_insert" ON public.event_drafts;
CREATE POLICY "event_drafts_insert" ON public.event_drafts
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL
        AND (
            public.is_admin(auth.uid())
            OR submitted_by = auth.uid()
        )
    );

DROP POLICY IF EXISTS "event_drafts_update" ON public.event_drafts;
CREATE POLICY "event_drafts_update" ON public.event_drafts
    FOR UPDATE USING (
        public.is_admin(auth.uid())
        OR submitted_by = auth.uid()
        OR organizer_id IN (
            SELECT id
            FROM public.organizers
            WHERE claimed_by_profile_id = auth.uid()
        )
    )
    WITH CHECK (
        public.is_admin(auth.uid())
        OR submitted_by = auth.uid()
        OR organizer_id IN (
            SELECT id
            FROM public.organizers
            WHERE claimed_by_profile_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "organizer_claim_requests_select" ON public.organizer_claim_requests;
CREATE POLICY "organizer_claim_requests_select" ON public.organizer_claim_requests
    FOR SELECT USING (
        public.is_admin(auth.uid())
        OR requester_id = auth.uid()
    );

DROP POLICY IF EXISTS "organizer_claim_requests_insert" ON public.organizer_claim_requests;
CREATE POLICY "organizer_claim_requests_insert" ON public.organizer_claim_requests
    FOR INSERT WITH CHECK (requester_id = auth.uid());

DROP POLICY IF EXISTS "organizer_claim_requests_update" ON public.organizer_claim_requests;
CREATE POLICY "organizer_claim_requests_update" ON public.organizer_claim_requests
    FOR UPDATE USING (
        public.is_admin(auth.uid())
        OR requester_id = auth.uid()
    )
    WITH CHECK (
        public.is_admin(auth.uid())
        OR requester_id = auth.uid()
    );

-- ============================================================
--  2. GUARD FUNKCIJE
-- ============================================================

CREATE OR REPLACE FUNCTION public.guard_organizer_update()
RETURNS TRIGGER AS $$
BEGIN
    IF public.is_admin(auth.uid()) THEN
        RETURN NEW;
    END IF;

    IF OLD.claimed_by_profile_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Only the claimed organizer can edit this organizer';
    END IF;

    NEW.status := OLD.status;
    NEW.claimed_by_profile_id := OLD.claimed_by_profile_id;
    NEW.merged_into_id := OLD.merged_into_id;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.updated_by := auth.uid();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.guard_event_draft_update()
RETURNS TRIGGER AS $$
BEGIN
    IF public.is_admin(auth.uid()) THEN
        RETURN NEW;
    END IF;

    IF OLD.review_status <> 'pending' THEN
        RAISE EXCEPTION 'Only pending drafts can be edited';
    END IF;

    IF NEW.review_status IS DISTINCT FROM OLD.review_status
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.approved_event_id IS DISTINCT FROM OLD.approved_event_id
       OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes THEN
        RAISE EXCEPTION 'Only admins can update review fields';
    END IF;

    NEW.submitted_by := OLD.submitted_by;
    NEW.source_type := OLD.source_type;
    NEW.approved_event_id := OLD.approved_event_id;
    NEW.review_status := OLD.review_status;
    NEW.reviewed_by := OLD.reviewed_by;
    NEW.reviewed_at := OLD.reviewed_at;
    NEW.admin_notes := OLD.admin_notes;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.guard_organizer_claim_request_update()
RETURNS TRIGGER AS $$
BEGIN
    IF public.is_admin(auth.uid()) THEN
        RETURN NEW;
    END IF;

    IF OLD.requester_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Only the requester can edit this claim';
    END IF;

    IF OLD.status <> 'pending' THEN
        RAISE EXCEPTION 'Only pending claims can be changed';
    END IF;

    IF NEW.organizer_id IS DISTINCT FROM OLD.organizer_id
       OR NEW.requester_id IS DISTINCT FROM OLD.requester_id
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes THEN
        RAISE EXCEPTION 'Only admins can change review fields';
    END IF;

    IF NEW.status NOT IN ('pending', 'cancelled') THEN
        RAISE EXCEPTION 'Requester can only keep the claim pending or cancel it';
    END IF;

    NEW.organizer_id := OLD.organizer_id;
    NEW.requester_id := OLD.requester_id;
    NEW.reviewed_by := OLD.reviewed_by;
    NEW.reviewed_at := OLD.reviewed_at;
    NEW.admin_notes := OLD.admin_notes;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
--  3. TRIGGER ZAMENE
-- ============================================================

DROP TRIGGER IF EXISTS trg_organizers_guard_update ON public.organizers;
CREATE TRIGGER trg_organizers_guard_update
    BEFORE UPDATE ON public.organizers
    FOR EACH ROW EXECUTE FUNCTION public.guard_organizer_update();

DROP TRIGGER IF EXISTS trg_event_drafts_guard_update ON public.event_drafts;
CREATE TRIGGER trg_event_drafts_guard_update
    BEFORE UPDATE ON public.event_drafts
    FOR EACH ROW EXECUTE FUNCTION public.guard_event_draft_update();

DROP TRIGGER IF EXISTS trg_organizer_claim_requests_guard_update ON public.organizer_claim_requests;
CREATE TRIGGER trg_organizer_claim_requests_guard_update
    BEFORE UPDATE ON public.organizer_claim_requests
    FOR EACH ROW EXECUTE FUNCTION public.guard_organizer_claim_request_update();

-- ============================================================
--  4. APPROVE EVENT DRAFT FIX
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
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only admins can approve event drafts';
    END IF;

    SELECT *
    INTO v_draft
    FROM public.event_drafts
    WHERE id = p_draft_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Draft not found';
    END IF;

    IF v_draft.review_status <> 'pending' THEN
        RAISE EXCEPTION 'Draft has already been reviewed';
    END IF;

    v_creator_id := COALESCE(p_creator_id, v_draft.submitted_by, auth.uid());

    INSERT INTO public.events (
        title,
        description,
        category,
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
        v_draft.city,
        v_draft.location_name,
        v_draft.starts_at,
        v_draft.ends_at,
        v_creator_id,
        v_draft.venue_id,
        v_draft.organizer_id,
        CASE
            WHEN v_draft.organizer_id IS NULL THEN v_draft.proposed_organizer_name
            ELSE NULL
        END,
        p_publish
    )
    RETURNING id INTO v_event_id;

    UPDATE public.event_drafts
    SET review_status = 'approved',
        approved_event_id = v_event_id,
        reviewed_by = auth.uid(),
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_draft_id;

    UPDATE public.events
    SET imported_from_draft_id = p_draft_id
    WHERE id = v_event_id;

    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
