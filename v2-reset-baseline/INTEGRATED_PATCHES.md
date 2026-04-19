# Integrated Patch Audit

Ovaj fajl postoji da bi novi `v2-reset-baseline` bio jasan i proverljiv.

## Vec ugradjeno u nova 4 SQL fajla

### Patch 29
- hardening oko `handle_new_user()`
- `protect_profile_privileged_fields()`
- tvrdje admin provere u organizer i moderation funkcijama
- hardened `plans_public_select`
- hardened review/moderation funkcije

Napomena:
- sadrzaj iz patch-a 29 je vec rasporedjen kroz `01`, `02`, `03` i `04`

### Patch 30
- admin role lockdown
- `profiles_self_update_safe`
- `profiles_admin_update`
- `grant_admin_role()`
- `revoke_admin_role()`

Vec prisutno u:
- `01_identity_events.sql`

### Patch 31
- `close_my_account()`

Vec prisutno u:
- `01_identity_events.sql`

### Patch 32
- `profile_visibility`
- `profiles_public_select` logika

Vec prisutno u:
- `01_identity_events.sql`

### Patch 33
- `idx_messages_chat_created_at`
- `sync_event_attendee_count_from_follows()`
- hardened `plans_public_select`
- `merge_organizers()` cleanup `claimed_by_profile_id`

Vec prisutno u:
- `02_organizers_drafts.sql`
- `03_social_reviews.sql`

### Patch 35
- `birth_year`
- `profiles_birth_year_check`
- `close_my_account()` reset `birth_year`

Vec prisutno u:
- `01_identity_events.sql`

### Patch 36
- `interests`
- `social_tempo`
- `profiles_social_tempo_check`
- `close_my_account()` reset preferences

Vec prisutno u:
- `01_identity_events.sql`

## Ostaje van cistog baseline-a

### Patch 34
- `34_backfill_orphan_admin_events_to_ghost_organizers.sql`

Razlog:
- ovo je data backfill za stare orphan evente
- nije schema/policy osnova za nov projekat

## Zakljucak

`v2-reset-baseline` trenutno moze da se tretira kao:
- novi cist schema start
- bez potrebe da se na novom projektu pusta istorijski niz patch-eva 29-36
- osim ako se posle otkrije neka nova delta izmena
