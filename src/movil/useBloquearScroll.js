import { useEffect } from 'react'

// Congela el fondo mientras hay una hoja abierta.
//
// Con solo `overflow: hidden` en el body, el celular sigue arrastrando la
// página de atrás: se abre el selector de categoría, se desliza el dedo y lo
// que se mueve es la lista de abajo. Fijando el body y guardando la posición se
// queda quieto, y al cerrar la hoja se vuelve exactamente al mismo punto.
export function useBloquearScroll(activo = true) {
  useEffect(() => {
    if (!activo) return
    const y = window.scrollY
    const cuerpo = document.body
    const previo = {
      position: cuerpo.style.position,
      top:      cuerpo.style.top,
      width:    cuerpo.style.width,
      overflow: cuerpo.style.overflow,
    }
    cuerpo.style.position = 'fixed'
    cuerpo.style.top      = `-${y}px`
    cuerpo.style.width    = '100%'
    cuerpo.style.overflow = 'hidden'
    return () => {
      cuerpo.style.position = previo.position
      cuerpo.style.top      = previo.top
      cuerpo.style.width    = previo.width
      cuerpo.style.overflow = previo.overflow
      window.scrollTo(0, y)
    }
  }, [activo])
}
