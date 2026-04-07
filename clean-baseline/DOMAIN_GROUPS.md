# Healthier Domain Groups

Postojeci SQL sloj prirodno se raspada na 4 manje celine.

## 1. Identity + Core Events

Ovde spadaju:

- auth -> profiles
- roles / capabilities
- venues
- events
- follows / blocks
- osnovni public feed

Glavni fajlovi:

- `schema/1_supabase_schema.sql`
- `schema/3_supabase_final.sql`
- `patches/7_supabase_profiles_patch.sql`
- `patches/8_supabase_auth_signup_patch.sql`
- `patches/14_supabase_venue_rating_patch.sql`
- `patches/16_supabase_event_cover_url_patch.sql`
- `patches/28_supabase_signup_and_event_feed_cleanup.sql`

## 2. Social Coordination

Ovde spadaju:

- invites
- plans
- invite applications
- chats / chat participants / messages
- event_pair_plans
- review_tasks
- peer_reviews / event_reviews
- hidden chat logika

Glavni fajlovi:

- `patches/9_supabase_social_patch.sql`
- `patches/12_supabase_free_tier_guards.sql`
- `patches/13_supabase_invite_vibes_patch.sql`
- `patches/17_supabase_event_pair_plans_patch.sql`
- `patches/18_supabase_review_tasks_patch.sql`
- `patches/19_supabase_blocking_and_review_sync_patch.sql`
- `patches/20_supabase_reviews_patch.sql`
- `patches/22_supabase_plans_patch.sql`
- `patches/23_supabase_event_pair_plan_source_plan_patch.sql`
- `patches/24_supabase_review_sync_from_source_plan_patch.sql`
- `patches/25_supabase_event_pair_plan_uniqueness_patch.sql`
- `patches/26_supabase_chat_hidden_patch.sql`

## 3. Organizers + Drafts

Ovde spadaju:

- organizers
- organizer claims
- event drafts
- organizer revoke / merge / approve tokovi
- organizer event ownership

Glavni fajlovi:

- `schema/4_supabase_organizers.sql`
- `patches/6_supabase_organizers_patch.sql`
- `patches/21_supabase_organizer_revoke_patch.sql`

## 4. Moderation + Notifications + Media

Ovde spadaju:

- reports
- moderation_items
- admin_notes
- soft hide
- notifications
- event photos storage / select / delete policy

Glavni fajlovi:

- `schema/5_supabase_moderation.sql`
- `patches/10_supabase_notifications_patch.sql`
- `patches/15_supabase_event_photos_rls_patch.sql`
- `patches/27_supabase_event_photos_storage_policy_fix.sql`

## Glavna ideja za v1 baseline

Kad budemo pravili pravi consolidated baseline, cilj nije "jedan ogroman fajl", nego:

1. `01_identity_events.sql`
2. `02_social_reviews.sql`
3. `03_organizers_drafts.sql`
4. `04_moderation_notifications_media.sql`

To je dovoljno malo da ostane citljivo, a dovoljno veliko da se ne raspadne na 20 zakrpa.
