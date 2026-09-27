// ── Librerías de exportación, bajo demanda ──────────────────────────────────
// ExcelJS, jsPDF y compañía pesan casi un megabyte. Antes venían en el paquete
// principal, así que el celular —que nunca exporta— las descargaba igual al
// abrir la app. Ahora se piden la primera vez que alguien genera un Excel o un
// PDF y se quedan en memoria para las siguientes.

let excel = null
let pdf = null

export function cargarExcel() {
  if (!excel) {
    excel = Promise.all([import('exceljs'), import('file-saver')])
      .then(([e, f]) => ({ ExcelJS: e.default, saveAs: f.saveAs }))
      .catch(err => { excel = null; throw err })   // se reintenta la próxima vez
  }
  return excel
}

export function cargarPdf() {
  if (!pdf) {
    pdf = Promise.all([import('jspdf'), import('jspdf-autotable'), import('file-saver')])
      .then(([j, a, f]) => ({ jsPDF: j.default, autoTable: a.default, saveAs: f.saveAs }))
      .catch(err => { pdf = null; throw err })
  }
  return pdf
}

// ── Nombre del archivo ──────────────────────────────────────────────────────
// Sale del título del documento, así cada reporte se descarga con su nombre
// ("REPORTE MENSUAL BIENES MUEBLES DEL 1 DE AGOSTO…pdf") en vez de que todos se
// llamen igual. Sin título se usa el respaldo con la fecha del día.
export function nombreArchivo(titulo, respaldo, ext) {
  const limpio = String(titulo || '')
    .replace(/[\/:*?"<>|]+/g, '-')   // lo que Windows no acepta en un nombre
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150)
  const base = limpio || `${respaldo}-${new Date().toISOString().slice(0, 10)}`
  return `${base}.${ext}`
}

// ── Periodo en palabras ─────────────────────────────────────────────────────
// "DEL 1 DE AGOSTO DE 2026 AL 31 DE AGOSTO DE 2026". Con una sola fecha dice
// "DESDE EL…" o "HASTA EL…"; sin fechas, nada.
const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']
export function fechaEnPalabras(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${Number(m[3])} DE ${MESES[Number(m[2]) - 1] || ''} DE ${m[1]}` : ''
}
export function textoPeriodo(desde, hasta) {
  const a = fechaEnPalabras(desde), b = fechaEnPalabras(hasta)
  if (a && b) return `DEL ${a} AL ${b}`
  if (a) return `DESDE EL ${a}`
  if (b) return `HASTA EL ${b}`
  return ''
}
