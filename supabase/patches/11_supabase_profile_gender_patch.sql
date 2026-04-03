-- ============================================================
-- mitmi - Profile gender patch
-- Dodaje gender polje za fallback avatar logiku
-- Idempotentno: moze da se pusti vise puta
-- ============================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT 'unspecified';

UPDATE public.profiles
SET gender = 'unspecified'
WHERE gender IS NULL
   OR gender NOT IN ('female', 'male', 'unspecified');

DO $$
BEGIN
    ALTER TABLE public.profiles
        ADD CONSTRAINT profiles_gender_check
        CHECK (gender IN ('female', 'male', 'unspecified'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
