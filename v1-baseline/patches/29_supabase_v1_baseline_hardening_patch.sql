-- ============================================================
-- MITMI v1 baseline hardening patch
-- Applies post-baseline SQL safety fixes without full reset
-- ============================================================

-- 01. Identity hardening

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS TRIGGER AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'admin'
          AND status = 'active'
    ) THEN
        RETURN NEW;
    END IF;

    IF NEW.id = auth.uid() THEN
        NEW.role := OLD.role;
        NEW.status := OLD.status;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_profiles_protect_privileged_fields ON public.profiles;
CREATE TRIGGER trg_profiles_protect_privileged_fields
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_fields();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    base_username TEXT;
    final_username TEXT;
    user_role_val TEXT;
BEGIN
    user_role_val := COALESCE(NEW.raw_user_meta_data->>'role', 'user');
    IF user_role_val NOT IN ('user','venue') THEN
        user_role_val := 'user';
    END IF;

    base_username := LOWER(REGEXP_REPLACE(SPLIT_PART(NEW.email, '@', 1), '[^a-z0-9]', '', 'g'));
    IF LENGTH(base_username) < 3 THEN
        base_username := 'user';
    END IF;
    final_username := base_username || '_' || SUBSTR(gen_random_uuid()::text, 1, 6);

    INSERT INTO public.profiles (
        id, username, display_name, city, role, status, created_at, updated_at
    ) VALUES (
        NEW.id,
        final_username,
        COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1)),
        NULLIF(BTRIM(NEW.raw_user_meta_data->>'city'), ''),
        user_role_val::public.user_role,
        'active',
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 02. Organizer + drafts hardening

CREATE OR REPLACE FUNCTION public.approve_organizer_claim(
    p_claim_request_id UUID
)
RETURNS UUID AS $$
DECLARE
    v_request public.organizer_claim_requests%ROWTYPE;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only admins can approve organizer claims';
    END IF;

    SELECT * INTO v_request
    FROM public.organizer_claim_requests
    WHERE id = p_claim_request_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Claim request not found';
    END IF;

    UPDATE public.organizer_claim_requests
    SET status = 'approved',
        reviewed_by = auth.uid(),
        reviewed_at = NOW()
    WHERE id = p_claim_request_id;

    UPDATE public.organizer_claim_requests
    SET status = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_at = NOW(),
        admin_notes = COALESCE(admin_notes, 'Drugi zahtev za isti organizer je odobren.')
    WHERE organizer_id = v_request.organizer_id
      AND id <> p_claim_request_id
      AND status = 'pending';

    UPDATE public.organizers
    SET status = 'claimed',
        claimed_by_profile_id = v_request.requester_id,
        updated_by = auth.uid()
    WHERE id = v_request.organizer_id;

    RETURN v_request.organizer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.revoke_organizer_claim(
    p_organizer_id UUID,
    p_note TEXT DEFAULT NULL
)
RETURNS UUID AS $$
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only admins can revoke organizer claims';
    END IF;

    UPDATE public.organizers
    SET status = 'unclaimed',
        claimed_by_profile_id = NULL,
        updated_by = auth.uid()
    WHERE id = p_organizer_id;

    UPDATE public.organizer_claim_requests
    SET admin_notes = COALESCE(admin_notes, p_note)
    WHERE organizer_id = p_organizer_id
      AND status = 'approved';

    RETURN p_organizer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.merge_organizers(
    p_from_organizer_id UUID,
    p_into_organizer_id UUID
)
RETURNS UUID AS $$
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only admins can merge organizers';
    END IF;

    IF p_from_organizer_id = p_into_organizer_id THEN
        RAISE EXCEPTION 'Cannot merge organizer into itself';
    END IF;

    UPDATE public.events
    SET organizer_id = p_into_organizer_id
    WHERE organizer_id = p_from_organizer_id;

    UPDATE public.event_drafts
    SET organizer_id = p_into_organizer_id
    WHERE organizer_id = p_from_organizer_id;

    UPDATE public.organizers
    SET status = 'merged',
        merged_into_id = p_into_organizer_id,
        updated_by = auth.uid()
    WHERE id = p_from_organizer_id;

    RETURN p_into_organizer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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

-- 03. Social + chat + review hardening

DROP POLICY IF EXISTS "plans_public_select" ON public.plans;
CREATE POLICY "plans_public_select" ON public.plans
    FOR SELECT USING (
        (status IN ('open','closed'))
        OR (creator_id = auth.uid())
    );

DROP POLICY IF EXISTS "invites_select" ON public.invites;
CREATE POLICY "invites_select" ON public.invites
    FOR SELECT USING (
        (status = 'open')
        OR (creator_id = auth.uid())
    );

DROP POLICY IF EXISTS "invite_apps_select" ON public.invite_applications;
CREATE POLICY "invite_apps_select" ON public.invite_applications
    FOR SELECT USING (
        (applicant_id = auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.invites
            WHERE id = invite_applications.invite_id
              AND creator_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "invite_apps_update" ON public.invite_applications;
CREATE POLICY "invite_apps_update" ON public.invite_applications
    FOR UPDATE USING (
        (applicant_id = auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.invites
            WHERE id = invite_applications.invite_id
              AND creator_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "peer_reviews_select" ON public.peer_reviews;
CREATE POLICY "peer_reviews_select" ON public.peer_reviews
    FOR SELECT USING (
        (reviewer_id = auth.uid())
        OR (reviewed_user_id = auth.uid())
        OR public.is_admin(auth.uid())
    );

DROP POLICY IF EXISTS "event_reviews_select" ON public.event_reviews;
CREATE POLICY "event_reviews_select" ON public.event_reviews
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.events e
            WHERE e.id = event_reviews.event_id
              AND e.is_published = TRUE
              AND e.is_cancelled = FALSE
              AND COALESCE(e.is_hidden, FALSE) = FALSE
        )
        OR (reviewer_id = auth.uid())
        OR public.is_admin(auth.uid())
    );

CREATE OR REPLACE FUNCTION public.is_blocked(a_user_id UUID, b_user_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.blocks
        WHERE (blocker_id = a_user_id AND blocked_id = b_user_id)
           OR (blocker_id = b_user_id AND blocked_id = a_user_id)
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.create_or_get_dm(other_user_id UUID)
RETURNS UUID AS $$
DECLARE
    existing_chat_id UUID;
    new_chat_id UUID;
BEGIN
    IF public.is_blocked(auth.uid(), other_user_id) THEN
        RAISE EXCEPTION 'DM nije dostupan između blokiranih korisnika';
    END IF;

    SELECT c.id INTO existing_chat_id
    FROM public.chats c
    JOIN public.chat_participants cp1 ON cp1.chat_id = c.id AND cp1.user_id = auth.uid()
    JOIN public.chat_participants cp2 ON cp2.chat_id = c.id AND cp2.user_id = other_user_id
    WHERE c.chat_type = 'direct'
      AND c.event_id IS NULL
    LIMIT 1;

    IF existing_chat_id IS NOT NULL THEN
        RETURN existing_chat_id;
    END IF;

    INSERT INTO public.chats (chat_type, created_by)
    VALUES ('direct', auth.uid())
    RETURNING id INTO new_chat_id;

    INSERT INTO public.chat_participants (chat_id, user_id)
    VALUES (new_chat_id, auth.uid()), (new_chat_id, other_user_id);

    RETURN new_chat_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.sync_review_tasks_for_user()
RETURNS INTEGER AS $$
DECLARE
    inserted_count INTEGER := 0;
BEGIN
    WITH eligible AS (
        SELECT
            p.id AS plan_id,
            COALESCE(src.event_id, p.event_id) AS event_id,
            src.id AS source_plan_id,
            src.event_id AS source_event_id,
            CASE
                WHEN p.user_a_id = auth.uid() THEN p.user_b_id
                ELSE p.user_a_id
            END AS peer_id
        FROM public.event_pair_plans p
        LEFT JOIN public.plans src ON src.id = p.source_plan_id
        JOIN public.events e ON e.id = COALESCE(src.event_id, p.event_id)
        WHERE p.status = 'confirmed'
          AND (p.user_a_id = auth.uid() OR p.user_b_id = auth.uid())
          AND COALESCE(e.ends_at, e.starts_at) <= NOW()
    ), inserted AS (
        INSERT INTO public.review_tasks (plan_id, reviewer_id, event_id, target_type, target_user_id, status, available_at)
        SELECT plan_id, auth.uid(), event_id, 'peer', peer_id, 'pending', NOW()
        FROM eligible
        ON CONFLICT (plan_id, reviewer_id, target_type) DO NOTHING
        RETURNING 1
    ), inserted_events AS (
        INSERT INTO public.review_tasks (plan_id, reviewer_id, event_id, target_type, target_user_id, status, available_at)
        SELECT plan_id, auth.uid(), event_id, 'event', NULL, 'pending', NOW()
        FROM eligible
        WHERE source_plan_id IS NULL OR source_event_id IS NOT NULL
        ON CONFLICT (plan_id, reviewer_id, target_type) DO NOTHING
        RETURNING 1
    )
    SELECT COALESCE((SELECT COUNT(*) FROM inserted), 0) + COALESCE((SELECT COUNT(*) FROM inserted_events), 0)
    INTO inserted_count;

    RETURN inserted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.update_profile_rating_from_peer_reviews()
RETURNS TRIGGER AS $$
DECLARE
    target_profile_id UUID;
BEGIN
    target_profile_id := COALESCE(NEW.reviewed_user_id, OLD.reviewed_user_id);
    IF target_profile_id IS NULL THEN
        RETURN NULL;
    END IF;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.update_event_rating_from_reviews()
RETURNS TRIGGER AS $$
DECLARE
    target_event_id UUID;
    target_venue_id UUID;
BEGIN
    target_event_id := COALESCE(NEW.event_id, OLD.event_id);
    target_venue_id := COALESCE(NEW.venue_id, OLD.venue_id);
    IF target_event_id IS NULL THEN
        RETURN NULL;
    END IF;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 04. Moderation hardening

CREATE OR REPLACE FUNCTION public.create_moderation_item(
    p_entity_type public.moderation_entity_type,
    p_entity_id UUID,
    p_reason TEXT,
    p_source_type public.moderation_source_type DEFAULT 'system',
    p_priority SMALLINT DEFAULT 2,
    p_report_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
    v_item_id UUID;
BEGIN
    INSERT INTO public.moderation_items (
        entity_type, entity_id, source_type, reason, priority, status, created_by, report_id, metadata
    )
    VALUES (
        p_entity_type, p_entity_id, p_source_type, p_reason, COALESCE(p_priority, 2), 'open', auth.uid(), p_report_id, COALESCE(p_metadata, '{}'::jsonb)
    )
    RETURNING id INTO v_item_id;

    RETURN v_item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.resolve_moderation_item(
    p_item_id UUID,
    p_status public.moderation_status,
    p_note TEXT DEFAULT NULL
)
RETURNS public.moderation_items AS $$
DECLARE
    v_item public.moderation_items;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only admins can resolve moderation items';
    END IF;

    UPDATE public.moderation_items
    SET status = p_status,
        notes = COALESCE(p_note, notes),
        reviewed_by = auth.uid(),
        reviewed_at = NOW(),
        resolved_at = CASE
            WHEN p_status IN ('resolved', 'dismissed') THEN NOW()
            ELSE resolved_at
        END,
        updated_at = NOW()
    WHERE id = p_item_id
    RETURNING * INTO v_item;

    RETURN v_item;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.submit_report(
    p_entity_type public.moderation_entity_type,
    p_entity_id UUID,
    p_reason TEXT,
    p_message TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_report_id UUID;
BEGIN
    INSERT INTO public.reports (
        reporter_id, entity_type, entity_id, reason, message, status
    )
    VALUES (
        auth.uid(), p_entity_type, p_entity_id, p_reason, p_message, 'open'
    )
    RETURNING id INTO v_report_id;

    PERFORM public.create_moderation_item(
        p_entity_type,
        p_entity_id,
        p_reason,
        'user',
        2,
        v_report_id,
        jsonb_build_object('message', p_message)
    );

    RETURN v_report_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.soft_hide_entity(
    p_entity_type public.moderation_entity_type,
    p_entity_id UUID,
    p_reason TEXT
)
RETURNS VOID AS $$
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only admins can hide entities';
    END IF;

    IF p_entity_type = 'event' THEN
        UPDATE public.events
        SET is_hidden = TRUE,
            hidden_reason = p_reason,
            hidden_by = auth.uid(),
            hidden_at = NOW()
        WHERE id = p_entity_id;
    ELSIF p_entity_type = 'organizer' THEN
        UPDATE public.organizers
        SET is_hidden = TRUE,
            hidden_reason = p_reason,
            hidden_by = auth.uid(),
            hidden_at = NOW()
        WHERE id = p_entity_id;
    ELSIF p_entity_type = 'event_draft' THEN
        UPDATE public.event_drafts
        SET is_hidden = TRUE,
            hidden_reason = p_reason,
            hidden_by = auth.uid(),
            hidden_at = NOW()
        WHERE id = p_entity_id;
    ELSE
        RAISE EXCEPTION 'Soft hide not implemented for entity type %', p_entity_type;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
