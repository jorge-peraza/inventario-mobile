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
