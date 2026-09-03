import { useEffect, useState } from 'react'

// ── ¿Es un celular? ───────────────────────────────────────────────────────────
// No se revisa el user-agent: se equivoca con tablets, con la ventana dividida
// y con cada navegador nuevo. Se pregunta lo que de verdad importa para el
// diseño: pantalla angosta Y dedo en vez de mouse.
//
// Hubo un interruptor para forzar la vista de escritorio y fue un error: en el
// celular dejaba la pantalla de escritorio sin manera de regresar, porque el
// botón para volver vivía justo en el menú móvil que se acababa de esconder.
// Se quitó, y aquí se borra la preferencia que haya quedado guardada para
// desatorar a quien alcanzó a picarle.
const LS = 'vista-preferida'
try { localStorage.removeItem(LS) } catch { /* modo privado */ }

const CONSULTA = '(max-width: 760px) and (pointer: coarse)'

export function useEsMovil() {
  const [esMovil, setEsMovil] = useState(() => window.matchMedia(CONSULTA).matches)

  useEffect(() => {
    const mq = window.matchMedia(CONSULTA)
    const alCambiar = () => setEsMovil(mq.matches)
    mq.addEventListener('change', alCambiar)
    return () => mq.removeEventListener('change', alCambiar)
  }, [])

  return esMovil
}
