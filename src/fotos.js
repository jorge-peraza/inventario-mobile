import { supabase } from './supabase'

// ── Fotos de los bienes muebles ──────────────────────────────────────────────
// Las fotos vivirán en un servidor aparte, no en Supabase. Mientras ese
// servidor no exista, SERVIDOR_FOTOS queda vacío: la consulta responde "sin
// fotos" y la subida avisa que todavía no hay dónde guardarlas.
//
// Para conectarlo basta con poner la dirección del servidor en la variable de
// entorno VITE_SERVIDOR_FOTOS al compilar (p. ej. en el workflow de GitHub
// Actions o en un archivo .env.local):
//
//   VITE_SERVIDOR_FOTOS=https://fotos.ejemplo.gob.mx/api
//
// Rutas que la app espera del servidor:
//
//   GET  {SERVIDOR}/bienes/{idbien}/fotos
//        → 200 [{ id, url, miniatura? }, …]   (o una lista de URLs)
//
//   POST {SERVIDOR}/bienes/{idbien}/fotos      multipart/form-data
//        campo "fotos" (uno por imagen) y "clave" (clave de inventario)
//        → 200 [{ id, url, miniatura? }, …]   las fotos que quedaron guardadas
//
// Cada petición lleva el token de la sesión de Supabase en Authorization, para
// que el servidor pueda comprobar que quien sube o consulta tiene sesión.

export const SERVIDOR_FOTOS = (import.meta.env.VITE_SERVIDOR_FOTOS || '').replace(/\/+$/, '')

// Lo que se acepta al subir
export const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
export const MAX_MB_FOTO = 10

export function hayServidorFotos() {
  return !!SERVIDOR_FOTOS
}

async function cabeceras() {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

// El servidor puede responder objetos o solo las direcciones
function normalizar(lista) {
  return (Array.isArray(lista) ? lista : [])
    .map((f, i) => typeof f === 'string'
      ? { id: `${i}-${f}`, url: f, miniatura: f }
      : { id: f.id ?? `${i}-${f.url}`, url: f.url, miniatura: f.miniatura || f.url })
    .filter(f => f.url)
}

// Fotos de un bien. Sin servidor, o si el servidor no responde, lista vacía.
export async function listarFotos(idbien) {
  if (!SERVIDOR_FOTOS || idbien == null) return []
  const r = await fetch(`${SERVIDOR_FOTOS}/bienes/${encodeURIComponent(idbien)}/fotos`, { headers: await cabeceras() })
  if (!r.ok) throw new Error('No se pudieron cargar las fotos')
  return normalizar(await r.json())
}

// Revisa los archivos antes de subirlos: solo imágenes y de un tamaño razonable
export function revisarArchivos(archivos) {
  const buenos = [], malos = []
  for (const f of archivos) {
    const esImagen = TIPOS_FOTO.includes(f.type) || /^image\//.test(f.type)
    if (!esImagen) malos.push(`${f.name}: no es una imagen`)
    else if (f.size > MAX_MB_FOTO * 1024 * 1024) malos.push(`${f.name}: pesa más de ${MAX_MB_FOTO} MB`)
    else buenos.push(f)
  }
  return { buenos, malos }
}

export async function subirFotos(idbien, clave, archivos) {
  if (!SERVIDOR_FOTOS) throw new Error('Todavía no está conectado el servidor de fotos: las imágenes no se guardaron.')
  const datos = new FormData()
  for (const f of archivos) datos.append('fotos', f, f.name)
  if (clave) datos.append('clave', clave)
  const r = await fetch(`${SERVIDOR_FOTOS}/bienes/${encodeURIComponent(idbien)}/fotos`, {
    method: 'POST', headers: await cabeceras(), body: datos,
  })
  if (!r.ok) throw new Error('No se pudieron subir las fotos')
  return normalizar(await r.json().catch(() => []))
}
