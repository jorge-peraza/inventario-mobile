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

// ── Periodo ─────────────────────────────────────────────────────────────────
// En número, que ocupa poco en el título y en el nombre del archivo:
// "DEL 01-08-26 AL 31-08-26". Con una sola fecha dice "DESDE EL…" o
// "HASTA EL…"; sin fechas, nada. Va con guiones y no con diagonales porque
// Windows no acepta la diagonal en el nombre de un archivo.
export function fechaCorta(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${m[3]}-${m[2]}-${m[1].slice(2)}` : ''
}
export function textoPeriodo(desde, hasta) {
  const a = fechaCorta(desde), b = fechaCorta(hasta)
  if (a && b) return `DEL ${a} AL ${b}`
  if (a) return `DESDE EL ${a}`
  if (b) return `HASTA EL ${b}`
  return ''
}
