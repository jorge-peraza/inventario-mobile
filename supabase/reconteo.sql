-- ── Reconteo físico ──────────────────────────────────────────────────────────
-- Pendiente de aplicar. Hoy la app móvil guarda el reconteo en el navegador del
-- equipo que cuenta: alcanza para levantarlo sin señal en una bodega, pero el
-- historial no se puede consultar desde otro dispositivo ni desde la
-- computadora. Estas dos tablas mueven ese historial a la base.
--
-- La forma de los datos es la misma que ya usa src/movil/reconteo.js, así que
-- al aplicarlas solo hay que cambiar de dónde lee y escribe ese archivo.

-- Un reconteo: el conteo de un área en una fecha.
create table if not exists public.reconteos (
  idreconteo    bigserial primary key,
  idarea        integer     not null,
  nombrearea    text,
  dependencia   text,
  usuario       text,
  inicio        timestamptz not null default now(),
  fin           timestamptz,
  -- Cuántos bienes decía la base que había en el área al abrir el conteo. Se
  -- guarda aparte porque después los bienes se mueven y el reconteo tiene que
  -- seguir diciendo lo que se contó ese día.
  esperados     integer     not null default 0
);

create index if not exists reconteos_area_idx on public.reconteos (idarea, inicio desc);

-- Un renglón por bien del área: si apareció, cuándo y cómo.
create table if not exists public.reconteo_bienes (
  idreconteo    bigint      not null references public.reconteos (idreconteo) on delete cascade,
  idbien        integer     not null,
  -- La clave que tenía al momento del conteo. Es la que va impresa en la
  -- etiqueta con el QR, y puede cambiar después (un traspaso reasigna clave).
  clave         text        not null,
  nombre        text,
  resguardante  text,
  encontrado    boolean     not null default false,
  -- 'qr' cuando se leyó la etiqueta, 'manual' cuando se marcó a mano porque la
  -- etiqueta estaba rota o el bien todavía no está etiquetado.
  metodo        text,
  fecha         timestamptz,
  primary key (idreconteo, idbien)
);

create index if not exists reconteo_bienes_clave_idx on public.reconteo_bienes (clave);

-- Códigos leídos que no pertenecían al área: el hallazgo más útil de un
-- reconteo, un bien que aparece donde no debería estar.
create table if not exists public.reconteo_ajenos (
  idreconteo    bigint      not null references public.reconteos (idreconteo) on delete cascade,
  clave         text        not null,
  fecha         timestamptz not null default now(),
  primary key (idreconteo, clave)
);
