import { supabaseInmuebles as supabase } from './supabaseInmuebles'

// Categorías reales de la BD
export const ID_PROCESO  = 12   // EN PROCESO DE DESINCORPORACION
export const ID_DESINC   = 13   // DESINCORPORADO DEL HAN
export const ID_COMODATO = 11   // EN COMODATO

// Movimientos de salida (para distinguir incorporaciones de desincorporaciones)
export const CATS_SALIDA = [ID_PROCESO, ID_DESINC]

// Categorías que NO son patrimonio del HAN y por lo tanto no suman en ningún
// total: el comodato (no es propio) y lo ya desincorporado (ya salió).
// "En proceso de desincorporación" SÍ cuenta: el trámite no ha concluido y el
// inmueble sigue siendo del Ayuntamiento.
export const CATS_FUERA  = [ID_COMODATO, ID_DESINC]

// Fecha/observaciones/categoría original se guardan localmente (la BD no tiene esas columnas)
// mapa: { [idinmueble]: { catOriginal, fechaProceso, obsProceso, fechaDesinc, obsDesinc } }
const LS = 'desincorporaciones'
export function getDesinc() {
  try { return JSON.parse(localStorage.getItem(LS) || '{}') } catch { return {} }
}
function guardar(m) { localStorage.setItem(LS, JSON.stringify(m)) }
export function setDesinc(ids, data) {
  const m = getDesinc()
  for (const id of ids) m[id] = { ...m[id], ...data }
  guardar(m)
}
export function quitarDesinc(ids) {
  const m = getDesinc()
  for (const id of ids) delete m[id]
  guardar(m)
}
export function hoyISO() { return new Date().toISOString().slice(0, 10) }

const SELECT_INM = 'idinmueble, consecutivo, idcategoria, claveinmueble, nombreinmueble, clavecatastral, superficiem2, ubicacion, valorcatastral, documentopropiedad, expediente, adquisicion, fecha_enajenacion, afavorde, tipo_enajenacion'

export async function fetchInmueblesPorIds(ids) {
  if (!ids.length) return []
  const BATCH = 300
  let todos = []
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH)
    const { data, error } = await supabase.from('bienesinmuebles').select(SELECT_INM).in('idinmueble', chunk)
    if (error) throw error
    todos = [...todos, ...(data || [])]
  }
  return todos
}

export async function fetchInmueblesPorCategoria(idcat) {
  const BATCH = 1000
  let todos = [], desde = 0
  while (true) {
    const { data, error } = await supabase.from('bienesinmuebles').select(SELECT_INM)
      .eq('idcategoria', idcat)
      .order('consecutivo', { ascending: true })
      .range(desde, desde + BATCH - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    todos = [...todos, ...data]
    if (data.length < BATCH) break
    desde += BATCH
  }
  // El consecutivo es un orden global, por eso las claves salían salteadas
  // (01-CC, 11-CC, 12-CC, 02-CC). Se reordena por la clave, con el número
  // leído como número y no como texto: si no, "11" va antes que "2".
  return todos.sort(compararClaveInmueble)
}

// Parte la clave en grupo + número, con las dos formas que existen en la base:
// "01-CC" (número primero) y "PEND-3" (provisional, número al final).
function partirClave(clave) {
  const txt = String(clave || '').trim()
  const normal = txt.match(/^(\d+)\s*-\s*(.*)$/)
  if (normal) return { grupo: normal[2].toUpperCase(), numero: parseInt(normal[1], 10) }
  const provisional = txt.match(/^(.*?)\s*-\s*(\d+)$/)
  if (provisional) return { grupo: provisional[1].toUpperCase(), numero: parseInt(provisional[2], 10) }
  return { grupo: txt.toUpperCase(), numero: Number.POSITIVE_INFINITY }
}

// Ordena por el código de categoría y, dentro de él, por número ascendente
export function compararClaveInmueble(a, b) {
  const x = partirClave(a.claveinmueble)
  const y = partirClave(b.claveinmueble)
  if (x.grupo !== y.grupo) return x.grupo.localeCompare(y.grupo, 'es')
  if (x.numero !== y.numero) return x.numero - y.numero
  return (a.idinmueble || 0) - (b.idinmueble || 0)
}

export async function contarCategoria(idcat) {
  const { count, error } = await supabase.from('bienesinmuebles').select('idinmueble', { count: 'exact', head: true }).eq('idcategoria', idcat)
  if (error) throw error
  return count || 0
}

// Inventario de inmuebles activos (excluye proceso/desincorporado) para armar reportes
export async function fetchInventarioInmuebles({ busqueda, areaIds, pagina, porPagina }) {
  const desde = pagina * porPagina
  let q = supabase.from('bienesinmuebles').select(SELECT_INM, { count: 'exact' })
    .not('idcategoria', 'in', `(${ID_PROCESO},${ID_DESINC})`)
    .order('consecutivo', { ascending: true })
    .range(desde, desde + porPagina - 1)
  if (busqueda) q = q.or(`nombreinmueble.ilike.%${busqueda}%,claveinmueble.ilike.%${busqueda}%,clavecatastral.ilike.%${busqueda}%,ubicacion.ilike.%${busqueda}%`)
  if (areaIds && areaIds.length) q = q.in('idcategoria', areaIds)   // (inmuebles se filtran por categoría)
  const { data, error, count } = await q
  if (error) throw error
  return { data: data || [], count: count || 0 }
}

export async function cambiarCategoria(ids, idcat) {
  const BATCH = 300
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH)
    const { error } = await supabase.from('bienesinmuebles').update({ idcategoria: idcat }).in('idinmueble', chunk)
    if (error) throw error
  }
}
