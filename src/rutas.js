// ── Direcciones ───────────────────────────────────────────────────────────────
// Antes cada pantalla vivía en un useState dentro de App.jsx. Eso tenía dos
// problemas de fondo: el botón Atrás del navegador sacaba de la aplicación en
// vez de regresar a la pantalla anterior, y no había forma de compartir un
// enlace a un bien —que es justo lo que necesita el QR de las etiquetas.
//
// Se usa el hash (#/bienes, #/b/I25-3401-2-765) y no rutas normales porque el
// sitio vive en GitHub Pages, que sirve archivos estáticos: una ruta real como
// /bienes devolvería 404 al recargar. Con el hash todo lo resuelve el navegador.

import { useEffect, useState } from 'react'

// Pantalla y parámetros que hay detrás de un hash
export function leerRuta(hash = window.location.hash) {
  const limpio = String(hash || '').replace(/^#\/?/, '')
  const [pagina, ...resto] = limpio.split('/').filter(Boolean)
  return {
    pagina: pagina || '',
    params: resto.map(p => decodeURIComponent(p)),
  }
}

// Arma el hash de una pantalla: irA('b', 'I25-3401-2-765') → #/b/I25-3401-2-765
export function rutaDe(pagina, ...params) {
  const cola = params.filter(p => p != null && p !== '').map(p => encodeURIComponent(p))
  return '#/' + [pagina, ...cola].join('/')
}

export function irA(pagina, ...params) {
  const destino = rutaDe(pagina, ...params)
  if (window.location.hash !== destino) window.location.hash = destino
}

// Reemplaza la dirección sin dejar rastro en el historial: para redirecciones
// (entrar sin sesión, caer en una ruta que no existe) donde regresar no aplica.
export function reemplazarRuta(pagina, ...params) {
  const url = window.location.pathname + window.location.search + rutaDe(pagina, ...params)
  window.history.replaceState(null, '', url)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

// La ruta actual, siempre al día: el navegador avisa con hashchange tanto si el
// cambio vino de la app como si vino del botón Atrás.
export function useRuta() {
  const [ruta, setRuta] = useState(() => leerRuta())
  useEffect(() => {
    const alCambiar = () => setRuta(leerRuta())
    window.addEventListener('hashchange', alCambiar)
    return () => window.removeEventListener('hashchange', alCambiar)
  }, [])
  return ruta
}

export function volver() {
  window.history.back()
}
