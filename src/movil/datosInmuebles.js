import { supabaseInmuebles as supabase } from '../supabaseInmuebles'
import { ID_PROCESO, ID_DESINC, CATS_FUERA } from '../desincorporaciones'

// ── Consultas de inmuebles para la vista móvil ───────────────────────────────
// Mismo criterio que el escritorio, para que los números cuadren:
//  · El patrimonio del ayuntamiento deja fuera lo que está en comodato (no es
//    propio) y lo ya desincorporado (ya salió). Lo que está EN PROCESO sí
//    cuenta: mientras el trámite no concluya, el inmueble sigue siendo del HAN.
//  · La lista por categorías las enseña todas, incluidas esas dos, y por eso
//    sus conteos no suman el total de arriba.
const SELECT = `idinmueble, claveinmueble, nombreinmueble, clavecatastral, superficiem2,
  ubicacion, valorcatastral, idcategoria, afavorde, fecha_enajenacion, expediente, documentopropiedad`

// Las que no son patrimonio: solo para el total, no para ocultar categorías
const FUERA = CATS_FUERA

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

// Cuántos inmuebles hay en cada categoría. Se enseñan todas las que tengan
// alguno, igual que en la computadora; las que no son patrimonio van marcadas.
export async function conteoPorCategoria(categorias) {
  const cuentas = await Promise.all((categorias || []).map(async c => {
    const { count, error } = await supabase
      .from('bienesinmuebles').select('idinmueble', { count: 'exact', head: true })
      .eq('idcategoria', c.idcategoria)
    if (error) throw error
    return { ...c, total: count || 0, fueraDelPatrimonio: FUERA.includes(Number(c.idcategoria)) }
  }))
  return cuentas.filter(c => c.total > 0)
}

// Los inmuebles que son patrimonio del ayuntamiento: el número grande del inicio
export async function totalPatrimonio() {
  const { count, error } = await supabase
    .from('bienesinmuebles').select('idinmueble', { count: 'exact', head: true })
    .not('idcategoria', 'in', `(${FUERA.join(',')})`)
  if (error) throw error
  return count || 0
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

// La búsqueda no esconde nada: en campo hace falta poder dar con cualquier
// inmueble, también uno en trámite. Cada resultado dice de qué categoría es.
export async function buscarInmuebles(texto, categorias, { limite = 40, idcategoria = '' } = {}) {
  const q = String(texto || '').trim()
  if (!q) return []
  let sel = supabase.from('bienesinmuebles').select(SELECT)
    .or(`nombreinmueble.ilike.%${q}%,claveinmueble.ilike.%${q}%,clavecatastral.ilike.%${q}%,ubicacion.ilike.%${q}%`)
  if (idcategoria) sel = sel.eq('idcategoria', Number(idcategoria))
  const { data, error } = await sel.order('consecutivo', { ascending: true }).limit(limite)
  if (error) throw error
  return (data || []).map(r => mapear(r, categorias))
}

// Guarda los datos que se pueden corregir desde el celular. La categoría y la
// clave no se tocan aquí: cambiarlas reasigna el consecutivo y eso se hace
// desde la computadora.
export async function actualizarInmueble(idinmueble, campos) {
  const txt = v => (String(v ?? '').trim() || null)
  const num = v => {
    const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''))
    return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null
  }
  const parche = {
    nombreinmueble:     txt(campos.nombre)?.toUpperCase() ?? null,
    clavecatastral:     txt(campos.catastral),
    ubicacion:          txt(campos.ubicacion),
    superficiem2:       num(campos.superficie),
    valorcatastral:     num(campos.valor),
    documentopropiedad: txt(campos.documento),
    expediente:         txt(campos.expediente),
    afavorde:           txt(campos.afavorde),
  }
  const { error } = await supabase.from('bienesinmuebles').update(parche).eq('idinmueble', idinmueble)
  if (error) throw error
  return parche
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
