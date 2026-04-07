# Keep / Rework Notes

Ovo nije lista "obrisati odmah", nego lista sta zadrzavamo za v1, a sta treba prepraviti pre pravog merged baseline-a.

## Zadrzati

- `chat_participants.hidden_at`
- `source_plan_id` logiku na `event_pair_plans`
- strozi `v_event_feed`
- storage path logiku za `event-photos`
- organizer claim / revoke / merge tok
- `plans` kao noviji read/write model za social tok

## Prepraviti pre pravog baseline-a

### 1. Venue vs Organizer

Definisati jednom zauvek:

- `venue` = fizicka lokacija
- `organizer` = brend / kolektiv / promoter / organizator

Frontend trenutno koristi unified adapter sloj, ali backend i UI nazivi nisu jos potpuno poravnati.

### 2. Invite vs Plan vs Event Pair Plan

Potrebno je jasno potvrditi:

- `invite` = trazim osobu/e za konkretan event
- `plan` = pravim sopstveni izlazak / drustveni plan
- `event_pair_plan` = dogovor dve osobe oko odlaska

### 3. Reports model

Reports su trenutno preopterecene istorijskim kolonama.
Za cist baseline ostaviti jedan canonical model:

- `entity_type`
- `entity_id`
- `reason`
- `message`
- `status`
- `reviewed_by`
- `reviewed_at`

### 4. RLS tightening

Posebno proveriti:

- `chats_insert`
- `chat_participants_insert`
- public visibility za reviews

### 5. Bootstrap order

Postojeci `1_supabase_schema.sql` istorijski nosi reference koje nisu idealno rasporedjene za potpuno cist bootstrap.
To je glavni razlog zasto jos nisam "slepo spojila sve u jedan fajl".

## Zakljucak

Za sada:

- stare fajlove cuvamo
- novi folder koristimo kao cist reset vodič

Za sledeci krug:

- pravimo pravi executable baseline iz ovih 4 celine
- tek tada prestajemo da se oslanjamo na istorijske patch-eve
