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
    LIMIT 1;

    IF existing_chat_id IS NOT NULL THEN RETURN existing_chat_id; END IF;

    INSERT INTO public.chats (chat_type) VALUES ('direct') RETURNING id INTO new_chat_id;
    INSERT INTO public.chat_participants (chat_id, user_id)
    VALUES (new_chat_id, auth.uid()), (new_chat_id, other_user_id);
    RETURN new_chat_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP POLICY IF EXISTS "profiles_auth_select" ON public.profiles;
CREATE POLICY "profiles_auth_select" ON public.profiles
    FOR SELECT USING (
        id = auth.uid()
        OR (
            auth.uid() IS NOT NULL
            AND status = 'active'
            AND NOT public.is_blocked(auth.uid(), id)
        )
    );

DROP POLICY IF EXISTS "events_public_select" ON public.events;
CREATE POLICY "events_public_select" ON public.events
    FOR SELECT USING (
        creator_id = auth.uid()
        OR (
            is_published = TRUE
            AND is_cancelled = FALSE
            AND auth.uid() IS NOT NULL
            AND NOT public.is_blocked(auth.uid(), creator_id)
        )
    );

CREATE OR REPLACE FUNCTION public.sync_review_tasks_for_user()
RETURNS INTEGER AS $$
DECLARE
    inserted_count INTEGER := 0;
BEGIN
    WITH eligible AS (
        SELECT
            p.id AS plan_id,
            p.event_id,
            CASE
                WHEN p.user_a_id = auth.uid() THEN p.user_b_id
                ELSE p.user_a_id
            END AS peer_id
        FROM public.event_pair_plans p
        JOIN public.events e ON e.id = p.event_id
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
        ON CONFLICT (plan_id, reviewer_id, target_type) DO NOTHING
        RETURNING 1
    )
    SELECT COALESCE((SELECT COUNT(*) FROM inserted), 0) + COALESCE((SELECT COUNT(*) FROM inserted_events), 0)
    INTO inserted_count;

    RETURN inserted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
