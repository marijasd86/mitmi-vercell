-- ============================================================
--  mitmi - Organizers + Event Drafts
--  Verzija: 1.0
--  Pokreni: 1_supabase_schema.sql -> 3_supabase_final.sql -> ovaj fajl
--  Idempotentno: moze da se pokrene vise puta bez gresaka
-- ============================================================


-- ============================================================
--  0. ENUM TIPOVI
-- ============================================================

DO $$ BEGIN
    CREATE TYPE organizer_status AS ENUM ('unclaimed','claimed','merged','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE draft_source_type AS ENUM ('ai','admin','user','organizer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE review_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE claim_status AS ENUM ('pending','approved','rejected','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================
--  1. HELPER FUNKCIJE
-- ============================================================

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


-- ============================================================
--  2. ORGANIZERS
-- ============================================================

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
    status                  organizer_status NOT NULL DEFAULT 'unclaimed',
    claimed_by_profile_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    merged_into_id          UUID REFERENCES public.organizers(id) ON DELETE SET NULL,
    created_by              UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by              UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT organizers_name_not_blank CHECK (BTRIM(name) <> ''),
    CONSTRAINT organizers_no_self_merge CHECK (merged_into_id IS NULL OR merged_into_id <> id)
);

ALTER TABLE public.organizers
    ADD COLUMN IF NOT EXISTS normalized_name TEXT,
    ADD COLUMN IF NOT EXISTS slug TEXT,
    ADD COLUMN IF NOT EXISTS city TEXT,
    ADD COLUMN IF NOT EXISTS instagram_handle TEXT,
    ADD COLUMN IF NOT EXISTS website_url TEXT,
    ADD COLUMN IF NOT EXISTS contact_email TEXT,
    ADD COLUMN IF NOT EXISTS contact_phone TEXT,
    ADD COLUMN IF NOT EXISTS source_notes TEXT,
    ADD COLUMN IF NOT EXISTS status organizer_status NOT NULL DEFAULT 'unclaimed',
    ADD COLUMN IF NOT EXISTS claimed_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES public.organizers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.organizers
SET normalized_name = public.normalize_entity_name(name)
WHERE normalized_name IS NULL;

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
    FOR SELECT USING (status != 'archived');

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


-- ============================================================
--  3. EVENT DRAFTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.event_drafts (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_type                 draft_source_type NOT NULL,
    review_status               review_status NOT NULL DEFAULT 'pending',
    source_url                  TEXT,
    source_label                TEXT,
    submitted_by                UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_by                 UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_event_id           UUID REFERENCES public.events(id) ON DELETE SET NULL,
    organizer_id                UUID REFERENCES public.organizers(id) ON DELETE SET NULL,
    venue_id                    UUID REFERENCES public.venues(id) ON DELETE SET NULL,
    title                       TEXT NOT NULL,
    description                 TEXT,
    category                    TEXT,
    city                        TEXT,
    location_name               TEXT,
    starts_at                   TIMESTAMPTZ,
    ends_at                     TIMESTAMPTZ,
    cover_image_url             TEXT,
    proposed_organizer_name     TEXT,
    proposed_organizer_instagram TEXT,
    proposed_venue_name         TEXT,
    ai_summary                  TEXT,
    ai_tags                     JSONB NOT NULL DEFAULT '[]'::jsonb,
    ai_confidence               NUMERIC(4,3),
    admin_notes                 TEXT,
    raw_payload                 JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at                 TIMESTAMPTZ,
    CONSTRAINT event_drafts_title_not_blank CHECK (BTRIM(title) <> ''),
    CONSTRAINT event_drafts_ai_confidence_range CHECK (
        ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)
    )
);

CREATE INDEX IF NOT EXISTS idx_event_drafts_review_queue
    ON public.event_drafts(review_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_drafts_organizer
    ON public.event_drafts(organizer_id, starts_at);

CREATE INDEX IF NOT EXISTS idx_event_drafts_submitter
    ON public.event_drafts(submitted_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_drafts_source_url
    ON public.event_drafts(source_url)
    WHERE source_url IS NOT NULL;

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


-- ============================================================
--  4. ORGANIZER CLAIM REQUESTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.organizer_claim_requests (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organizer_id        UUID NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
    requester_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status              claim_status NOT NULL DEFAULT 'pending',
    claim_message       TEXT,
    evidence            JSONB NOT NULL DEFAULT '{}'::jsonb,
    reviewed_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at         TIMESTAMPTZ,
    admin_notes         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organizer_id, requester_id)
);

CREATE INDEX IF NOT EXISTS idx_organizer_claim_requests_status
    ON public.organizer_claim_requests(status, created_at DESC);

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


-- ============================================================
--  5. EVENTS - ORGANIZER PODRSKA
-- ============================================================

ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS organizer_id UUID REFERENCES public.organizers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS organizer_name_override TEXT,
    ADD COLUMN IF NOT EXISTS imported_from_draft_id UUID REFERENCES public.event_drafts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_events_organizer_id
    ON public.events(organizer_id, starts_at);


-- ============================================================
--  6. TRIGGERI ZA TIMESTAMPS / NORMALIZACIJU
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.guard_organizer_update()
RETURNS TRIGGER AS $$
BEGIN
    IF public.is_admin(auth.uid()) THEN
        RETURN NEW;
    END IF;

    IF OLD.claimed_by_profile_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Only the claimed organizer can edit this organizer';
    END IF;

    NEW.status := OLD.status;
    NEW.claimed_by_profile_id := OLD.claimed_by_profile_id;
    NEW.merged_into_id := OLD.merged_into_id;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.updated_by := auth.uid();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.guard_event_draft_update()
RETURNS TRIGGER AS $$
BEGIN
    IF public.is_admin(auth.uid()) THEN
        RETURN NEW;
    END IF;

    IF OLD.review_status <> 'pending' THEN
        RAISE EXCEPTION 'Only pending drafts can be edited';
    END IF;

    IF NEW.review_status IS DISTINCT FROM OLD.review_status
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.approved_event_id IS DISTINCT FROM OLD.approved_event_id
       OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes THEN
        RAISE EXCEPTION 'Only admins can update review fields';
    END IF;

    NEW.submitted_by := OLD.submitted_by;
    NEW.source_type := OLD.source_type;
    NEW.approved_event_id := OLD.approved_event_id;
    NEW.review_status := OLD.review_status;
    NEW.reviewed_by := OLD.reviewed_by;
    NEW.reviewed_at := OLD.reviewed_at;
    NEW.admin_notes := OLD.admin_notes;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.guard_organizer_claim_request_update()
RETURNS TRIGGER AS $$
BEGIN
    IF public.is_admin(auth.uid()) THEN
        RETURN NEW;
    END IF;

    IF OLD.requester_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Only the requester can edit this claim';
    END IF;

    IF OLD.status <> 'pending' THEN
        RAISE EXCEPTION 'Only pending claims can be changed';
    END IF;

    IF NEW.organizer_id IS DISTINCT FROM OLD.organizer_id
       OR NEW.requester_id IS DISTINCT FROM OLD.requester_id
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes THEN
        RAISE EXCEPTION 'Only admins can change review fields';
    END IF;

    IF NEW.status NOT IN ('pending', 'cancelled') THEN
        RAISE EXCEPTION 'Requester can only keep the claim pending or cancel it';
    END IF;

    NEW.organizer_id := OLD.organizer_id;
    NEW.requester_id := OLD.requester_id;
    NEW.reviewed_by := OLD.reviewed_by;
    NEW.reviewed_at := OLD.reviewed_at;
    NEW.admin_notes := OLD.admin_notes;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

DROP TRIGGER IF EXISTS trg_organizers_guard_update ON public.organizers;
CREATE TRIGGER trg_organizers_guard_update
    BEFORE UPDATE ON public.organizers
    FOR EACH ROW EXECUTE FUNCTION public.guard_organizer_update();

DROP TRIGGER IF EXISTS trg_organizers_updated_at ON public.organizers;
CREATE TRIGGER trg_organizers_updated_at
    BEFORE UPDATE ON public.organizers
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_event_drafts_guard_update ON public.event_drafts;
CREATE TRIGGER trg_event_drafts_guard_update
    BEFORE UPDATE ON public.event_drafts
    FOR EACH ROW EXECUTE FUNCTION public.guard_event_draft_update();

DROP TRIGGER IF EXISTS trg_event_drafts_updated_at ON public.event_drafts;
CREATE TRIGGER trg_event_drafts_updated_at
    BEFORE UPDATE ON public.event_drafts
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_organizer_claim_requests_guard_update ON public.organizer_claim_requests;
CREATE TRIGGER trg_organizer_claim_requests_guard_update
    BEFORE UPDATE ON public.organizer_claim_requests
    FOR EACH ROW EXECUTE FUNCTION public.guard_organizer_claim_request_update();

DROP TRIGGER IF EXISTS trg_organizer_claim_requests_updated_at ON public.organizer_claim_requests;
CREATE TRIGGER trg_organizer_claim_requests_updated_at
    BEFORE UPDATE ON public.organizer_claim_requests
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
--  7. ADMIN FUNKCIJE - CLAIM / MERGE / APPROVE
-- ============================================================

CREATE OR REPLACE FUNCTION public.approve_organizer_claim(
    p_claim_request_id UUID
)
RETURNS UUID AS $$
DECLARE
    v_request public.organizer_claim_requests%ROWTYPE;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only admins can approve organizer claims';
    END IF;

    SELECT *
    INTO v_request
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

    UPDATE public.organizers
    SET status = 'claimed',
        claimed_by_profile_id = v_request.requester_id,
        updated_by = auth.uid()
    WHERE id = v_request.organizer_id;

    UPDATE public.organizer_claim_requests
    SET status = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_at = NOW(),
        admin_notes = COALESCE(admin_notes, 'Rejected because another claim was approved first')
    WHERE organizer_id = v_request.organizer_id
      AND id <> p_claim_request_id
      AND status = 'pending';

    RETURN v_request.organizer_id;
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

    UPDATE public.organizer_claim_requests
    SET status = 'cancelled',
        reviewed_by = auth.uid(),
        reviewed_at = NOW(),
        admin_notes = COALESCE(admin_notes, 'Cancelled because organizer was merged')
    WHERE organizer_id = p_from_organizer_id
      AND requester_id IN (
          SELECT requester_id
          FROM public.organizer_claim_requests
          WHERE organizer_id = p_into_organizer_id
      );

    UPDATE public.organizer_claim_requests
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

    SELECT *
    INTO v_draft
    FROM public.event_drafts
    WHERE id = p_draft_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Draft not found';
    END IF;

    IF v_draft.review_status <> 'pending' THEN
        RAISE EXCEPTION 'Draft has already been reviewed';
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
        CASE
            WHEN v_draft.organizer_id IS NULL THEN v_draft.proposed_organizer_name
            ELSE NULL
        END,
        p_publish
    )
    RETURNING id INTO v_event_id;

    UPDATE public.event_drafts
    SET review_status = 'approved',
        approved_event_id = v_event_id,
        reviewed_by = auth.uid(),
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_draft_id;

    UPDATE public.events
    SET imported_from_draft_id = p_draft_id
    WHERE id = v_event_id;

    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
--  8. VIEWOVI ZA ADMIN RAD
-- ============================================================

DROP VIEW IF EXISTS public.v_event_draft_review_queue CASCADE;
CREATE VIEW public.v_event_draft_review_queue AS
SELECT
    d.id,
    d.source_type,
    d.review_status,
    d.source_url,
    d.source_label,
    d.title,
    d.category,
    d.city,
    d.location_name,
    d.starts_at,
    d.ends_at,
    d.proposed_organizer_name,
    d.proposed_organizer_instagram,
    d.proposed_venue_name,
    d.ai_confidence,
    d.created_at,
    d.submitted_by,
    p.username AS submitted_by_username,
    d.organizer_id,
    o.name AS organizer_name,
    o.status AS organizer_status
FROM public.event_drafts d
LEFT JOIN public.profiles p ON p.id = d.submitted_by
LEFT JOIN public.organizers o ON o.id = d.organizer_id
WHERE d.review_status = 'pending'
ORDER BY d.created_at DESC;

DROP VIEW IF EXISTS public.v_organizer_possible_matches CASCADE;
CREATE VIEW public.v_organizer_possible_matches AS
SELECT
    a.id AS organizer_id,
    a.name AS organizer_name,
    a.city AS organizer_city,
    b.id AS possible_match_id,
    b.name AS possible_match_name,
    b.city AS possible_match_city,
    a.instagram_handle AS organizer_instagram,
    b.instagram_handle AS possible_match_instagram,
    CASE
        WHEN a.instagram_handle IS NOT NULL AND a.instagram_handle = b.instagram_handle THEN 1.000
        WHEN a.website_url IS NOT NULL AND a.website_url = b.website_url THEN 0.980
        WHEN a.normalized_name IS NOT NULL AND a.normalized_name = b.normalized_name
             AND COALESCE(a.city, '') = COALESCE(b.city, '') THEN 0.950
        WHEN a.normalized_name IS NOT NULL AND a.normalized_name = b.normalized_name THEN 0.900
        ELSE 0.700
    END AS match_score
FROM public.organizers a
JOIN public.organizers b
  ON a.id <> b.id
 AND a.status != 'merged'
 AND b.status != 'merged'
 AND (
      (a.instagram_handle IS NOT NULL AND a.instagram_handle = b.instagram_handle)
   OR (a.website_url IS NOT NULL AND a.website_url = b.website_url)
   OR (a.normalized_name IS NOT NULL AND a.normalized_name = b.normalized_name)
 )
WHERE a.id < b.id;
