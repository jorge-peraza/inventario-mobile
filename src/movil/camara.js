// ── Lectura de códigos QR ─────────────────────────────────────────────────────
// Dos caminos, porque no hay uno solo que funcione en todos los celulares:
//
//  1. BarcodeDetector — va en el navegador (Chrome de Android). Es el rápido:
//     lo resuelve el sistema, no gasta batería en JavaScript.
//  2. jsQR — respaldo para Safari de iPhone, que todavía no trae el detector.
//     Se carga solo si hace falta, así que en Android no pesa nada.
//
// Las dos necesitan HTTPS para pedir la cámara. GitHub Pages ya lo es; en
// pruebas desde la computadora, localhost también cuenta como seguro.

let jsQR = null

async function cargarRespaldo() {
  if (jsQR) return jsQR
  const mod = await import('jsqr')
  jsQR = mod.default || mod
  return jsQR
}

export function hayCamara() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
}

// Pide la cámara trasera. Devuelve el stream para poder apagarlo al salir:
// si no se cierra, el celular deja la luz de la cámara prendida.
export async function abrirCamara() {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  })
}

export function cerrarCamara(stream) {
  for (const pista of stream?.getTracks?.() || []) pista.stop()
}

// Empieza a leer del video y avisa cada lectura. Devuelve la función para parar.
export function leerContinuo(video, alLeer) {
  let vivo = true
  let detector = null
  let lienzo = null, ctx = null

  if ('BarcodeDetector' in window) {
    try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }) } catch { detector = null }
  }

  async function vuelta() {
    if (!vivo) return
    try {
      if (video.readyState >= 2) {
        let texto = null

        if (detector) {
          const codigos = await detector.detect(video)
          if (codigos.length) texto = codigos[0].rawValue
        } else {
          const decodificar = await cargarRespaldo()
          if (!lienzo) {
            lienzo = document.createElement('canvas')
            ctx = lienzo.getContext('2d', { willReadFrequently: true })
          }
          // Se lee a la mitad de resolución: es de sobra para un QR y en un
          // celular modesto la diferencia entre fluido y trabado.
          const ancho = Math.min(640, video.videoWidth || 640)
          const alto  = Math.round((video.videoHeight || 480) * (ancho / (video.videoWidth || 640)))
          lienzo.width = ancho; lienzo.height = alto
          ctx.drawImage(video, 0, 0, ancho, alto)
          const img = ctx.getImageData(0, 0, ancho, alto)
          const r = decodificar(img.data, ancho, alto, { inversionAttempts: 'dontInvert' })
          if (r?.data) texto = r.data
        }

        if (texto) alLeer(texto)
      }
    } catch { /* un cuadro que no se pudo leer no interrumpe el escaneo */ }
    if (vivo) requestAnimationFrame(vuelta)
  }

  requestAnimationFrame(vuelta)
  return () => { vivo = false }
}

// Aviso corto al acertar: vibración donde exista y un pitido cortito. En campo
// se escanea sin mirar la pantalla, así que el aviso importa.
let audio = null
export function avisar(tipo = 'ok') {
  try {
    if (navigator.vibrate) navigator.vibrate(tipo === 'ok' ? 40 : [30, 60, 30])
  } catch { /* no todos lo permiten */ }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    if (!audio) audio = new Ctx()
    if (audio.state === 'suspended') audio.resume()
    const osc = audio.createOscillator()
    const vol = audio.createGain()
    osc.frequency.value = tipo === 'ok' ? 880 : 300
    vol.gain.value = 0.05
    osc.connect(vol); vol.connect(audio.destination)
    osc.start()
    osc.stop(audio.currentTime + 0.09)
  } catch { /* sin sonido no pasa nada */ }
}
