-- ═══════════════════════════════════════════════════════════════════════════
-- TODO EN LA BASE — proyecto de BIENES MUEBLES
-- Pegar completo en el editor SQL de Supabase y darle Run. Una sola vez.
--
-- Es ADITIVO: solo agrega columnas y tablas. No modifica, no borra y no
-- reescribe ningún dato existente. Se puede correr dos veces sin problema.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Bajas ────────────────────────────────────────────────────────────────
-- Las fechas de solicitud y de confirmación vivían en el navegador del
-- administrador: desde otro equipo el reporte de bajas salía sin fechas.
alter table public.bienes add column if not exists fecha_solicitud_baja date;
alter table public.bienes add column if not exists fecha_baja           date;
alter table public.bienes add column if not exists oficio_baja          text;

-- ── 2. Encargado (titular) de cada dependencia ──────────────────────────────
alter table public.dependencias add column if not exists encargado        text;
alter table public.dependencias add column if not exists puesto_encargado text;

-- ── 3. Reportes personalizados ──────────────────────────────────────────────
-- Antes se guardaban en el user_metadata de la cuenta: eso no sale en un
-- respaldo de la base ni se puede exportar a otro sistema.
create table if not exists public.reportes_personalizados (
  idreporte   text        primary key,      -- el mismo id que genera la app
  usuario     text,                         -- quién lo creó
  titulo      text        not null,
  config      jsonb       not null,         -- modos y columnas elegidas
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index if not exists reportes_personalizados_usuario_idx
  on public.reportes_personalizados (usuario);

-- ── 4. Historial de reconteo (el del celular) ───────────────────────────────
-- Si ya corriste supabase/reconteo.sql, este bloque no hace nada.
create table if not exists public.reconteos (
  idreconteo  text        primary key,
  idarea      integer,
  nombrearea  text,
  dependencia text,
  usuario     text,
  inicio      timestamptz not null default now(),
  fin         timestamptz,
  esperados   integer     not null default 0,
  encontrados integer     not null default 0
);

create table if not exists public.reconteo_bienes (
  idreconteo   text    not null references public.reconteos (idreconteo) on delete cascade,
  idbien       integer not null,
  clave        text,
  nombre       text,
  resguardante text,
  encontrado   boolean not null default false,
  metodo       text,
  fecha        timestamptz,
  observacion  text,
  primary key (idreconteo, idbien)
);

create table if not exists public.reconteo_ajenos (
  idreconteo text not null references public.reconteos (idreconteo) on delete cascade,
  clave      text not null,
  fecha      timestamptz,
  primary key (idreconteo, clave)
);

create index if not exists reconteos_area_idx          on public.reconteos (idarea, inicio desc);
create index if not exists reconteo_bienes_recont_idx  on public.reconteo_bienes (idreconteo);

-- ── 5. Permisos ─────────────────────────────────────────────────────────────
-- La app entra con la llave pública (anon), igual que con el resto de tablas.
grant select, insert, update, delete on public.reportes_personalizados to anon, authenticated;
grant select, insert, update, delete on public.reconteos              to anon, authenticated;
grant select, insert, update, delete on public.reconteo_bienes        to anon, authenticated;
grant select, insert, update, delete on public.reconteo_ajenos        to anon, authenticated;

-- Las tablas nuevas nacen con RLS activado y SIN reglas, y así Supabase bloquea
-- todo (error 42501 al guardar). Se les da el mismo acceso que ya tiene el
-- resto de la base. Sin esto, el reconteo y los reportes personalizados no
-- pueden escribir.
alter table public.reportes_personalizados enable row level security;
alter table public.reconteos               enable row level security;
alter table public.reconteo_bienes         enable row level security;
alter table public.reconteo_ajenos         enable row level security;

drop policy if exists acceso_app on public.reportes_personalizados;
drop policy if exists acceso_app on public.reconteos;
drop policy if exists acceso_app on public.reconteo_bienes;
drop policy if exists acceso_app on public.reconteo_ajenos;

create policy acceso_app on public.reportes_personalizados
  for all to anon, authenticated using (true) with check (true);
create policy acceso_app on public.reconteos
  for all to anon, authenticated using (true) with check (true);
create policy acceso_app on public.reconteo_bienes
  for all to anon, authenticated using (true) with check (true);
create policy acceso_app on public.reconteo_ajenos
  for all to anon, authenticated using (true) with check (true);

-- ── 6. Índices de consulta (opcional, solo hacen más rápida la app) ─────────
-- No cambian ningún dato. Si tarda, es porque está leyendo las 17,858 filas.
create index if not exists bienes_estado_idx  on public.bienes (estadobien);
create index if not exists bienes_area_idx    on public.bienes (idarea);
create index if not exists bienes_clave_idx   on public.bienes (claveinventario);

-- ── 7. Comprobación ─────────────────────────────────────────────────────────
-- Debe devolver 8 renglones, todos en 'listo'.
select 'bienes.fecha_solicitud_baja' as objeto,
       case when exists (select 1 from information_schema.columns
         where table_name='bienes' and column_name='fecha_solicitud_baja')
       then 'listo' else 'FALTA' end as estado
union all select 'bienes.fecha_baja',
       case when exists (select 1 from information_schema.columns
         where table_name='bienes' and column_name='fecha_baja') then 'listo' else 'FALTA' end
union all select 'bienes.oficio_baja',
       case when exists (select 1 from information_schema.columns
         where table_name='bienes' and column_name='oficio_baja') then 'listo' else 'FALTA' end
union all select 'dependencias.encargado',
       case when exists (select 1 from information_schema.columns
         where table_name='dependencias' and column_name='encargado') then 'listo' else 'FALTA' end
union all select 'dependencias.puesto_encargado',
       case when exists (select 1 from information_schema.columns
         where table_name='dependencias' and column_name='puesto_encargado') then 'listo' else 'FALTA' end
union all select 'tabla reportes_personalizados',
       case when to_regclass('public.reportes_personalizados') is null then 'FALTA' else 'listo' end
union all select 'tabla reconteos',
       case when to_regclass('public.reconteos') is null then 'FALTA' else 'listo' end
union all select 'tabla reconteo_bienes',
       case when to_regclass('public.reconteo_bienes') is null then 'FALTA' else 'listo' end;
