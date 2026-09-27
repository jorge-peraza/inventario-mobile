import { useState, useEffect } from 'react'

// ── Datos en memoria entre pantallas ────────────────────────────────────────
// El inicio leía todo el inventario (más de 13,000 bienes, de mil en mil) cada
// vez que se entraba, así que al volver del menú se veía cargar otra vez.
// Ahora lo último que se leyó se queda en memoria: al volver se enseña al
// instante y, si ya pasó un rato, se vuelve a leer en silencio —sin esqueleto
// de carga— y los números se acomodan solos.
//
// La memoria dura lo que dura la pestaña abierta: al recargar la página se lee
// de nuevo de la base, que es la fuente de verdad.

const memoria = new Map()   // clave -> { valor, t }
const enCurso = new Map()   // clave -> promesa (dos visitas seguidas no leen doble)
const REFRESCO = 30 * 1000  // antes de esto no vale la pena volver a leer

function leer(clave, cargar) {
  if (!enCurso.has(clave)) {
    enCurso.set(clave, cargar()
      .then(valor => { memoria.set(clave, { valor, t: Date.now() }); return valor })
      .finally(() => enCurso.delete(clave)))
  }
  return enCurso.get(clave)
}

// `activo` en false detiene la lectura (p. ej. mientras no se sabe qué áreas
// puede ver una dependencia); mientras tanto se reporta como cargando.
export function useDatosEnCache(clave, cargar, { activo = true } = {}) {
  const [valor, setValor] = useState(() => memoria.get(clave)?.valor ?? null)
  const [cargando, setCargando] = useState(() => !memoria.has(clave))

  useEffect(() => {
    if (!activo) { setCargando(true); return }
    const guardado = memoria.get(clave)
    if (guardado) { setValor(guardado.valor); setCargando(false) }
    else { setValor(null); setCargando(true) }
    if (guardado && Date.now() - guardado.t < REFRESCO) return

    let vivo = true
    leer(clave, cargar)
      .then(v => { if (vivo) setValor(v) })
      .catch(e => console.error(e))
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  // `cargar` se arma en cada render; lo que decide qué se lee es la clave
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, activo])

  return { valor, cargando }
}
