-- Diminutif du club (ex. « SCB » pour SC Bernay) : affiché à la place du nom complet quand la place manque.
-- Modifié par le bureau du club, comme le nom (règle clubs_update existante).
alter table public.clubs add column if not exists short_name text;
alter table public.clubs drop constraint if exists clubs_short_name_len;
alter table public.clubs add constraint clubs_short_name_len check (short_name is null or char_length(btrim(short_name)) between 1 and 8);
-- Le bureau ne modifie que certaines colonnes du club (nom, réglages, début de saison) : on y ajoute le diminutif
grant update (short_name) on public.clubs to authenticated;
