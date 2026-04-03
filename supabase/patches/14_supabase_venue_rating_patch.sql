-- ============================================================
--  mitmi - Venue rating schema patch
--  Pokreni posle: 1_supabase_schema.sql i 3_supabase_final.sql
--  Svrha:
--   1. Dodaje venues.avg_rating i venues.rating_count ako nedostaju
--   2. Backfill-uje vrednosti iz public.venue_reviews
--   3. Osvežava trigger da održava i prosek i broj ocena
-- ============================================================

ALTER TABLE public.venues
    ADD COLUMN IF NOT EXISTS avg_rating NUMERIC(3,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0;

UPDATE public.venues v
SET
    avg_rating = src.avg_rating,
    rating_count = src.rating_count
FROM (
    SELECT
        venue_id,
        ROUND(AVG(rating_overall)::numeric, 2) AS avg_rating,
        COUNT(*)::integer AS rating_count
    FROM public.venue_reviews
    GROUP BY venue_id
) AS src
WHERE v.id = src.venue_id;

UPDATE public.venues
SET avg_rating = 0
WHERE avg_rating IS NULL;

UPDATE public.venues
SET rating_count = 0
WHERE rating_count IS NULL;

CREATE OR REPLACE FUNCTION public.update_venue_rating()
RETURNS TRIGGER AS $$
DECLARE
    target_venue_id UUID;
BEGIN
    target_venue_id := COALESCE(NEW.venue_id, OLD.venue_id);

    UPDATE public.venues
    SET
        avg_rating = COALESCE((
            SELECT ROUND(AVG(rating_overall)::numeric, 2)
            FROM public.venue_reviews
            WHERE venue_id = target_venue_id
        ), 0),
        rating_count = (
            SELECT COUNT(*)::integer
            FROM public.venue_reviews
            WHERE venue_id = target_venue_id
        )
    WHERE id = target_venue_id;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_venue_reviews_rating ON public.venue_reviews;
CREATE TRIGGER trg_venue_reviews_rating
    AFTER INSERT OR UPDATE OR DELETE ON public.venue_reviews
    FOR EACH ROW EXECUTE FUNCTION public.update_venue_rating();
