# MITMI Supabase v1 Baseline

Ovo je novi kandidat za **zdraviji executable baseline** za fresh Supabase projekat.

Za razliku od istorijskih `schema/` + `patches/` fajlova, ovde je logika spojena u 4 vece celine:

1. `01_identity_events.sql`
2. `02_organizers_drafts.sql`
3. `03_social_reviews.sql`
4. `04_moderation_notifications_media.sql`

## Odluke koje su ovde namerno presečene

- `venue` = fizicka lokacija
- `organizer` = brend / kolektiv / promoter / organizator
- gost moze da vidi:
  - javne evente
  - aktivne profile
- `reports` koriste jedan canonical model:
  - `entity_type`
  - `entity_id`
  - `reason`
  - `message`
  - `status`
  - `reviewed_by`
  - `reviewed_at`
- `plans` dolaze tek posle `organizers`, tako da bootstrap vise ne puca na FK

## Vazno

Ovo je novi baseline kandidat za **nov projekat**.
Ne pustaj ga preko postojeceg, vec resetovanog Supabase okruzenja bez dodatne provere.

## Redosled

Pokreni redom:

1. `supabase/v1-baseline/01_identity_events.sql`
2. `supabase/v1-baseline/02_organizers_drafts.sql`
3. `supabase/v1-baseline/03_social_reviews.sql`
4. `supabase/v1-baseline/04_moderation_notifications_media.sql`
