# Merge Plan

## Ugraditi u novi baseline

- `29_supabase_v1_baseline_hardening_patch.sql`
  - hardening oko signup i sigurnijeg baseline ponasanja

- `30_admin_role_lockdown.sql`
  - admin ne sme da nastane iz signup metadata
  - privilegovana polja profila ostaju zakljucana
  - admin helper funkcije ostaju u cistom baseline-u

- `31_close_account_patch.sql`
  - `close_my_account()` treba da bude deo cistog baseline-a

- `32_profile_visibility_patch.sql`
  - `profile_visibility`
  - javni/registered profil pristup

- `33_event_integrity_patch.sql`
  - attendee_count sync
  - chat indeks
  - plans/public selekcija i merge cleanup

- `35_birth_year_profile_patch.sql`
  - `birth_year`
  - reset pri close account

- `36_profile_preferences_patch.sql`
  - `interests`
  - `social_tempo`
  - reset pri close account

## Ne ugradjivati kao trajni baseline

- `34_backfill_orphan_admin_events_to_ghost_organizers.sql`
  - ovo je data cleanup za stare orphan evente
  - cuva se kao poseban alat ako ikad bude trebala migracija sa starog projekta

## Napomena

Ako se tokom konsolidacije otkrije da je neka izmena vec rucno ugradjena u `v1-baseline`, ne treba je duplirati. Cilj je novi cist baseline bez istorijskih slojeva, ne mehanicko kopiranje svega dva puta.
