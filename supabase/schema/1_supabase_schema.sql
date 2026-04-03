-- ============================================================
--  mitmi - Supabase Base Schema
--  Verzija: 1.0
--  Pokreni prvo: ovaj fajl
--  Zatim: 3_supabase_final.sql -> 4_supabase_organizers.sql -> 5_supabase_moderation.sql
--  Idempotentno: moze da se pokrene vise puta bez gresaka
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
--  0. ENUM TIPOVI
-- ============================================================

DO $$ BEGIN
    CREATE TYPE public.user_role AS ENUM ('user','venue','admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================
--  1. HELPER FUNKCIJE
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
--  2. PROFILES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username        TEXT NOT NULL UNIQUE,
    display_name    TEXT,
    city            TEXT,
    bio             TEXT,
    avatar_url      TEXT,
    role            public.user_role NOT NULL DEFAULT 'user',
    status          TEXT NOT NULL DEFAULT 'active',
    avg_rating      NUMERIC(3,2) NOT NULL DEFAULT 0,
    rating_count    INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT profiles_status_check CHECK (status IN ('active','blocked','deleted')),
    CONSTRAINT profiles_username_min_length CHECK (char_length(username) >= 3)
);

CREATE INDEX IF NOT EXISTS idx_profiles_role_status
    ON public.profiles(role, status);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "profiles_auth_select" ON public.profiles
        FOR SELECT USING (
            (auth.uid() IS NOT NULL AND status = 'active')
            OR id = auth.uid()
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "profiles_self_update" ON public.profiles
        FOR UPDATE USING (id = auth.uid())
        WITH CHECK (id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
--  3. VENUES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.venues (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id      UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    venue_name      TEXT NOT NULL,
    venue_type      TEXT,
    city            TEXT,
    description     TEXT,
    cover_url       TEXT,
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

DO $$ BEGIN
    CREATE POLICY "venues_owner_select_or_verified" ON public.venues
        FOR SELECT USING (status = 'verified' OR profile_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "venues_owner_insert" ON public.venues
        FOR INSERT WITH CHECK (profile_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "venues_owner_update" ON public.venues
        FOR UPDATE USING (profile_id = auth.uid())
        WITH CHECK (profile_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS trg_venues_updated_at ON public.venues;
CREATE TRIGGER trg_venues_updated_at
    BEFORE UPDATE ON public.venues
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
--  4. EVENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    venue_id        UUID REFERENCES public.venues(id) ON DELETE SET NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    category        TEXT,
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
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT events_capacity_nonnegative CHECK (capacity IS NULL OR capacity >= 0),
    CONSTRAINT events_attendee_nonnegative CHECK (attendee_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_events_feed
    ON public.events(is_published, is_cancelled, starts_at);

CREATE INDEX IF NOT EXISTS idx_events_creator
    ON public.events(creator_id, created_at DESC);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "events_public_select" ON public.events
        FOR SELECT USING (
            (is_published = TRUE AND is_cancelled = FALSE)
            OR creator_id = auth.uid()
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "events_owner_insert" ON public.events
        FOR INSERT WITH CHECK (creator_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "events_owner_update" ON public.events
        FOR UPDATE USING (creator_id = auth.uid())
        WITH CHECK (creator_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS trg_events_updated_at ON public.events;
CREATE TRIGGER trg_events_updated_at
    BEFORE UPDATE ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
--  5. INVITES + APPLICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.plans (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_id        UUID REFERENCES public.events(id) ON DELETE SET NULL,
    organizer_id    UUID REFERENCES public.organizers(id) ON DELETE SET NULL,
    venue_id        UUID REFERENCES public.venues(id) ON DELETE SET NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    category        TEXT,
    city            TEXT,
    location_name   TEXT,
    starts_at       TIMESTAMPTZ,
    spots_total     INTEGER NOT NULL DEFAULT 1,
    source_url      TEXT,
    status          TEXT NOT NULL DEFAULT 'open',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT plans_status_check CHECK (status IN ('open','closed','cancelled')),
    CONSTRAINT plans_spots_positive CHECK (spots_total > 0),
    CONSTRAINT plans_title_not_blank CHECK (BTRIM(title) <> '')
);

CREATE INDEX IF NOT EXISTS idx_plans_creator_status
    ON public.plans(creator_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plans_event_status
    ON public.plans(event_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plans_organizer_status
    ON public.plans(organizer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plans_starts_at
    ON public.plans(starts_at DESC);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "plans_public_select" ON public.plans
        FOR SELECT USING (
            status IN ('open','closed')
            OR creator_id = auth.uid()
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "plans_owner_insert" ON public.plans
        FOR INSERT WITH CHECK (creator_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "plans_owner_update" ON public.plans
        FOR UPDATE USING (creator_id = auth.uid())
        WITH CHECK (creator_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS trg_plans_updated_at ON public.plans;
CREATE TRIGGER trg_plans_updated_at
    BEFORE UPDATE ON public.plans
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.invites (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id        UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    creator_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT,
    spots_total     INTEGER NOT NULL DEFAULT 1,
    status          TEXT NOT NULL DEFAULT 'open',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT invites_status_check CHECK (status IN ('open','closed','cancelled')),
    CONSTRAINT invites_spots_positive CHECK (spots_total > 0)
);

CREATE INDEX IF NOT EXISTS idx_invites_event_status
    ON public.invites(event_id, status, created_at DESC);

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.invite_applications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invite_id       UUID NOT NULL REFERENCES public.invites(id) ON DELETE CASCADE,
    applicant_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    message         TEXT,
    approved        BOOLEAN,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT invite_applications_unique UNIQUE (invite_id, applicant_id)
);

CREATE INDEX IF NOT EXISTS idx_invite_applications_invite
    ON public.invite_applications(invite_id, created_at DESC);

ALTER TABLE public.invite_applications ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_invites_updated_at ON public.invites;
CREATE TRIGGER trg_invites_updated_at
    BEFORE UPDATE ON public.invites
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_invite_applications_updated_at ON public.invite_applications;
CREATE TRIGGER trg_invite_applications_updated_at
    BEFORE UPDATE ON public.invite_applications
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
--  6. CHATS + MESSAGES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.chats (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id        UUID REFERENCES public.events(id) ON DELETE CASCADE,
    created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    chat_type       TEXT NOT NULL DEFAULT 'direct',
    title           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chats_type_check CHECK (chat_type IN ('direct','event_group','invite_group'))
);

ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.chat_participants (
    chat_id         UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_read_at    TIMESTAMPTZ,
    hidden_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (chat_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_participants_user
    ON public.chat_participants(user_id, chat_id);

ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id         UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
    sender_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_chat_created
    ON public.messages(chat_id, created_at DESC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "messages_select_participants" ON public.messages
        FOR SELECT USING (
            EXISTS (
                SELECT 1
                FROM public.chat_participants cp
                WHERE cp.chat_id = messages.chat_id
                  AND cp.user_id = auth.uid()
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "messages_insert_sender" ON public.messages
        FOR INSERT WITH CHECK (
            sender_id = auth.uid()
            AND EXISTS (
                SELECT 1
                FROM public.chat_participants cp
                WHERE cp.chat_id = messages.chat_id
                  AND cp.user_id = auth.uid()
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS trg_chats_updated_at ON public.chats;
CREATE TRIGGER trg_chats_updated_at
    BEFORE UPDATE ON public.chats
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_chat_participants_updated_at ON public.chat_participants;
CREATE TRIGGER trg_chat_participants_updated_at
    BEFORE UPDATE ON public.chat_participants
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_messages_updated_at ON public.messages;
CREATE TRIGGER trg_messages_updated_at
    BEFORE UPDATE ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
--  7. EVENT PAIR PLANS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.event_pair_plans (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id            UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    invite_id           UUID REFERENCES public.invites(id) ON DELETE SET NULL,
    source_plan_id      UUID REFERENCES public.plans(id) ON DELETE SET NULL,
    chat_id             UUID REFERENCES public.chats(id) ON DELETE SET NULL,
    user_a_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    user_b_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status              TEXT NOT NULL DEFAULT 'talking',
    proposed_by_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    confirmed_by_a_at   TIMESTAMPTZ,
    confirmed_by_b_at   TIMESTAMPTZ,
    confirmed_at        TIMESTAMPTZ,
    cancelled_by_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    cancelled_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT event_pair_plans_users_distinct CHECK (user_a_id <> user_b_id),
    CONSTRAINT event_pair_plans_status_check CHECK (status IN ('talking','maybe','confirmed','cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_event_pair_plans_event_status
    ON public.event_pair_plans(event_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_pair_plans_user_a
    ON public.event_pair_plans(user_a_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_pair_plans_user_b
    ON public.event_pair_plans(user_b_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_pair_plans_chat
    ON public.event_pair_plans(chat_id)
    WHERE chat_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_pair_plans_source_plan
    ON public.event_pair_plans(source_plan_id)
    WHERE source_plan_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_pair_plans_source_pair_unique
    ON public.event_pair_plans(source_plan_id, user_a_id, user_b_id)
    WHERE source_plan_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_pair_plans_event_pair_fallback_unique
    ON public.event_pair_plans(event_id, user_a_id, user_b_id)
    WHERE source_plan_id IS NULL;

ALTER TABLE public.event_pair_plans ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "event_pair_plans_select_participants" ON public.event_pair_plans
        FOR SELECT USING (
            auth.uid() IS NOT NULL
            AND (
                user_a_id = auth.uid()
                OR user_b_id = auth.uid()
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "event_pair_plans_insert_participants" ON public.event_pair_plans
        FOR INSERT WITH CHECK (
            auth.uid() IS NOT NULL
            AND (
                user_a_id = auth.uid()
                OR user_b_id = auth.uid()
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "event_pair_plans_update_participants" ON public.event_pair_plans
        FOR UPDATE USING (
            auth.uid() IS NOT NULL
            AND (
                user_a_id = auth.uid()
                OR user_b_id = auth.uid()
            )
        )
        WITH CHECK (
            auth.uid() IS NOT NULL
            AND (
                user_a_id = auth.uid()
                OR user_b_id = auth.uid()
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS trg_event_pair_plans_updated_at ON public.event_pair_plans;
CREATE TRIGGER trg_event_pair_plans_updated_at
    BEFORE UPDATE ON public.event_pair_plans
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
--  8. REVIEW TASKS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.review_tasks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id         UUID NOT NULL REFERENCES public.event_pair_plans(id) ON DELETE CASCADE,
    reviewer_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_id        UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    target_type     TEXT NOT NULL,
    target_user_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    available_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT review_tasks_target_type_check CHECK (target_type IN ('peer','event')),
    CONSTRAINT review_tasks_status_check CHECK (status IN ('pending','done','skipped')),
    CONSTRAINT review_tasks_unique UNIQUE (plan_id, reviewer_id, target_type)
);

CREATE INDEX IF NOT EXISTS idx_review_tasks_reviewer_status
    ON public.review_tasks(reviewer_id, status, available_at DESC);

CREATE INDEX IF NOT EXISTS idx_review_tasks_plan
    ON public.review_tasks(plan_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_review_tasks_event
    ON public.review_tasks(event_id, created_at DESC);

ALTER TABLE public.review_tasks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "review_tasks_select_owner" ON public.review_tasks
        FOR SELECT USING (
            auth.uid() IS NOT NULL
            AND reviewer_id = auth.uid()
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "review_tasks_insert_owner" ON public.review_tasks
        FOR INSERT WITH CHECK (
            auth.uid() IS NOT NULL
            AND reviewer_id = auth.uid()
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "review_tasks_update_owner" ON public.review_tasks
        FOR UPDATE USING (
            auth.uid() IS NOT NULL
            AND reviewer_id = auth.uid()
        )
        WITH CHECK (
            auth.uid() IS NOT NULL
            AND reviewer_id = auth.uid()
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS trg_review_tasks_updated_at ON public.review_tasks;
CREATE TRIGGER trg_review_tasks_updated_at
    BEFORE UPDATE ON public.review_tasks
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
--  9. REVIEWS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.peer_reviews (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id             UUID NOT NULL REFERENCES public.event_pair_plans(id) ON DELETE CASCADE,
    reviewer_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reviewed_user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_id            UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    did_show_up         BOOLEAN,
    communication_rating SMALLINT NOT NULL CHECK (communication_rating BETWEEN 1 AND 5),
    would_go_again      BOOLEAN,
    comment             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (plan_id, reviewer_id),
    CONSTRAINT peer_reviews_no_self CHECK (reviewer_id <> reviewed_user_id)
);

CREATE INDEX IF NOT EXISTS idx_peer_reviews_reviewed_user
    ON public.peer_reviews(reviewed_user_id, created_at DESC);

ALTER TABLE public.peer_reviews ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "peer_reviews_select" ON public.peer_reviews
        FOR SELECT USING (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "peer_reviews_insert" ON public.peer_reviews
        FOR INSERT WITH CHECK (reviewer_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.event_reviews (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id             UUID NOT NULL REFERENCES public.event_pair_plans(id) ON DELETE CASCADE,
    reviewer_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_id            UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    venue_id            UUID REFERENCES public.venues(id) ON DELETE SET NULL,
    rating_overall      SMALLINT NOT NULL CHECK (rating_overall BETWEEN 1 AND 5),
    rating_atmosphere   SMALLINT CHECK (rating_atmosphere BETWEEN 1 AND 5),
    rating_organization SMALLINT CHECK (rating_organization BETWEEN 1 AND 5),
    comment             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (plan_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_event_reviews_event
    ON public.event_reviews(event_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_reviews_venue
    ON public.event_reviews(venue_id, created_at DESC);

ALTER TABLE public.event_reviews ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "event_reviews_select" ON public.event_reviews
        FOR SELECT USING (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "event_reviews_insert" ON public.event_reviews
        FOR INSERT WITH CHECK (reviewer_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================
--  10. SOCIAL + REPORTS + NOTIFICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.follows (
    follower_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    following_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (follower_id, following_id),
    CONSTRAINT follows_no_self CHECK (follower_id <> following_id)
);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.blocks (
    blocker_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    blocked_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (blocker_id, blocked_id),
    CONSTRAINT blocks_no_self CHECK (blocker_id <> blocked_id)
);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.reports (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reason          TEXT NOT NULL,
    resolved        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_reporter
    ON public.reports(reporter_id, created_at DESC);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.notifications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type            TEXT NOT NULL,
    title           TEXT NOT NULL,
    body            TEXT,
    read            BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "notif_own" ON public.notifications
        FOR ALL USING (user_id = auth.uid())
        WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================
--  8. STORAGE BUCKETI
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
SELECT 'avatars', 'avatars', TRUE
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'avatars');

INSERT INTO storage.buckets (id, name, public)
SELECT 'venue-covers', 'venue-covers', TRUE
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'venue-covers');

INSERT INTO storage.buckets (id, name, public)
SELECT 'event-photos', 'event-photos', TRUE
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'event-photos');
