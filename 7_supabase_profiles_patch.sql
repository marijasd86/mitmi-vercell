-- ============================================================
--  mitmi - Profiles patch v7
--  Svrha:
--  - omogucava korisniku da kreira svoj public.profiles red
--  - omogucava bezbedan upsert iz browsera preko auth.uid()
-- ============================================================

BEGIN;

ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.venues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_self_insert" ON public.profiles;
CREATE POLICY "profiles_self_insert" ON public.profiles
    FOR INSERT WITH CHECK (
        id = auth.uid()
        AND auth.uid() IS NOT NULL
    );

DROP POLICY IF EXISTS "venues_update" ON public.venues;
CREATE POLICY "venues_update" ON public.venues
    FOR UPDATE USING (profile_id = auth.uid())
    WITH CHECK (profile_id = auth.uid());

COMMIT;
