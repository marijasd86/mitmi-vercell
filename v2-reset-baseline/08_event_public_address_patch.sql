ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS public_address TEXT;
