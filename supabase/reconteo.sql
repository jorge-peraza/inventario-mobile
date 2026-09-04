-- ── Reconteo físico ──────────────────────────────────────────────────────────
-- Pegar tal cual en el editor SQL de Supabase (proyecto de bienes muebles).
-- Solo agrega tablas nuevas: no toca `bienes` ni ninguna de las que ya existen.
--
-- Mientras se cuenta, el teléfono sigue mandando: la lista y las marcas viven
-- en el equipo, que es lo que hace que funcione sin señal en una bodega. Estas
-- tablas son el respaldo y el historial compartido: al terminar el reconteo se
-- sube completo y ya se puede consultar desde cualquier teléfono y desde la
-- computadora.

-- Un reconteo: el conteo de un área en una fecha.
create table if not exists public.reconteos (
  idreconteo    text        primary key,   -- el mismo id que generó el teléfono
  idarea        integer     not null,
  nombrearea    text,
  dependencia   text,
  usuario       text,
  inicio        timestamptz not null default now(),
  fin           timestamptz,
  -- Cuántos bienes decía la base que había en el área al abrir el conteo. Se
  -- guarda aparte porque después los bienes se mueven y el reconteo tiene que
  -- seguir diciendo lo que se contó ese día.
  esperados     integer     not null default 0,
  encontrados   integer     not null default 0
);

create index if not exists reconteos_area_idx on public.reconteos (idarea, inicio desc);

-- Un renglón por bien del área: si apareció, cuándo y cómo.
create table if not exists public.reconteo_bienes (
  idreconteo    text        not null references public.reconteos (idreconteo) on delete cascade,
  idbien        integer     not null,
  -- La clave que tenía al momento del conteo. Es la que va impresa en la
  -- etiqueta con el QR, y puede cambiar después: un traspaso reasigna clave.
  clave         text        not null,
  nombre        text,
  resguardante  text,
  encontrado    boolean     not null default false,
  -- 'qr' cuando se leyó la etiqueta, 'manual' cuando se marcó a mano porque la
  -- etiqueta estaba rota o el bien todavía no está etiquetado.
  metodo        text,
  fecha         timestamptz,
  observacion   text,
  primary key (idreconteo, idbien)
);

create index if not exists reconteo_bienes_clave_idx on public.reconteo_bienes (clave);

-- Códigos leídos que no pertenecían al área: el hallazgo más útil de un
-- reconteo, un bien que aparece donde no debería estar.
create table if not exists public.reconteo_ajenos (
  idreconteo    text        not null references public.reconteos (idreconteo) on delete cascade,
  clave         text        not null,
  fecha         timestamptz not null default now(),
  primary key (idreconteo, clave)
);
