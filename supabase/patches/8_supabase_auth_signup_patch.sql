-- ============================================================
--  mitmi - Auth signup patch v8
--  Svrha:
--  - stabilizuje auth.users trigger pri registraciji
--  - ako profile insert pukne, ne obara ceo signup
--  - koristi predvidljiv username suffix bez dodatnih ekstenzija
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    base_username TEXT;
    final_username TEXT;
    user_role_val TEXT;
BEGIN
    user_role_val := COALESCE(NEW.raw_user_meta_data->>'role', 'user');

    IF user_role_val NOT IN ('user', 'venue', 'admin') THEN
        user_role_val := 'user';
    END IF;

    base_username := LOWER(REGEXP_REPLACE(SPLIT_PART(COALESCE(NEW.email, 'user'), '@', 1), '[^a-z0-9]', '', 'g'));
    IF LENGTH(base_username) < 3 THEN
        base_username := 'user';
    END IF;

    final_username := base_username || '_' || SUBSTRING(md5(NEW.id::text), 1, 6);

    BEGIN
        INSERT INTO public.profiles (
            id,
            username,
            display_name,
            city,
            role,
            status,
            created_at,
            updated_at
        ) VALUES (
            NEW.id,
            final_username,
            COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(COALESCE(NEW.email, 'mitmi'), '@', 1)),
            COALESCE(NEW.raw_user_meta_data->>'city', 'Novi Sad'),
            user_role_val::public.user_role,
            'active',
            NOW(),
            NOW()
        )
        ON CONFLICT (id) DO NOTHING;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE WARNING '[mitmi] handle_new_user skipped profile bootstrap for %: %', NEW.id, SQLERRM;
    END;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

COMMIT;
