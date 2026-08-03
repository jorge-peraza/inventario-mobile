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
  admin:           ['dashboard', 'bienes', 'reportes'],
  admin_inmuebles: ['dashboard-inmuebles', 'inmuebles', 'reportes'],
}

export function paginaInicio(rol) {
  return rol === 'admin_inmuebles' ? 'dashboard-inmuebles' : 'dashboard'
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

export async function iniciarSesion(usuario, password) {
  const key = (usuario || '').trim().toLowerCase()
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
  try {
    const { data } = await supabase.auth.getSession()
    const u = data?.session?.user
    return u ? perfilDesdeUser(u) : null
  } catch { return null }
}

export function cerrarSesion() {
  supabase.auth.signOut().catch(() => {})
}
