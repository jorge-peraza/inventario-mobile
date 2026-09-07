// Comentarios internos por inmueble.
//
// Viven en la columna `comentarios` de bienesinmuebles. La base ya la tiene
// (supabase/persistencia-inmuebles.sql, aplicado), así que se lee y se escribe
// siempre contra la base: se puede ver desde cualquier equipo y sale en las
// exportaciones.
//
// Lo único que queda del navegador es el RESCATE de más abajo: los comentarios
// escritos antes de la migración siguen en el equipo donde se capturaron y se
// suben solos la primera vez que esa persona abre inmuebles. Cuando ya no quede
// ninguno pendiente en ningún equipo, se puede borrar ese bloque y este módulo
// se queda sin una sola línea de localStorage.

import { supabaseInmuebles as supabase } from './supabaseInmuebles'

// El comentario del inmueble: viene en la propia fila.
export function comentarioDe(inmueble) {
  return inmueble?.comentarios || ''
}

export async function setComentario(idinmueble, texto) {
  const valor = (texto || '').trim()
  const { error } = await supabase.from('bienesinmuebles')
    .update({ comentarios: valor || null }).eq('idinmueble', idinmueble)
  if (error) throw error
}

// ── Rescate de lo capturado antes de la migración ───────────────────────────
const LS = 'comentarios_inmuebles'

export async function subirComentariosPendientes() {
  let m
  try { m = JSON.parse(localStorage.getItem(LS) || '{}') } catch { return 0 }
  const ids = Object.keys(m)
  if (!ids.length) return 0

  let subidos = 0
  for (const id of ids) {
    const { error } = await supabase.from('bienesinmuebles')
      .update({ comentarios: m[id] || null }).eq('idinmueble', Number(id))
    if (error) continue        // se reintenta la próxima vez que se abra
    delete m[id]; subidos++
  }
  try {
    if (Object.keys(m).length) localStorage.setItem(LS, JSON.stringify(m))
    else localStorage.removeItem(LS)
  } catch { /* modo privado */ }
  return subidos
}
