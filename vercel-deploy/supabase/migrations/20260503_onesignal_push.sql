create table if not exists public.push_notification_logs (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor_id uuid null,
  recipient_ids uuid[] not null default '{}',
  payload jsonb not null default '{}'::jsonb,
  onesignal_response jsonb null,
  status text not null default 'queued',
  created_at timestamptz not null default now()
);

create index if not exists push_notification_logs_created_at_idx
  on public.push_notification_logs (created_at desc);

create index if not exists push_notification_logs_event_type_idx
  on public.push_notification_logs (event_type);

alter table public.push_notification_logs enable row level security;

-- only admins should inspect logs from dashboard/tools
drop policy if exists "push logs admin read" on public.push_notification_logs;
create policy "push logs admin read"
on public.push_notification_logs
for select
using (coalesce((auth.jwt() ->> 'role') = 'admin', false));

revoke all on public.push_notification_logs from anon, authenticated;
