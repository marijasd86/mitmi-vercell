-- ============================================================
--  mitmi - Event photos RLS patch
--  Svrha:
--   1. Vlasnik eventa i uploader vide slike i pre objave
--   2. Javnost i dalje vidi samo slike objavljenih i aktivnih događaja
-- ============================================================

DROP POLICY IF EXISTS "event_photos_select" ON public.event_photos;

CREATE POLICY "event_photos_select" ON public.event_photos
    FOR SELECT USING (
        uploader_id = auth.uid()
        OR EXISTS (
            SELECT 1
            FROM public.events
            WHERE id = event_photos.event_id
              AND creator_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1
            FROM public.events
            WHERE id = event_photos.event_id
              AND is_published = TRUE
              AND is_cancelled = FALSE
        )
    );
