// ── Lectura de un Excel para dar de alta bienes ──────────────────────────────
//
// Los inventarios de cada dependencia no están hechos con el mismo molde: el
// encabezado aparece en el renglón 4, en el 11 o en el 12; "D E S C R I P C I Ó N"
// es una celda combinada que abarca cuatro columnas y los nombres de verdad van
// en el renglón de abajo; y cada quien escribió el título a su manera —"TIPO",
// "TIPO / MODELO", "MODELO / PLACA"—.
//
// Por eso aquí no se asume nada: se busca el renglón que más parece encabezado,
// se juntan las dos filas de títulos y se reconocen las columnas por sinónimos.
// Lo que se deduzca se enseña antes de escribir, para poder corregirlo a mano.
//
// Este archivo no toca la base ni React: solo lee y ordena. Guardar es aparte.

let XLSX = null
// SheetJS pesa; se pide solo cuando alguien va a importar de verdad
async function cargarXLSX() {
  if (!XLSX) XLSX = await import('xlsx')
  return XLSX
}

export const txt  = v => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim()
export const norm = v => txt(v).toUpperCase()
  .replace(/[ÁÀÄÂ]/g, 'A').replace(/[ÉÈËÊ]/g, 'E').replace(/[ÍÌÏÎ]/g, 'I')
  .replace(/[ÓÒÖÔ]/g, 'O').replace(/[ÚÙÜÛ]/g, 'U').replace(/Ñ/g, 'N')

// ── Campos que sabemos llenar ────────────────────────────────────────────────
// `sinonimos` son los títulos tal como aparecen escritos en los archivos; se
// comparan ya normalizados y sin espacios, así "TIPO/MODELO" y "TIPO / MODELO"
// son lo mismo.
export const CAMPOS_MUEBLES = [
  { id: 'clave',        etiqueta: 'Clave de inventario', sinonimos: ['CLAVE DE INVENTARIO', 'CLAVE INVENTARIO', 'CLAVE', 'NO', 'NO.'] },
  { id: 'nombre',       etiqueta: 'Nombre del bien',     sinonimos: ['NOMBRE DEL BIEN', 'NOMBRE', 'DESCRIPCION', 'BIEN'], obligatorio: true },
  { id: 'marca',        etiqueta: 'Marca',               sinonimos: ['MARCA'] },
  { id: 'tipo',         etiqueta: 'Tipo / Modelo',       sinonimos: ['TIPO', 'MODELO', 'TIPO / MODELO', 'TIPO/MODELO', 'MODELO / PLACA', 'TIPO O MODELO'] },
  { id: 'serie',        etiqueta: 'Serie',               sinonimos: ['SERIE', 'SERIE (VIN)', 'NO. DE SERIE', 'NUMERO DE SERIE'] },
  { id: 'placa',        etiqueta: 'Placa',               sinonimos: ['PLACA', 'PLACAS'] },
  { id: 'anio',         etiqueta: 'Año',                 sinonimos: ['ANO', 'AÑO', 'MODELO ANO'] },
  { id: 'area',         etiqueta: 'Área de adscripción', sinonimos: ['AREA DE ADSCRIPCION', 'AREA DE ASCRIPCION', 'AREA', 'ADSCRIPCION', 'UNIDAD ADMINISTRATIVA'] },
  { id: 'resguardo',    etiqueta: 'Resguardo a cargo de',sinonimos: ['RESGUARDO A CARGO DE', 'NOMBRE / PUESTO', 'NOMBRE/PUESTO', 'RESGUARDANTE', 'RESGUARDATARIO', 'RESGUARDO'] },
  { id: 'observaciones',etiqueta: 'Observaciones',       sinonimos: ['OBSERVACIONES', 'OBSERVACION', 'NOTAS'] },
  { id: 'importe',      etiqueta: 'Importe',             sinonimos: ['IMPORTE', 'VALOR FACTURA', 'VALOR FACTURA / AVALUO', 'VALOR', 'COSTO', 'VALOR FACTURA/AVALUO'] },
  { id: 'factura',      etiqueta: 'Factura',             sinonimos: ['FACTURA', 'FACTURA / AVALUO', 'FACTURA/AVALUO', 'NO. DE FACTURA', 'NUMERO DE FACTURA'] },
  { id: 'proveedor',    etiqueta: 'Proveedor',           sinonimos: ['PROVEEDOR'] },
  { id: 'fechafactura', etiqueta: 'Fecha de factura',    sinonimos: ['FECHA FACTURA', 'FECHA DE FACTURA', 'FECHA'] },
  // "CAPITULO" va al final a propósito: en los libros que titulan la columna
  // "PARTIDA 5000 CAPITULO:" gana PARTIDA, y donde dice solo "CAPITULO" el
  // contenido igual son partidas (51501), no capítulos.
  { id: 'partida',      etiqueta: 'Partida',             sinonimos: ['PARTIDA', 'CONAC', 'PARTIDA CONAC', 'CAPITULO'] },
]

export const CAMPOS_INMUEBLES = [
  { id: 'clave',        etiqueta: 'No. (clave)',          sinonimos: ['NO', 'NO.', 'CLAVE', 'CLAVE DE INVENTARIO', 'NUMERO'] },
  { id: 'nombre',       etiqueta: 'Nombre del inmueble',  sinonimos: ['NOMBRE DEL INMUEBLE', 'NOMBRE', 'CATEGORIA EDIFICIO O INMUEBLE', 'INMUEBLE', 'DESCRIPCION'], obligatorio: true },
  { id: 'clavecatastral', etiqueta: 'Clave catastral',    sinonimos: ['CLAVE CATASTRAL', 'CATASTRAL'] },
  { id: 'superficie',   etiqueta: 'Superficie m²',        sinonimos: ['SUPERFICIE M2', 'SUPERFICIE', 'SUPERFICIEM2', 'M2'] },
  { id: 'ubicacion',    etiqueta: 'Ubicación',            sinonimos: ['UBICACION', 'DOMICILIO', 'DIRECCION'] },
  { id: 'adquisicion',  etiqueta: 'Adquisición',          sinonimos: ['ADQUISICION', 'FORMA DE ADQUISICION'] },
  { id: 'valor',        etiqueta: 'Valor catastral',      sinonimos: ['VALOR CATASTRAL', 'VALOR'] },
  { id: 'documento',    etiqueta: 'Documento de propiedad', sinonimos: ['DOCUMENTO DE PROPIEDAD', 'DOCUMENTO', 'PROPIEDAD'] },
  { id: 'expediente',   etiqueta: 'Expediente',           sinonimos: ['EXPEDIENTE'] },
  { id: 'afavorde',     etiqueta: 'A favor de',           sinonimos: ['A FAVOR DE', 'AFAVORDE'] },
  { id: 'fechaenaj',    etiqueta: 'Fecha de enajenación', sinonimos: ['FECHA DE ENAJENACION', 'FECHA ENAJENACION', 'ENAJENACION'] },
]

// ── Lectura del archivo ──────────────────────────────────────────────────────
// Devuelve las hojas con su contenido como matriz de textos, con las celdas
// combinadas ya repetidas en todo su rango (si no, el encabezado de grupo solo
// aparecería en su esquina y no habría cómo reconocerlo).
export async function leerArchivo(file) {
  const X = await cargarXLSX()
  const buf = await file.arrayBuffer()
  const libro = X.read(buf, { type: 'array', cellDates: true })

  return libro.SheetNames.map(nombre => {
    const ws = libro.Sheets[nombre]

    // Se lee SIEMPRE desde A1, aunque la hoja empiece en otra columna. Varios
    // inventarios dejan la A vacía y declaran su rango desde la B; sin esto,
    // la primera columna del arreglo sería la B y todos los índices quedarían
    // corridos uno —y las celdas combinadas, que sí vienen en coordenadas
    // absolutas, se expandirían encima de la columna equivocada.
    const ref = ws['!ref'] ? X.utils.decode_range(ws['!ref']) : null
    const rango = ref ? { s: { r: 0, c: 0 }, e: ref.e } : undefined
    const filas = X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true, range: rango })

    for (const m of ws['!merges'] || []) {
      const v = filas[m.s.r]?.[m.s.c]
      if (v == null || v === '') continue
      for (let r = m.s.r; r <= m.e.r; r++) {
        if (!filas[r]) filas[r] = []
        for (let c = m.s.c; c <= m.e.c; c++) if (filas[r][c] == null || filas[r][c] === '') filas[r][c] = v
      }
    }
    return { nombre, filas }
  })
}

// ── Encabezado ───────────────────────────────────────────────────────────────
const sinEspacios = s => norm(s).replace(/[^A-Z0-9]/g, '')

function puntajeEncabezado(fila, campos) {
  if (!fila) return 0
  let n = 0
  for (const celda of fila) {
    const v = sinEspacios(celda)
    if (!v) continue
    if (campos.some(c => c.sinonimos.some(s => sinEspacios(s) === v))) n++
  }
  return n
}

// El encabezado casi siempre ocupa dos renglones: arriba van los títulos que
// abarcan varias columnas ("D E S C R I P C I Ó N", "RESGUARDO A CARGO DE:") y
// abajo los concretos ("NOMBRE DEL BIEN", "MARCA", "NOMBRE / PUESTO").
//
// Se guardan los DOS, no uno solo. Quedarse con el de abajo perdía el área en
// los libros donde el renglón inferior repite "MARCA" justo debajo de "AREA DE
// ASCRIPCION"; y quedarse con el de arriba perdía el nombre del bien.
export function detectarEncabezado(filas, campos) {
  let mejor = { fila: -1, puntaje: 0 }
  const hasta = Math.min(filas.length, 40)
  for (let f = 0; f < hasta; f++) {
    const p = puntajeEncabezado(filas[f], campos)
    if (p > mejor.puntaje) mejor = { fila: f, puntaje: p }
  }
  if (mejor.fila < 0 || mejor.puntaje < 2) return null

  // El renglón con más títulos suele ser el de abajo. Si el de encima también
  // parece encabezado, el par empieza ahí: si no, se pierden las columnas que
  // solo aparecen arriba (clave, área, observaciones).
  let primera = mejor.fila
  if (primera > 0 && puntajeEncabezado(filas[primera - 1], campos) >= 2) primera--

  const segunda = puntajeEncabezado(filas[primera + 1], campos) >= 2 ? primera + 1 : -1
  const ancho = Math.max((filas[primera] || []).length, segunda >= 0 ? (filas[segunda] || []).length : 0)

  const titulos = []
  for (let c = 0; c < ancho; c++) {
    titulos.push({
      arriba: txt(filas[primera]?.[c]),
      abajo:  segunda >= 0 ? txt(filas[segunda]?.[c]) : '',
    })
  }
  return { fila: primera, filaDatos: (segunda >= 0 ? segunda : primera) + 1, titulos }
}

// Etiqueta legible de una columna, para enseñarla en la pantalla
export const tituloDe = t => (t ? (t.abajo && t.arriba && t.abajo !== t.arriba
  ? `${t.arriba} · ${t.abajo}` : (t.abajo || t.arriba)) : '')

export function mapearColumnas(titulos, campos) {
  const mapa = {}          // idCampo -> índice de columna
  const usadas = new Set()

  // Cuatro pasadas, de la más confiable a la más floja. Lo exacto antes que lo
  // parcial evita que "FECHA FACTURA" se quede con la columna de "FECHA DE
  // ENAJENACION"; y el título de abajo antes que el de arriba respeta que el
  // inferior es el específico, sin perder el superior cuando el de abajo está
  // repetido en otra columna.
  const pasadas = [
    { donde: 'abajo',  exacta: true },
    { donde: 'arriba', exacta: true },
    { donde: 'abajo',  exacta: false },
    { donde: 'arriba', exacta: false },
  ]
  for (const { donde, exacta } of pasadas) {
    for (const campo of campos) {
      if (mapa[campo.id] != null) continue
      for (let c = 0; c < titulos.length; c++) {
        if (usadas.has(c)) continue
        const t = sinEspacios(titulos[c]?.[donde])
        if (!t) continue
        const pega = campo.sinonimos.some(s => {
          const x = sinEspacios(s)
          return exacta ? x === t : (t.includes(x) && x.length >= 4)
        })
        if (pega) { mapa[campo.id] = c; usadas.add(c); break }
      }
    }
  }
  return mapa
}

// ── Valores ──────────────────────────────────────────────────────────────────
export function aTexto(v) {
  if (v == null) return ''
  if (v instanceof Date) return isNaN(v) ? '' : v.toISOString().slice(0, 10)
  return txt(v)
}

// "$ 5,614.92" → 5614.92 · "2,000.25 M2" → 2000.25 · 5614.92 → 5614.92
//
// Se toma el PRIMER número del texto, no todos los dígitos que haya. Quitando
// solo las letras, la unidad "M2" aportaba su 2 y una superficie de 2,000.25 M2
// terminaba siendo 2000.252.
export function aNumero(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return isFinite(v) ? v : null
  const m = /-?\d[\d,]*(?:\.\d+)?/.exec(String(v))
  if (!m) return null
  const n = Number(m[0].replace(/,/g, ''))
  return isFinite(n) ? n : null
}

const MESES = { ENE:1, FEB:2, MAR:3, ABR:4, MAY:5, JUN:6, JUL:7, AGO:8, SEP:9, SET:9, OCT:10, NOV:11, DIC:12 }

// Las fechas vienen de tres formas: como fecha de Excel, como número de serie
// suelto ("45838") o como texto ("26-Mar-25", "15/MAY/1940").
export function aFecha(v) {
  if (v == null || v === '') return null
  if (v instanceof Date) return isNaN(v) ? null : iso(v.getFullYear(), v.getMonth() + 1, v.getDate())
  if (typeof v === 'number' && v > 1000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000)
    return isNaN(d) ? null : d.toISOString().slice(0, 10)
  }
  const t = norm(v)
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t)
  if (m) return iso(m[1], m[2], m[3])
  m = new RegExp('(\\d{1,2})\\s*[\\/\\-. ]\\s*(' + Object.keys(MESES).join('|') + ')[A-Z]*\\s*[\\/\\-. ]\\s*(\\d{2,4})').exec(t)
  if (m) return iso(anio4(m[3]), MESES[m[2]], m[1])
  m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(t)
  if (m && Number(m[2]) <= 12) return iso(anio4(m[3]), m[2], m[1])
  return null
}
const anio4 = a => { const n = Number(a); return n < 100 ? (n > 50 ? 1900 + n : 2000 + n) : n }
function iso(a, m, d) {
  const A = Number(a), M = Number(m), D = Number(d)
  if (!A || !M || !D || M > 12 || D > 31 || A < 1900 || A > 2100) return null
  return A + '-' + String(M).padStart(2, '0') + '-' + String(D).padStart(2, '0')
}

// ── Renglones ────────────────────────────────────────────────────────────────
// Un renglón entra si tiene nombre. Las hojas traen títulos de bloque, totales
// y renglones en blanco entre medio: sin nombre no hay bien que dar de alta.
export function extraerFilas(filas, filaDatos, mapa, campos) {
  const out = []
  const iNombre = mapa.nombre
  for (let f = filaDatos; f < filas.length; f++) {
    const fila = filas[f]
    if (!fila) continue
    const nombre = iNombre != null ? aTexto(fila[iNombre]) : ''
    if (!nombre) continue

    // Los inventarios cierran con un renglón de totales: el número de bienes cae
    // en la columna de la descripción y la suma en la del importe. Se cuela como
    // un bien llamado "131", así que se descarta: nombre que es solo un número y
    // sin clave. Un bien de verdad siempre trae clave.
    const claveAqui = mapa.clave != null ? aTexto(fila[mapa.clave]) : ''
    if (!claveAqui && /^\d+([.,]\d+)?$/.test(nombre)) continue

    const datos = {}
    for (const campo of campos) {
      const c = mapa[campo.id]
      datos[campo.id] = c != null ? fila[c] : null
    }
    out.push({ fila: f + 1, datos })
  }
  return out
}
