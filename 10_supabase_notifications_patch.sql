-- ============================================================
-- mitmi - Notifications patch
-- Dodaje target kolone i backend notifikacije za:
-- 1. profile follows
-- 2. venue follows
-- 3. invite applications
-- 4. new chat messages
-- Idempotentno: moze da se pusti vise puta
-- ============================================================

ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS actor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS chat_id UUID REFERENCES public.chats(id) ON DELETE SET NULL;

ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE SET NULL;

ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS invite_id UUID REFERENCES public.invites(id) ON DELETE SET NULL;

ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL;

ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS application_id UUID REFERENCES public.invite_applications(id) ON DELETE SET NULL;

ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL;

ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_notifications_chat
    ON public.notifications(chat_id, created_at DESC)
    WHERE chat_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_event
    ON public.notifications(event_id, created_at DESC)
    WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_actor
    ON public.notifications(actor_profile_id, created_at DESC)
    WHERE actor_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_unread
    ON public.notifications(user_id, read, created_at DESC);


CREATE OR REPLACE FUNCTION public._notif_profile_label(p_profile_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(NULLIF(display_name, ''), NULLIF(username, ''), 'Neko')
    FROM public.profiles
    WHERE id = p_profile_id
$$;


CREATE OR REPLACE FUNCTION public.create_follow_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_label TEXT;
BEGIN
    IF NEW.follower_id IS NULL OR NEW.following_id IS NULL OR NEW.follower_id = NEW.following_id THEN
        RETURN NEW;
    END IF;

    v_actor_label := COALESCE(public._notif_profile_label(NEW.follower_id), 'Neko');

    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        body,
        actor_profile_id,
        payload
    )
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
    FOR EACH ROW
    EXECUTE FUNCTION public.create_follow_notification();


CREATE OR REPLACE FUNCTION public.create_venue_follow_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
        user_id,
        type,
        title,
        body,
        actor_profile_id,
        venue_id,
        payload
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
    FOR EACH ROW
    EXECUTE FUNCTION public.create_venue_follow_notification();


CREATE OR REPLACE FUNCTION public.create_invite_application_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
        user_id,
        type,
        title,
        body,
        actor_profile_id,
        event_id,
        invite_id,
        application_id,
        payload
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
    FOR EACH ROW
    EXECUTE FUNCTION public.create_invite_application_notification();


CREATE OR REPLACE FUNCTION public.create_message_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
        user_id,
        type,
        title,
        body,
        actor_profile_id,
        chat_id,
        event_id,
        message_id,
        payload
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
      AND cp.user_id <> NEW.sender_id;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_message_notify ON public.messages;
CREATE TRIGGER trg_message_notify
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.create_message_notifications();
