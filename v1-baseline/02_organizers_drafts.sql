-- ============================================================
-- MITMI v1 baseline
-- 02. Organizers + Claims + Event Drafts
-- ============================================================

DO $$ BEGIN
    CREATE TYPE public.organizer_status AS ENUM ('unclaimed','claimed','merged','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.draft_source_type AS ENUM ('ai','admin','user','organizer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.review_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.claim_status AS ENUM ('pending','approved','rejected','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.normalize_entity_name(input_text TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN NULLIF(
        REGEXP_REPLACE(
            LOWER(COALESCE(input_text, '')),
            '[^a-z0-9]+',
            '',
            'g'
        ),
        ''
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

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

CREATE TABLE IF NOT EXISTS public.organizers (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                    TEXT NOT NULL,
    normalized_name         TEXT,
    slug                    TEXT,
    city                    TEXT,
    instagram_handle        TEXT,
    website_url             TEXT,
    contact_email           TEXT,
    contact_phone           TEXT,
    source_notes            TEXT,
    status                  public.organizer_status NOT NULL DEFAULT 'unclaimed',
    claimed_by_profile_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    merged_into_id          UUID REFERENCES public.organizers(id) ON DELETE SET NULL,
    created_by              UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by              UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    is_hidden               BOOLEAN NOT NULL DEFAULT FALSE,
    hidden_reason           TEXT,
    hidden_by               UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    hidden_at               TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT organizers_name_not_blank CHECK (BTRIM(name) <> ''),
    CONSTRAINT organizers_no_self_merge CHECK (merged_into_id IS NULL OR merged_into_id <> id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizers_slug_unique
    ON public.organizers(slug)
    WHERE slug IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizers_instagram_unique
    ON public.organizers(instagram_handle)
    WHERE instagram_handle IS NOT NULL
      AND status != 'merged';

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizers_claimed_profile_unique
    ON public.organizers(claimed_by_profile_id)
    WHERE claimed_by_profile_id IS NOT NULL
      AND status != 'merged';

CREATE INDEX IF NOT EXISTS idx_organizers_status
    ON public.organizers(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_organizers_name_lookup
    ON public.organizers(normalized_name, city);

ALTER TABLE public.organizers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizers_select" ON public.organizers;
CREATE POLICY "organizers_select" ON public.organizers
    FOR SELECT USING (
        status != 'archived'
        AND COALESCE(is_hidden, FALSE) = FALSE
    );

DROP POLICY IF EXISTS "organizers_insert" ON public.organizers;
CREATE POLICY "organizers_insert" ON public.organizers
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL
        AND (
            public.is_admin(auth.uid())
            OR created_by = auth.uid()
        )
    );

DROP POLICY IF EXISTS "organizers_update" ON public.organizers;
CREATE POLICY "organizers_update" ON public.organizers
    FOR UPDATE USING (
        public.is_admin(auth.uid())
        OR claimed_by_profile_id = auth.uid()
    )
    WITH CHECK (
        public.is_admin(auth.uid())
        OR claimed_by_profile_id = auth.uid()
    );

ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS organizer_id UUID REFERENCES public.organizers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS organizer_name_override TEXT,
    ADD COLUMN IF NOT EXISTS imported_from_draft_id UUID;

CREATE INDEX IF NOT EXISTS idx_events_organizer_id
    ON public.events(organizer_id, starts_at);

CREATE TABLE IF NOT EXISTS public.event_drafts (
    id                           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_type                  public.draft_source_type NOT NULL,
    review_status                public.review_status NOT NULL DEFAULT 'pending',
    source_url                   TEXT,
    source_label                 TEXT,
    submitted_by                 UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_by                  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_event_id            UUID REFERENCES public.events(id) ON DELETE SET NULL,
    organizer_id                 UUID REFERENCES public.organizers(id) ON DELETE SET NULL,
    venue_id                     UUID REFERENCES public.venues(id) ON DELETE SET NULL,
    title                        TEXT NOT NULL,
    description                  TEXT,
    category                     TEXT,
    city                         TEXT,
    location_name                TEXT,
    starts_at                    TIMESTAMPTZ,
    ends_at                      TIMESTAMPTZ,
    cover_image_url              TEXT,
    proposed_organizer_name      TEXT,
    proposed_organizer_instagram TEXT,
    proposed_venue_name          TEXT,
    ai_summary                   TEXT,
    ai_tags                      JSONB NOT NULL DEFAULT '[]'::jsonb,
    ai_confidence                NUMERIC(4,3),
    admin_notes                  TEXT,
    raw_payload                  JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_hidden                    BOOLEAN NOT NULL DEFAULT FALSE,
    hidden_reason                TEXT,
    hidden_by                    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    hidden_at                    TIMESTAMPTZ,
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at                  TIMESTAMPTZ,
    CONSTRAINT event_drafts_title_not_blank CHECK (BTRIM(title) <> ''),
    CONSTRAINT event_drafts_ai_confidence_range CHECK (
        ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)
    )
);

CREATE INDEX IF NOT EXISTS idx_event_drafts_review_queue
    ON public.event_drafts(review_status, created_at DESC);

ALTER TABLE public.event_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_drafts_select" ON public.event_drafts;
CREATE POLICY "event_drafts_select" ON public.event_drafts
    FOR SELECT USING (
        public.is_admin(auth.uid())
        OR submitted_by = auth.uid()
        OR organizer_id IN (
            SELECT id FROM public.organizers
            WHERE claimed_by_profile_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "event_drafts_insert" ON public.event_drafts;
CREATE POLICY "event_drafts_insert" ON public.event_drafts
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL
        AND (
            public.is_admin(auth.uid())
            OR submitted_by = auth.uid()
        )
    );

DROP POLICY IF EXISTS "event_drafts_update" ON public.event_drafts;
CREATE POLICY "event_drafts_update" ON public.event_drafts
    FOR UPDATE USING (
        public.is_admin(auth.uid())
        OR submitted_by = auth.uid()
        OR organizer_id IN (
            SELECT id FROM public.organizers
            WHERE claimed_by_profile_id = auth.uid()
        )
    )
    WITH CHECK (
        public.is_admin(auth.uid())
        OR submitted_by = auth.uid()
        OR organizer_id IN (
            SELECT id FROM public.organizers
            WHERE claimed_by_profile_id = auth.uid()
        )
    );

CREATE TABLE IF NOT EXISTS public.organizer_claim_requests (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organizer_id    UUID NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
    requester_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status          public.claim_status NOT NULL DEFAULT 'pending',
    claim_message   TEXT,
    evidence        JSONB NOT NULL DEFAULT '{}'::jsonb,
    reviewed_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at     TIMESTAMPTZ,
    admin_notes     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organizer_id, requester_id)
);

ALTER TABLE public.organizer_claim_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizer_claim_requests_select" ON public.organizer_claim_requests;
CREATE POLICY "organizer_claim_requests_select" ON public.organizer_claim_requests
    FOR SELECT USING (
        public.is_admin(auth.uid())
        OR requester_id = auth.uid()
    );

DROP POLICY IF EXISTS "organizer_claim_requests_insert" ON public.organizer_claim_requests;
CREATE POLICY "organizer_claim_requests_insert" ON public.organizer_claim_requests
    FOR INSERT WITH CHECK (requester_id = auth.uid());

DROP POLICY IF EXISTS "organizer_claim_requests_update" ON public.organizer_claim_requests;
CREATE POLICY "organizer_claim_requests_update" ON public.organizer_claim_requests
    FOR UPDATE USING (
        public.is_admin(auth.uid())
        OR requester_id = auth.uid()
    )
    WITH CHECK (
        public.is_admin(auth.uid())
        OR requester_id = auth.uid()
    );

CREATE OR REPLACE FUNCTION public.sync_organizer_denorm()
RETURNS TRIGGER AS $$
BEGIN
    NEW.normalized_name := public.normalize_entity_name(NEW.name);

    IF NEW.slug IS NULL AND NEW.name IS NOT NULL THEN
        NEW.slug := REGEXP_REPLACE(LOWER(BTRIM(NEW.name)), '[^a-z0-9]+', '-', 'g');
        NEW.slug := REGEXP_REPLACE(NEW.slug, '(^-+|-+$)', '', 'g');
    END IF;

    IF NEW.instagram_handle IS NOT NULL THEN
        NEW.instagram_handle := LOWER(REGEXP_REPLACE(NEW.instagram_handle, '^@+', ''));
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_organizers_sync_denorm ON public.organizers;
CREATE TRIGGER trg_organizers_sync_denorm
    BEFORE INSERT OR UPDATE ON public.organizers
    FOR EACH ROW EXECUTE FUNCTION public.sync_organizer_denorm();

DROP TRIGGER IF EXISTS trg_organizers_updated_at ON public.organizers;
CREATE TRIGGER trg_organizers_updated_at
    BEFORE UPDATE ON public.organizers
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_event_drafts_updated_at ON public.event_drafts;
CREATE TRIGGER trg_event_drafts_updated_at
    BEFORE UPDATE ON public.event_drafts
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_organizer_claim_requests_updated_at ON public.organizer_claim_requests;
CREATE TRIGGER trg_organizer_claim_requests_updated_at
    BEFORE UPDATE ON public.organizer_claim_requests
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.approve_organizer_claim(p_claim_request_id UUID)
RETURNS UUID AS $$
DECLARE
    v_request public.organizer_claim_requests%ROWTYPE;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only admins can approve organizer claims';
    END IF;

    SELECT * INTO v_request
    FROM public.organizer_claim_requests
    WHERE id = p_claim_request_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Claim request not found';
    END IF;

    UPDATE public.organizer_claim_requests
    SET status = 'approved',
        reviewed_by = auth.uid(),
        reviewed_at = NOW()
    WHERE id = p_claim_request_id;

    UPDATE public.organizer_claim_requests
    SET status = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_at = NOW(),
        admin_notes = COALESCE(admin_notes, 'Drugi zahtev za isti organizer je odobren.')
    WHERE organizer_id = v_request.organizer_id
      AND id <> p_claim_request_id
      AND status = 'pending';

    UPDATE public.organizers
    SET status = 'claimed',
        claimed_by_profile_id = v_request.requester_id,
        updated_by = auth.uid()
    WHERE id = v_request.organizer_id;

    RETURN v_request.organizer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.revoke_organizer_claim(
    p_organizer_id UUID,
    p_note TEXT DEFAULT NULL
)
RETURNS UUID AS $$
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only admins can revoke organizer claims';
    END IF;

    UPDATE public.organizers
    SET status = 'unclaimed',
        claimed_by_profile_id = NULL,
        updated_by = auth.uid()
    WHERE id = p_organizer_id;

    UPDATE public.organizer_claim_requests
    SET admin_notes = COALESCE(admin_notes, p_note)
    WHERE organizer_id = p_organizer_id
      AND status = 'approved';

    RETURN p_organizer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.merge_organizers(
    p_from_organizer_id UUID,
    p_into_organizer_id UUID
)
RETURNS UUID AS $$
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only admins can merge organizers';
    END IF;

    IF p_from_organizer_id = p_into_organizer_id THEN
        RAISE EXCEPTION 'Cannot merge organizer into itself';
    END IF;

    UPDATE public.events
    SET organizer_id = p_into_organizer_id
    WHERE organizer_id = p_from_organizer_id;

    UPDATE public.event_drafts
    SET organizer_id = p_into_organizer_id
    WHERE organizer_id = p_from_organizer_id;

    UPDATE public.organizers
    SET status = 'merged',
        merged_into_id = p_into_organizer_id,
        updated_by = auth.uid()
    WHERE id = p_from_organizer_id;

    RETURN p_into_organizer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.approve_event_draft(
    p_draft_id UUID,
    p_creator_id UUID DEFAULT NULL,
    p_publish BOOLEAN DEFAULT FALSE
)
RETURNS UUID AS $$
DECLARE
    v_draft public.event_drafts%ROWTYPE;
    v_event_id UUID;
    v_creator_id UUID;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only admins can approve event drafts';
    END IF;

    SELECT * INTO v_draft
    FROM public.event_drafts
    WHERE id = p_draft_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Draft not found';
    END IF;

    v_creator_id := COALESCE(p_creator_id, v_draft.submitted_by, auth.uid());

    INSERT INTO public.events (
        title,
        description,
        category,
        city,
        location_name,
        starts_at,
        ends_at,
        creator_id,
        venue_id,
        organizer_id,
        organizer_name_override,
        is_published
    ) VALUES (
        v_draft.title,
        COALESCE(v_draft.ai_summary, v_draft.description),
        v_draft.category,
        v_draft.city,
        v_draft.location_name,
        v_draft.starts_at,
        v_draft.ends_at,
        v_creator_id,
        v_draft.venue_id,
        v_draft.organizer_id,
        CASE WHEN v_draft.organizer_id IS NULL THEN v_draft.proposed_organizer_name ELSE NULL END,
        p_publish
    )
    RETURNING id INTO v_event_id;

    UPDATE public.event_drafts
    SET review_status = 'approved',
        approved_event_id = v_event_id,
        reviewed_by = auth.uid(),
        reviewed_at = NOW()
    WHERE id = p_draft_id;

    UPDATE public.events
    SET imported_from_draft_id = p_draft_id
    WHERE id = v_event_id;

    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
