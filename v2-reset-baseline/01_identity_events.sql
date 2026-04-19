-- ============================================================
-- MITMI v1 baseline
-- 01. Identity + Venues + Events
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
    CREATE TYPE public.user_role AS ENUM ('user','venue','admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.profiles (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username        TEXT NOT NULL UNIQUE,
    display_name    TEXT,
    city            TEXT,
    bio             TEXT,
    avatar_url      TEXT,
    gender          TEXT,
    birth_year      INTEGER,
    interests       TEXT[] NOT NULL DEFAULT '{}',
    social_tempo    TEXT,
    profile_visibility TEXT NOT NULL DEFAULT 'registered',
    role            public.user_role NOT NULL DEFAULT 'user',
    status          TEXT NOT NULL DEFAULT 'active',
    avg_rating      NUMERIC(3,2) NOT NULL DEFAULT 0,
    rating_count    INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT profiles_status_check CHECK (status IN ('active','blocked','deleted')),
    CONSTRAINT profiles_username_min_length CHECK (char_length(username) >= 3),
    CONSTRAINT profiles_visibility_check CHECK (profile_visibility IN ('registered','public')),
    CONSTRAINT profiles_birth_year_check CHECK (birth_year IS NULL OR (birth_year BETWEEN 1940 AND EXTRACT(YEAR FROM NOW())::INTEGER - 16)),
    CONSTRAINT profiles_social_tempo_check CHECK (social_tempo IS NULL OR social_tempo IN ('retko','povremeno','cesto'))
);

CREATE INDEX IF NOT EXISTS idx_profiles_role_status
    ON public.profiles(role, status);

CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = user_id
          AND role = 'admin'
          AND status = 'active'
    );
$$ LANGUAGE sql STABLE;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_public_select" ON public.profiles;
CREATE POLICY "profiles_public_select" ON public.profiles
    FOR SELECT USING (
        id = auth.uid()
        OR (
            status = 'active'
            AND (
                auth.uid() IS NOT NULL
                OR profile_visibility = 'public'
            )
        )
    );

DROP POLICY IF EXISTS "profiles_self_insert" ON public.profiles;
CREATE POLICY "profiles_self_insert" ON public.profiles
    FOR INSERT WITH CHECK (id = auth.uid() AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
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

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'admin'
          AND status = 'active'
    ) THEN
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
    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'admin'
          AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Only admins can revoke admin role';
    END IF;

    UPDATE public.profiles
    SET role = 'user',
        updated_at = NOW()
    WHERE id = target_user_id;

    RETURN target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.close_my_account()
RETURNS BOOLEAN AS $$
DECLARE
    current_user_id UUID := auth.uid();
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    UPDATE public.profiles
    SET status = 'deleted',
        role = 'user',
        profile_visibility = 'registered',
        display_name = 'Zatvoren profil',
        bio = NULL,
        avatar_url = NULL,
        city = NULL,
        gender = NULL,
        birth_year = NULL,
        interests = '{}',
        social_tempo = NULL,
        updated_at = NOW()
    WHERE id = current_user_id;

    UPDATE public.venues
    SET status = 'archived',
        updated_at = NOW()
    WHERE profile_id = current_user_id;

    UPDATE public.organizers
    SET claimed_by_profile_id = NULL,
        status = CASE
            WHEN status = 'claimed' THEN 'unclaimed'
            ELSE status
        END,
        updated_at = NOW()
    WHERE claimed_by_profile_id = current_user_id;

    UPDATE public.events
    SET is_published = FALSE,
        is_hidden = TRUE,
        hidden_reason = 'account_closed',
        hidden_by = current_user_id,
        hidden_at = NOW(),
        updated_at = NOW()
    WHERE creator_id = current_user_id;

    UPDATE public.plans
    SET status = 'cancelled',
        updated_at = NOW()
    WHERE creator_id = current_user_id
      AND status = 'open';

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE IF NOT EXISTS public.venues (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id      UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    venue_name      TEXT NOT NULL,
    venue_type      TEXT,
    city            TEXT,
    public_address  TEXT,
    description     TEXT,
    instagram_handle TEXT,
    website_url     TEXT,
    public_contact_email TEXT,
    public_contact_phone TEXT,
    cover_url       TEXT,
    followers_count INTEGER NOT NULL DEFAULT 0,
    avg_rating      NUMERIC(3,2) NOT NULL DEFAULT 0,
    rating_count    INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT venues_status_check CHECK (status IN ('pending','verified','rejected','archived'))
);

CREATE INDEX IF NOT EXISTS idx_venues_status_city
    ON public.venues(status, city);

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venues_select" ON public.venues;
CREATE POLICY "venues_select" ON public.venues
    FOR SELECT USING (
        status = 'verified'
        OR profile_id = auth.uid()
    );

DROP POLICY IF EXISTS "venues_insert" ON public.venues;
CREATE POLICY "venues_insert" ON public.venues
    FOR INSERT WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "venues_update" ON public.venues;
CREATE POLICY "venues_update" ON public.venues
    FOR UPDATE USING (profile_id = auth.uid())
    WITH CHECK (profile_id = auth.uid());

DROP TRIGGER IF EXISTS trg_venues_updated_at ON public.venues;
CREATE TRIGGER trg_venues_updated_at
    BEFORE UPDATE ON public.venues
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE VIEW public.venue_public_profiles AS
SELECT
    v.id,
    v.profile_id,
    v.venue_name,
    v.venue_type,
    v.city,
    v.public_address,
    v.description,
    v.instagram_handle,
    v.website_url,
    v.public_contact_email,
    v.public_contact_phone,
    v.cover_url,
    v.followers_count,
    v.avg_rating,
    v.rating_count,
    v.status,
    v.created_at,
    v.updated_at
FROM public.venues v
WHERE v.status = 'verified';

CREATE TABLE IF NOT EXISTS public.events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    venue_id        UUID REFERENCES public.venues(id) ON DELETE SET NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    category        TEXT,
    event_tags      TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
    city            TEXT,
    location_name   TEXT,
    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ,
    capacity        INTEGER,
    attendee_count  INTEGER NOT NULL DEFAULT 0,
    avg_rating      NUMERIC(3,2) NOT NULL DEFAULT 0,
    rating_count    INTEGER NOT NULL DEFAULT 0,
    cover_url       TEXT,
    cover_gradient  TEXT,
    is_published    BOOLEAN NOT NULL DEFAULT FALSE,
    is_cancelled    BOOLEAN NOT NULL DEFAULT FALSE,
    is_hidden       BOOLEAN NOT NULL DEFAULT FALSE,
    hidden_reason   TEXT,
    hidden_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    hidden_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT events_capacity_nonnegative CHECK (capacity IS NULL OR capacity >= 0),
    CONSTRAINT events_attendee_nonnegative CHECK (attendee_count >= 0),
    CONSTRAINT events_ends_after_starts CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS idx_events_feed
    ON public.events(is_published, is_cancelled, is_hidden, starts_at);

CREATE INDEX IF NOT EXISTS idx_events_creator
    ON public.events(creator_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_venue_starts_at
    ON public.events(venue_id, starts_at);

CREATE INDEX IF NOT EXISTS idx_events_starts_at
    ON public.events(starts_at);

CREATE INDEX IF NOT EXISTS idx_events_event_tags
    ON public.events USING GIN(event_tags);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events_public_select" ON public.events;
CREATE POLICY "events_public_select" ON public.events
    FOR SELECT USING (
        (
            is_published = TRUE
            AND is_cancelled = FALSE
            AND COALESCE(is_hidden, FALSE) = FALSE
        )
        OR creator_id = auth.uid()
    );

DROP POLICY IF EXISTS "events_owner_insert" ON public.events;
CREATE POLICY "events_owner_insert" ON public.events
    FOR INSERT WITH CHECK (creator_id = auth.uid());

DROP POLICY IF EXISTS "events_owner_update" ON public.events;
CREATE POLICY "events_owner_update" ON public.events
    FOR UPDATE USING (creator_id = auth.uid())
    WITH CHECK (creator_id = auth.uid());

DROP TRIGGER IF EXISTS trg_events_updated_at ON public.events;
CREATE TRIGGER trg_events_updated_at
    BEFORE UPDATE ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
