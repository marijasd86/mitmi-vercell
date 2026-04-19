ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS ticket_price_rsd INTEGER;

ALTER TABLE public.events
    DROP CONSTRAINT IF EXISTS events_ticket_price_nonnegative;

ALTER TABLE public.events
    ADD CONSTRAINT events_ticket_price_nonnegative
    CHECK (ticket_price_rsd IS NULL OR ticket_price_rsd >= 0);
