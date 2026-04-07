-- ============================================================
-- MITMI v1 baseline
-- 04. Reports + Moderation + Notifications + Media
-- ============================================================

DO $$ BEGIN
    CREATE TYPE public.moderation_status AS ENUM ('open','reviewing','resolved','dismissed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.moderation_source_type AS ENUM ('system','user','ai','admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.moderation_entity_type AS ENUM ('user','event','invite','chat_message','organizer','event_draft','claim_request','report');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.reports (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    entity_type     public.moderation_entity_type NOT NULL,
    entity_id       UUID NOT NULL,
    reason          TEXT NOT NULL,
    message         TEXT,
    status          public.moderation_status NOT NULL DEFAULT 'open',
    reviewed_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at     TIMESTAMPTZ,
    resolution_note TEXT,
    priority        SMALLINT NOT NULL DEFAULT 2,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_reporter
    ON public.reports(reporter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_status_created
    ON public.reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_entity_lookup
    ON public.reports(entity_type, entity_id, created_at DESC);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports_insert" ON public.reports;
CREATE POLICY "reports_insert" ON public.reports
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND reporter_id = auth.uid());

DROP POLICY IF EXISTS "reports_select_own_or_admin" ON public.reports;
CREATE POLICY "reports_select_own_or_admin" ON public.reports
    FOR SELECT USING (
        reporter_id = auth.uid()
        OR public.is_admin(auth.uid())
    );

DROP POLICY IF EXISTS "reports_admin_update" ON public.reports;
CREATE POLICY "reports_admin_update" ON public.reports
    FOR UPDATE USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.moderation_items (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type         public.moderation_entity_type NOT NULL,
    entity_id           UUID NOT NULL,
    source_type         public.moderation_source_type NOT NULL DEFAULT 'system',
    reason              TEXT NOT NULL,
    priority            SMALLINT NOT NULL DEFAULT 2,
    status              public.moderation_status NOT NULL DEFAULT 'open',
    assigned_to         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    report_id           UUID REFERENCES public.reports(id) ON DELETE SET NULL,
    notes               TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at         TIMESTAMPTZ,
    resolved_at         TIMESTAMPTZ
);

ALTER TABLE public.moderation_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "moderation_items_admin_select" ON public.moderation_items;
CREATE POLICY "moderation_items_admin_select" ON public.moderation_items
    FOR SELECT USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "moderation_items_admin_insert" ON public.moderation_items;
CREATE POLICY "moderation_items_admin_insert" ON public.moderation_items
    FOR INSERT WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "moderation_items_admin_update" ON public.moderation_items;
CREATE POLICY "moderation_items_admin_update" ON public.moderation_items
    FOR UPDATE USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_moderation_items_updated_at ON public.moderation_items;
CREATE TRIGGER trg_moderation_items_updated_at
    BEFORE UPDATE ON public.moderation_items
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.admin_notes (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type         public.moderation_entity_type NOT NULL,
    entity_id           UUID NOT NULL,
    note                TEXT NOT NULL,
    created_by          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_notes_admin_select" ON public.admin_notes;
CREATE POLICY "admin_notes_admin_select" ON public.admin_notes
    FOR SELECT USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin_notes_admin_insert" ON public.admin_notes;
CREATE POLICY "admin_notes_admin_insert" ON public.admin_notes
    FOR INSERT WITH CHECK (public.is_admin(auth.uid()) AND created_by = auth.uid());

DROP POLICY IF EXISTS "admin_notes_admin_update" ON public.admin_notes;
CREATE POLICY "admin_notes_admin_update" ON public.admin_notes
    FOR UPDATE USING (public.is_admin(auth.uid()) AND created_by = auth.uid())
    WITH CHECK (public.is_admin(auth.uid()) AND created_by = auth.uid());

DROP TRIGGER IF EXISTS trg_admin_notes_updated_at ON public.admin_notes;
CREATE TRIGGER trg_admin_notes_updated_at
    BEFORE UPDATE ON public.admin_notes
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.create_moderation_item(
    p_entity_type public.moderation_entity_type,
    p_entity_id UUID,
    p_reason TEXT,
    p_source_type public.moderation_source_type DEFAULT 'system',
    p_priority SMALLINT DEFAULT 2,
    p_report_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
    v_item_id UUID;
BEGIN
    INSERT INTO public.moderation_items (
        entity_type, entity_id, source_type, reason, priority, status, created_by, report_id, metadata
    )
    VALUES (
        p_entity_type, p_entity_id, p_source_type, p_reason, COALESCE(p_priority, 2), 'open', auth.uid(), p_report_id, COALESCE(p_metadata, '{}'::jsonb)
    )
    RETURNING id INTO v_item_id;

    RETURN v_item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.resolve_moderation_item(
    p_item_id UUID,
    p_status public.moderation_status,
    p_note TEXT DEFAULT NULL
)
RETURNS public.moderation_items AS $$
DECLARE
    v_item public.moderation_items;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only admins can resolve moderation items';
    END IF;

    UPDATE public.moderation_items
    SET status = p_status,
        notes = COALESCE(p_note, notes),
        reviewed_by = auth.uid(),
        reviewed_at = NOW(),
        resolved_at = CASE
            WHEN p_status IN ('resolved', 'dismissed') THEN NOW()
            ELSE resolved_at
        END,
        updated_at = NOW()
    WHERE id = p_item_id
    RETURNING * INTO v_item;

    RETURN v_item;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.submit_report(
    p_entity_type public.moderation_entity_type,
    p_entity_id UUID,
    p_reason TEXT,
    p_message TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_report_id UUID;
BEGIN
    INSERT INTO public.reports (
        reporter_id, entity_type, entity_id, reason, message, status
    )
    VALUES (
        auth.uid(), p_entity_type, p_entity_id, p_reason, p_message, 'open'
    )
    RETURNING id INTO v_report_id;

    PERFORM public.create_moderation_item(
        p_entity_type,
        p_entity_id,
        p_reason,
        'user',
        2,
        v_report_id,
        jsonb_build_object('message', p_message)
    );

    RETURN v_report_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.soft_hide_entity(
    p_entity_type public.moderation_entity_type,
    p_entity_id UUID,
    p_reason TEXT
)
RETURNS VOID AS $$
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only admins can hide entities';
    END IF;

    IF p_entity_type = 'event' THEN
        UPDATE public.events
        SET is_hidden = TRUE,
            hidden_reason = p_reason,
            hidden_by = auth.uid(),
            hidden_at = NOW()
        WHERE id = p_entity_id;
    ELSIF p_entity_type = 'organizer' THEN
        UPDATE public.organizers
        SET is_hidden = TRUE,
            hidden_reason = p_reason,
            hidden_by = auth.uid(),
            hidden_at = NOW()
        WHERE id = p_entity_id;
    ELSIF p_entity_type = 'event_draft' THEN
        UPDATE public.event_drafts
        SET is_hidden = TRUE,
            hidden_reason = p_reason,
            hidden_by = auth.uid(),
            hidden_at = NOW()
        WHERE id = p_entity_id;
    ELSE
        RAISE EXCEPTION 'Soft hide not implemented for entity type %', p_entity_type;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TABLE IF NOT EXISTS public.notifications (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type             TEXT NOT NULL,
    title            TEXT NOT NULL,
    body             TEXT,
    read             BOOLEAN NOT NULL DEFAULT FALSE,
    actor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    chat_id          UUID REFERENCES public.chats(id) ON DELETE SET NULL,
    event_id         UUID REFERENCES public.events(id) ON DELETE SET NULL,
    invite_id        UUID REFERENCES public.invites(id) ON DELETE SET NULL,
    venue_id         UUID REFERENCES public.venues(id) ON DELETE SET NULL,
    application_id   UUID REFERENCES public.invite_applications(id) ON DELETE SET NULL,
    message_id       UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    payload          JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_own" ON public.notifications;
CREATE POLICY "notif_own" ON public.notifications
    FOR ALL USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public._notif_profile_label(p_profile_id UUID)
RETURNS TEXT LANGUAGE sql STABLE AS $$
    SELECT COALESCE(NULLIF(display_name, ''), NULLIF(username, ''), 'Neko')
    FROM public.profiles
    WHERE id = p_profile_id
$$;

CREATE OR REPLACE FUNCTION public.create_follow_notification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_actor_label TEXT;
BEGIN
    IF NEW.follower_id IS NULL OR NEW.following_id IS NULL OR NEW.follower_id = NEW.following_id THEN
        RETURN NEW;
    END IF;

    v_actor_label := COALESCE(public._notif_profile_label(NEW.follower_id), 'Neko');

    INSERT INTO public.notifications (user_id, type, title, body, actor_profile_id, payload)
    VALUES (
        NEW.following_id,
        'new_follower',
        v_actor_label || ' te sada prati',
        'Pogledaj profil i uzvrati praćenje ako želiš.',
        NEW.follower_id,
        jsonb_build_object('source', 'follows')
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_follow_notify ON public.follows;
CREATE TRIGGER trg_follow_notify
    AFTER INSERT ON public.follows
    FOR EACH ROW EXECUTE FUNCTION public.create_follow_notification();

CREATE OR REPLACE FUNCTION public.create_venue_follow_notification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_owner_id UUID;
    v_actor_label TEXT;
BEGIN
    SELECT profile_id INTO v_owner_id
    FROM public.venues
    WHERE id = NEW.venue_id;

    IF v_owner_id IS NULL OR v_owner_id = NEW.user_id THEN
        RETURN NEW;
    END IF;

    v_actor_label := COALESCE(public._notif_profile_label(NEW.user_id), 'Neko');

    INSERT INTO public.notifications (
        user_id, type, title, body, actor_profile_id, venue_id, payload
    )
    VALUES (
        v_owner_id,
        'venue_follow',
        v_actor_label || ' prati tvoj organizer profil',
        'Pogledaj svoj organizer profil i nove pratioce.',
        NEW.user_id,
        NEW.venue_id,
        jsonb_build_object('source', 'venue_follows')
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_venue_follow_notify ON public.venue_follows;
CREATE TRIGGER trg_venue_follow_notify
    AFTER INSERT ON public.venue_follows
    FOR EACH ROW EXECUTE FUNCTION public.create_venue_follow_notification();

CREATE OR REPLACE FUNCTION public.create_invite_application_notification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_creator_id UUID;
    v_event_id UUID;
    v_invite_title TEXT;
    v_actor_label TEXT;
BEGIN
    SELECT i.creator_id, i.event_id, i.title
    INTO v_creator_id, v_event_id, v_invite_title
    FROM public.invites i
    WHERE i.id = NEW.invite_id;

    IF v_creator_id IS NULL OR v_creator_id = NEW.applicant_id THEN
        RETURN NEW;
    END IF;

    v_actor_label := COALESCE(public._notif_profile_label(NEW.applicant_id), 'Neko');

    INSERT INTO public.notifications (
        user_id, type, title, body, actor_profile_id, event_id, invite_id, application_id, payload
    )
    VALUES (
        v_creator_id,
        'invite_joined',
        v_actor_label || ' se prijavio/la na tvoj poziv',
        COALESCE('Poziv: ' || NULLIF(v_invite_title, ''), 'Pogledaj ko želi da ide sa tobom.'),
        NEW.applicant_id,
        v_event_id,
        NEW.invite_id,
        NEW.id,
        jsonb_build_object('source', 'invite_applications')
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invite_application_notify ON public.invite_applications;
CREATE TRIGGER trg_invite_application_notify
    AFTER INSERT ON public.invite_applications
    FOR EACH ROW EXECUTE FUNCTION public.create_invite_application_notification();

CREATE OR REPLACE FUNCTION public.create_message_notifications()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_sender_label TEXT;
    v_chat_title TEXT;
    v_chat_type TEXT;
BEGIN
    SELECT COALESCE(NULLIF(title, ''), 'Chat'), chat_type
    INTO v_chat_title, v_chat_type
    FROM public.chats
    WHERE id = NEW.chat_id;

    v_sender_label := COALESCE(public._notif_profile_label(NEW.sender_id), 'Nova poruka');

    INSERT INTO public.notifications (
        user_id, type, title, body, actor_profile_id, chat_id, event_id, message_id, payload
    )
    SELECT
        cp.user_id,
        'new_message',
        CASE
            WHEN v_chat_type = 'direct' THEN v_sender_label || ' ti je poslao/la poruku'
            ELSE 'Nova poruka u chatu "' || COALESCE(v_chat_title, 'Događaj') || '"'
        END,
        LEFT(COALESCE(NEW.content, ''), 160),
        NEW.sender_id,
        NEW.chat_id,
        c.event_id,
        NEW.id,
        jsonb_build_object('source', 'messages', 'chat_type', v_chat_type)
    FROM public.chat_participants cp
    JOIN public.chats c ON c.id = cp.chat_id
    WHERE cp.chat_id = NEW.chat_id
      AND cp.user_id <> NEW.sender_id
      AND cp.hidden_at IS NULL;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_message_notify ON public.messages;
CREATE TRIGGER trg_message_notify
    AFTER INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.create_message_notifications();

CREATE TABLE IF NOT EXISTS public.event_photos (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id        UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    uploader_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    photo_url       TEXT NOT NULL,
    storage_path    TEXT NOT NULL,
    display_order   SMALLINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.event_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_photos_select" ON public.event_photos;
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
              AND is_published = TRUE
              AND is_cancelled = FALSE
              AND COALESCE(is_hidden, FALSE) = FALSE
        )
    );

DROP POLICY IF EXISTS "event_photos_insert" ON public.event_photos;
CREATE POLICY "event_photos_insert" ON public.event_photos
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND uploader_id = auth.uid());

DROP POLICY IF EXISTS "event_photos_delete" ON public.event_photos;
CREATE POLICY "event_photos_delete" ON public.event_photos
    FOR DELETE USING (
        uploader_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.events
            WHERE id = event_photos.event_id
              AND creator_id = auth.uid()
        )
    );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', TRUE, 2097152, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('venue-covers', 'venue-covers', TRUE, 3145728, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('event-photos', 'event-photos', TRUE, 2097152, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$ BEGIN
    CREATE POLICY "avatars_read" ON storage.objects
        FOR SELECT USING (bucket_id = 'avatars');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "avatars_insert" ON storage.objects
        FOR INSERT WITH CHECK (
            bucket_id = 'avatars'
            AND auth.uid()::text = SPLIT_PART(name, '/', 1)
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "avatars_update" ON storage.objects
        FOR UPDATE USING (
            bucket_id = 'avatars'
            AND auth.uid()::text = SPLIT_PART(name, '/', 1)
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "avatars_delete" ON storage.objects
        FOR DELETE USING (
            bucket_id = 'avatars'
            AND auth.uid()::text = SPLIT_PART(name, '/', 1)
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "venue_covers_read" ON storage.objects
        FOR SELECT USING (bucket_id = 'venue-covers');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "venue_covers_insert" ON storage.objects
        FOR INSERT WITH CHECK (
            bucket_id = 'venue-covers'
            AND EXISTS (
                SELECT 1 FROM public.venues
                WHERE id::text = SPLIT_PART(name, '/', 1)
                  AND profile_id = auth.uid()
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "venue_covers_delete" ON storage.objects
        FOR DELETE USING (
            bucket_id = 'venue-covers'
            AND EXISTS (
                SELECT 1 FROM public.venues
                WHERE id::text = SPLIT_PART(name, '/', 1)
                  AND profile_id = auth.uid()
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS "storage_event_photos_insert" ON storage.objects;
CREATE POLICY "storage_event_photos_insert" ON storage.objects
    FOR INSERT WITH CHECK (
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
CREATE POLICY "storage_event_photos_delete" ON storage.objects
    FOR DELETE USING (
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

DROP VIEW IF EXISTS public.v_event_feed CASCADE;
CREATE VIEW public.v_event_feed AS
SELECT
    e.id,
    e.title,
    e.description,
    e.category,
    e.city,
    e.location_name,
    e.starts_at,
    e.ends_at,
    e.capacity,
    e.attendee_count,
    e.cover_url,
    e.cover_gradient,
    e.is_cancelled,
    e.created_at,
    e.organizer_id,
    o.name AS organizer_name,
    v.id AS venue_id,
    v.venue_name,
    v.cover_url AS venue_cover_url,
    v.status AS venue_status,
    p.id AS creator_id,
    p.username AS creator_username,
    p.avatar_url AS creator_avatar,
    p.avg_rating AS creator_rating,
    CASE
        WHEN e.capacity IS NULL THEN NULL
        ELSE GREATEST(e.capacity - e.attendee_count, 0)
    END AS spots_available,
    (e.starts_at::date = CURRENT_DATE) AS is_urgent,
    (
        SELECT COUNT(*)
        FROM public.invites i
        WHERE i.event_id = e.id
          AND i.status = 'open'
    ) AS open_invites_count,
    (
        SELECT COUNT(*)
        FROM public.event_follows ef
        WHERE ef.event_id = e.id
    ) AS saved_count,
    (
        SELECT EXISTS (
            SELECT 1
            FROM public.event_follows ef
            WHERE ef.event_id = e.id
              AND ef.user_id = auth.uid()
        )
    ) AS is_saved_by_me,
    (
        SELECT photo_url
        FROM public.event_photos ep
        WHERE ep.event_id = e.id
        ORDER BY ep.display_order ASC, ep.created_at ASC
        LIMIT 1
    ) AS first_photo_url
FROM public.events e
LEFT JOIN public.venues v ON v.id = e.venue_id
LEFT JOIN public.organizers o ON o.id = e.organizer_id
LEFT JOIN public.profiles p ON p.id = e.creator_id
WHERE e.is_published = TRUE
  AND e.is_cancelled = FALSE
  AND COALESCE(e.is_hidden, FALSE) = FALSE
  AND e.starts_at >= NOW() - INTERVAL '2 hours';

DROP VIEW IF EXISTS public.v_venue_profile CASCADE;
CREATE VIEW public.v_venue_profile AS
SELECT
    v.*,
    p.username,
    p.display_name,
    p.avatar_url,
    p.bio,
    p.status AS profile_status,
    (
        SELECT COUNT(*)
        FROM public.events e
        WHERE e.venue_id = v.id
          AND e.is_published = TRUE
          AND e.is_cancelled = FALSE
          AND COALESCE(e.is_hidden, FALSE) = FALSE
          AND e.starts_at > NOW()
    ) AS upcoming_events_count,
    (
        SELECT COUNT(*)
        FROM public.events e
        WHERE e.venue_id = v.id
          AND e.is_published = TRUE
          AND e.is_cancelled = FALSE
          AND COALESCE(e.is_hidden, FALSE) = FALSE
    ) AS public_events_count,
    (
        SELECT EXISTS (
            SELECT 1
            FROM public.venue_follows vf
            WHERE vf.venue_id = v.id
              AND vf.user_id = auth.uid()
        )
    ) AS is_followed_by_me
FROM public.venues v
JOIN public.profiles p ON p.id = v.profile_id
WHERE p.status = 'active';

DROP VIEW IF EXISTS public.v_user_profile CASCADE;
CREATE VIEW public.v_user_profile AS
SELECT
    p.*,
    (
        SELECT COUNT(*)
        FROM public.follows f
        WHERE f.following_id = p.id
    ) AS followers_count,
    (
        SELECT COUNT(*)
        FROM public.follows f
        WHERE f.follower_id = p.id
    ) AS following_count,
    (
        SELECT EXISTS (
            SELECT 1
            FROM public.follows f
            WHERE f.follower_id = auth.uid()
              AND f.following_id = p.id
        )
    ) AS is_followed_by_me,
    (
        SELECT EXISTS (
            SELECT 1
            FROM public.blocks b
            WHERE b.blocker_id = auth.uid()
              AND b.blocked_id = p.id
        )
    ) AS is_blocked_by_me,
    (
        SELECT COUNT(*)
        FROM public.events e
        WHERE e.creator_id = p.id
          AND e.is_published = TRUE
          AND e.is_cancelled = FALSE
          AND COALESCE(e.is_hidden, FALSE) = FALSE
    ) AS public_events_count,
    (
        SELECT COUNT(*)
        FROM public.invites i
        JOIN public.events e ON e.id = i.event_id
        WHERE i.creator_id = p.id
          AND i.status = 'open'
          AND e.starts_at > NOW()
          AND e.is_cancelled = FALSE
          AND COALESCE(e.is_hidden, FALSE) = FALSE
    ) AS active_invites_count
FROM public.profiles p
WHERE p.status = 'active';

DROP VIEW IF EXISTS public.v_chat_list CASCADE;
CREATE VIEW public.v_chat_list AS
SELECT
    c.id AS chat_id,
    c.chat_type,
    c.event_id,
    cp.user_id,
    cp.last_read_at,
    cp.hidden_at,
    last_msg.content AS last_message,
    last_msg.created_at AS last_message_at,
    last_msg.sender_id AS last_sender_id,
    lsp.username AS last_sender_username,
    (
        SELECT COUNT(*)
        FROM public.messages m
        WHERE m.chat_id = c.id
          AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01'::timestamptz)
          AND m.sender_id <> cp.user_id
    ) AS unread_count,
    e.title AS event_title,
    e.category AS event_category,
    e.starts_at AS event_starts_at,
    dm.id AS dm_other_user_id,
    dm.username AS dm_other_username,
    dm.avatar_url AS dm_other_avatar
FROM public.chats c
JOIN public.chat_participants cp ON cp.chat_id = c.id
LEFT JOIN LATERAL (
    SELECT content, created_at, sender_id
    FROM public.messages
    WHERE chat_id = c.id
    ORDER BY created_at DESC
    LIMIT 1
) last_msg ON TRUE
LEFT JOIN public.profiles lsp ON lsp.id = last_msg.sender_id
LEFT JOIN public.events e ON e.id = c.event_id
LEFT JOIN LATERAL (
    SELECT p.id, p.username, p.avatar_url
    FROM public.chat_participants cp2
    JOIN public.profiles p ON p.id = cp2.user_id
    WHERE cp2.chat_id = c.id
      AND cp2.user_id <> cp.user_id
      AND c.chat_type = 'direct'
    LIMIT 1
) dm ON TRUE;

DROP VIEW IF EXISTS public.v_venue_analytics CASCADE;
CREATE VIEW public.v_venue_analytics AS
SELECT
    v.id AS venue_id,
    v.profile_id,
    v.venue_name,
    COALESCE(v.followers_count, 0) AS followers_count,
    (
        SELECT COUNT(*)
        FROM public.events e
        WHERE (e.venue_id = v.id OR e.creator_id = v.profile_id)
          AND e.is_published = TRUE
          AND e.is_cancelled = FALSE
          AND COALESCE(e.is_hidden, FALSE) = FALSE
    ) AS total_events_count,
    (
        SELECT COUNT(*)
        FROM public.events e
        WHERE (e.venue_id = v.id OR e.creator_id = v.profile_id)
          AND e.is_published = TRUE
          AND e.is_cancelled = FALSE
          AND COALESCE(e.is_hidden, FALSE) = FALSE
          AND e.starts_at > NOW()
    ) AS active_events_count,
    (
        SELECT COALESCE(SUM(e.attendee_count), 0)
        FROM public.events e
        WHERE (e.venue_id = v.id OR e.creator_id = v.profile_id)
          AND e.is_published = TRUE
          AND e.is_cancelled = FALSE
          AND COALESCE(e.is_hidden, FALSE) = FALSE
    ) AS total_registrations,
    (
        SELECT COALESCE(SUM(e.attendee_count), 0)
        FROM public.events e
        WHERE (e.venue_id = v.id OR e.creator_id = v.profile_id)
          AND e.is_published = TRUE
          AND e.is_cancelled = FALSE
          AND COALESCE(e.is_hidden, FALSE) = FALSE
          AND e.starts_at > NOW()
    ) AS upcoming_registrations,
    (
        SELECT COUNT(*)
        FROM public.event_follows ef
        JOIN public.events e ON e.id = ef.event_id
        WHERE (e.venue_id = v.id OR e.creator_id = v.profile_id)
          AND e.is_published = TRUE
          AND e.is_cancelled = FALSE
          AND COALESCE(e.is_hidden, FALSE) = FALSE
    ) AS saved_events_count
FROM public.venues v;

CREATE OR REPLACE VIEW public.admin_moderation_queue AS
SELECT
    mi.id,
    mi.entity_type,
    mi.entity_id,
    mi.source_type,
    mi.reason,
    mi.priority,
    mi.status,
    mi.assigned_to,
    mi.created_by,
    mi.reviewed_by,
    mi.report_id,
    mi.notes,
    mi.metadata,
    mi.created_at,
    mi.updated_at,
    mi.reviewed_at,
    mi.resolved_at,
    r.message AS report_message,
    p.username AS created_by_username
FROM public.moderation_items mi
LEFT JOIN public.reports r ON r.id = mi.report_id
LEFT JOIN public.profiles p ON p.id = mi.created_by
ORDER BY mi.priority ASC, mi.created_at DESC;
