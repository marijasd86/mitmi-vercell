-- ============================================================
-- Patch 13: Invites legacy lock
-- Cilj:
-- - plans ostaje canonical social model
-- - invites/invite_applications ostaju samo legacy read/admin maintenance
-- ============================================================

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invites_insert" ON public.invites;
CREATE POLICY "invites_insert" ON public.invites
    FOR INSERT WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "invites_update" ON public.invites;
CREATE POLICY "invites_update" ON public.invites
    FOR UPDATE USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "invites_delete" ON public.invites;
CREATE POLICY "invites_delete" ON public.invites
    FOR DELETE USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "invite_apps_insert" ON public.invite_applications;
CREATE POLICY "invite_apps_insert" ON public.invite_applications
    FOR INSERT WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "invite_apps_update" ON public.invite_applications;
CREATE POLICY "invite_apps_update" ON public.invite_applications
    FOR UPDATE USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));
