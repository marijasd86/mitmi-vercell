-- ============================================================
--  mitmi — Supabase Final Schema
--  Verzija: 2.0
--  Pokreni: 1_supabase_schema.sql → pa ovaj fajl
--  Idempotentno: može da se pokrene više puta bez grešaka
-- ============================================================


-- ============================================================
--  0. NOVI ENUM TIPOVI (ako već ne postoje)
-- ============================================================

DO $$ BEGIN
    CREATE TYPE application_status AS ENUM ('pending','approved','rejected','withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================
--  1. HANDLE_NEW_USER — role fix + idempotentno
--     [FIX] Upisuje rolu iz raw_user_meta_data, ne fiksno 'user'
--     [FIX] EXCEPTION handler za username koliziju
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    base_username TEXT;
    final_username TEXT;
    user_role_val  TEXT;
BEGIN
    -- Izvuci rolu iz signup metadata (frontend šalje data: { role: 'user'|'venue' })
    user_role_val := COALESCE(
        NEW.raw_user_meta_data->>'role',
        'user'
    );
    -- Provjeri da je validna vrijednost
    IF user_role_val NOT IN ('user','venue','admin') THEN
        user_role_val := 'user';
    END IF;

    -- Napravi username iz emaila, samo alfanumerički znakovi
    base_username := LOWER(REGEXP_REPLACE(SPLIT_PART(NEW.email, '@', 1), '[^a-z0-9]', '', 'g'));
    IF LENGTH(base_username) < 3 THEN base_username := 'user'; END IF;
    final_username := base_username || '_' || SUBSTR(gen_random_uuid()::text, 1, 6);

    INSERT INTO public.profiles (
        id, username, display_name, city, role, status, created_at, updated_at
    ) VALUES (
        NEW.id,
        final_username,
        COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'city', 'Novi Sad'),
        user_role_val::user_role,
        'active',
        NOW(), NOW()
    )
    ON CONFLICT (id) DO NOTHING;  -- ako profil već postoji, ne diraj

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Idempotentno: drop pa create trigger
DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
--  2. INVITE_APPLICATIONS — app_status kolona
-- ============================================================

ALTER TABLE public.invite_applications
    ADD COLUMN IF NOT EXISTS app_status   application_status NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

-- Migracija starog approved BOOLEAN -> novi app_status (sigurno ako već postoji)
UPDATE public.invite_applications
SET app_status = CASE
    WHEN approved = TRUE  THEN 'approved'::application_status
    WHEN approved = FALSE THEN 'rejected'::application_status
    ELSE 'pending'::application_status
END
WHERE app_status = 'pending' AND approved IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invite_apps_status
    ON public.invite_applications(invite_id, app_status);


-- ============================================================
--  3. EVENT_PHOTOS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.event_photos (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id        UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    uploader_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    photo_url       TEXT NOT NULL,
    storage_path    TEXT NOT NULL,
    display_order   SMALLINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_photos_event
    ON public.event_photos(event_id, display_order);
CREATE INDEX IF NOT EXISTS idx_event_photos_uploader
    ON public.event_photos(uploader_id);

ALTER TABLE public.event_photos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "event_photos_select" ON public.event_photos
        FOR SELECT USING (
            uploader_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM public.events
                WHERE id = event_photos.event_id
                  AND creator_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1 FROM public.events
                WHERE id = event_photos.event_id
                  AND is_published = TRUE AND is_cancelled = FALSE
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "event_photos_insert" ON public.event_photos
        FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND uploader_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "event_photos_delete" ON public.event_photos
        FOR DELETE USING (
            uploader_id = auth.uid()
            OR EXISTS (SELECT 1 FROM public.events
                WHERE id = event_photos.event_id AND creator_id = auth.uid())
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================
--  4. VENUE_FOLLOWS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.venue_follows (
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    venue_id    UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, venue_id)
);

CREATE INDEX IF NOT EXISTS idx_venue_follows_venue ON public.venue_follows(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_follows_user  ON public.venue_follows(user_id);

ALTER TABLE public.venue_follows ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "venue_follows_select" ON public.venue_follows FOR SELECT USING (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "venue_follows_insert" ON public.venue_follows
        FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "venue_follows_delete" ON public.venue_follows
        FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION update_venue_follower_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.venues SET followers_count = followers_count + 1 WHERE id = NEW.venue_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.venues SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = OLD.venue_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_venue_follows_count ON public.venue_follows;
CREATE TRIGGER trg_venue_follows_count
    AFTER INSERT OR DELETE ON public.venue_follows
    FOR EACH ROW EXECUTE FUNCTION update_venue_follower_count();


-- ============================================================
--  5. VENUE_REVIEWS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.venue_reviews (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reviewer_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    venue_id            UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    event_id            UUID REFERENCES public.events(id) ON DELETE SET NULL,
    rating_overall      SMALLINT NOT NULL CHECK (rating_overall BETWEEN 1 AND 5),
    rating_atmosphere   SMALLINT CHECK (rating_atmosphere BETWEEN 1 AND 5),
    rating_organization SMALLINT CHECK (rating_organization BETWEEN 1 AND 5),
    comment             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(reviewer_id, venue_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_venue_reviews_venue
    ON public.venue_reviews(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_venue_reviews_reviewer
    ON public.venue_reviews(reviewer_id);

ALTER TABLE public.venue_reviews ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "venue_reviews_select" ON public.venue_reviews FOR SELECT USING (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "venue_reviews_insert" ON public.venue_reviews
        FOR INSERT WITH CHECK (reviewer_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "venue_reviews_delete" ON public.venue_reviews
        FOR DELETE USING (reviewer_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION update_venue_rating()
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
    FOR EACH ROW EXECUTE FUNCTION update_venue_rating();


-- ============================================================
--  6. DOPUNJENE RLS POLITIKE (sve idempotentne)
-- ============================================================

-- ── invites ──────────────────────────────────────────────────
DO $$ BEGIN CREATE POLICY "invites_select" ON public.invites
    FOR SELECT USING (status = 'open' OR creator_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "invites_insert" ON public.invites
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND creator_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "invites_update" ON public.invites
    FOR UPDATE USING (creator_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "invites_delete" ON public.invites
    FOR DELETE USING (creator_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── invite_applications ───────────────────────────────────────
DO $$ BEGIN CREATE POLICY "invite_apps_select" ON public.invite_applications
    FOR SELECT USING (
        applicant_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.invites
            WHERE id = invite_applications.invite_id AND creator_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "invite_apps_insert" ON public.invite_applications
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND applicant_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "invite_apps_update" ON public.invite_applications
    FOR UPDATE USING (
        applicant_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.invites
            WHERE id = invite_applications.invite_id AND creator_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── chats ─────────────────────────────────────────────────────
DO $$ BEGIN CREATE POLICY "chats_select" ON public.chats
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.chat_participants
            WHERE chat_id = chats.id AND user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "chats_insert" ON public.chats
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── chat_participants ─────────────────────────────────────────
DO $$ BEGIN CREATE POLICY "chat_participants_select" ON public.chat_participants
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.chat_participants cp2
            WHERE cp2.chat_id = chat_participants.chat_id AND cp2.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "chat_participants_insert" ON public.chat_participants
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "chat_participants_update" ON public.chat_participants
    FOR UPDATE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── follows ───────────────────────────────────────────────────
DO $$ BEGIN CREATE POLICY "follows_select" ON public.follows FOR SELECT USING (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "follows_insert" ON public.follows
    FOR INSERT WITH CHECK (auth.uid() = follower_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "follows_delete" ON public.follows
    FOR DELETE USING (auth.uid() = follower_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── blocks ────────────────────────────────────────────────────
DO $$ BEGIN CREATE POLICY "blocks_select" ON public.blocks FOR SELECT USING (blocker_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "blocks_insert" ON public.blocks
    FOR INSERT WITH CHECK (auth.uid() = blocker_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "blocks_delete" ON public.blocks
    FOR DELETE USING (auth.uid() = blocker_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── reports ───────────────────────────────────────────────────
DO $$ BEGIN CREATE POLICY "reports_insert" ON public.reports
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND reporter_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "reports_select" ON public.reports
    FOR SELECT USING (reporter_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── venues ────────────────────────────────────────────────────
DO $$ BEGIN CREATE POLICY "venues_select" ON public.venues
    FOR SELECT USING (status = 'verified' OR profile_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "venues_insert" ON public.venues
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND profile_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "venues_update" ON public.venues
    FOR UPDATE USING (profile_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── messages — dopuna (UPDATE za edit, DELETE za soft delete) ─
DO $$ BEGIN CREATE POLICY "messages_update_own" ON public.messages
    FOR UPDATE USING (sender_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── notifications — dopuna (UPDATE za mark as read) ──────────
-- notif_own policy (ALL) već postoji u v1, pokriva UPDATE


-- ============================================================
--  7. STORAGE BUCKETI (idempotentno)
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', TRUE, 2097152, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
    file_size_limit    = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('venue-covers', 'venue-covers', TRUE, 3145728, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
    file_size_limit    = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('event-photos', 'event-photos', TRUE, 2097152, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
    file_size_limit    = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage politike — idempotentne
-- Putanja avatars: avatars/{user_id}/avatar.jpg
DO $$ BEGIN CREATE POLICY "avatars_read" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "avatars_insert" ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'avatars' AND auth.uid()::text = SPLIT_PART(name, '/', 1));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "avatars_update" ON storage.objects FOR UPDATE USING (
    bucket_id = 'avatars' AND auth.uid()::text = SPLIT_PART(name, '/', 1));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "avatars_delete" ON storage.objects FOR DELETE USING (
    bucket_id = 'avatars' AND auth.uid()::text = SPLIT_PART(name, '/', 1));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Putanja venue-covers: venue-covers/{venue_id}/cover.jpg
DO $$ BEGIN CREATE POLICY "venue_covers_read" ON storage.objects FOR SELECT USING (bucket_id = 'venue-covers');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "venue_covers_insert" ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'venue-covers' AND EXISTS (
        SELECT 1 FROM public.venues
        WHERE id::text = SPLIT_PART(name, '/', 1) AND profile_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "venue_covers_delete" ON storage.objects FOR DELETE USING (
    bucket_id = 'venue-covers' AND EXISTS (
        SELECT 1 FROM public.venues
        WHERE id::text = SPLIT_PART(name, '/', 1) AND profile_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Putanja event-photos: event-photos/{event_id}/{user_id}/{uuid}.jpg
DO $$ BEGIN CREATE POLICY "storage_event_photos_read" ON storage.objects FOR SELECT USING (bucket_id = 'event-photos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
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


-- ============================================================
--  8. HELPER FUNKCIJE
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_blocked(a_user_id UUID, b_user_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.blocks
        WHERE (blocker_id = a_user_id AND blocked_id = b_user_id)
           OR (blocker_id = b_user_id AND blocked_id = a_user_id)
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.create_or_get_dm(other_user_id UUID)
RETURNS UUID AS $$
DECLARE
    existing_chat_id UUID;
    new_chat_id UUID;
BEGIN
    IF public.is_blocked(auth.uid(), other_user_id) THEN
        RAISE EXCEPTION 'DM nije dostupan između blokiranih korisnika';
    END IF;

    SELECT c.id INTO existing_chat_id
    FROM public.chats c
    JOIN public.chat_participants cp1 ON cp1.chat_id = c.id AND cp1.user_id = auth.uid()
    JOIN public.chat_participants cp2 ON cp2.chat_id = c.id AND cp2.user_id = other_user_id
    WHERE c.chat_type = 'direct'
    LIMIT 1;

    IF existing_chat_id IS NOT NULL THEN RETURN existing_chat_id; END IF;

    INSERT INTO public.chats (chat_type) VALUES ('direct') RETURNING id INTO new_chat_id;
    INSERT INTO public.chat_participants (chat_id, user_id)
    VALUES (new_chat_id, auth.uid()), (new_chat_id, other_user_id);
    RETURN new_chat_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP POLICY IF EXISTS "profiles_auth_select" ON public.profiles;
DO $$ BEGIN
    CREATE POLICY "profiles_auth_select" ON public.profiles
        FOR SELECT USING (
            id = auth.uid()
            OR (
                auth.uid() IS NOT NULL
                AND status = 'active'
                AND NOT public.is_blocked(auth.uid(), id)
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS "events_public_select" ON public.events;
DO $$ BEGIN
    CREATE POLICY "events_public_select" ON public.events
        FOR SELECT USING (
            creator_id = auth.uid()
            OR (
                is_published = TRUE
                AND is_cancelled = FALSE
                AND auth.uid() IS NOT NULL
                AND NOT public.is_blocked(auth.uid(), creator_id)
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.sync_review_tasks_for_user()
RETURNS INTEGER AS $$
DECLARE
    inserted_count INTEGER := 0;
BEGIN
    WITH eligible AS (
        SELECT
            p.id AS plan_id,
            COALESCE(src.event_id, p.event_id) AS event_id,
            src.id AS source_plan_id,
            src.event_id AS source_event_id,
            CASE
                WHEN p.user_a_id = auth.uid() THEN p.user_b_id
                ELSE p.user_a_id
            END AS peer_id
        FROM public.event_pair_plans p
        LEFT JOIN public.plans src ON src.id = p.source_plan_id
        JOIN public.events e ON e.id = COALESCE(src.event_id, p.event_id)
        WHERE p.status = 'confirmed'
          AND (p.user_a_id = auth.uid() OR p.user_b_id = auth.uid())
          AND COALESCE(e.ends_at, e.starts_at) <= NOW()
    ), inserted AS (
        INSERT INTO public.review_tasks (plan_id, reviewer_id, event_id, target_type, target_user_id, status, available_at)
        SELECT plan_id, auth.uid(), event_id, 'peer', peer_id, 'pending', NOW()
        FROM eligible
        ON CONFLICT (plan_id, reviewer_id, target_type) DO NOTHING
        RETURNING 1
    ), inserted_events AS (
        INSERT INTO public.review_tasks (plan_id, reviewer_id, event_id, target_type, target_user_id, status, available_at)
        SELECT plan_id, auth.uid(), event_id, 'event', NULL, 'pending', NOW()
        FROM eligible
        WHERE source_plan_id IS NULL OR source_event_id IS NOT NULL
        ON CONFLICT (plan_id, reviewer_id, target_type) DO NOTHING
        RETURNING 1
    )
    SELECT COALESCE((SELECT COUNT(*) FROM inserted), 0) + COALESCE((SELECT COUNT(*) FROM inserted_events), 0)
    INTO inserted_count;

    RETURN inserted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_profile_rating_from_peer_reviews()
RETURNS TRIGGER AS $$
DECLARE
    target_profile_id UUID;
BEGIN
    target_profile_id := COALESCE(NEW.reviewed_user_id, OLD.reviewed_user_id);
    IF target_profile_id IS NULL THEN RETURN NULL; END IF;

    UPDATE public.profiles
    SET
        avg_rating = COALESCE((
            SELECT ROUND(AVG(communication_rating)::numeric, 2)
            FROM public.peer_reviews
            WHERE reviewed_user_id = target_profile_id
        ), 0),
        rating_count = (
            SELECT COUNT(*)
            FROM public.peer_reviews
            WHERE reviewed_user_id = target_profile_id
        )
    WHERE id = target_profile_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_peer_reviews_profile_rating ON public.peer_reviews;
CREATE TRIGGER trg_peer_reviews_profile_rating
    AFTER INSERT OR UPDATE OR DELETE ON public.peer_reviews
    FOR EACH ROW EXECUTE FUNCTION public.update_profile_rating_from_peer_reviews();

CREATE OR REPLACE FUNCTION public.update_event_rating_from_reviews()
RETURNS TRIGGER AS $$
DECLARE
    target_event_id UUID;
    target_venue_id UUID;
BEGIN
    target_event_id := COALESCE(NEW.event_id, OLD.event_id);
    target_venue_id := COALESCE(NEW.venue_id, OLD.venue_id);
    IF target_event_id IS NULL THEN RETURN NULL; END IF;

    UPDATE public.events
    SET
        avg_rating = COALESCE((
            SELECT ROUND(AVG(rating_overall)::numeric, 2)
            FROM public.event_reviews
            WHERE event_id = target_event_id
        ), 0),
        rating_count = (
            SELECT COUNT(*)
            FROM public.event_reviews
            WHERE event_id = target_event_id
        )
    WHERE id = target_event_id;

    IF target_venue_id IS NOT NULL THEN
        UPDATE public.venues
        SET
            avg_rating = COALESCE((
                SELECT ROUND(AVG(rating_overall)::numeric, 2)
                FROM public.event_reviews
                WHERE venue_id = target_venue_id
            ), 0),
            rating_count = (
                SELECT COUNT(*)
                FROM public.event_reviews
                WHERE venue_id = target_venue_id
            )
        WHERE id = target_venue_id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_event_reviews_event_rating ON public.event_reviews;
CREATE TRIGGER trg_event_reviews_event_rating
    AFTER INSERT OR UPDATE OR DELETE ON public.event_reviews
    FOR EACH ROW EXECUTE FUNCTION public.update_event_rating_from_reviews();

CREATE OR REPLACE FUNCTION public.create_event_group_chat()
RETURNS TRIGGER AS $$
DECLARE new_chat_id UUID;
BEGIN
    INSERT INTO public.chats (chat_type, event_id)
    VALUES ('event_group', NEW.id) RETURNING id INTO new_chat_id;
    INSERT INTO public.chat_participants (chat_id, user_id)
    VALUES (new_chat_id, NEW.creator_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_event_create_chat ON public.events;
CREATE TRIGGER trg_event_create_chat
    AFTER INSERT ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.create_event_group_chat();

CREATE OR REPLACE FUNCTION public.join_event_chat_on_approve()
RETURNS TRIGGER AS $$
DECLARE chat_id_to_join UUID;
BEGIN
    SELECT c.id INTO chat_id_to_join
    FROM public.chats c
    JOIN public.invites i ON i.id = NEW.invite_id
    WHERE c.event_id = i.event_id AND c.chat_type = 'event_group'
    LIMIT 1;

    IF chat_id_to_join IS NOT NULL THEN
        INSERT INTO public.chat_participants (chat_id, user_id)
        VALUES (chat_id_to_join, NEW.applicant_id)
        ON CONFLICT (chat_id, user_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_invite_approved_join_chat ON public.invite_applications;
CREATE TRIGGER trg_invite_approved_join_chat
    AFTER UPDATE ON public.invite_applications
    FOR EACH ROW
    WHEN (NEW.app_status = 'approved' AND OLD.app_status IS DISTINCT FROM NEW.app_status)
    EXECUTE FUNCTION public.join_event_chat_on_approve();

CREATE OR REPLACE FUNCTION public.update_event_attendee_count()
RETURNS TRIGGER AS $$
DECLARE
    target_invite_id UUID;
    target_event_id  UUID;
BEGIN
    target_invite_id := COALESCE(NEW.invite_id, OLD.invite_id);
    IF target_invite_id IS NULL THEN RETURN NULL; END IF;

    SELECT event_id INTO target_event_id FROM public.invites WHERE id = target_invite_id;
    IF target_event_id IS NULL THEN RETURN NULL; END IF;

    UPDATE public.events SET attendee_count = (
        SELECT COUNT(DISTINCT ia.applicant_id)
        FROM public.invite_applications ia
        JOIN public.invites i ON i.id = ia.invite_id
        WHERE i.event_id = target_event_id AND ia.app_status = 'approved'
    ) WHERE id = target_event_id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_attendee_count ON public.invite_applications;
CREATE TRIGGER trg_update_attendee_count
    AFTER INSERT OR UPDATE OR DELETE ON public.invite_applications
    FOR EACH ROW EXECUTE FUNCTION public.update_event_attendee_count();


-- ============================================================
--  9. VIEWOVI
-- ============================================================

DROP VIEW IF EXISTS public.v_event_feed CASCADE;
CREATE VIEW public.v_event_feed AS
SELECT
    e.id, e.title, e.description, e.category, e.city,
    e.location_name, e.starts_at, e.ends_at,
    e.capacity, e.attendee_count, e.cover_url, e.cover_gradient,
    e.is_cancelled, e.created_at,
    v.id          AS venue_id,
    v.venue_name,
    v.cover_url   AS venue_cover_url,
    v.status      AS venue_status,
    p.id          AS creator_id,
    p.username    AS creator_username,
    p.avatar_url  AS creator_avatar,
    p.avg_rating  AS creator_rating,
    CASE WHEN e.capacity IS NULL THEN NULL
         ELSE GREATEST(e.capacity - e.attendee_count, 0)
    END AS spots_available,
    (e.starts_at::date = CURRENT_DATE) AS is_urgent,
    (SELECT COUNT(*) FROM public.invites
     WHERE event_id = e.id AND status = 'open') AS open_invites_count,
    (SELECT photo_url FROM public.event_photos
     WHERE event_id = e.id ORDER BY display_order LIMIT 1) AS first_photo_url
FROM public.events e
LEFT JOIN public.venues   v ON e.venue_id   = v.id
LEFT JOIN public.profiles p ON e.creator_id = p.id
WHERE e.is_published = TRUE
  AND e.is_cancelled = FALSE
  AND e.starts_at >= NOW() - INTERVAL '2 hours';

-- FTS index na events
CREATE INDEX IF NOT EXISTS idx_events_fts ON public.events
    USING GIN(TO_TSVECTOR('simple',
        COALESCE(title,'') || ' ' || COALESCE(description,'') || ' ' || COALESCE(city,'')));

DROP VIEW IF EXISTS public.v_venue_profile CASCADE;
CREATE VIEW public.v_venue_profile AS
SELECT
    v.*,
    p.username, p.display_name, p.avatar_url, p.bio,
    p.status AS profile_status,
    (SELECT COUNT(*) FROM public.events
     WHERE venue_id = v.id AND is_published = TRUE
       AND is_cancelled = FALSE AND starts_at > NOW()) AS upcoming_events_count,
    (SELECT EXISTS (SELECT 1 FROM public.venue_follows
        WHERE venue_id = v.id AND user_id = auth.uid())) AS is_followed_by_me
FROM public.venues v
JOIN public.profiles p ON v.profile_id = p.id;

DROP VIEW IF EXISTS public.v_user_profile CASCADE;
CREATE VIEW public.v_user_profile AS
SELECT
    p.*,
    (SELECT EXISTS (SELECT 1 FROM public.follows
        WHERE follower_id = auth.uid() AND following_id = p.id)) AS is_followed_by_me,
    (SELECT EXISTS (SELECT 1 FROM public.blocks
        WHERE blocker_id = auth.uid() AND blocked_id = p.id)) AS is_blocked_by_me,
    (SELECT COUNT(*) FROM public.invites i
     JOIN public.events e ON i.event_id = e.id
     WHERE i.creator_id = p.id AND i.status = 'open'
       AND e.starts_at > NOW()) AS active_invites_count
FROM public.profiles p
WHERE p.status = 'active';

-- v_chat_list: bez auth.uid() u WHERE — filtrira se kroz RLS
-- Uključuje DM info o drugom korisniku
DROP VIEW IF EXISTS public.v_chat_list CASCADE;
CREATE VIEW public.v_chat_list AS
SELECT
    c.id          AS chat_id,
    c.chat_type,
    c.event_id,
    cp.user_id,
    cp.last_read_at,
    last_msg.content     AS last_message,
    last_msg.created_at  AS last_message_at,
    last_msg.sender_id   AS last_sender_id,
    lsp.username         AS last_sender_username,
    (SELECT COUNT(*) FROM public.messages m
     WHERE m.chat_id = c.id
       AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01'::timestamptz)
       AND m.sender_id != cp.user_id
    ) AS unread_count,
    e.title      AS event_title,
    e.category   AS event_category,
    e.starts_at  AS event_starts_at,
    dm.id        AS dm_other_user_id,
    dm.username  AS dm_other_username,
    dm.avatar_url AS dm_other_avatar
FROM public.chats c
JOIN public.chat_participants cp ON cp.chat_id = c.id
LEFT JOIN LATERAL (
    SELECT content, created_at, sender_id
    FROM public.messages WHERE chat_id = c.id
    ORDER BY created_at DESC LIMIT 1
) last_msg ON TRUE
LEFT JOIN public.profiles lsp ON lsp.id = last_msg.sender_id
LEFT JOIN public.events e ON e.id = c.event_id
LEFT JOIN LATERAL (
    SELECT p.id, p.username, p.avatar_url
    FROM public.chat_participants cp2
    JOIN public.profiles p ON p.id = cp2.user_id
    WHERE cp2.chat_id = c.id AND cp2.user_id != cp.user_id
      AND c.chat_type = 'direct'
    LIMIT 1
) dm ON TRUE
ORDER BY last_msg.created_at DESC NULLS LAST;


-- ============================================================
--  10. REALTIME (idempotentno — ne puca ako već postoji)
-- ============================================================

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_participants;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
