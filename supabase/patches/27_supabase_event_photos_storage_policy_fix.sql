DROP POLICY IF EXISTS "storage_event_photos_insert" ON storage.objects;
CREATE POLICY "storage_event_photos_insert" ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'event-photos'
    AND auth.uid() IS NOT NULL
    AND auth.uid()::text = SPLIT_PART(name, '/', 2)
    AND EXISTS (
        SELECT 1
        FROM public.events e
        WHERE e.id::text = SPLIT_PART(name, '/', 1)
          AND e.creator_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "storage_event_photos_delete" ON storage.objects;
CREATE POLICY "storage_event_photos_delete" ON storage.objects FOR DELETE USING (
    bucket_id = 'event-photos'
    AND auth.uid() IS NOT NULL
    AND auth.uid()::text = SPLIT_PART(name, '/', 2)
    AND EXISTS (
        SELECT 1
        FROM public.events e
        WHERE e.id::text = SPLIT_PART(name, '/', 1)
          AND e.creator_id = auth.uid()
    )
);
