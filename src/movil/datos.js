import { supabase } from '../supabase'

// ── Consultas de la vista móvil ───────────────────────────────────────────────
// Se pide poco y concreto: en campo la señal es mala y la pantalla es chica.
// Los estados vigentes son los mismos que usa el escritorio.
const VIGENTES = ['ACTIVO', 'SOLICITUD BAJA']

const SELECT = `idbien, claveinventario, nombrebien, marca, tipo, serie, observaciones,
  categoriainventario, estadobien, idarea, areas ( nombrearea ),
  resguardos ( nombre, puesto ),
  facturas ( numerofactura, fechafactura, costoinicial )`

function mapear(b) {
  return {
    idbien:         b.idbien,
    clave:          b.claveinventario || '',
    nombre:         b.nombrebien || '',
    marca:          b.marca || '',
    modelo:         b.tipo || '',
    serie:          b.serie || '',
    observaciones:  b.observaciones || '',
    categoria:      b.categoriainventario || '',
    estado:         b.estadobien || '',
    idarea:         b.idarea,
    area:           b.areas?.nombrearea || '—',
    resguardante:   b.resguardos?.nombre || '—',
    puesto:         b.resguardos?.puesto || '',
    factura:        b.facturas?.numerofactura || '',
    fechafactura:   b.facturas?.fechafactura || '',
    importe:        b.facturas?.costoinicial || 0,
  }
}

// Dependencias con sus áreas y cuántos bienes vigentes tiene cada una
export async function areasConDependencia() {
  const { data, error } = await supabase
    .from('areas_activas')
    .select('idarea, nombrearea, total_bienes, iddependencia, nombredependencia')
    .order('nombredependencia', { ascending: true })
  if (error) throw error

  const deps = new Map()
  for (const a of data || []) {
    const nombre = a.nombredependencia || 'SIN DEPENDENCIA'
    if (!deps.has(nombre)) deps.set(nombre, { nombre, areas: [], total: 0 })
    const d = deps.get(nombre)
    d.areas.push(a)
    d.total += a.total_bienes || 0
  }
  return [...deps.values()]
}

// Todos los bienes vigentes de un área. Es la lista contra la que se recuenta,
// así que se trae completa de una vez: después el escaneo trabaja en memoria y
// no depende de la señal.
export async function bienesDeArea(idarea) {
  const BATCH = 1000
  let todos = [], desde = 0
  while (true) {
    const { data, error } = await supabase
      .from('bienes').select(SELECT)
      .eq('idarea', idarea)
      .in('estadobien', VIGENTES)
      .order('consecutivo', { ascending: true })
      .range(desde, desde + BATCH - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    todos = todos.concat(data.map(mapear))
    if (data.length < BATCH) break
    desde += BATCH
  }
  return todos
}

// Un bien por su clave de inventario: es lo que lleva el QR de la etiqueta.
// La clave es única en los 13,005 bienes vigentes, así que identifica sin
// ambigüedad. Se busca sin distinguir mayúsculas por si la capturan a mano.
export async function bienPorClave(clave) {
  const { data, error } = await supabase
    .from('bienes').select(SELECT)
    .ilike('claveinventario', String(clave || '').trim())
    .limit(2)
  if (error) throw error
  if (!data || data.length === 0) return null
  return mapear(data[0])
}

// Las mismas listas que en el escritorio: el inventario vigente, los traspasos
// y la papelera. Cambia nada más el estado que se pide.
const ESTADOS = {
  inventario: VIGENTES,
  traspasos:  ['TRASPASO'],
  papelera:   ['PAPELERA'],
}

export async function buscarBienes(texto, { lista = 'inventario', areaIds = [], limite = 40 } = {}) {
  const q = String(texto || '').trim()
  let consulta = supabase.from('bienes').select(SELECT)
    .in('estadobien', ESTADOS[lista] || VIGENTES)
    .order('idbien', { ascending: false })
    .limit(limite)

  if (q) consulta = consulta.or(`nombrebien.ilike.%${q}%,claveinventario.ilike.%${q}%,serie.ilike.%${q}%,marca.ilike.%${q}%`)
  if (areaIds && areaIds.length) consulta = consulta.in('idarea', areaIds)

  const { data, error } = await consulta
  if (error) throw error
  return (data || []).map(mapear)
}
