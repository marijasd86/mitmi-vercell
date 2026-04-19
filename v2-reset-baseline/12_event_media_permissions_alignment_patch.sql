-- ============================================================
-- Patch 12: Event media permissions alignment
-- Cilj:
-- - uskladiti event_photos + storage policy sa event management pravima
-- - creator/admin/claimed organizer/venue owner imaju ista prava kao na events
-- ============================================================

ALTER TABLE public.event_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_photos_insert" ON public.event_photos;
CREATE POLICY "event_photos_insert" ON public.event_photos
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL
        AND uploader_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.events e
            WHERE e.id = event_photos.event_id
              AND (
                public.is_admin(auth.uid())
                OR e.creator_id = auth.uid()
                OR (
                    e.organizer_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1
                        FROM public.organizers o
                        WHERE o.id = e.organizer_id
                          AND o.claimed_by_profile_id = auth.uid()
                          AND o.status = 'claimed'
                    )
                )
                OR (
                    e.venue_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1
                        FROM public.venues v
                        WHERE v.id = e.venue_id
                          AND v.profile_id = auth.uid()
                          AND v.status <> 'archived'
                    )
                )
              )
        )
    );

DROP POLICY IF EXISTS "event_photos_delete" ON public.event_photos;
CREATE POLICY "event_photos_delete" ON public.event_photos
    FOR DELETE USING (
        uploader_id = auth.uid()
        OR EXISTS (
            SELECT 1
            FROM public.events e
            WHERE e.id = event_photos.event_id
              AND (
                public.is_admin(auth.uid())
                OR e.creator_id = auth.uid()
                OR (
                    e.organizer_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1
                        FROM public.organizers o
                        WHERE o.id = e.organizer_id
                          AND o.claimed_by_profile_id = auth.uid()
                          AND o.status = 'claimed'
                    )
                )
                OR (
                    e.venue_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1
                        FROM public.venues v
                        WHERE v.id = e.venue_id
                          AND v.profile_id = auth.uid()
                          AND v.status <> 'archived'
                    )
                )
              )
        )
    );

DROP POLICY IF EXISTS "storage_event_photos_insert" ON storage.objects;
CREATE POLICY "storage_event_photos_insert" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'event-photos'
        AND auth.uid() IS NOT NULL
        AND auth.uid()::text = SPLIT_PART(name, '/', 2)
        AND EXISTS (
            SELECT 1
            FROM public.events e
            WHERE e.id::text = SPLIT_PART(name, '/', 1)
              AND (
                public.is_admin(auth.uid())
                OR e.creator_id = auth.uid()
                OR (
                    e.organizer_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1
                        FROM public.organizers o
                        WHERE o.id = e.organizer_id
                          AND o.claimed_by_profile_id = auth.uid()
                          AND o.status = 'claimed'
                    )
                )
                OR (
                    e.venue_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1
                        FROM public.venues v
                        WHERE v.id = e.venue_id
                          AND v.profile_id = auth.uid()
                          AND v.status <> 'archived'
                    )
                )
              )
        )
    );

DROP POLICY IF EXISTS "storage_event_photos_delete" ON storage.objects;
CREATE POLICY "storage_event_photos_delete" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'event-photos'
        AND auth.uid() IS NOT NULL
        AND auth.uid()::text = SPLIT_PART(name, '/', 2)
        AND EXISTS (
            SELECT 1
            FROM public.events e
            WHERE e.id::text = SPLIT_PART(name, '/', 1)
              AND (
                public.is_admin(auth.uid())
                OR e.creator_id = auth.uid()
                OR (
                    e.organizer_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1
                        FROM public.organizers o
                        WHERE o.id = e.organizer_id
                          AND o.claimed_by_profile_id = auth.uid()
                          AND o.status = 'claimed'
                    )
                )
                OR (
                    e.venue_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1
                        FROM public.venues v
                        WHERE v.id = e.venue_id
                          AND v.profile_id = auth.uid()
                          AND v.status <> 'archived'
                    )
                )
              )
        )
    );
