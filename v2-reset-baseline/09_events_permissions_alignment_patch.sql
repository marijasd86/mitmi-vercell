-- ============================================================
-- Patch 09: Events permissions alignment
-- Cilj:
-- - uskladiti RLS sa realnim admin/organizer/venue tokovima iz frontenda
-- - zadrzati creator ownership kao osnovu
-- ============================================================

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events_owner_insert" ON public.events;
CREATE POLICY "events_owner_insert" ON public.events
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL
        AND creator_id = auth.uid()
        AND (
            public.is_admin(auth.uid())
            OR (
                organizer_id IS NULL
                AND venue_id IS NULL
            )
            OR (
                organizer_id IS NOT NULL
                AND EXISTS (
                    SELECT 1
                    FROM public.organizers o
                    WHERE o.id = organizer_id
                      AND o.claimed_by_profile_id = auth.uid()
                      AND o.status = 'claimed'
                )
            )
            OR (
                venue_id IS NOT NULL
                AND EXISTS (
                    SELECT 1
                    FROM public.venues v
                    WHERE v.id = venue_id
                      AND v.profile_id = auth.uid()
                      AND v.status <> 'archived'
                )
            )
        )
    );

DROP POLICY IF EXISTS "events_owner_update" ON public.events;
CREATE POLICY "events_owner_update" ON public.events
    FOR UPDATE USING (
        public.is_admin(auth.uid())
        OR creator_id = auth.uid()
        OR (
            organizer_id IS NOT NULL
            AND EXISTS (
                SELECT 1
                FROM public.organizers o
                WHERE o.id = organizer_id
                  AND o.claimed_by_profile_id = auth.uid()
                  AND o.status = 'claimed'
            )
        )
        OR (
            venue_id IS NOT NULL
            AND EXISTS (
                SELECT 1
                FROM public.venues v
                WHERE v.id = venue_id
                  AND v.profile_id = auth.uid()
                  AND v.status <> 'archived'
            )
        )
    )
    WITH CHECK (
        public.is_admin(auth.uid())
        OR creator_id = auth.uid()
        OR (
            organizer_id IS NOT NULL
            AND EXISTS (
                SELECT 1
                FROM public.organizers o
                WHERE o.id = organizer_id
                  AND o.claimed_by_profile_id = auth.uid()
                  AND o.status = 'claimed'
            )
        )
        OR (
            venue_id IS NOT NULL
            AND EXISTS (
                SELECT 1
                FROM public.venues v
                WHERE v.id = venue_id
                  AND v.profile_id = auth.uid()
                  AND v.status <> 'archived'
            )
        )
    );
