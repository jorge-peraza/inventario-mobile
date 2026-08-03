-- ============================================================
--  Módulo de BAJAS de bienes muebles
--  Aprovecha bienes.estadobien ('ACTIVO' | 'BAJA') para que el
--  bien desaparezca de la tabla al confirmar la baja.
-- ============================================================

-- 1) Tabla de bajas (registra el trámite)
create table if not exists public.bajas (
  idbaja             bigint generated always as identity primary key,
  idbien             bigint not null references public.bienes(idbien),
  estado             text not null default 'solicitud',   -- 'solicitud' | 'confirmada' | 'rechazada'
  numero_oficio      text,                                 -- solo se muestra en el reporte
  motivo             text,
  valoravaluo        numeric,                              -- opcional: solo si la baja es por avalúo
  solicitado_por     text,
  fecha_solicitud    timestamptz not null default now(),
  fecha_confirmacion timestamptz
);

create index if not exists idx_bajas_estado on public.bajas (estado);
create index if not exists idx_bajas_idbien on public.bajas (idbien);

-- (Demo) Sin RLS, igual que el resto del proyecto.
alter table public.bajas disable row level security;


-- 2) Solicitar baja: inserta el trámite. El bien SIGUE activo.
create or replace function public.solicitar_baja(
  p_idbien        bigint,
  p_numero_oficio text default null,
  p_motivo        text default null,
  p_valoravaluo   numeric default null,
  p_solicitado_por text default null
) returns bigint
language plpgsql
as $$
declare
  v_id bigint;
begin
  -- Evita duplicar una solicitud abierta para el mismo bien
  if exists (select 1 from public.bajas where idbien = p_idbien and estado = 'solicitud') then
    raise exception 'Ya existe una solicitud de baja pendiente para este bien';
  end if;

  insert into public.bajas (idbien, estado, numero_oficio, motivo, valoravaluo, solicitado_por)
  values (p_idbien, 'solicitud', p_numero_oficio, p_motivo, p_valoravaluo, p_solicitado_por)
  returning idbaja into v_id;

  return v_id;
end;
$$;


-- 3) Confirmar baja: marca la baja como confirmada Y pone el bien en 'BAJA'
--    (todo en una sola transacción atómica).
create or replace function public.confirmar_baja(p_idbaja bigint)
returns void
language plpgsql
as $$
declare
  v_idbien bigint;
begin
  select idbien into v_idbien from public.bajas where idbaja = p_idbaja and estado = 'solicitud';
  if v_idbien is null then
    raise exception 'La baja no existe o no está en estado de solicitud';
  end if;

  update public.bajas
     set estado = 'confirmada', fecha_confirmacion = now()
   where idbaja = p_idbaja;

  update public.bienes
     set estadobien = 'BAJA'
   where idbien = v_idbien;
end;
$$;


-- 4) Rechazar baja (opcional): descarta la solicitud, el bien sigue activo.
create or replace function public.rechazar_baja(p_idbaja bigint)
returns void
language plpgsql
as $$
begin
  update public.bajas
     set estado = 'rechazada'
   where idbaja = p_idbaja and estado = 'solicitud';
end;
$$;
