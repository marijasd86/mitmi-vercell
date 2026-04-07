-- ============================================================
-- MITMI v1 baseline
-- 03. Social + Chats + Plans + Reviews
-- ============================================================

DO $$ BEGIN
    CREATE TYPE public.application_status AS ENUM ('pending','approved','rejected','withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plans_public_select" ON public.plans;
CREATE POLICY "plans_public_select" ON public.plans
    FOR SELECT USING (
        status IN ('open','closed')
        OR creator_id = auth.uid()
    );

DROP POLICY IF EXISTS "plans_owner_insert" ON public.plans;
CREATE POLICY "plans_owner_insert" ON public.plans
    FOR INSERT WITH CHECK (creator_id = auth.uid());

DROP POLICY IF EXISTS "plans_owner_update" ON public.plans;
CREATE POLICY "plans_owner_update" ON public.plans
    FOR UPDATE USING (creator_id = auth.uid())
    WITH CHECK (creator_id = auth.uid());

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

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invites_select" ON public.invites;
CREATE POLICY "invites_select" ON public.invites
    FOR SELECT USING (status = 'open' OR creator_id = auth.uid());

DROP POLICY IF EXISTS "invites_insert" ON public.invites;
CREATE POLICY "invites_insert" ON public.invites
    FOR INSERT WITH CHECK (creator_id = auth.uid());

DROP POLICY IF EXISTS "invites_update" ON public.invites;
CREATE POLICY "invites_update" ON public.invites
    FOR UPDATE USING (creator_id = auth.uid())
    WITH CHECK (creator_id = auth.uid());

DROP POLICY IF EXISTS "invites_delete" ON public.invites;
CREATE POLICY "invites_delete" ON public.invites
    FOR DELETE USING (creator_id = auth.uid());

DROP TRIGGER IF EXISTS trg_invites_updated_at ON public.invites;
CREATE TRIGGER trg_invites_updated_at
    BEFORE UPDATE ON public.invites
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.invite_applications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invite_id       UUID NOT NULL REFERENCES public.invites(id) ON DELETE CASCADE,
    applicant_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    message         TEXT,
    app_status      public.application_status NOT NULL DEFAULT 'pending',
    responded_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT invite_applications_unique UNIQUE (invite_id, applicant_id)
);

ALTER TABLE public.invite_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invite_apps_select" ON public.invite_applications;
CREATE POLICY "invite_apps_select" ON public.invite_applications
    FOR SELECT USING (
        applicant_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.invites
            WHERE id = invite_applications.invite_id
              AND creator_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "invite_apps_insert" ON public.invite_applications;
CREATE POLICY "invite_apps_insert" ON public.invite_applications
    FOR INSERT WITH CHECK (applicant_id = auth.uid());

DROP POLICY IF EXISTS "invite_apps_update" ON public.invite_applications;
CREATE POLICY "invite_apps_update" ON public.invite_applications
    FOR UPDATE USING (
        applicant_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.invites
            WHERE id = invite_applications.invite_id
              AND creator_id = auth.uid()
        )
    );

DROP TRIGGER IF EXISTS trg_invite_applications_updated_at ON public.invite_applications;
CREATE TRIGGER trg_invite_applications_updated_at
    BEFORE UPDATE ON public.invite_applications
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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

DROP TRIGGER IF EXISTS trg_chats_updated_at ON public.chats;
CREATE TRIGGER trg_chats_updated_at
    BEFORE UPDATE ON public.chats
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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

ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chats_select" ON public.chats;
CREATE POLICY "chats_select" ON public.chats
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.chat_participants
            WHERE chat_id = chats.id
              AND user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "chats_insert" ON public.chats;
CREATE POLICY "chats_insert" ON public.chats
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL
        AND created_by = auth.uid()
    );

DROP POLICY IF EXISTS "chat_participants_select" ON public.chat_participants;
CREATE POLICY "chat_participants_select" ON public.chat_participants
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.chat_participants cp2
            WHERE cp2.chat_id = chat_participants.chat_id
              AND cp2.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "chat_participants_insert" ON public.chat_participants;
CREATE POLICY "chat_participants_insert" ON public.chat_participants
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL
        AND (
            user_id = auth.uid()
            OR EXISTS (
                SELECT 1
                FROM public.chats c
                WHERE c.id = chat_id
                  AND c.created_by = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "chat_participants_update" ON public.chat_participants;
CREATE POLICY "chat_participants_update" ON public.chat_participants
    FOR UPDATE USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_chat_participants_updated_at ON public.chat_participants;
CREATE TRIGGER trg_chat_participants_updated_at
    BEFORE UPDATE ON public.chat_participants
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id         UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
    sender_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select_participants" ON public.messages;
CREATE POLICY "messages_select_participants" ON public.messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.chat_participants cp
            WHERE cp.chat_id = messages.chat_id
              AND cp.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "messages_insert_sender" ON public.messages;
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

DROP POLICY IF EXISTS "messages_update_own" ON public.messages;
CREATE POLICY "messages_update_own" ON public.messages
    FOR UPDATE USING (sender_id = auth.uid())
    WITH CHECK (sender_id = auth.uid());

DROP TRIGGER IF EXISTS trg_messages_updated_at ON public.messages;
CREATE TRIGGER trg_messages_updated_at
    BEFORE UPDATE ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_pair_plans_source_pair_unique
    ON public.event_pair_plans(source_plan_id, user_a_id, user_b_id)
    WHERE source_plan_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_pair_plans_event_pair_fallback_unique
    ON public.event_pair_plans(event_id, user_a_id, user_b_id)
    WHERE source_plan_id IS NULL;

ALTER TABLE public.event_pair_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_pair_plans_select_participants" ON public.event_pair_plans;
CREATE POLICY "event_pair_plans_select_participants" ON public.event_pair_plans
    FOR SELECT USING (
        auth.uid() IS NOT NULL
        AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
    );

DROP POLICY IF EXISTS "event_pair_plans_insert_participants" ON public.event_pair_plans;
CREATE POLICY "event_pair_plans_insert_participants" ON public.event_pair_plans
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL
        AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
    );

DROP POLICY IF EXISTS "event_pair_plans_update_participants" ON public.event_pair_plans;
CREATE POLICY "event_pair_plans_update_participants" ON public.event_pair_plans
    FOR UPDATE USING (
        auth.uid() IS NOT NULL
        AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
    )
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
    );

DROP TRIGGER IF EXISTS trg_event_pair_plans_updated_at ON public.event_pair_plans;
CREATE TRIGGER trg_event_pair_plans_updated_at
    BEFORE UPDATE ON public.event_pair_plans
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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

ALTER TABLE public.review_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "review_tasks_select_owner" ON public.review_tasks;
CREATE POLICY "review_tasks_select_owner" ON public.review_tasks
    FOR SELECT USING (reviewer_id = auth.uid());

DROP POLICY IF EXISTS "review_tasks_insert_owner" ON public.review_tasks;
CREATE POLICY "review_tasks_insert_owner" ON public.review_tasks
    FOR INSERT WITH CHECK (reviewer_id = auth.uid());

DROP POLICY IF EXISTS "review_tasks_update_owner" ON public.review_tasks;
CREATE POLICY "review_tasks_update_owner" ON public.review_tasks
    FOR UPDATE USING (reviewer_id = auth.uid())
    WITH CHECK (reviewer_id = auth.uid());

DROP TRIGGER IF EXISTS trg_review_tasks_updated_at ON public.review_tasks;
CREATE TRIGGER trg_review_tasks_updated_at
    BEFORE UPDATE ON public.review_tasks
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.peer_reviews (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id              UUID NOT NULL REFERENCES public.event_pair_plans(id) ON DELETE CASCADE,
    reviewer_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reviewed_user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_id             UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    did_show_up          BOOLEAN,
    communication_rating SMALLINT NOT NULL CHECK (communication_rating BETWEEN 1 AND 5),
    would_go_again       BOOLEAN,
    comment              TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (plan_id, reviewer_id),
    CONSTRAINT peer_reviews_no_self CHECK (reviewer_id <> reviewed_user_id)
);

ALTER TABLE public.peer_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "peer_reviews_select" ON public.peer_reviews;
CREATE POLICY "peer_reviews_select" ON public.peer_reviews
    FOR SELECT USING (
        reviewer_id = auth.uid()
        OR reviewed_user_id = auth.uid()
        OR public.is_admin(auth.uid())
    );

DROP POLICY IF EXISTS "peer_reviews_insert" ON public.peer_reviews;
CREATE POLICY "peer_reviews_insert" ON public.peer_reviews
    FOR INSERT WITH CHECK (reviewer_id = auth.uid());

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

ALTER TABLE public.event_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_reviews_select" ON public.event_reviews;
CREATE POLICY "event_reviews_select" ON public.event_reviews
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.events e
            WHERE e.id = event_reviews.event_id
              AND e.is_published = TRUE
              AND e.is_cancelled = FALSE
              AND COALESCE(e.is_hidden, FALSE) = FALSE
        )
        OR reviewer_id = auth.uid()
        OR public.is_admin(auth.uid())
    );

DROP POLICY IF EXISTS "event_reviews_insert" ON public.event_reviews;
CREATE POLICY "event_reviews_insert" ON public.event_reviews
    FOR INSERT WITH CHECK (reviewer_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.follows (
    follower_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    following_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (follower_id, following_id),
    CONSTRAINT follows_no_self CHECK (follower_id <> following_id)
);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "follows_select" ON public.follows;
CREATE POLICY "follows_select" ON public.follows
    FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "follows_insert" ON public.follows;
CREATE POLICY "follows_insert" ON public.follows
    FOR INSERT WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "follows_delete" ON public.follows;
CREATE POLICY "follows_delete" ON public.follows
    FOR DELETE USING (auth.uid() = follower_id);

CREATE TABLE IF NOT EXISTS public.blocks (
    blocker_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    blocked_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (blocker_id, blocked_id),
    CONSTRAINT blocks_no_self CHECK (blocker_id <> blocked_id)
);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blocks_select" ON public.blocks;
CREATE POLICY "blocks_select" ON public.blocks
    FOR SELECT USING (blocker_id = auth.uid());

DROP POLICY IF EXISTS "blocks_insert" ON public.blocks;
CREATE POLICY "blocks_insert" ON public.blocks
    FOR INSERT WITH CHECK (blocker_id = auth.uid());

DROP POLICY IF EXISTS "blocks_delete" ON public.blocks;
CREATE POLICY "blocks_delete" ON public.blocks
    FOR DELETE USING (blocker_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.event_follows (
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_id    UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, event_id)
);

ALTER TABLE public.event_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_follows_select" ON public.event_follows;
CREATE POLICY "event_follows_select" ON public.event_follows
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "event_follows_insert" ON public.event_follows;
CREATE POLICY "event_follows_insert" ON public.event_follows
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "event_follows_delete" ON public.event_follows;
CREATE POLICY "event_follows_delete" ON public.event_follows
    FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.venue_follows (
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    venue_id    UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, venue_id)
);

ALTER TABLE public.venue_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venue_follows_select" ON public.venue_follows;
CREATE POLICY "venue_follows_select" ON public.venue_follows
    FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "venue_follows_insert" ON public.venue_follows;
CREATE POLICY "venue_follows_insert" ON public.venue_follows
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "venue_follows_delete" ON public.venue_follows;
CREATE POLICY "venue_follows_delete" ON public.venue_follows
    FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_venue_follower_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.venues
        SET followers_count = followers_count + 1
        WHERE id = NEW.venue_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.venues
        SET followers_count = GREATEST(followers_count - 1, 0)
        WHERE id = OLD.venue_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_venue_follows_count ON public.venue_follows;
CREATE TRIGGER trg_venue_follows_count
    AFTER INSERT OR DELETE ON public.venue_follows
    FOR EACH ROW EXECUTE FUNCTION public.update_venue_follower_count();

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
      AND c.event_id IS NULL
    LIMIT 1;

    IF existing_chat_id IS NOT NULL THEN
        RETURN existing_chat_id;
    END IF;

    INSERT INTO public.chats (chat_type, created_by)
    VALUES ('direct', auth.uid())
    RETURNING id INTO new_chat_id;

    INSERT INTO public.chat_participants (chat_id, user_id)
    VALUES (new_chat_id, auth.uid()), (new_chat_id, other_user_id);

    RETURN new_chat_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
    IF target_profile_id IS NULL THEN
        RETURN NULL;
    END IF;

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
    IF target_event_id IS NULL THEN
        RETURN NULL;
    END IF;

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
