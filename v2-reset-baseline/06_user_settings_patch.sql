BEGIN;

CREATE TABLE IF NOT EXISTS public.user_settings (
    id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    show_location    BOOLEAN NOT NULL DEFAULT TRUE,
    event_visibility TEXT NOT NULL DEFAULT 'profile',
    invite_visibility TEXT NOT NULL DEFAULT 'profile',
    plan_visibility  TEXT NOT NULL DEFAULT 'profile',
    notif_events     BOOLEAN NOT NULL DEFAULT TRUE,
    notif_messages   BOOLEAN NOT NULL DEFAULT TRUE,
    notif_plans      BOOLEAN NOT NULL DEFAULT TRUE,
    notif_invites    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_settings_event_visibility_check CHECK (event_visibility IN ('profile','hidden')),
    CONSTRAINT user_settings_invite_visibility_check CHECK (invite_visibility IN ('profile','hidden')),
    CONSTRAINT user_settings_plan_visibility_check CHECK (plan_visibility IN ('profile','hidden'))
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_settings_self_select" ON public.user_settings;
CREATE POLICY "user_settings_self_select" ON public.user_settings
    FOR SELECT USING (id = auth.uid());

DROP POLICY IF EXISTS "user_settings_self_insert" ON public.user_settings;
CREATE POLICY "user_settings_self_insert" ON public.user_settings
    FOR INSERT WITH CHECK (id = auth.uid() AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "user_settings_self_update" ON public.user_settings;
CREATE POLICY "user_settings_self_update" ON public.user_settings
    FOR UPDATE USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

DROP TRIGGER IF EXISTS trg_user_settings_updated_at ON public.user_settings;
CREATE TRIGGER trg_user_settings_updated_at
    BEFORE UPDATE ON public.user_settings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
