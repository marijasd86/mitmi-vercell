-- ============================================================
--  mitmi - Moderation Inbox + Reports Extensions
--  Verzija: 1.0
--  Pokreni posle: 3_supabase_final.sql, 4_supabase_organizers.sql
--  Idempotentno: moze da se pokrene vise puta bez gresaka
-- ============================================================


-- ============================================================
--  0. ENUM TIPOVI
-- ============================================================

DO $$ BEGIN
    CREATE TYPE moderation_status AS ENUM ('open','reviewing','resolved','dismissed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE moderation_source_type AS ENUM ('system','user','ai','admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE moderation_entity_type AS ENUM ('user','event','invite','chat_message','organizer','event_draft','claim_request','report');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================
--  1. REPORTS NADOGRADNJA
-- ============================================================

ALTER TABLE public.reports
    ADD COLUMN IF NOT EXISTS entity_type moderation_entity_type,
    ADD COLUMN IF NOT EXISTS entity_id UUID,
    ADD COLUMN IF NOT EXISTS message TEXT,
    ADD COLUMN IF NOT EXISTS status moderation_status NOT NULL DEFAULT 'open',
    ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS resolution_note TEXT,
    ADD COLUMN IF NOT EXISTS priority SMALLINT NOT NULL DEFAULT 2;

CREATE INDEX IF NOT EXISTS idx_reports_status_created
    ON public.reports(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_entity_lookup
    ON public.reports(entity_type, entity_id, created_at DESC);

DO $$ BEGIN
    CREATE POLICY "reports_admin_select" ON public.reports
        FOR SELECT USING (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "reports_admin_update" ON public.reports
        FOR UPDATE USING (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================
--  2. MODERATION ITEMS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.moderation_items (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type         moderation_entity_type NOT NULL,
    entity_id           UUID NOT NULL,
    source_type         moderation_source_type NOT NULL DEFAULT 'system',
    reason              TEXT NOT NULL,
    priority            SMALLINT NOT NULL DEFAULT 2,
    status              moderation_status NOT NULL DEFAULT 'open',
    assigned_to         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    report_id           UUID REFERENCES public.reports(id) ON DELETE SET NULL,
    notes               TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at         TIMESTAMPTZ,
    resolved_at         TIMESTAMPTZ,
    CONSTRAINT moderation_items_reason_not_blank CHECK (BTRIM(reason) <> ''),
    CONSTRAINT moderation_items_priority_range CHECK (priority BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS idx_moderation_items_queue
    ON public.moderation_items(status, priority, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_moderation_items_entity
    ON public.moderation_items(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_moderation_items_assignee
    ON public.moderation_items(assigned_to, status, created_at DESC);

ALTER TABLE public.moderation_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "moderation_items_admin_select" ON public.moderation_items
        FOR SELECT USING (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "moderation_items_admin_insert" ON public.moderation_items
        FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "moderation_items_admin_update" ON public.moderation_items
        FOR UPDATE USING (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================
--  3. ADMIN NOTES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_notes (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type         moderation_entity_type NOT NULL,
    entity_id           UUID NOT NULL,
    note                TEXT NOT NULL,
    created_by          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT admin_notes_note_not_blank CHECK (BTRIM(note) <> '')
);

CREATE INDEX IF NOT EXISTS idx_admin_notes_entity
    ON public.admin_notes(entity_type, entity_id, created_at DESC);

ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "admin_notes_admin_select" ON public.admin_notes
        FOR SELECT USING (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "admin_notes_admin_insert" ON public.admin_notes
        FOR INSERT WITH CHECK (public.is_admin(auth.uid()) AND created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "admin_notes_admin_update" ON public.admin_notes
        FOR UPDATE USING (public.is_admin(auth.uid()) AND created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================
--  4. SOFT DELETE POLJA
-- ============================================================

ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS hidden_reason TEXT,
    ADD COLUMN IF NOT EXISTS hidden_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;

ALTER TABLE public.organizers
    ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS hidden_reason TEXT,
    ADD COLUMN IF NOT EXISTS hidden_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;

ALTER TABLE public.event_drafts
    ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS hidden_reason TEXT,
    ADD COLUMN IF NOT EXISTS hidden_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_events_hidden
    ON public.events(is_hidden, starts_at DESC);

CREATE INDEX IF NOT EXISTS idx_organizers_hidden
    ON public.organizers(is_hidden, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_drafts_hidden
    ON public.event_drafts(is_hidden, created_at DESC);


-- ============================================================
--  5. HELPER FUNKCIJE
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_moderation_item(
    p_entity_type moderation_entity_type,
    p_entity_id UUID,
    p_reason TEXT,
    p_source_type moderation_source_type DEFAULT 'system',
    p_priority SMALLINT DEFAULT 2,
    p_report_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
    v_item_id UUID;
BEGIN
    INSERT INTO public.moderation_items (
        entity_type,
        entity_id,
        source_type,
        reason,
        priority,
        status,
        created_by,
        report_id,
        metadata
    )
    VALUES (
        p_entity_type,
        p_entity_id,
        p_source_type,
        p_reason,
        COALESCE(p_priority, 2),
        'open',
        auth.uid(),
        p_report_id,
        COALESCE(p_metadata, '{}'::jsonb)
    )
    RETURNING id INTO v_item_id;

    RETURN v_item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.resolve_moderation_item(
    p_item_id UUID,
    p_status moderation_status,
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
        resolved_at = CASE WHEN p_status IN ('resolved','dismissed') THEN NOW() ELSE resolved_at END,
        updated_at = NOW()
    WHERE id = p_item_id
    RETURNING * INTO v_item;

    RETURN v_item;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.submit_report(
    p_entity_type moderation_entity_type,
    p_entity_id UUID,
    p_reason TEXT,
    p_message TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_report_id UUID;
BEGIN
    INSERT INTO public.reports (
        reporter_id,
        entity_type,
        entity_id,
        reason,
        message,
        resolved,
        status
    )
    VALUES (
        auth.uid(),
        p_entity_type,
        p_entity_id,
        p_reason,
        p_message,
        FALSE,
        'open'
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
    p_entity_type moderation_entity_type,
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


-- ============================================================
--  6. ADMIN VIEW ZA INBOX
-- ============================================================

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
