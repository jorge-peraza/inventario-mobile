// Pantalla completa en el celular.
//
// Quita la barra del navegador y la app se siente aplicación. En Android lo
// hace la API de fullscreen; en iPhone Safari no la permite, ahí el camino es
// "Añadir a pantalla de inicio", que el manifiesto ya deja listo.
//
// Ojo con la cámara: al conceder el permiso, Android sale de pantalla completa.
// Volver a entrar exige un toque de la persona —el navegador no deja hacerlo
// solo—, por eso el botón está dentro del escáner y no únicamente en el menú.
// El estado se lee del documento cada vez y no se guarda: guardarlo era lo que
// dejaba el botón diciendo "salir" cuando ya se había salido solo.

export function pantallaCompletaDisponible() {
  const r = document.documentElement
  return !!(r.requestFullscreen || r.webkitRequestFullscreen)
}

export function enPantallaCompleta() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement)
}

export async function alternarPantallaCompleta() {
  const raiz = document.documentElement
  try {
    if (enPantallaCompleta()) {
      await (document.exitFullscreen?.() ?? document.webkitExitFullscreen?.())
    } else {
      await (raiz.requestFullscreen?.({ navigationUI: 'hide' }) ?? raiz.webkitRequestFullscreen?.())
    }
  } catch { /* el navegador puede negarlo */ }
}
