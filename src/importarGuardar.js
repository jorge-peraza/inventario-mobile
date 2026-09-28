// ── Alta de bienes leídos de un Excel ────────────────────────────────────────
//
// Dos pasos, siempre en este orden:
//
//   analizar…()  no escribe nada. Resuelve el área de cada renglón, detecta las
//                claves que ya existen y devuelve el estado de cada uno para
//                enseñarlo antes de decidir.
//   guardar…()   inserta solo los renglones que quedaron en estado 'listo'.
//
// Las claves repetidas se saltan: en este inventario una misma clave llegó a
// usarse para bienes distintos, así que crear otra copia es justo lo que hay
// que evitar cuando se recarga un archivo que ya se había importado.

import { supabase } from './supabase'
import { supabaseInmuebles } from './supabaseInmuebles'
import { CLAVE_POR_AREA } from './claves'
import { aTexto, aNumero, aFecha, norm, txt } from './importarExcel'

const trozos = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }

// Para comparar nombres de área: sin acentos, sin signos y sin espacios de más
const llave = s => norm(s).replace(/[^A-Z0-9]+/g, ' ').trim()

// ── Claves que ya están en la base ───────────────────────────────────────────
async function clavesExistentes(claves, { tabla, columna, cliente }) {
  const limpias = [...new Set(claves.filter(Boolean))]
  const ya = new Set()
  for (const t of trozos(limpias, 150)) {
    const { data, error } = await cliente.from(tabla).select(columna).in(columna, t)
    if (error) throw error
    for (const r of data || []) ya.add(norm(r[columna]))
  }
  return ya
}

// ── MUEBLES ──────────────────────────────────────────────────────────────────

// `areas` es el catálogo (fetchAreas): [{ idarea, nombrearea, nombredependencia }]
// Cómo viene escrita el área en los Excel, y cómo se busca en el catálogo:
//
//   "H. CABILDO"                              el área tal cual
//   "SERVICIOS PUBLICOS/ALUMBRADO PUBLICO"    dependencia corta / área
//   "DIRECCION DE SALUD / CENTRO ATENCION"    dependencia larga / área
//
// La dependencia casi nunca coincide palabra por palabra con el catálogo
// —"SERVICIOS PUBLICOS" contra "DIRECCION DE SERVICIOS PUBLICOS…"—, así que lo
// que manda es el área: se prueba el texto completo, luego cada parte separada
// por diagonal, y al final una coincidencia parcial que solo vale si es única.
function crearBuscadorAreas(areas) {
  const lista = areas || []
  const exactas = new Map()
  const porDependencia = new Map()   // nombre de dependencia -> áreas que tiene

  for (const a of lista) {
    const k = llave(a.nombrearea)
    if (k && !exactas.has(k)) exactas.set(k, a.idarea)
    const conDep = llave(`${a.nombredependencia} ${a.nombrearea}`)
    if (conDep && !exactas.has(conDep)) exactas.set(conDep, a.idarea)
    const d = llave(a.nombredependencia)
    if (d) { if (!porDependencia.has(d)) porDependencia.set(d, []); porDependencia.get(d).push(a) }
  }

  // Una sola área en esa dependencia: no hay a dónde más mandarlo
  const unicaDe = (candidato) => {
    if (!candidato || candidato.length < 5) return null
    const deps = [...porDependencia.entries()].filter(([d]) =>
      d === candidato || d.includes(candidato) || candidato.includes(d))
    if (deps.length !== 1) return null
    const suyas = deps[0][1]
    return suyas.length === 1 ? suyas[0].idarea : null
  }

  // Devuelve { idarea, exacta } o null. `exacta` en false significa que se
  // dedujo: el renglón se marca en la revisión para que alguien lo confirme,
  // porque mandar un bien al área equivocada no se nota hasta mucho después.
  return (texto) => {
    const t = llave(texto)
    if (!t) return null
    if (exactas.has(t)) return { idarea: exactas.get(t), exacta: true }

    // Por partes: "DEPENDENCIA / AREA" — de la última a la primera, que es
    // donde suele venir el área
    // Solo la ÚLTIMA parte cuenta como coincidencia exacta: ahí va el área. Si
    // pega una parte anterior es la dependencia, y que su nombre coincida con
    // el de un área no significa que el bien vaya ahí —"SERVICIOS PUBLICOS/
    // RELLENO SANITARIO" acabaría en el área "SERVICIOS PUBLICOS" sin avisar—.
    const partes = String(texto).split(/[\/|·]/).map(p => llave(p)).filter(Boolean)
    for (let i = partes.length - 1; i >= 0; i--) {
      if (exactas.has(partes[i])) return { idarea: exactas.get(partes[i]), exacta: i === partes.length - 1 }
    }

    // Las partes van ANTES que el texto completo, y la última antes que la
    // primera: en "SERVICIOS PUBLICOS/RELLENO SANITARIO" el área es la de la
    // derecha. Probando el texto entero primero se lo llevaba "SERVICIOS
    // PUBLICOS", que también encaja y es la dependencia, no el área.
    const candidatos = [...partes.slice().reverse(), t]
    // Parcial contra nombres de área, y solo si es única: si encajan dos, no se
    // adivina —mandar un bien al área equivocada es peor que dejarlo marcado.
    for (const cand of candidatos) {
      if (cand.length < 5) continue
      const pegan = lista.filter(a => {
        const n = llave(a.nombrearea)
        return n && (n === cand || n.includes(cand) || cand.includes(n))
      })
      if (pegan.length === 1) return { idarea: pegan[0].idarea, exacta: false }
    }
    // Escribieron solo la dependencia: vale si esa dependencia tiene una sola área
    for (const cand of candidatos) {
      const id = unicaDe(cand)
      if (id) return { idarea: id, exacta: false }
    }
    return null
  }
}

// ── El área según la clave de inventario ─────────────────────────────────────
// La clave la lleva dentro: CR12-A1-1-005 → prefijo CR + clave de Tesorería A1,
// que es justo el par que el catálogo asigna a cada área. Es más confiable que
// el texto de la columna, donde cada quien escribió la dependencia a su manera.
//
// Hay pares que comparten dos áreas (DS-3101 es Salud y Centro de Protección
// Animal). Ahí la clave sola no basta: se desempata con el texto, y si tampoco
// alcanza se marca para confirmar en vez de elegir por elegir.
function partirClave(clave) {
  const m = /^([A-Z]+)(\d{2})-([A-Z0-9]+)-/.exec(norm(clave))
  return m ? { prefijo: m[1], tesoreria: m[3] } : null
}

function crearBuscadorPorClave(areas) {
  const porPar = new Map()   // "PREFIJO|TESORERIA" -> [idarea]
  for (const a of areas || []) {
    const par = CLAVE_POR_AREA[Number(a.idarea)]
    if (!par) continue
    const k = norm(par[0]) + '|' + norm(par[1])
    if (!porPar.has(k)) porPar.set(k, [])
    porPar.get(k).push(a.idarea)
  }
  return (clave) => {
    const p = partirClave(clave)
    if (!p) return []
    return porPar.get(p.prefijo + '|' + p.tesoreria) || []
  }
}

export async function analizarMuebles(filas, { areas, idareaPorDefecto }) {
  const buscarArea = crearBuscadorAreas(areas)
  const areasDeClave = crearBuscadorPorClave(areas)
  const nombrePorId = new Map((areas || []).map(a => [a.idarea, a.nombrearea]))

  const claves = filas.map(f => aTexto(f.datos.clave)).filter(Boolean)
  const ya = await clavesExistentes(claves, { tabla: 'bienes', columna: 'claveinventario', cliente: supabase })

  return filas.map(f => {
    const d = f.datos
    const clave = aTexto(d.clave)
    const nombre = aTexto(d.nombre)
    const textoArea = aTexto(d.area)
    const porTexto = buscarArea(textoArea)
    const deClave = areasDeClave(clave)

    // Manda la clave. Si apunta a una sola área, esa es. Si apunta a varias, se
    // desempata con el texto; y si no hay clave, se va por el texto.
    let hallada = null
    if (deClave.length === 1) hallada = { idarea: deClave[0], exacta: true, via: 'clave' }
    else if (deClave.length > 1) {
      hallada = porTexto && deClave.includes(porTexto.idarea)
        ? { idarea: porTexto.idarea, exacta: true, via: 'clave y área' }
        : { idarea: deClave[0], exacta: false, via: 'clave' }
    } else if (porTexto) hallada = { ...porTexto, via: 'área' }

    const idarea = hallada ? hallada.idarea : (idareaPorDefecto || null)
    const nombreArea = idarea ? (nombrePorId.get(idarea) || '') : ''

    let estado = 'listo', nota = ''
    if (!nombre) { estado = 'error'; nota = 'sin nombre del bien' }
    else if (clave && ya.has(norm(clave))) { estado = 'repetido'; nota = 'la clave ya existe en la base' }
    else if (!idarea) { estado = 'error'; nota = 'no reconozco el área' }
    else if (!hallada) nota = 'área por omisión'
    else if (!hallada.exacta) nota = 'área deducida, confírmala'

    return {
      fila: f.fila, estado, nota,
      clave, nombre, idarea, textoArea, nombreArea,
      marca: aTexto(d.marca), tipo: aTexto(d.tipo), serie: aTexto(d.serie),
      placa: aTexto(d.placa), anio: aTexto(d.anio), partida: aTexto(d.partida),
      observaciones: aTexto(d.observaciones),
      resguardo: aTexto(d.resguardo),
      importe: aNumero(d.importe),
      factura: aTexto(d.factura),
      proveedor: aTexto(d.proveedor),
      fechafactura: aFecha(d.fechafactura),
    }
  })
}

// El nombre y el puesto vienen juntos: "LIC. JUAN RUIZ/DIRECTOR GENERAL"
function partirResguardo(v) {
  const s = txt(v)
  if (!s) return { nombre: '', puesto: '' }
  const i = s.indexOf('/')
  return i < 0 ? { nombre: s, puesto: '' } : { nombre: s.slice(0, i).trim(), puesto: s.slice(i + 1).trim() }
}

// Reutiliza el registro si el nombre ya está en el catálogo; si no, lo crea.
// Igual que al dar de alta a mano, para no llenar los catálogos de duplicados.
async function resolverDeCatalogo(cache, nombre, { tabla, idCol, nomCol, extra }) {
  const nom = txt(nombre).toUpperCase()
  if (!nom) return null
  if (cache.has(nom)) return cache.get(nom)

  const { data } = await supabase.from(tabla).select(idCol).ilike(nomCol, nom).limit(1)
  let id = data && data[0] ? data[0][idCol] : null
  if (id == null) {
    const { data: ult, error: e1 } = await supabase.from(tabla).select(idCol).order(idCol, { ascending: false }).limit(1)
    if (e1) throw e1
    id = ((ult && ult[0]?.[idCol]) || 0) + 1
    const { error: e2 } = await supabase.from(tabla).insert({ [idCol]: id, [nomCol]: nom, ...(extra || {}) })
    if (e2) throw e2
  }
  cache.set(nom, id)
  return id
}

// El consecutivo sale de la propia clave: CR12-A1-1-005 → 5. Es el número que
// usa la pantalla para ordenar, y así respeta el del Excel en vez de inventar uno.
function consecutivoDeClave(clave) {
  const m = /-(\d+)\s*$/.exec(txt(clave))
  return m ? Number(m[1]) : null
}

export async function guardarMuebles(analizadas, { categoria, onProgreso }) {
  const listas = analizadas.filter(r => r.estado === 'listo')
  if (!listas.length) return { insertados: 0, facturas: 0 }

  const cacheProv = new Map(), cacheResg = new Map()
  const avisar = (hechos) => onProgreso && onProgreso(hechos, listas.length)

  // Solo se factura lo que trae algún dato de compra. Ojo: se mira el texto del
  // Excel, no el proveedor ya resuelto, porque abajo se le pone uno por omisión
  // y si no todos los bienes acabarían con factura.
  const tieneCompra = r => r.importe != null || !!r.factura || !!r.proveedor || !!r.fechafactura

  // Catálogos primero: así el insert de bienes ya lleva los ids resueltos
  for (const r of listas) {
    // `facturas.idproveedor` no admite nulos, y en los Excel es normal que la
    // columna venga vacía; va al registro "SIN PROVEEDOR", que ya existe y es
    // el que usa el resto del inventario para lo mismo.
    r.idproveedor = tieneCompra(r)
      ? await resolverDeCatalogo(cacheProv, r.proveedor || 'SIN PROVEEDOR',
          { tabla: 'proveedores', idCol: 'idproveedor', nomCol: 'nombreproveedor' })
      : null
    const { nombre, puesto } = partirResguardo(r.resguardo)
    r.idresguardo = nombre ? await resolverDeCatalogo(cacheResg, nombre,
      { tabla: 'resguardos', idCol: 'idresguardo', nomCol: 'nombre', extra: { puesto: puesto || null } }) : null
  }

  // Ni idbien ni idfactura son autoincrementales: se toman del máximo actual
  const { data: maxB, error: eB } = await supabase.from('bienes').select('idbien').order('idbien', { ascending: false }).limit(1)
  if (eB) throw eB
  let idbien = ((maxB && maxB[0]?.idbien) || 0) + 1

  const conCompra = listas.filter(tieneCompra)
  let idfactura = null
  if (conCompra.length) {
    const { data: maxF, error: eF } = await supabase.from('facturas').select('idfactura').order('idfactura', { ascending: false }).limit(1)
    if (eF) throw eF
    idfactura = ((maxF && maxF[0]?.idfactura) || 0) + 1
  }

  // Una factura por bien, con su costo unitario: es como está el resto del
  // inventario y así el reporte de conciliación vuelve a sumar la compra.
  const facturas = [], bienes = []
  for (const r of listas) {
    let suFactura = null
    if (tieneCompra(r)) {
      suFactura = idfactura++
      facturas.push({
        idfactura: suFactura,
        numerofactura: r.factura || null,
        fechafactura: r.fechafactura || null,
        costoinicial: r.importe,
        idproveedor: r.idproveedor,
      })
    }
    bienes.push({
      idbien: idbien++,
      claveinventario: r.clave || null,
      consecutivo: consecutivoDeClave(r.clave),
      nombrebien: r.nombre.toUpperCase(),
      marca: r.marca || null,
      tipo: r.tipo || null,
      serie: r.serie || null,
      placa: r.placa || null,
      anio: r.anio ? Number(String(r.anio).replace(/\D/g, '')) || null : null,
      observaciones: r.observaciones || null,
      idarea: Number(r.idarea),
      idresguardo: r.idresguardo,
      idfactura: suFactura,
      partida: r.partida || null,
      categoriainventario: categoria,
      estadobien: 'ACTIVO',
    })
  }

  // Las facturas van antes: un bien no puede apuntar a una que no existe
  const creadas = []
  try {
    for (const t of trozos(facturas, 200)) {
      const { error } = await supabase.from('facturas').insert(t)
      if (error) throw error
      creadas.push(...t.map(f => f.idfactura))
    }
    let hechos = 0
    for (const t of trozos(bienes, 200)) {
      const { error } = await supabase.from('bienes').insert(t)
      if (error) throw error
      hechos += t.length
      avisar(hechos)
    }
  } catch (e) {
    // Si los bienes fallaron después de crear las facturas, se borran: si no,
    // quedarían sueltas y el reporte las contaría sin ningún bien detrás
    if (creadas.length) await supabase.from('facturas').delete().in('idfactura', creadas)
    throw e
  }

  return { insertados: bienes.length, facturas: facturas.length }
}

// ── INMUEBLES ────────────────────────────────────────────────────────────────

// La categoría va en la propia clave: 128-EDYR es un espacio deportivo, 07-PN un
// panteón. Un Excel casi siempre trae inmuebles de varias categorías mezclados,
// así que cada renglón se manda a la suya en vez de a una sola para todos.
//
// Se confirmó contra los 1,447 inmuebles de la base: cada sufijo apunta a una
// categoría y solo a una. Las únicas mezclas son con "EN PROCESO DE
// DESINCORPORACION" y "DESINCORPORADO DEL HAN", que no son categorías sino
// estados —un BOL desincorporado conserva su clave BOL—, y a esas no se importa.
export const CATEGORIA_POR_SUFIJO = {
  E: 1,       // EDIFICIO O INMUEBLE
  PL: 2,      // PLAZAS Y MONUMENTOS
  PN: 3,      // PANTEONES
  I: 4,       // PREDIOS
  BOL: 5,     // EQUIPAMIENTOS, AREAS VERDES, TALUDES & DERECHO DE PASO
  BOS: 6,     // BOSQUES URBANOS
  EDYR: 7,    // ESPACIOS DEPORTIVOS Y RECREACIÓN
  CC: 8,      // CENTROS COMUNITARIOS
  EDU: 9,     // EDUCACION
  VIA: 10,    // VIALIDADES, CALLES
  C: 11,      // EN COMODATO
}

// "128-EDYR" → 7. Las claves viejas tipo "PEND-42" o "SIN CLAVE" no encajan y
// devuelven null: ese renglón se queda con la categoría por omisión.
export function categoriaDeClave(clave) {
  const m = /^\s*\d+\s*-\s*([A-Za-z]+)\s*$/.exec(txt(clave))
  return m ? (CATEGORIA_POR_SUFIJO[m[1].toUpperCase()] || null) : null
}

export async function analizarInmuebles(filas, { categorias, idcategoriaPorDefecto }) {
  const existe = new Set((categorias || []).map(c => c.idcategoria))

  const claves = filas.map(f => aTexto(f.datos.clave)).filter(Boolean)
  const ya = await clavesExistentes(claves, { tabla: 'bienesinmuebles', columna: 'claveinmueble', cliente: supabaseInmuebles })

  return filas.map(f => {
    const d = f.datos
    const clave = aTexto(d.clave)
    const nombre = aTexto(d.nombre)

    // Manda la clave; si no se reconoce, la categoría elegida en la pantalla
    const deClave = categoriaDeClave(clave)
    const porClave = deClave != null && existe.has(deClave)
    const idcategoria = porClave ? deClave : (idcategoriaPorDefecto || null)

    let estado = 'listo', nota = ''
    if (!nombre) { estado = 'error'; nota = 'sin nombre del inmueble' }
    else if (clave && ya.has(norm(clave))) { estado = 'repetido'; nota = 'la clave ya existe en la base' }
    else if (!idcategoria) { estado = 'error'; nota = 'no reconozco la categoría en la clave' }
    else if (!porClave) nota = 'categoría por omisión'

    return {
      fila: f.fila, estado, nota,
      clave, nombre, idcategoria, categoriaDeClave: porClave,
      clavecatastral: aTexto(d.clavecatastral),
      superficie: aNumero(d.superficie),
      ubicacion: aTexto(d.ubicacion),
      adquisicion: aTexto(d.adquisicion),
      valor: aNumero(d.valor),
      documento: aTexto(d.documento),
      expediente: aTexto(d.expediente),
      afavorde: aTexto(d.afavorde),
      fechaenaj: aFecha(d.fechaenaj),
    }
  })
}

export async function guardarInmuebles(analizadas, { onProgreso }) {
  const listas = analizadas.filter(r => r.estado === 'listo')
  if (!listas.length) return { insertados: 0 }

  // El consecutivo es una serie continua; se toma el último y se sigue de ahí
  const { data: ult, error } = await supabaseInmuebles.from('bienesinmuebles')
    .select('consecutivo').order('consecutivo', { ascending: false }).limit(1)
  if (error) throw error
  let consecutivo = ((ult && ult[0]?.consecutivo) || 0) + 1

  const filas = listas.map(r => ({
    claveinmueble: r.clave || null,
    consecutivo: consecutivo++,
    nombreinmueble: r.nombre.toUpperCase(),
    idcategoria: Number(r.idcategoria),
    clavecatastral: r.clavecatastral || null,
    superficiem2: r.superficie,
    ubicacion: r.ubicacion || null,
    valorcatastral: r.valor,
    documentopropiedad: r.documento || null,
    expediente: r.expediente || null,
    adquisicion: r.adquisicion || null,
    afavorde: r.afavorde || null,
    fecha_enajenacion: r.fechaenaj || null,
  }))

  let hechos = 0
  for (const t of trozos(filas, 200)) {
    const { error: e } = await supabaseInmuebles.from('bienesinmuebles').insert(t)
    if (e) throw e
    hechos += t.length
    onProgreso && onProgreso(hechos, filas.length)
  }
  return { insertados: filas.length }
}
