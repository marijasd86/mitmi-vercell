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
$$ LANGUAGE plpgsql SECURITY DEFINER;
