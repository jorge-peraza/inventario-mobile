import { supabase } from './supabase'

// Cuentas del sistema: nombre de usuario → cuenta registrada en Supabase Auth
// (Authentication → Users). Las contraseñas NO viven en el código: las valida
// Supabase. El rol y el perfil se leen del user_metadata de cada cuenta.
const CUENTAS = {
  'nogales.monica': 'jorgeperaza2828+muebles@gmail.com',
  'nogales.eliseo': 'jorgeperaza2828+inmuebles@gmail.com',
}

// Páginas permitidas por rol — todo lo demás queda bloqueado
export const PAGINAS_POR_ROL = {
  admin:           ['dashboard', 'bienes', 'traspasos', 'reportes', 'dependencias', 'papelera', 'reconteo', 'usuarios'],
  admin_inmuebles: ['dashboard-inmuebles', 'inmuebles', 'reportes'],
  // Una dependencia solo consulta lo suyo: su inicio y el inventario, de donde
  // además saca sus reportes. No entra a traspasos, papelera, reconteo ni
  // usuarios.
  dependencia:     ['index-dep', 'bienes'],
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

export async function iniciarSesion(usuario, password) {
  const key = (usuario || '').trim().toLowerCase()

  // Primero las dependencias; si no es una de ellas, se intenta con Supabase Auth
  const dep = await entrarComoDependencia(key, password)
  if (dep) return dep

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
    const guardada = localStorage.getItem(SESION_DEP)
    if (guardada) return JSON.parse(guardada)
  } catch { /* modo privado o dato corrupto */ }

  try {
    const { data } = await supabase.auth.getSession()
    const u = data?.session?.user
    return u ? perfilDesdeUser(u) : null
  } catch { return null }
}

export function cerrarSesion() {
  try { localStorage.removeItem(SESION_DEP) } catch { /* noop */ }
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
