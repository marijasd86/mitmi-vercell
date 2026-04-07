# Fresh Project Run Order

Ovo je preporuceni redosled za **nov Supabase projekat**.

## 1. Base schema

Pokreni redom:

1. `supabase/schema/1_supabase_schema.sql`
2. `supabase/schema/3_supabase_final.sql`
3. `supabase/schema/4_supabase_organizers.sql`
4. `supabase/schema/5_supabase_moderation.sql`

## 2. Relevant patches za v1

Ovo su patch-evi koje zadrzavamo kao relevantne za trenutno stanje aplikacije:

1. `supabase/patches/6_supabase_organizers_patch.sql`
2. `supabase/patches/7_supabase_profiles_patch.sql`
3. `supabase/patches/8_supabase_auth_signup_patch.sql`
4. `supabase/patches/9_supabase_social_patch.sql`
5. `supabase/patches/10_supabase_notifications_patch.sql`
6. `supabase/patches/11_supabase_profile_gender_patch.sql`
7. `supabase/patches/12_supabase_free_tier_guards.sql`
8. `supabase/patches/13_supabase_invite_vibes_patch.sql`
9. `supabase/patches/14_supabase_venue_rating_patch.sql`
10. `supabase/patches/15_supabase_event_photos_rls_patch.sql`
11. `supabase/patches/16_supabase_event_cover_url_patch.sql`
12. `supabase/patches/17_supabase_event_pair_plans_patch.sql`
13. `supabase/patches/18_supabase_review_tasks_patch.sql`
14. `supabase/patches/19_supabase_blocking_and_review_sync_patch.sql`
15. `supabase/patches/20_supabase_reviews_patch.sql`
16. `supabase/patches/21_supabase_organizer_revoke_patch.sql`
17. `supabase/patches/22_supabase_plans_patch.sql`
18. `supabase/patches/23_supabase_event_pair_plan_source_plan_patch.sql`
19. `supabase/patches/24_supabase_review_sync_from_source_plan_patch.sql`
20. `supabase/patches/25_supabase_event_pair_plan_uniqueness_patch.sql`
21. `supabase/patches/26_supabase_chat_hidden_patch.sql`
22. `supabase/patches/27_supabase_event_photos_storage_policy_fix.sql`
23. `supabase/patches/28_supabase_signup_and_event_feed_cleanup.sql`

## 3. Sta ne bih vise pustala naslepo

Oprez sa slepim ponovnim pustanjem bilo cega sto je:

- test/admin-promote varijanta
- parcijalni backfill koji je samo sanirao staro stanje
- alternativna verzija istog view-a ili triggera bez provere finalnog efekta

## 4. Vazna napomena

Ovaj run order je **kurirani reset plan**, ne znaci da je migracioni sloj vec savrseno konsolidovan.

Ako hoces potpuno zdrav bootstrap bez istorijskih patch-eva, sledeci korak je pravljenje
pravog merged baseline-a iz ovih fajlova.
