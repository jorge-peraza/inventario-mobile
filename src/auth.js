import { supabase } from './supabase'

// Los usuarios viven en la tabla `usuarios` de Supabase (correo = nombre de usuario).
// El login llama a la función RPC `iniciar_sesion` (security definer): valida las
// credenciales dentro de la base y devuelve solo el perfil — las contraseñas nunca
// se exponen ni viven en este código.

// Páginas permitidas por rol — todo lo demás queda bloqueado
export const PAGINAS_POR_ROL = {
  admin:           ['dashboard', 'bienes', 'reportes'],
  admin_inmuebles: ['dashboard-inmuebles', 'inmuebles', 'reportes'],
}

export function paginaInicio(rol) {
  return rol === 'admin_inmuebles' ? 'dashboard-inmuebles' : 'dashboard'
}

export async function iniciarSesion(usuario, password) {
  const { data, error } = await supabase.rpc('iniciar_sesion', {
    p_usuario: (usuario || '').trim(),
    p_contrasena: password || '',
  })
  if (error) throw new Error('No se pudo validar el usuario. Intenta de nuevo.')
  if (!data) throw new Error('Usuario o contraseña incorrectos')
  return {
    nombre: data.nombre || (usuario || '').trim(),
    rol: data.rol || 'admin',
    dependencia: data.dependencia || 'Tesorería',
    iniciales: data.iniciales || 'US',
  }
}

export function cerrarSesion() {
  supabase.auth.signOut().catch(() => {})
}
