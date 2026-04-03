-- ============================================================
-- mitmi - Free tier guards
-- Cilj:
-- 1. ograniciti broj dodatnih slika po dogadjaju
-- 2. ograniciti broj aktivnih poziva po korisniku
-- 3. ograniciti burst poruka u kratkom periodu
-- Idempotentno: moze da se pusti vise puta
-- ============================================================

-- ------------------------------------------------------------
-- 1. Max 3 dodatne slike po dogadjaju
-- ------------------------------------------------------------
create or replace function public.enforce_event_photo_limit()
returns trigger
language plpgsql
as $$
declare
  existing_count integer;
begin
  select count(*)
    into existing_count
  from public.event_photos
  where event_id = new.event_id;

  if existing_count >= 3 then
    raise exception 'Dozvoljene su najvise 3 dodatne slike po dogadjaju.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_event_photo_limit on public.event_photos;
create trigger trg_event_photo_limit
before insert on public.event_photos
for each row
execute function public.enforce_event_photo_limit();


-- ------------------------------------------------------------
-- 2. Max 5 otvorenih poziva po korisniku
-- ------------------------------------------------------------
create or replace function public.enforce_open_invite_limit()
returns trigger
language plpgsql
as $$
declare
  open_invites integer;
begin
  if coalesce(new.status, 'open') <> 'open' then
    return new;
  end if;

  select count(*)
    into open_invites
  from public.invites
  where creator_id = new.creator_id
    and status = 'open'
    and (tg_op = 'INSERT' or id <> new.id);

  if open_invites >= 5 then
    raise exception 'Mozes imati najvise 5 aktivnih poziva u isto vreme.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_open_invite_limit on public.invites;
create trigger trg_open_invite_limit
before insert or update on public.invites
for each row
execute function public.enforce_open_invite_limit();


-- ------------------------------------------------------------
-- 3. Burst limit poruka: max 25 poruka po minuti po korisniku
-- ------------------------------------------------------------
create or replace function public.enforce_message_burst_limit()
returns trigger
language plpgsql
as $$
declare
  recent_messages integer;
begin
  select count(*)
    into recent_messages
  from public.messages
  where sender_id = new.sender_id
    and created_at > (now() - interval '1 minute');

  if recent_messages >= 25 then
    raise exception 'Prebrzo saljes poruke. Sacekaj malo pa pokusaj ponovo.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_message_burst_limit on public.messages;
create trigger trg_message_burst_limit
before insert on public.messages
for each row
execute function public.enforce_message_burst_limit();
