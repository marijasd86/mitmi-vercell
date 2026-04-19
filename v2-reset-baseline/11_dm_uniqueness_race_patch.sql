-- ============================================================
-- Patch 11: DM uniqueness + race hardening
-- Cilj:
-- - spreciti duple "direct" chatove za isti par korisnika
-- - uciniti create_or_get_dm otpornim na race uslove
-- ============================================================

ALTER TABLE public.chats
    ADD COLUMN IF NOT EXISTS direct_pair_key TEXT;

-- Backfill direct pair key for existing direct chats.
WITH direct_pairs AS (
    SELECT
        c.id,
        c.created_at,
        array_agg(DISTINCT cp.user_id::TEXT ORDER BY cp.user_id::TEXT) AS users
    FROM public.chats c
    JOIN public.chat_participants cp ON cp.chat_id = c.id
    WHERE c.chat_type = 'direct'
      AND c.event_id IS NULL
    GROUP BY c.id, c.created_at
),
normalized AS (
    SELECT
        id,
        created_at,
        CASE
            WHEN array_length(users, 1) = 2 THEN users[1] || ':' || users[2]
            ELSE NULL
        END AS pair_key
    FROM direct_pairs
),
ranked AS (
    SELECT
        id,
        pair_key,
        ROW_NUMBER() OVER (
            PARTITION BY pair_key
            ORDER BY created_at ASC, id ASC
        ) AS rn
    FROM normalized
    WHERE pair_key IS NOT NULL
)
UPDATE public.chats c
SET direct_pair_key = CASE WHEN r.rn = 1 THEN r.pair_key ELSE NULL END
FROM ranked r
WHERE c.id = r.id;

-- For malformed direct chats (not exactly 2 participants), keep pair key empty.
UPDATE public.chats c
SET direct_pair_key = NULL
WHERE c.chat_type = 'direct'
  AND c.event_id IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.chat_participants cp
      WHERE cp.chat_id = c.id
      GROUP BY cp.chat_id
      HAVING COUNT(DISTINCT cp.user_id) = 2
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_direct_pair_key_unique
    ON public.chats(direct_pair_key)
    WHERE chat_type = 'direct'
      AND event_id IS NULL
      AND direct_pair_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_or_get_dm(other_user_id UUID)
RETURNS UUID AS $$
DECLARE
    existing_chat_id UUID;
    new_chat_id UUID;
    me UUID := auth.uid();
    v_pair_key TEXT;
BEGIN
    IF me IS NULL OR other_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF me = other_user_id THEN
        RAISE EXCEPTION 'Cannot create DM with yourself';
    END IF;

    IF public.is_blocked(me, other_user_id) THEN
        RAISE EXCEPTION 'DM nije dostupan između blokiranih korisnika';
    END IF;

    v_pair_key := LEAST(me::TEXT, other_user_id::TEXT) || ':' || GREATEST(me::TEXT, other_user_id::TEXT);

    -- Serialize same-pair creation attempts within transaction.
    PERFORM pg_advisory_xact_lock(hashtext(v_pair_key));

    SELECT c.id INTO existing_chat_id
    FROM public.chats c
    WHERE c.chat_type = 'direct'
      AND c.event_id IS NULL
      AND c.direct_pair_key = v_pair_key
    LIMIT 1;

    IF existing_chat_id IS NOT NULL THEN
        RETURN existing_chat_id;
    END IF;

    INSERT INTO public.chats (chat_type, created_by, direct_pair_key)
    VALUES ('direct', me, v_pair_key)
    RETURNING id INTO new_chat_id;

    INSERT INTO public.chat_participants (chat_id, user_id)
    VALUES (new_chat_id, me), (new_chat_id, other_user_id)
    ON CONFLICT (chat_id, user_id) DO NOTHING;

    RETURN new_chat_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
