import { useEffect, useState } from 'react'

// ── ¿Es un celular? ───────────────────────────────────────────────────────────
// No se revisa el user-agent: se equivoca con tablets, con la ventana dividida
// y con cada navegador nuevo. Se pregunta lo que de verdad importa para el
// diseño: pantalla angosta Y dedo en vez de mouse.
//
// Queda una salida manual: quien quiera la vista de escritorio en el celular
// (o al revés, para probar) la fija desde el menú y se recuerda en el equipo.
const LS = 'vista-preferida'   // 'movil' | 'escritorio' | ausente = automático

const CONSULTA = '(max-width: 760px) and (pointer: coarse)'

export function vistaPreferida() {
  try { return localStorage.getItem(LS) || 'auto' } catch { return 'auto' }
}

export function fijarVista(v) {
  try {
    if (v === 'auto') localStorage.removeItem(LS)
    else localStorage.setItem(LS, v)
  } catch { /* modo privado */ }
  window.dispatchEvent(new Event('vista-cambiada'))
}

export function useEsMovil() {
  const calcular = () => {
    const forzada = vistaPreferida()
    if (forzada === 'movil') return true
    if (forzada === 'escritorio') return false
    return window.matchMedia(CONSULTA).matches
  }
  const [esMovil, setEsMovil] = useState(calcular)

  useEffect(() => {
    const mq = window.matchMedia(CONSULTA)
    const alCambiar = () => setEsMovil(calcular())
    mq.addEventListener('change', alCambiar)
    window.addEventListener('vista-cambiada', alCambiar)
    return () => {
      mq.removeEventListener('change', alCambiar)
      window.removeEventListener('vista-cambiada', alCambiar)
    }
  }, [])

  return esMovil
}
