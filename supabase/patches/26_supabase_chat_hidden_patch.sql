ALTER TABLE public.chat_participants
    ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;
