# Run Checklist For New Supabase Project

Pre pustanja:
- napravi novi Supabase projekat
- podesi auth site URL i redirect URL
- proveri storage bucket plan

Pusti redom:
1. `01_identity_events.sql`
2. `02_organizers_drafts.sql`
3. `03_social_reviews.sql`
4. `04_moderation_notifications_media.sql`

Ako si vec pustila 01-04 na novom v2 projektu i ne zelis reset:
5. `05_event_tags_patch.sql`
6. `06_user_settings_patch.sql`
7. `07_event_ticket_price_patch.sql`
8. `08_event_public_address_patch.sql`
9. `09_events_permissions_alignment_patch.sql`
10. `10_approve_draft_data_integrity_patch.sql`
11. `11_dm_uniqueness_race_patch.sql`
12. `12_event_media_permissions_alignment_patch.sql`
13. `13_invites_legacy_lock_patch.sql`

Posle pustanja:
- napravi prvi admin nalog rucno
- proveri register/login/logout
- proveri user onboarding
- proveri venue onboarding
- proveri profile privacy
- proveri event create i event detail
- proveri admin panel i orphan organizer tok
- proveri close account

Tek kad sve prodje:
- prevezi app na novi Supabase URL/key
- stari projekat ostavi kratko kao backup
