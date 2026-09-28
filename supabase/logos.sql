-- ── Logos de los reportes de BIENES MUEBLES ──────────────────────────────────
-- Pegar en el editor SQL de Supabase (proyecto de BIENES MUEBLES).
-- Solo agrega una tabla: no toca `bienes` ni ninguna existente.
--
-- Los tres logos del encabezado venían dentro del programa, así que cambiarlos
-- obligaba a volver a publicarlo. Aquí se guardan en la base para poder
-- cambiarlos desde la pantalla de Configuración.
--
-- Estos son SOLO los de los reportes de bienes muebles. Los de inmuebles viven
-- en la otra base y se instalan con supabase/logos-inmuebles.sql: así el
-- administrador de inmuebles no le cambia los logos a los reportes de muebles.
--
-- Si un logo no está en esta tabla se usa el que trae el programa de fábrica, o
-- sea que mientras no se cambie nada todo sigue viéndose igual.
--
-- La imagen se guarda como texto (data URL). Son tres archivos chicos y el
-- programa se los aprende al entrar, así que no se vuelven a pedir en toda la
-- sesión.

create table if not exists public.configuracion (
  clave       text primary key,
  valor       text,
  actualizado timestamptz not null default now()
);

comment on table public.configuracion is
  'Ajustes del sistema. Los logos del encabezado viven aquí con las claves logo_ayuntamiento, logo_nogales y logo_mexico.';

alter table public.configuracion enable row level security;

-- Leer: cualquiera que abra el sistema. Hace falta para que el reporte de una
-- dependencia salga con los mismos logos, y las dependencias entran con la
-- llave pública, sin sesión de Supabase Auth.
drop policy if exists "configuracion lectura" on public.configuracion;
create policy "configuracion lectura" on public.configuracion
  for select to anon, authenticated using (true);

-- Cambiar: solo las cuentas de Supabase Auth, que son las de los dos
-- administradores. Una dependencia no tiene sesión de Auth, así que aunque
-- llame al servicio a mano no puede reemplazar un logo.
drop policy if exists "configuracion escritura" on public.configuracion;
create policy "configuracion escritura" on public.configuracion
  for all to authenticated using (true) with check (true);

grant select on public.configuracion to anon;
grant select, insert, update, delete on public.configuracion to authenticated;

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
