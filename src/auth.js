import { supabase } from './supabase'
import { supabaseInmuebles } from './supabaseInmuebles'

// Cuentas del sistema: nombre de usuario → cuenta registrada en Supabase Auth
// (Authentication → Users). Las contraseñas NO viven en el código: las valida
// Supabase. El rol y el perfil se leen del user_metadata de cada cuenta.
const CUENTAS = {
  'nogales.monica': 'jorgeperaza2828+muebles@gmail.com',
  'nogales.eliseo': 'jorgeperaza2828+inmuebles@gmail.com',
}

// Traspasos y bajas para las dependencias: hecho y probado, pero apagado hasta
// que se decida abrirlo. En false no queda rastro en ninguna pantalla —ni menú,
// ni accesos, ni la dirección escrita a mano—; poniéndolo en true vuelve
// completo, sin tocar nada más.
export const DEPENDENCIA_VE_MOVIMIENTOS = false

// Páginas permitidas por rol — todo lo demás queda bloqueado
export const PAGINAS_POR_ROL = {
  admin:           ['dashboard', 'bienes', 'movimientos', 'traspasos', 'reportes', 'dependencias', 'papelera', 'reconteo', 'usuarios', 'configuracion'],
  admin_inmuebles: ['dashboard-inmuebles', 'inmuebles', 'movimientos', 'reportes', 'usuarios', 'configuracion'],
  // Una dependencia consulta lo suyo: su inicio y el inventario vigente, de
  // donde además saca sus reportes. No entra a papelera, reconteo ni usuarios.
  dependencia:     ['index-dep', 'bienes', ...(DEPENDENCIA_VE_MOVIMIENTOS ? ['traspasos', 'bajas'] : [])],
}

// Lo que puede abrir esta persona. Los usuarios que da de alta el administrador
// de inmuebles entran con su mismo rol —ven y, si se les permite, editan lo
// mismo—, pero nunca la pantalla de Usuarios: no pueden crear otras cuentas.
export function paginasPermitidas(user) {
  const base = PAGINAS_POR_ROL[user?.rol] || []
  // Configuración cambia los logos de TODOS los reportes, y guardarlos requiere
  // una sesión de Supabase Auth, que los subusuarios no tienen: se les esconde
  // en vez de dejarles una pantalla que les va a decir que no.
  return user?.subusuario ? base.filter(p => p !== 'usuarios' && p !== 'configuracion') : base
}

// Solo consulta: no da de alta, no modifica ni desincorpora
export function esSoloConsulta(user) {
  return !!user?.subusuario && user.permiso !== 'editar'
}

export function paginaInicio(rol) {
  if (rol === 'admin_inmuebles') return 'dashboard-inmuebles'
  if (rol === 'dependencia')     return 'index-dep'
  return 'dashboard'
}

function perfilDesdeUser(u, fallbackNombre = '') {
  const meta = u?.user_metadata || {}
  // Aplica la preferencia de tema guardada en la cuenta (se usa al montar ThemeProvider)
  if (meta.tema === 'dark' || meta.tema === 'light') {
    try { localStorage.setItem('tema', meta.tema) } catch { /* noop */ }
  }
  const nombre = meta.usuario || fallbackNombre || u?.email || 'Usuario'
  return {
    nombre,
    rol: meta.rol || 'admin',
    dependencia: meta.dependencia || 'Tesorería',
    iniciales: meta.iniciales || nombre.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'US',
  }
}

// Guarda una preferencia en la cuenta del usuario (user_metadata de Supabase):
// persiste entre dispositivos. Silencioso si no hay sesión.
export function guardarPreferencia(clave, valor) {
  supabase.auth.updateUser({ data: { [clave]: valor } }).catch(() => {})
}

// Lee el user_metadata completo de la sesión actual
export async function metadataUsuario() {
  try {
    const { data } = await supabase.auth.getUser()
    return data?.user?.user_metadata || {}
  } catch { return {} }
}

// ── Usuarios de dependencia ───────────────────────────────────────────────────
// No son cuentas de Supabase Auth: viven en la tabla usuarios_dependencia y los
// da de alta el administrador de bienes muebles desde el propio sistema. La
// contraseña se compara dentro de la base (función usuarios_verificar), así que
// ni la contraseña ni su hash pasan por el navegador.
const SESION_DEP = 'sesion-dependencia'

function perfilDependencia(fila) {
  const nombre = fila.nombre || fila.usuario
  return {
    nombre,
    rol: 'dependencia',
    idusuario: fila.idusuario,
    usuario: fila.usuario,
    iddependencia: fila.iddependencia,
    dependencia: fila.dependencia || 'Dependencia',
    puesto: fila.puesto || '',
    iniciales: nombre.replace(/[^A-Za-zÁÉÍÓÚÑ]/gi, '').slice(0, 2).toUpperCase() || 'US',
  }
}

async function entrarComoDependencia(usuario, password) {
  const { data, error } = await supabase.rpc('usuarios_verificar', {
    p_usuario: usuario,
    p_clave: password,
  })
  // Si la función todavía no existe (falta correr supabase/usuarios.sql) se
  // sigue con el inicio de sesión normal en vez de romper el acceso.
  if (error) return null
  const fila = Array.isArray(data) ? data[0] : data
  if (!fila) return null

  const perfil = perfilDependencia(fila)
  try { localStorage.setItem(SESION_DEP, JSON.stringify(perfil)) } catch { /* modo privado */ }
  return perfil
}

// ── Usuarios de Bienes Inmuebles ─────────────────────────────────────────────
// Los da de alta el administrador de inmuebles (tabla usuarios_inmuebles, en la
// base de inmuebles). Entran con el rol del administrador de inmuebles y con
// el permiso que él les dio: 'consultar' o 'editar'.
const SESION_INM = 'sesion-inmuebles'

function perfilInmuebles(fila) {
  const nombre = fila.nombre || fila.usuario
  const edita = fila.permiso === 'editar'
  return {
    nombre,
    rol: 'admin_inmuebles',
    subusuario: true,
    permiso: edita ? 'editar' : 'consultar',
    idusuario: fila.idusuario,
    usuario: fila.usuario,
    puesto: fila.puesto || '',
    dependencia: edita ? 'Edición · Inmuebles' : 'Consulta · Inmuebles',
    iniciales: nombre.replace(/[^A-Za-zÁÉÍÓÚÑ]/gi, '').slice(0, 2).toUpperCase() || 'US',
  }
}

async function entrarComoInmuebles(usuario, password) {
  const { data, error } = await supabaseInmuebles.rpc('usuarios_inm_verificar', {
    p_usuario: usuario,
    p_clave: password,
  })
  // Sin la tabla (falta supabase/usuarios-inmuebles.sql) se sigue de largo
  if (error) return null
  const fila = Array.isArray(data) ? data[0] : data
  if (!fila) return null
  const perfil = perfilInmuebles(fila)
  try { localStorage.setItem(SESION_INM, JSON.stringify(perfil)) } catch { /* modo privado */ }
  return perfil
}

export async function iniciarSesion(usuario, password) {
  const key = (usuario || '').trim().toLowerCase()

  // Primero las dependencias, luego los usuarios de inmuebles; si no es
  // ninguno de ellos, se intenta con Supabase Auth
  const dep = await entrarComoDependencia(key, password)
  if (dep) return dep
  const inm = await entrarComoInmuebles(key, password)
  if (inm) return inm

  // Acepta el nombre de usuario del sistema o directamente un correo de Supabase
  const email = CUENTAS[key] || (key.includes('@') ? key : null)
  if (!email) throw new Error('Usuario o contraseña incorrectos')

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    if (/not confirmed/i.test(error.message)) throw new Error('La cuenta aún no está habilitada en Supabase')
    throw new Error('Usuario o contraseña incorrectos')
  }
  return perfilDesdeUser(data.user, (usuario || '').trim())
}

// Restaura la sesión guardada en el navegador (para que al recargar siga logueado)
export async function sesionActual() {
  // La dependencia no tiene sesión de Supabase: la suya se guarda aquí
  try {
    const guardada = localStorage.getItem(SESION_DEP) || localStorage.getItem(SESION_INM)
    if (guardada) return JSON.parse(guardada)
  } catch { /* modo privado o dato corrupto */ }

  try {
    const { data } = await supabase.auth.getSession()
    const u = data?.session?.user
    return u ? perfilDesdeUser(u) : null
  } catch { return null }
}

// Confirma que quien está frente a la pantalla es el administrador de la sesión
// abierta: su contraseña se vuelve a validar con Supabase. Se pide antes de
// quitar algo del historial, para que no pase por un clic accidental.
export async function verificarContrasena(password) {
  if (!password) throw new Error('Escribe tu contraseña')
  const { data } = await supabase.auth.getUser()
  const email = data?.user?.email
  if (!email) throw new Error('No hay una sesión de administrador abierta')
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error('La contraseña no es correcta')
}

export function cerrarSesion() {
  try { localStorage.removeItem(SESION_DEP); localStorage.removeItem(SESION_INM) } catch { /* noop */ }
  supabase.auth.signOut().catch(() => {})
}

// ── Administración de usuarios de dependencia ────────────────────────────────
// Todo pasa por funciones de la base: la tabla no es accesible desde la app y
// las contraseñas nunca viajan de regreso.
async function rpc(nombre, params) {
  const { data, error } = await supabase.rpc(nombre, params)
  if (error) throw new Error(error.message.replace(/^.*?:\s*/, ''))
  return data
}

export const usuariosDependencia = {
  listar:      ()                                  => rpc('usuarios_listar'),
  crear:       ({ usuario, nombre, iddependencia, puesto, clave }) =>
    rpc('usuarios_crear', { p_usuario: usuario, p_nombre: nombre, p_iddependencia: iddependencia, p_puesto: puesto, p_clave: clave }),
  editar:      ({ idusuario, usuario, nombre, iddependencia, puesto, activo }) =>
    rpc('usuarios_editar', { p_idusuario: idusuario, p_usuario: usuario, p_nombre: nombre, p_iddependencia: iddependencia, p_puesto: puesto, p_activo: activo }),
  cambiarClave: (idusuario, clave)                 => rpc('usuarios_clave', { p_idusuario: idusuario, p_clave: clave }),
  borrar:       idusuario                          => rpc('usuarios_borrar', { p_idusuario: idusuario }),
}

// ── Administración de usuarios de inmuebles ──────────────────────────────────
async function rpcInm(nombre, params) {
  const { data, error } = await supabaseInmuebles.rpc(nombre, params)
  if (error) throw new Error(error.message.replace(/^.*?:\s*/, ''))
  return data
}

export const usuariosInmuebles = {
  listar:       ()                                            => rpcInm('usuarios_inm_listar'),
  crear:        ({ usuario, nombre, puesto, permiso, clave }) =>
    rpcInm('usuarios_inm_crear', { p_usuario: usuario, p_nombre: nombre, p_puesto: puesto, p_permiso: permiso, p_clave: clave }),
  editar:       ({ idusuario, usuario, nombre, puesto, permiso, activo }) =>
    rpcInm('usuarios_inm_editar', { p_idusuario: idusuario, p_usuario: usuario, p_nombre: nombre, p_puesto: puesto, p_permiso: permiso, p_activo: activo }),
  cambiarClave: (idusuario, clave)                            => rpcInm('usuarios_inm_clave', { p_idusuario: idusuario, p_clave: clave }),
  borrar:       idusuario                                     => rpcInm('usuarios_inm_borrar', { p_idusuario: idusuario }),
}
