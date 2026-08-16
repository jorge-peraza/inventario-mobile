// Comentarios internos por inmueble.
//
// La tabla bienesinmuebles no tiene una columna para esto, así que se guardan en
// el navegador —igual que las fechas de desincorporación—. Solo se ven en el
// formulario de modificar y en el panel de consulta; no salen en los reportes.
//
// Para que se compartan entre equipos basta con agregar la columna en Supabase:
//   alter table bienesinmuebles add column comentarios text;
// y cambiar estas dos funciones por un select/update normal.

const LS = 'comentarios_inmuebles'

function leer() {
  try { return JSON.parse(localStorage.getItem(LS) || '{}') } catch { return {} }
}

export function getComentario(idinmueble) {
  return leer()[idinmueble] || ''
}

export function setComentario(idinmueble, texto) {
  const m = leer()
  const t = String(texto || '').trim()
  if (t) m[idinmueble] = t
  else delete m[idinmueble]
  try { localStorage.setItem(LS, JSON.stringify(m)) } catch { /* noop */ }
}
