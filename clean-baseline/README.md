# Supabase Clean Baseline

Ovaj folder ne dira postojece istorijske schema/patch fajlove.

Njegova svrha je da:

1. svede postojece Supabase fajlove na manje logicke celine
2. da jasan redosled za novi, cist Supabase projekat
3. odvoji "sta nam stvarno treba za v1" od istorijskih zakrpa

## Zasto ovako

Postojeci `schema/` + `patches/` sloj radi, ali je vremenom narastao u previse medjuzavisnih korekcija.
To znaci da je za produkcijski reset zdravije prvo imati:

- jedan jasan run order
- jednu mapu domena
- jednu listu sta je "v1 potrebno", a sta je istorijski patch

Tek posle toga ima smisla napraviti pravi "merged executable baseline".

## Preporuka za novi Supabase projekat

Ako jos nema korisnika, preporuka je:

1. napravi nov Supabase projekat
2. pokreni fajlove po redosledu iz `RUN_ORDER.md`
3. stare `schema/` i `patches/` ostavi kao arhivu

## Sta je u ovom folderu

- `RUN_ORDER.md`
  - tacan redosled za fresh project
- `DOMAIN_GROUPS.md`
  - manje, zdravije logicke celine
- `KEEP_DROP_NOTES.md`
  - sta zadrzavamo za v1, a sta ne bih vise slepo nadogradjivala

## Sledeci pravi korak

Kad potvrdis da hoces bas potpuni reset, sledeci bezbedan korak je:

- napraviti jedan novi executable baseline folder, npr:
  - `supabase/v1-baseline/01_core.sql`
  - `supabase/v1-baseline/02_social.sql`
  - `supabase/v1-baseline/03_organizers.sql`
  - `supabase/v1-baseline/04_moderation.sql`

Ali to treba raditi pazljivo, da ne prenesemo stare regresije u "lepse upakovan" fajl.
