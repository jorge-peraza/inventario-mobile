-- ── Logos de los reportes de BIENES INMUEBLES ────────────────────────────────
-- Pegar en el editor SQL de Supabase (proyecto de BIENES INMUEBLES).
-- Solo agrega una tabla: no toca `bienesinmuebles` ni ninguna existente.
--
-- Es el gemelo de supabase/logos.sql, que va en el proyecto de bienes muebles.
-- Cada módulo guarda los suyos en su propia base, así que quien administra
-- inmuebles no le cambia los logos a los reportes de muebles ni al revés.
--
-- Si un logo no está en esta tabla se usa el que trae el programa de fábrica, o
-- sea que mientras no se cambie nada todo sigue viéndose igual.
--
-- OJO con los permisos, que aquí son distintos a los de muebles:
-- el administrador de inmuebles inicia sesión contra el proyecto de MUEBLES
-- (así está armado el login), así que en esta base la aplicación solo tiene la
-- llave pública (rol `anon`) y no hay sesión autenticada que exigir. Por eso
-- escribir queda abierto a `anon`, igual que ya lo está `bienesinmuebles`, que
-- se da de alta y se edita con esa misma llave. No es un permiso nuevo: es el
-- mismo nivel de acceso que ya tiene el resto de este proyecto.

create table if not exists public.configuracion (
  clave       text primary key,
  valor       text,
  actualizado timestamptz not null default now()
);

comment on table public.configuracion is
  'Ajustes del módulo de inmuebles. Los logos del encabezado viven aquí con las claves logo_ayuntamiento, logo_nogales y logo_mexico.';

alter table public.configuracion enable row level security;

drop policy if exists "configuracion lectura" on public.configuracion;
create policy "configuracion lectura" on public.configuracion
  for select to anon, authenticated using (true);

drop policy if exists "configuracion escritura" on public.configuracion;
create policy "configuracion escritura" on public.configuracion
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.configuracion to anon, authenticated;

-- Deja constancia de cuándo se cambió cada cosa
create or replace function public.configuracion_toca()
returns trigger language plpgsql as $$
begin
  new.actualizado := now();
  return new;
end $$;

drop trigger if exists configuracion_toca on public.configuracion;
create trigger configuracion_toca before update on public.configuracion
  for each row execute function public.configuracion_toca();
