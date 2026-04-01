# Mitmi Project Structure

## Root overview

- Active web app: `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/vercel-deploy`
- Supabase files: `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/supabase`
- Documentation: `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/docs`
- Archived backups and old noise: `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/archive`

## Active frontend source

- Main deploy entry: `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/vercel-deploy/index.html`
- Main deploy config: `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/vercel-deploy/vercel.json`

## Frontend assets

- Base styles: `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/vercel-deploy/assets/styles/base.css`
- Page styles: `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/vercel-deploy/assets/styles/pages.css`

### Scripts

- Core runtime/navigation: `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/vercel-deploy/assets/scripts/core/runtime.js`
- Auth/session logic: `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/vercel-deploy/assets/scripts/auth/session.js`
- Events domain: `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/vercel-deploy/assets/scripts/domains/events.js`
- Chat domain: `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/vercel-deploy/assets/scripts/domains/chat.js`
- Discovery/swipe domain: `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/vercel-deploy/assets/scripts/domains/discovery.js`
- Integrations/uploads/notifications domain: `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/vercel-deploy/assets/scripts/domains/integrations.js`
- Bootstrap/init: `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/vercel-deploy/assets/scripts/bootstrap/init.js`

## Local backup copy

- Synced backup HTML: `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/archive/backups/index.html.html`

## Supabase SQL files

### Schema / base layers

- Base schema: `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/supabase/schema/1_supabase_schema.sql`
- Final schema extensions: `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/supabase/schema/3_supabase_final.sql`
- Organizer layer: `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/supabase/schema/4_supabase_organizers.sql`
- Moderation layer: `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/supabase/schema/5_supabase_moderation.sql`

### Patches

- Organizer patch: `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/supabase/patches/6_supabase_organizers_patch.sql`
- Profiles patch: `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/supabase/patches/7_supabase_profiles_patch.sql`
- Auth signup patch: `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/supabase/patches/8_supabase_auth_signup_patch.sql`
- Social patch: `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/supabase/patches/9_supabase_social_patch.sql`
- Notifications patch: `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/supabase/patches/10_supabase_notifications_patch.sql`

## Archived noise / historical files

- Historical root noise: `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/archive/root-noise`
- Browser test profiles: `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/archive/test-profiles`
- Backup copies: `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/archive/backups`

## Deploy reminder

If the Vercel project is connected to GitHub and uses `Root Directory = vercel-deploy`, the files that must be pushed for frontend changes are inside:

- `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/vercel-deploy`

For the current structure, frontend deploy changes usually include:

- `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/vercel-deploy/index.html`
- `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/vercel-deploy/assets/styles/base.css`
- `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/vercel-deploy/assets/styles/pages.css`
- `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/vercel-deploy/assets/scripts/core/runtime.js`
- `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/vercel-deploy/assets/scripts/auth/session.js`
- `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/vercel-deploy/assets/scripts/domains/events.js`
- `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/vercel-deploy/assets/scripts/domains/chat.js`
- `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/vercel-deploy/assets/scripts/domains/discovery.js`
- `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/vercel-deploy/assets/scripts/domains/integrations.js`
- `/Users/brankicamarjanovic/Desktop/za kcodex mitmi/vercel-deploy/assets/scripts/bootstrap/init.js`
