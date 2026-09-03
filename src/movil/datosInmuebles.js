import { supabaseInmuebles as supabase } from '../supabaseInmuebles'
import { ID_PROCESO, ID_DESINC, CATS_FUERA } from '../desincorporaciones'

// ── Consultas de inmuebles para la vista móvil ───────────────────────────────
// Mismo criterio que el escritorio: un inmueble vive en una sola lista, así que
// el inventario deja fuera comodato, desincorporado y los que están en trámite.
const SELECT = `idinmueble, claveinmueble, nombreinmueble, clavecatastral, superficiem2,
  ubicacion, valorcatastral, idcategoria, afavorde, fecha_enajenacion, expediente, documentopropiedad`

const FUERA = [...CATS_FUERA, ID_PROCESO]

function mapear(r, categorias) {
  const cat = (categorias || []).find(c => Number(c.idcategoria) === Number(r.idcategoria))
  return {
    idinmueble:   r.idinmueble,
    clave:        r.claveinmueble || '',
    nombre:       r.nombreinmueble || '',
    catastral:    r.clavecatastral || '',
    superficie:   r.superficiem2,
    ubicacion:    r.ubicacion || '',
    valor:        r.valorcatastral,
    idcategoria:  r.idcategoria,
    categoria:    cat?.nombrecategoria || '',
    afavorde:     r.afavorde || '',
    expediente:   r.expediente || '',
    documento:    r.documentopropiedad || '',
    fechaEnaj:    r.fecha_enajenacion || '',
  }
}

export async function categoriasInmuebles() {
  const { data, error } = await supabase
    .from('categoriasinmuebles')
    .select('idcategoria, nombrecategoria, clavecategoria')
    .order('nombrecategoria', { ascending: true })
  if (error) throw error
  return data || []
}

// Cuántos inmuebles hay en cada categoría del inventario vigente
export async function conteoPorCategoria(categorias) {
  const vivas = (categorias || []).filter(c => !FUERA.includes(Number(c.idcategoria)))
  const cuentas = await Promise.all(vivas.map(async c => {
    const { count, error } = await supabase
      .from('bienesinmuebles').select('idinmueble', { count: 'exact', head: true })
      .eq('idcategoria', c.idcategoria)
    if (error) throw error
    return { ...c, total: count || 0 }
  }))
  return cuentas.filter(c => c.total > 0)
}

export async function inmueblesDeCategoria(idcategoria, categorias) {
  const BATCH = 1000
  let todos = [], desde = 0
  while (true) {
    const { data, error } = await supabase
      .from('bienesinmuebles').select(SELECT)
      .eq('idcategoria', idcategoria)
      .order('consecutivo', { ascending: true })
      .range(desde, desde + BATCH - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    todos = todos.concat(data.map(r => mapear(r, categorias)))
    if (data.length < BATCH) break
    desde += BATCH
  }
  return todos
}

export async function buscarInmuebles(texto, categorias, limite = 40) {
  const q = String(texto || '').trim()
  if (!q) return []
  const { data, error } = await supabase
    .from('bienesinmuebles').select(SELECT)
    .not('idcategoria', 'in', `(${FUERA.join(',')})`)
    .or(`nombreinmueble.ilike.%${q}%,claveinmueble.ilike.%${q}%,clavecatastral.ilike.%${q}%,ubicacion.ilike.%${q}%`)
    .order('consecutivo', { ascending: true })
    .limit(limite)
  if (error) throw error
  return (data || []).map(r => mapear(r, categorias))
}

// Los dos apartados de salida, para las tarjetas de la pantalla de reportes
export async function conteosDesincorporacion() {
  const uno = async idcat => {
    const { count, error } = await supabase
      .from('bienesinmuebles').select('idinmueble', { count: 'exact', head: true })
      .eq('idcategoria', idcat)
    if (error) throw error
    return count || 0
  }
  const [proceso, desinc] = await Promise.all([uno(ID_PROCESO), uno(ID_DESINC)])
  return { proceso, desinc }
}

export async function inmueblePorClave(clave, categorias) {
  const { data, error } = await supabase
    .from('bienesinmuebles').select(SELECT)
    .ilike('claveinmueble', String(clave || '').trim())
    .limit(1)
  if (error) throw error
  if (!data || !data.length) return null
  return mapear(data[0], categorias)
}
