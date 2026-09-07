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

// ── Datos del trámite de desincorporación ────────────────────────────────────
// La categoría original (para poder cancelar el trámite), las fechas y las
// observaciones viven en columnas de bienesinmuebles. La base ya las tiene
// (supabase/persistencia-inmuebles.sql, aplicado), así que se leen y se
// escriben siempre contra la base.
//
// Lo único que queda del navegador es el RESCATE del final del bloque: los
// trámites capturados antes de la migración siguen en el equipo donde se
// hicieron y se suben solos al abrir inmuebles. Cuando ya no quede ninguno
// pendiente, ese bloque se puede borrar.
const COLS_TRAMITE = 'categoria_original, fecha_proceso, obs_proceso, fecha_desinc, obs_desinc, comentarios'

// Traduce las columnas de la fila al objeto que usan las pantallas
export function tramiteDe(fila) {
  if (!fila) return {}
  return {
    catOriginal:  fila.categoria_original ?? undefined,
    fechaProceso: fila.fecha_proceso  || undefined,
    obsProceso:   fila.obs_proceso    || undefined,
    fechaDesinc:  fila.fecha_desinc   || undefined,
    obsDesinc:    fila.obs_desinc     || undefined,
  }
}

const A_COLUMNA = {
  catOriginal:  'categoria_original',
  fechaProceso: 'fecha_proceso',
  obsProceso:   'obs_proceso',
  fechaDesinc:  'fecha_desinc',
  obsDesinc:    'obs_desinc',
}

export async function setDesinc(ids, data) {
  const parche = {}
  for (const [k, v] of Object.entries(data)) {
    if (A_COLUMNA[k]) parche[A_COLUMNA[k]] = v === '' ? null : v
  }
  if (!Object.keys(parche).length) return
  const { error } = await supabase.from('bienesinmuebles').update(parche).in('idinmueble', ids)
  if (error) throw error
}

// Al cancelar el trámite el inmueble regresa limpio a su categoría
export async function quitarDesinc(ids) {
  const { error } = await supabase.from('bienesinmuebles').update({
    categoria_original: null, fecha_proceso: null, obs_proceso: null,
    fecha_desinc: null, obs_desinc: null,
  }).in('idinmueble', ids)
  if (error) throw error
}

// ── Rescate de lo capturado antes de la migración ───────────────────────────
const LS = 'desincorporaciones'

export async function subirTramitesPendientes() {
  let m
  try { m = JSON.parse(localStorage.getItem(LS) || '{}') } catch { return 0 }
  const ids = Object.keys(m)
  if (!ids.length) return 0

  let subidos = 0
  for (const id of ids) {
    const d = m[id] || {}
    const { error } = await supabase.from('bienesinmuebles').update({
      categoria_original: d.catOriginal ?? null,
      fecha_proceso: d.fechaProceso || null,
      obs_proceso:   d.obsProceso   || null,
      fecha_desinc:  d.fechaDesinc  || null,
      obs_desinc:    d.obsDesinc    || null,
    }).eq('idinmueble', Number(id))
    if (error) continue        // se reintenta la próxima vez que se abra
    delete m[id]; subidos++
  }
  try {
    if (Object.keys(m).length) localStorage.setItem(LS, JSON.stringify(m))
    else localStorage.removeItem(LS)
  } catch { /* modo privado */ }
  return subidos
}

export function hoyISO() { return new Date().toISOString().slice(0, 10) }

const SELECT_INM = `idinmueble, consecutivo, idcategoria, claveinmueble, nombreinmueble, clavecatastral, superficiem2, ubicacion, valorcatastral, documentopropiedad, expediente, adquisicion, fecha_enajenacion, afavorde, tipo_enajenacion, ${COLS_TRAMITE}`

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
