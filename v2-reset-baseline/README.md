# MITMI Supabase Reset Baseline

Ovaj folder je novi, cist radni prostor za konsolidovani Supabase reset.

Bitno:
- stari baseline je sacuvan netaknut u `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/supabase/v1-baseline`
- ovaj folder je napravljen kao pocetna kopija trenutnog najboljeg stanja
- ovde treba ugraditi trajne schema/policy/funkcijske promene iz patch-eva, ali bez istorijskog niza patch fajlova

Predvidjeni red pustanja na novom Supabase projektu:
1. `01_identity_events.sql`
2. `02_organizers_drafts.sql`
3. `03_social_reviews.sql`
4. `04_moderation_notifications_media.sql`

Ako je novi v2 projekat vec podignut i samo dodajes novu event tag logiku:
5. `05_event_tags_patch.sql`
6. `06_user_settings_patch.sql`
7. `07_event_ticket_price_patch.sql`
8. `08_event_public_address_patch.sql`
9. `09_events_permissions_alignment_patch.sql`
10. `10_approve_draft_data_integrity_patch.sql`
11. `11_dm_uniqueness_race_patch.sql`
12. `12_event_media_permissions_alignment_patch.sql`
13. `13_invites_legacy_lock_patch.sql`

Sta ulazi u novi cist baseline:
- hardening i admin lockdown
- close account logika
- profile visibility
- event integrity i attendee_count sync
- birth_year
- profile preferences (`interests`, `social_tempo`)
- organizer i venue public profile polja
- bezbedni public view-jevi:
  - `public.organizer_public_profiles`
  - `public.venue_public_profiles`

Sta ne treba ugradjivati kao trajni baseline:
- data backfill i jednokratne migracije nad starim podacima
- posebno:
  - `34_backfill_orphan_admin_events_to_ghost_organizers.sql`

Sledeci korak:
- proci kroz `MERGE_PLAN.md`
- svaku stavku ili ugraditi direktno u 4 glavna fajla
- ili eksplicitno oznaciti da ostaje van baseline-a

Napomena za frontend:
- postojeci frontend jos koristi deo starih organizer/venue polja
- novi public view-jevi su priprema za sledeci pass, da javni organizer profili ne zavise od cele tabele
