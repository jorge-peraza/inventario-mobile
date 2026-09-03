// ── Reconteo ──────────────────────────────────────────────────────────────────
// Un reconteo es una foto del área en un momento: los bienes que la base decía
// que estaban ahí, y cuáles se encontraron físicamente. Guarda la lista completa
// al abrirse, no solo los ids: si después un bien se traspasa, el reconteo tiene
// que seguir diciendo lo que se contó ese día.
//
// De momento vive en el navegador del equipo que cuenta. Eso alcanza para
// levantar el conteo sin señal en una bodega, pero NO para consultar el
// historial desde otro dispositivo: eso necesita las dos tablas que quedan
// propuestas en supabase/reconteo.sql. La forma de los datos de aquí es la
// misma que la de esas tablas, para que mudarlo sea copiar y pegar.

const LS = 'reconteos'

function leerTodo() {
  try { return JSON.parse(localStorage.getItem(LS) || '[]') } catch { return [] }
}

function guardarTodo(lista) {
  try { localStorage.setItem(LS, JSON.stringify(lista)) } catch { /* sin espacio */ }
  window.dispatchEvent(new Event('reconteo-cambiado'))
}

// La clave puede venir del QR (una dirección) o tecleada a mano. Se acepta:
//   I25-3401-2-765
//   https://…/inventario-nogales/#/b/I25-3401-2-765
export function normalizarClave(texto) {
  const crudo = String(texto || '').trim()
  const enRuta = crudo.match(/[#/]b\/([^/?#\s]+)/i)
  const clave = enRuta ? decodeURIComponent(enRuta[1]) : crudo
  return clave.trim().toUpperCase()
}

export function listaReconteos() {
  return leerTodo().sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)))
}

export function reconteo(id) {
  return leerTodo().find(r => r.id === id) || null
}

// El reconteo abierto de un área, si lo hay: al volver a entrar se continúa el
// mismo conteo en vez de empezar de cero.
export function reconteoAbierto(idarea) {
  return leerTodo().find(r => r.idarea === Number(idarea) && !r.fin) || null
}

export function abrirReconteo({ idarea, nombrearea, dependencia, bienes, usuario }) {
  const lista = leerTodo()
  const yaHay = lista.find(r => r.idarea === Number(idarea) && !r.fin)
  if (yaHay) return yaHay

  const nuevo = {
    id: 'rc_' + Date.now(),
    idarea: Number(idarea),
    nombrearea,
    dependencia,
    usuario: usuario || '',
    inicio: new Date().toISOString(),
    fin: null,
    // Foto de lo que la base decía en ese momento
    esperados: bienes.map(b => ({
      idbien: b.idbien,
      clave:  (b.clave || '').toUpperCase(),
      nombre: b.nombre,
      resguardante: b.resguardante,
    })),
    // clave → { fecha, metodo: 'qr' | 'manual' }
    encontrados: {},
    // Claves leídas que no pertenecen a esta área: el hallazgo más útil de un
    // reconteo, un bien que aparece donde no debería.
    ajenos: {},
  }
  guardarTodo([nuevo, ...lista])
  return nuevo
}

function conReconteo(id, cambiar) {
  const lista = leerTodo()
  const i = lista.findIndex(r => r.id === id)
  if (i < 0) return null
  const copia = { ...lista[i] }
  cambiar(copia)
  lista[i] = copia
  guardarTodo(lista)
  return copia
}

// Marca una clave. Devuelve qué pasó para poder avisarlo en pantalla:
//   'ok' | 'repetido' | 'ajeno' | 'desconocido'
export function marcar(id, claveCruda, metodo = 'qr') {
  const clave = normalizarClave(claveCruda)
  const r = reconteo(id)
  if (!r || !clave) return { estado: 'desconocido', clave }

  const esperado = r.esperados.find(e => e.clave === clave)
  if (!esperado) {
    conReconteo(id, c => { c.ajenos = { ...c.ajenos, [clave]: { fecha: new Date().toISOString(), metodo } } })
    return { estado: 'ajeno', clave }
  }
  if (r.encontrados[clave]) return { estado: 'repetido', clave, bien: esperado }

  conReconteo(id, c => { c.encontrados = { ...c.encontrados, [clave]: { fecha: new Date().toISOString(), metodo } } })
  return { estado: 'ok', clave, bien: esperado }
}

export function desmarcar(id, clave) {
  const k = normalizarClave(clave)
  return conReconteo(id, c => {
    const copia = { ...c.encontrados }
    delete copia[k]
    c.encontrados = copia
  })
}

export function cerrarReconteo(id) {
  return conReconteo(id, c => { c.fin = new Date().toISOString() })
}

export function borrarReconteo(id) {
  guardarTodo(leerTodo().filter(r => r.id !== id))
}

export function resumen(r) {
  if (!r) return { total: 0, encontrados: 0, faltan: 0, ajenos: 0 }
  const encontrados = Object.keys(r.encontrados || {}).length
  return {
    total: r.esperados.length,
    encontrados,
    faltan: r.esperados.length - encontrados,
    ajenos: Object.keys(r.ajenos || {}).length,
  }
}

export function fechaCorta(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}
