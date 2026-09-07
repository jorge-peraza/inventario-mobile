-- ── Usuarios de dependencia ──────────────────────────────────────────────────
-- Pegar en el editor SQL de Supabase (proyecto de BIENES MUEBLES).
-- Solo agrega una tabla y sus funciones: no toca `bienes` ni ninguna existente.
--
-- Por qué una tabla propia y no Supabase Auth: dar de alta, borrar o cambiarle
-- la contraseña a otra persona requiere la llave de administrador del proyecto,
-- que no puede vivir en el navegador. Con esta tabla el administrador de bienes
-- muebles administra a las dependencias desde el sistema, sin esa llave.
--
-- La contraseña NO se guarda: se guarda su hash bcrypt, calculado por la base.
-- El navegador nunca recibe el hash —la tabla no es legible desde la app— y
-- todo pasa por las funciones de abajo.

-- pgcrypto vive en el esquema extensions en Supabase, por eso las funciones de
-- abajo llevan ese esquema en su search_path: si no, no encuentran crypt().
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.usuarios_dependencia (
  idusuario     bigserial   primary key,
  usuario       text        not null unique,   -- con el que inicia sesión
  nombre        text        not null,          -- nombre de la persona
  iddependencia integer     not null,
  puesto        text,
  activo        boolean     not null default true,
  clave_hash    text        not null,
  creado        timestamptz not null default now(),
  acceso        timestamptz                    -- último ingreso
);

create index if not exists usuarios_dependencia_dep_idx on public.usuarios_dependencia (iddependencia);

-- La app no lee ni escribe la tabla directamente: solo llama a estas funciones.
revoke all on public.usuarios_dependencia from anon, authenticated;
revoke all on sequence public.usuarios_dependencia_idusuario_seq from anon, authenticated;

-- ── Listar ───────────────────────────────────────────────────────────────────
-- Devuelve todo menos el hash. Es lo que ve la pantalla de Usuarios.
create or replace function public.usuarios_listar()
returns table (
  idusuario bigint, usuario text, nombre text, iddependencia integer,
  dependencia text, puesto text, activo boolean, creado timestamptz, acceso timestamptz
)
language sql security definer set search_path = public, extensions as $$
  select u.idusuario, u.usuario, u.nombre, u.iddependencia,
         d.nombredependencia::text, u.puesto, u.activo, u.creado, u.acceso
  from usuarios_dependencia u
  left join dependencias d on d.iddependencia = u.iddependencia
  order by u.nombre;
$$;

-- ── Alta ─────────────────────────────────────────────────────────────────────
create or replace function public.usuarios_crear(
  p_usuario text, p_nombre text, p_iddependencia integer, p_puesto text, p_clave text
) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare v_id bigint;
begin
  if length(coalesce(p_clave, '')) < 6 then
    raise exception 'La contraseña debe tener al menos 6 caracteres';
  end if;
  insert into usuarios_dependencia (usuario, nombre, iddependencia, puesto, clave_hash)
  values (lower(trim(p_usuario)), p_nombre, p_iddependencia, nullif(trim(p_puesto), ''),
          crypt(p_clave, gen_salt('bf')))
  returning idusuario into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Ya existe un usuario con ese nombre de acceso';
end;
$$;

-- ── Edición ──────────────────────────────────────────────────────────────────
create or replace function public.usuarios_editar(
  p_idusuario bigint, p_usuario text, p_nombre text, p_iddependencia integer,
  p_puesto text, p_activo boolean
) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  update usuarios_dependencia
     set usuario = lower(trim(p_usuario)),
         nombre = p_nombre,
         iddependencia = p_iddependencia,
         puesto = nullif(trim(p_puesto), ''),
         activo = coalesce(p_activo, true)
   where idusuario = p_idusuario;
exception when unique_violation then
  raise exception 'Ya existe un usuario con ese nombre de acceso';
end;
$$;

-- ── Contraseña nueva ─────────────────────────────────────────────────────────
create or replace function public.usuarios_clave(p_idusuario bigint, p_clave text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if length(coalesce(p_clave, '')) < 6 then
    raise exception 'La contraseña debe tener al menos 6 caracteres';
  end if;
  update usuarios_dependencia
     set clave_hash = crypt(p_clave, gen_salt('bf'))
   where idusuario = p_idusuario;
end;
$$;

-- ── Baja ─────────────────────────────────────────────────────────────────────
create or replace function public.usuarios_borrar(p_idusuario bigint)
returns void
language sql security definer set search_path = public, extensions as $$
  delete from usuarios_dependencia where idusuario = p_idusuario;
$$;

-- ── Ingreso ──────────────────────────────────────────────────────────────────
-- Compara contra el hash dentro de la base: la contraseña no se compara en el
-- navegador y el hash nunca sale de aquí. Devuelve vacío si no coincide o si
-- la cuenta está desactivada.
create or replace function public.usuarios_verificar(p_usuario text, p_clave text)
returns table (
  idusuario bigint, usuario text, nombre text, iddependencia integer,
  dependencia text, puesto text
)
language plpgsql security definer set search_path = public, extensions as $$
begin
  update usuarios_dependencia u
     set acceso = now()
   where u.usuario = lower(trim(p_usuario))
     and u.activo
     and u.clave_hash = crypt(p_clave, u.clave_hash);

  return query
    select u.idusuario, u.usuario, u.nombre, u.iddependencia,
           -- nombredependencia es varchar en la base y la funcion declara text
           d.nombredependencia::text, u.puesto
      from usuarios_dependencia u
      left join dependencias d on d.iddependencia = u.iddependencia
     where u.usuario = lower(trim(p_usuario))
       and u.activo
       and u.clave_hash = crypt(p_clave, u.clave_hash);
end;
$$;

grant execute on function
  public.usuarios_listar(),
  public.usuarios_crear(text, text, integer, text, text),
  public.usuarios_editar(bigint, text, text, integer, text, boolean),
  public.usuarios_clave(bigint, text),
  public.usuarios_borrar(bigint),
  public.usuarios_verificar(text, text)
to anon, authenticated;
