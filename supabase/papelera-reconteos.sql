-- ── Papelera de reconteos ───────────────────────────────────────────────────
-- Pegar en el editor SQL de Supabase (proyecto de BIENES MUEBLES).
--
-- Solo AGREGA una columna a `reconteos`: no borra ni cambia ningún registro.
-- Quitar un reconteo del historial ya no lo borra: le pone la fecha en que se
-- mandó a la papelera. Desde la Papelera se puede regresar al historial.
alter table public.reconteos add column if not exists en_papelera timestamptz;
