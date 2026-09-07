// Encargado (titular) de cada dependencia.
//
// Vive en las columnas `encargado` y `puesto_encargado` de `dependencias`, ya
// creadas (supabase/persistencia-muebles.sql). Se lee y se escribe contra la
// base, así que el titular es el mismo en todos los equipos.
//
// Lo único que queda del navegador es el RESCATE: los titulares capturados
// antes de la migración siguen en el equipo donde se pusieron y se suben solos
// la primera vez que ahí se abre la pantalla de dependencias.

import { supabase } from './supabase'

const LS = 'encargados_dependencias'

// Devuelve las dependencias con su encargado, ordenadas por nombre.
export async function fetchDependencias() {
  const { data, error } = await supabase.from('dependencias')
    .select('iddependencia, nombredependencia, orden, encargado, puesto_encargado')
  if (error) throw error

  const rescatados = await subirEncargadosPendientes()
  return (data || [])
    .map(d => {
      const subido = rescatados[d.iddependencia] || {}
      return {
        ...d,
        encargado:        d.encargado        || subido.encargado || '',
        puesto_encargado: d.puesto_encargado || subido.puesto    || '',
      }
    })
    .sort((a, b) => String(a.nombredependencia || '').localeCompare(String(b.nombredependencia || ''), 'es'))
}

// ── Rescate de lo capturado antes de la migración ───────────────────────────
async function subirEncargadosPendientes() {
  let m
  try { m = JSON.parse(localStorage.getItem(LS) || '{}') } catch { return {} }
  const ids = Object.keys(m)
  if (!ids.length) return {}

  const subidos = {}
  for (const id of ids) {
    const { encargado, puesto } = m[id] || {}
    const { error } = await supabase.from('dependencias')
      .update({ encargado: encargado || null, puesto_encargado: puesto || null })
      .eq('iddependencia', Number(id))
    if (error) continue        // se reintenta la próxima vez que se abra
    subidos[id] = m[id]; delete m[id]
  }
  try {
    if (Object.keys(m).length) localStorage.setItem(LS, JSON.stringify(m))
    else localStorage.removeItem(LS)
  } catch { /* modo privado */ }
  return subidos
}

// Áreas de cada dependencia, con su conteo de bienes (vista areas_activas)
export async function fetchAreasPorDependencia() {
  const { data, error } = await supabase
    .from('areas_activas')
    .select('idarea, nombrearea, iddependencia, total_bienes')
  if (error) throw error
  const mapa = {}
  for (const a of data || []) {
    const k = a.iddependencia
    if (!mapa[k]) mapa[k] = { areas: [], bienes: 0 }
    mapa[k].areas.push({ idarea: a.idarea, nombrearea: a.nombrearea, total_bienes: a.total_bienes || 0 })
    mapa[k].bienes += a.total_bienes || 0
  }
  for (const v of Object.values(mapa)) {
    v.areas.sort((a, b) => String(a.nombrearea || '').localeCompare(String(b.nombrearea || ''), 'es'))
  }
  return mapa
}

// Catálogo de personas ya registradas como titulares de resguardo. Es de donde
// se eligen los encargados, para no capturar nombres nuevos a mano.
export async function fetchResguardos() {
  const { data, error } = await supabase
    .from('resguardos')
    .select('idresguardo, nombre, puesto')
    .order('nombre', { ascending: true })
  if (error) throw error
  // En resguardos se colaron importes, números de serie y cifras sueltas
  // ("642600", "3N6AD35A3RK816165", "$1,1685.12 AVALUO 15"): no son personas,
  // así que no deben aparecer al elegir encargado.
  // Un nombre de persona no lleva dígitos, así que ese filtro basta.
  const esPersona = n => n.length >= 5 && /[A-Za-zÁÉÍÓÚÑáéíóúñ]{3}/.test(n) && !/\d/.test(n)

  // Un mismo nombre puede aparecer varias veces con distinto puesto
  const vistos = new Set()
  const lista = []
  for (const r of data || []) {
    const nombre = String(r.nombre || '').trim()
    if (!nombre || !esPersona(nombre)) continue
    const clave = nombre.toUpperCase() + '|' + String(r.puesto || '').trim().toUpperCase()
    if (vistos.has(clave)) continue
    vistos.add(clave)
    lista.push({ idresguardo: r.idresguardo, nombre, puesto: String(r.puesto || '').trim() })
  }
  return lista
}

export async function guardarEncargado(iddependencia, { encargado, puesto }) {
  const nombre = String(encargado || '').trim()
  const cargo  = String(puesto || '').trim()
  const { error } = await supabase
    .from('dependencias')
    .update({ encargado: nombre || null, puesto_encargado: cargo || null })
    .eq('iddependencia', iddependencia)
  if (error) throw error
}
