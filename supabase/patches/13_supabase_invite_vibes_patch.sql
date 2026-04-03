-- ============================================================
-- mitmi - Invite vibes
-- Dodaje jeftine, rule-based vibe tagove na invites
-- Idempotentno: moze da se pusti vise puta
-- ============================================================

alter table public.invites
  add column if not exists vibe_tags text[] not null default '{}';
