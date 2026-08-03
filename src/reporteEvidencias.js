import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const GRIS = 'BFBFBF', NEGRO = '000000'

// Carga imagen (logos) a dataURL + dimensiones
function cargarImagen(src) {
  // Resuelve contra la ruta base (GitHub Pages sirve bajo /inventario-nogales/)
  if (src.startsWith('/')) src = import.meta.env.BASE_URL + src.slice(1)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth; c.height = img.naturalHeight
      c.getContext('2d').drawImage(img, 0, 0)
      resolve({ dataURL: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight })
    }
    img.onerror = reject
    img.src = src
  })
}

// Convierte un File a { dataURL, w, h }
export function fileADataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => {
      const img = new Image()
      img.onload = () => resolve({ dataURL: fr.result, w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = reject
      img.src = fr.result
    }
    fr.onerror = reject
    fr.readAsDataURL(file)
  })
}

function agrupar(items) {
  const m = new Map()
  for (const it of items) {
    const k = it.categoria || 'SIN CATEGORÍA'
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(it)
  }
  return m
}

function nombreArchivo(ext) { return `reporte-inmuebles-evidencias-${new Date().toISOString().slice(0, 10)}.${ext}` }

const RGB_GRIS = [191, 191, 191]

async function dibujarLogosPDF(doc, pageW, margin) {
  try {
    const [ay, nog, mex] = await Promise.all([
      cargarImagen('/logo-ayuntamiento.png'), cargarImagen('/escudo-nogales.png'), cargarImagen('/escudo-mexico.png'),
    ])
    const H = 46, Hmex = 66
    const wAy = H * ay.w / ay.h, wNog = H * nog.w / nog.h, wMex = Hmex * mex.w / mex.h
    const y = 18
    doc.addImage(ay.dataURL, 'PNG', margin, y, wAy, H, undefined, 'FAST')
    doc.addImage(nog.dataURL, 'PNG', (pageW - wNog) / 2, y, wNog, H, undefined, 'FAST')
    doc.addImage(mex.dataURL, 'PNG', pageW - margin - wMex, y - (Hmex - H) / 2, wMex, Hmex, undefined, 'FAST')
    return y + Hmex - (Hmex - H) / 2 + 12
  } catch { return 24 }
}

// ── PDF ──────────────────────────────────────────────────────────────────────
export async function exportarEvidenciasPDF(items, titulo = '') {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 24
  let startY = await dibujarLogosPDF(doc, pageW, margin)
  if (titulo) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(0)
    doc.text(titulo, pageW / 2, startY + 6, { align: 'center' })
    const tw = doc.getTextWidth(titulo)
    doc.setLineWidth(1); doc.line(pageW / 2 - tw / 2, startY + 10, pageW / 2 + tw / 2, startY + 10)
    startY += 24
  }

  const hStyle = { fillColor: RGB_GRIS, textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center', valign: 'middle' }
  const grupos = agrupar(items)
  const body = []
  const meta = []   // por fila del body: {foto, doc} o null (encabezado de grupo)
  for (const [cat, arr] of grupos) {
    body.push([{ content: 'NO.', styles: hStyle }, { content: 'CATEGORIA: ' + cat, styles: hStyle }, { content: 'FOTO', styles: hStyle }, { content: 'DOCUMENTO', styles: hStyle }])
    meta.push(null)
    arr.forEach((it, i) => { body.push([String(i + 1), it.nombre || '—', '', '']); meta.push({ foto: it.foto, doc: it.documento }) })
  }

  autoTable(doc, {
    startY, body,
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, overflow: 'linebreak', valign: 'middle', halign: 'center', lineColor: [0, 0, 0], lineWidth: 0.5, textColor: [0, 0, 0], fillColor: [255, 255, 255] },
    columnStyles: { 0: { cellWidth: 46 }, 2: { cellWidth: 150 }, 3: { cellWidth: 150 } },
    didParseCell: (d) => {
      if (d.section === 'body' && meta[d.row.index]) d.cell.styles.minCellHeight = 100
    },
    didDrawCell: (d) => {
      if (d.section !== 'body') return
      const m = meta[d.row.index]; if (!m) return
      const img = d.column.index === 2 ? m.foto : d.column.index === 3 ? m.doc : null
      if (!img) return
      const pad = 4
      const maxW = d.cell.width - pad * 2, maxH = d.cell.height - pad * 2
      let w = img.w, h = img.h
      const r = Math.min(maxW / w, maxH / h)
      w *= r; h *= r
      const x = d.cell.x + (d.cell.width - w) / 2, y = d.cell.y + (d.cell.height - h) / 2
      try { doc.addImage(img.dataURL, 'PNG', x, y, w, h) } catch { /* noop */ }
    },
    margin: { left: margin, right: margin },
  })
  doc.save(nombreArchivo('pdf'))
}

// ── Excel ────────────────────────────────────────────────────────────────────
export async function exportarEvidenciasExcel(items, titulo = '') {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('EVIDENCIAS')
  const FUENTE = 'Arial'
  const borde = { style: 'thin', color: { argb: 'FF' + NEGRO } }
  const bordes = { top: borde, left: borde, bottom: borde, right: borde }
  const nCols = 4
  // ── Geometría espejo del PDF (jsPDF, landscape A4, unit pt) ──
  // PDF: NO=46pt, NOMBRE=447.89pt, FOTO=150pt, DOCUMENTO=150pt; fila=100pt.
  // Excel: ancho_col(chars) = (px - 5) / 7 ; px = pt * 96/72 (= pt*4/3).
  const PDF_COLS_PT = [46, 447.89, 150, 150]
  const PT_A_PX = 4 / 3
  const colPx = PDF_COLS_PT.map(pt => Math.round(pt * PT_A_PX))      // px reales por columna
  const totalPx = colPx.reduce((a, b) => a + b, 0)
  const ANCHOS = colPx.map(px => (px - 5) / 7)                       // ancho en "chars" de Excel
  ANCHOS.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  const pxToCol = (x) => { let acc = 0; for (let k = 0; k < colPx.length; k++) { if (x < acc + colPx[k]) return k + (x - acc) / colPx[k]; acc += colPx[k] } return colPx.length }

  function headerCell(cell, val) {
    cell.value = val
    cell.font = { name: FUENTE, family: 2, size: 11, bold: true, color: { argb: 'FF' + NEGRO } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + GRIS } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = bordes
  }
  function dataCell(cell, val, align) {
    cell.value = val
    cell.font = { name: FUENTE, family: 2, size: 11, color: { argb: 'FF' + NEGRO } }
    cell.alignment = { horizontal: align, vertical: 'middle', wrapText: true }
    cell.border = bordes
  }

  let fila = 1
  // Banda de logos
  try {
    const [ay, nog, mex] = await Promise.all([
      cargarImagen('/logo-ayuntamiento.png'), cargarImagen('/escudo-nogales.png'), cargarImagen('/escudo-mexico.png'),
    ])
    const H = 80, Hmex = 112
    const ROW_H = 62                            // pt por fila
    ws.getRow(1).height = ROW_H; ws.getRow(2).height = ROW_H
    const EMU_PX = 9525                         // EMU por píxel
    const EMU_PT = 12700                        // EMU por punto Excel
    const rowPx  = ROW_H * 96 / 72             // px reales por fila (~82.67)
    const bandPx = rowPx * 2                    // px totales de la banda (~165.33)
    // Convierte px horizontal → native col + colOff en EMU
    function colNative(px) {
      let acc = 0
      for (let k = 0; k < colPx.length; k++) {
        if (px <= acc + colPx[k]) return { nativeCol: k, nativeColOff: Math.round((px - acc) * EMU_PX) }
        acc += colPx[k]
      }
      return { nativeCol: colPx.length - 1, nativeColOff: 0 }
    }
    // Convierte px vertical → native row + rowOff en EMU
    function rowNative(px) {
      const idx = Math.floor(px / rowPx)
      return { nativeRow: idx, nativeRowOff: Math.round((px - idx * rowPx) * EMU_PX) }
    }
    const place = (im, leftPx, h) => {
      const w   = h * im.w / im.h
      const top = (bandPx - h) / 2
      const { nativeCol, nativeColOff } = colNative(leftPx)
      const { nativeRow, nativeRowOff } = rowNative(top)
      const id  = wb.addImage({ base64: im.dataURL, extension: 'png' })
      ws.addImage(id, { tl: { nativeCol, nativeColOff, nativeRow, nativeRowOff }, ext: { width: w, height: h }, editAs: 'oneCell' })
    }
    const wAy  = H    * ay.w  / ay.h;  place(ay,  6,                               H)
    const wNog = H    * nog.w / nog.h;  place(nog, totalPx / 2 - wNog / 2,          H)
    const wMex = Hmex * mex.w / mex.h;  place(mex, totalPx - 6 - wMex,             Hmex)
    ws.getRow(3).height = 8
    fila = 4
  } catch { fila = 1 }

  if (titulo) {
    ws.mergeCells(fila, 1, fila, nCols)
    const c = ws.getCell(fila, 1)
    c.value = titulo
    c.font = { name: FUENTE, family: 2, size: 16, bold: true, underline: true }
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    ws.getRow(fila).height = 26
    ws.getRow(fila + 1).height = 10   // espacio antes de la tabla (igual que el PDF)
    fila += 2
  }

  const grupos = agrupar(items)
  const ROW_PT = 100                        // alto de fila = minCellHeight del PDF (pt)
  const ROW_PX = Math.round(ROW_PT * PT_A_PX) // alto real de la fila en px
  const PAD_PX = Math.round(2 * PT_A_PX)      // padding reducido -> fotos ~3-5% más grandes
  for (const [cat, arr] of grupos) {
    const hr = ws.getRow(fila)
    headerCell(hr.getCell(1), 'NO.'); headerCell(hr.getCell(2), 'CATEGORIA: ' + cat); headerCell(hr.getCell(3), 'FOTO'); headerCell(hr.getCell(4), 'DOCUMENTO')
    fila++
    arr.forEach((it, i) => {
      const row = ws.getRow(fila)
      row.height = ROW_PT
      dataCell(row.getCell(1), String(i + 1), 'center')
      dataCell(row.getCell(2), it.nombre || '—', 'center')
      dataCell(row.getCell(3), '', 'center')
      dataCell(row.getCell(4), '', 'center')
      // Escala la imagen para llenar el espacio real de la celda (igual que didDrawCell del PDF):
      //   maxW = anchoColumnaPx - 2*pad ; maxH = altoFilaPx - 2*pad ; r = min(maxW/w, maxH/h)
      // y la centra horizontal y verticalmente con offsets fraccionales de la celda.
      const colocar = (img, colIdx) => {
        if (!img) return
        const cellPx = colPx[colIdx]
        const maxW = cellPx - 2 * PAD_PX, maxH = ROW_PX - 2 * PAD_PX
        let w = img.w, h = img.h
        const r = Math.min(maxW / w, maxH / h); w *= r; h *= r
        const offCol = (cellPx - w) / 2 / cellPx     // centra horizontal
        const offRow = (ROW_PX - h) / 2 / ROW_PX     // centra vertical
        const id = wb.addImage({ base64: img.dataURL, extension: 'png' })
        ws.addImage(id, { tl: { col: colIdx + offCol, row: (fila - 1) + offRow }, ext: { width: w, height: h }, editAs: 'oneCell' })
      }
      colocar(it.foto, 2)        // columna FOTO (índice 0-based 2)
      colocar(it.documento, 3)   // columna DOCUMENTO
      fila++
    })
  }

  const buf = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nombreArchivo('xlsx'))
}
