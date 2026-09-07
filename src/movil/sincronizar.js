import { supabase } from '../supabase'
import { listaReconteos, resumen } from './reconteo'

// ── El reconteo en la base ────────────────────────────────────────────────────
// Mientras se cuenta manda el teléfono: la lista y las marcas viven ahí, que es
// lo que permite seguir contando sin señal. Al terminar, el reconteo se sube
// completo y desde entonces se puede ver desde cualquier equipo.
//
// Si las tablas todavía no existen —el SQL de supabase/reconteo.sql no se ha
// aplicado— nada se rompe: se devuelve `false` y la app sigue con el historial
// del teléfono.

const LOTE = 200

function noHayTablas(error) {
  // PGRST205: la tabla no está en el esquema. 42P01: no existe en Postgres.
  return error?.code === 'PGRST205' || error?.code === '42P01'
}

export async function hayTablas() {
  const { error } = await supabase.from('reconteos').select('idreconteo').limit(1)
  return !noHayTablas(error)
}

export async function subirReconteo(r) {
  if (!r) return false
  const s = resumen(r)

  const { error } = await supabase.from('reconteos').upsert({
    idreconteo: r.id,
    idarea: r.idarea,
    nombrearea: r.nombrearea,
    dependencia: r.dependencia,
    usuario: r.usuario || null,
    inicio: r.inicio,
    fin: r.fin,
    esperados: s.total,
    encontrados: s.encontrados,
  })
  if (error) {
    if (noHayTablas(error)) return false
    throw error
  }

  const filas = r.esperados.map(e => {
    const hallado = r.encontrados[e.clave]
    return {
      idreconteo: r.id,
      idbien: e.idbien,
      clave: e.clave,
      nombre: e.nombre,
      resguardante: e.resguardante,
      encontrado: !!hallado,
      metodo: hallado?.metodo || null,
      fecha: hallado?.fecha || null,
      observacion: hallado?.observacion || null,
    }
  })
  for (let i = 0; i < filas.length; i += LOTE) {
    const { error: e2 } = await supabase.from('reconteo_bienes').upsert(filas.slice(i, i + LOTE))
    if (e2) throw e2
  }

  const ajenos = Object.entries(r.ajenos || {}).map(([clave, v]) => ({
    idreconteo: r.id, clave, fecha: v.fecha,
  }))
  if (ajenos.length) {
    const { error: e3 } = await supabase.from('reconteo_ajenos').upsert(ajenos)
    if (e3) throw e3
  }

  return true
}

// ── Avance del reconteo, mientras se cuenta ──────────────────────────────────
// El teléfono ya no es el único lugar donde vive lo contado: cada vez que se
// marca algo se manda la cabecera y SOLO las filas nuevas, para no reenviar el
// área entera en cada lectura. Si no hay señal falla en silencio y el conteo
// sigue; al cerrarlo se sube completo de todos modos.
export async function subirAvance(r, claves) {
  if (!r) return false
  const s = resumen(r)
  const { error } = await supabase.from('reconteos').upsert({
    idreconteo: r.id, idarea: r.idarea, nombrearea: r.nombrearea,
    dependencia: r.dependencia, usuario: r.usuario || null,
    inicio: r.inicio, fin: r.fin, esperados: s.total, encontrados: s.encontrados,
  })
  if (error) { if (noHayTablas(error)) return false; throw error }

  const nuevas = (claves || []).filter(c => r.encontrados[c])
  if (nuevas.length) {
    const filas = nuevas.map(clave => {
      const e = r.esperados.find(x => x.clave === clave) || {}
      const h = r.encontrados[clave]
      return {
        idreconteo: r.id, idbien: e.idbien, clave, nombre: e.nombre,
        resguardante: e.resguardante, encontrado: true,
        metodo: h.metodo || null, fecha: h.fecha || null,
        observacion: h.observacion || null,
      }
    }).filter(f => f.idbien != null)
    for (let i = 0; i < filas.length; i += LOTE) {
      const { error: e2 } = await supabase.from('reconteo_bienes').upsert(filas.slice(i, i + LOTE))
      if (e2) throw e2
    }
  }
  return true
}

// Sube los reconteos terminados que todavía no están en la base. Se llama al
// cerrar uno y al abrir el historial, por si alguno quedó sin señal.
export async function subirPendientes() {
  let subidos = 0
  for (const r of listaReconteos()) {
    if (!r.fin) continue          // los abiertos se suben al terminarlos
    try { if (await subirReconteo(r)) subidos++ } catch { /* se reintenta luego */ }
  }
  return subidos
}

// El historial de todos los equipos, no solo el de este teléfono.
export async function historialRemoto(limite = 40) {
  const { data, error } = await supabase
    .from('reconteos').select('*')
    .order('inicio', { ascending: false })
    .limit(limite)
  if (error) {
    if (noHayTablas(error)) return null
    throw error
  }
  return data || []
}

export async function detalleRemoto(idreconteo) {
  const { data, error } = await supabase
    .from('reconteo_bienes').select('*')
    .eq('idreconteo', idreconteo)
    .order('clave', { ascending: true })
  if (error) {
    if (noHayTablas(error)) return null
    throw error
  }
  return data || []
}
