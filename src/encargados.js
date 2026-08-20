// Encargado de cada dependencia.
//
// La tabla `dependencias` solo trae iddependencia, nombredependencia y orden.
// Para que el dato se comparta entre equipos basta con agregar dos columnas:
//
//   alter table dependencias add column encargado text;
//   alter table dependencias add column puesto_encargado text;
//
// Este módulo las detecta solas: si existen guarda y lee de Supabase, y si no
// se apoya en el navegador —igual que los comentarios de inmuebles— para que la
// pantalla funcione sin tocar la base de datos.

import { supabase } from './supabase'

const LS = 'encargados_dependencias'

// Se resuelve con la primera consulta real, sin gastar una petición extra
let hayColumnas = null   // null = sin comprobar todavía

export function soportaColumnas() {
  return hayColumnas === true
}

function leerLocal() {
  try { return JSON.parse(localStorage.getItem(LS) || '{}') } catch { return {} }
}

function guardarLocal(mapa) {
  try { localStorage.setItem(LS, JSON.stringify(mapa)) } catch { /* noop */ }
}

// Devuelve las dependencias con su encargado, ordenadas por nombre.
// Se pide primero con las columnas nuevas: si la base todavía no las tiene,
// Postgrest responde error y se repite sin ellas. Así la detección no cuesta
// una petición aparte.
export async function fetchDependencias() {
  let conColumnas = hayColumnas !== false
  let data, error

  if (conColumnas) {
    ({ data, error } = await supabase.from('dependencias')
      .select('iddependencia, nombredependencia, orden, encargado, puesto_encargado'))
    if (error) { conColumnas = false; hayColumnas = false }
    else hayColumnas = true
  }
  if (!conColumnas) {
    ({ data, error } = await supabase.from('dependencias')
      .select('iddependencia, nombredependencia, orden'))
    if (error) throw error
  }

  const local = conColumnas ? {} : leerLocal()
  return (data || [])
    .map(d => {
      const guardado = local[d.iddependencia] || {}
      return {
        ...d,
        encargado: (conColumnas ? d.encargado : guardado.encargado) || '',
        puesto_encargado: (conColumnas ? d.puesto_encargado : guardado.puesto) || '',
      }
    })
    .sort((a, b) => String(a.nombredependencia || '').localeCompare(String(b.nombredependencia || ''), 'es'))
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

  if (soportaColumnas()) {
    const { error } = await supabase
      .from('dependencias')
      .update({ encargado: nombre || null, puesto_encargado: cargo || null })
      .eq('iddependencia', iddependencia)
    if (error) throw error
    return
  }

  const mapa = leerLocal()
  if (nombre || cargo) mapa[iddependencia] = { encargado: nombre, puesto: cargo }
  else delete mapa[iddependencia]
  guardarLocal(mapa)
}
