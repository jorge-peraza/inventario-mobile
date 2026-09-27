-- ── Usuarios de Bienes Inmuebles ─────────────────────────────────────────────
-- Pegar en el editor SQL de Supabase (proyecto de BIENES INMUEBLES).
-- Solo AGREGA una tabla y sus funciones: no toca `bienesinmuebles` ni ninguna
-- tabla que ya exista, y no borra ni cambia ningún registro.
--
-- El administrador de inmuebles da de alta a estas personas desde el sistema y
-- elige qué puede hacer cada una:
--   'consultar'  ve el inventario y descarga reportes, sin modificar nada
--   'editar'     lo mismo que el administrador, menos dar de alta usuarios
--
-- Igual que en usuarios.sql: la contraseña no se guarda, solo su hash bcrypt
-- calculado por la base; el navegador nunca lo recibe.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.usuarios_inmuebles (
  idusuario   bigserial   primary key,
  usuario     text        not null unique,
  nombre      text        not null,
  puesto      text,
  permiso     text        not null default 'consultar' check (permiso in ('consultar', 'editar')),
  activo      boolean     not null default true,
  clave_hash  text        not null,
  creado      timestamptz not null default now(),
  acceso      timestamptz
);

revoke all on public.usuarios_inmuebles from anon, authenticated;
revoke all on sequence public.usuarios_inmuebles_idusuario_seq from anon, authenticated;

create or replace function public.usuarios_inm_listar()
returns table (
  idusuario bigint, usuario text, nombre text, puesto text, permiso text,
  activo boolean, creado timestamptz, acceso timestamptz
)
language sql security definer set search_path = public, extensions as $$
  select idusuario, usuario, nombre, puesto, permiso, activo, creado, acceso
  from usuarios_inmuebles order by nombre;
$$;

create or replace function public.usuarios_inm_crear(
  p_usuario text, p_nombre text, p_puesto text, p_permiso text, p_clave text
) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare v_id bigint;
begin
  if length(coalesce(p_clave, '')) < 6 then
    raise exception 'La contraseña debe tener al menos 6 caracteres';
  end if;
  insert into usuarios_inmuebles (usuario, nombre, puesto, permiso, clave_hash)
  values (lower(trim(p_usuario)), p_nombre, nullif(trim(p_puesto), ''),
          coalesce(p_permiso, 'consultar'), crypt(p_clave, gen_salt('bf')))
  returning idusuario into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Ya existe un usuario con ese nombre de acceso';
end;
$$;

create or replace function public.usuarios_inm_editar(
  p_idusuario bigint, p_usuario text, p_nombre text, p_puesto text, p_permiso text, p_activo boolean
) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  update usuarios_inmuebles
     set usuario = lower(trim(p_usuario)),
         nombre  = p_nombre,
         puesto  = nullif(trim(p_puesto), ''),
         permiso = coalesce(p_permiso, 'consultar'),
         activo  = coalesce(p_activo, true)
   where idusuario = p_idusuario;
exception when unique_violation then
  raise exception 'Ya existe un usuario con ese nombre de acceso';
end;
$$;

create or replace function public.usuarios_inm_clave(p_idusuario bigint, p_clave text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if length(coalesce(p_clave, '')) < 6 then
    raise exception 'La contraseña debe tener al menos 6 caracteres';
  end if;
  update usuarios_inmuebles set clave_hash = crypt(p_clave, gen_salt('bf'))
   where idusuario = p_idusuario;
end;
$$;

create or replace function public.usuarios_inm_borrar(p_idusuario bigint)
returns void
language sql security definer set search_path = public, extensions as $$
  delete from usuarios_inmuebles where idusuario = p_idusuario;
$$;

-- Devuelve vacío si no coincide o si la cuenta está desactivada
create or replace function public.usuarios_inm_verificar(p_usuario text, p_clave text)
returns table (idusuario bigint, usuario text, nombre text, puesto text, permiso text)
language plpgsql security definer set search_path = public, extensions as $$
begin
  update usuarios_inmuebles u set acceso = now()
   where u.usuario = lower(trim(p_usuario)) and u.activo
     and u.clave_hash = crypt(p_clave, u.clave_hash);
  return query
    select u.idusuario, u.usuario, u.nombre, u.puesto, u.permiso
      from usuarios_inmuebles u
     where u.usuario = lower(trim(p_usuario)) and u.activo
       and u.clave_hash = crypt(p_clave, u.clave_hash);
end;
$$;

grant execute on function
  public.usuarios_inm_listar(),
  public.usuarios_inm_crear(text, text, text, text, text),
  public.usuarios_inm_editar(bigint, text, text, text, text, boolean),
  public.usuarios_inm_clave(bigint, text),
  public.usuarios_inm_borrar(bigint),
  public.usuarios_inm_verificar(text, text)
to anon, authenticated;
