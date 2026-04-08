-- ============================================================
-- MITMI v1 admin role lockdown patch
-- Closes client-side admin escalation paths
-- ============================================================

DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_update_safe" ON public.profiles;
CREATE POLICY "profiles_self_update_safe" ON public.profiles
    FOR UPDATE USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;
CREATE POLICY "profiles_admin_update" ON public.profiles
    FOR UPDATE USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS TRIGGER AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
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

    IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Only admins can change profile role';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'Only admins can change profile status';
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

CREATE OR REPLACE FUNCTION public.grant_admin_role(target_user_id UUID)
RETURNS UUID AS $$
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only admins can grant admin role';
    END IF;

    UPDATE public.profiles
    SET role = 'admin',
        updated_at = NOW()
    WHERE id = target_user_id;

    RETURN target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.revoke_admin_role(target_user_id UUID)
RETURNS UUID AS $$
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only admins can revoke admin role';
    END IF;

    UPDATE public.profiles
    SET role = 'user',
        updated_at = NOW()
    WHERE id = target_user_id;

    RETURN target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
