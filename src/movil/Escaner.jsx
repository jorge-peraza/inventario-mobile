import { useEffect, useRef, useState } from 'react'
import { volver, irA } from '../rutas'
import { hayCamara, abrirCamara, cerrarCamara, leerContinuo, avisar } from './camara'
import { reconteoAbierto, reconteo, marcar, resumen, normalizarClave } from './reconteo'
import { bienPorClave } from './datos'

// ── Escáner del reconteo ──────────────────────────────────────────────────────
// Pantalla completa con la cámara detrás. Cada lectura se resuelve contra la
// lista del área que ya está en memoria, así que no hace falta señal: en una
// bodega esa es la diferencia entre poder contar y no poder.
//
// Una etiqueta rota o un bien sin etiquetar se capturan a mano en la misma
// pantalla, sin salir del escaneo.
export function Escaner({ idarea }) {
  const refVideo = useRef(null)
  const refUltima = useRef({ clave: '', cuando: 0 })
  const [rc, setRc] = useState(() => reconteoAbierto(idarea))
  const [aviso, setAviso] = useState(null)      // { tipo, texto }
  const [error, setError] = useState(null)
  const [manual, setManual] = useState('')

  // Cámara: se abre al entrar y se apaga al salir, si no el celular deja la luz
  // de la cámara prendida al regresar a la lista.
  useEffect(() => {
    if (!hayCamara()) {
      setError('Este navegador no da acceso a la cámara. Se puede capturar la clave a mano.')
      return
    }
    let stream = null
    let parar = null
    let vivo = true

    abrirCamara()
      .then(s => {
        if (!vivo) { cerrarCamara(s); return }
        stream = s
        const v = refVideo.current
        if (!v) return
        v.srcObject = s
        v.setAttribute('playsinline', 'true')   // iPhone: si no, abre a pantalla completa
        v.play().catch(() => {})
        parar = leerContinuo(v, leido)
      })
      .catch(() => setError('No se pudo abrir la cámara. Revisa el permiso en el navegador.'))

    return () => {
      vivo = false
      parar?.()
      if (stream) cerrarCamara(stream)
    }
  }, [])

  function mostrar(tipo, texto) {
    setAviso({ tipo, texto })
    setTimeout(() => setAviso(a => (a?.texto === texto ? null : a)), 2200)
  }

  function leido(texto, metodo = 'qr') {
    const actual = rc || reconteoAbierto(idarea)
    if (!actual) return
    const clave = normalizarClave(texto)
    if (!clave) return

    // La cámara lee el mismo código muchas veces por segundo: se ignora la
    // repetición inmediata para no vibrar sin parar sobre la misma etiqueta.
    const ahora = Date.now()
    if (clave === refUltima.current.clave && ahora - refUltima.current.cuando < 2000) return
    refUltima.current = { clave, cuando: ahora }

    const r = marcar(actual.id, clave, metodo)
    setRc(reconteo(actual.id))

    if (r.estado === 'ok')            { avisar('ok');  mostrar('ok', `✓ ${r.bien.nombre}`) }
    else if (r.estado === 'repetido') { avisar('mal'); mostrar('repite', `Ya estaba verificado · ${clave}`) }
    else {
      // No está en esta área. Vale la pena decir si el bien existe y dónde
      // debería estar: encontrar uno fuera de su área es justo lo que un
      // reconteo tiene que sacar a la luz.
      avisar('mal')
      mostrar('error', `${clave} no es de esta área`)
      bienPorClave(clave)
        .then(b => mostrar('error', b
          ? `${clave} está asignado a ${b.area}`
          : `${clave} no existe en el inventario`))
        .catch(() => {})
    }
  }

  const s = resumen(rc)

  return (
    <div className="movil-escaner">
      <video ref={refVideo} muted playsInline />
      <div className="capa">
        <div className="arriba">
          <button className="icono-btn" onClick={volver} aria-label="Cerrar">
            <i className="ti ti-x" />
          </button>
          <div className="cuenta">
            {s.encontrados} de {s.total}
            <span>{rc?.nombrearea || 'Reconteo'} · faltan {s.faltan}</span>
          </div>
          <button className="icono-btn" onClick={() => irA('m', 'reconteo', idarea)} aria-label="Ver la lista">
            <i className="ti ti-list" />
          </button>
        </div>

        <div className="mira" />

        <div className="abajo">
          {aviso && <div className={`aviso ${aviso.tipo}`}>{aviso.texto}</div>}
          {error && <div className="aviso error">{error}</div>}

          <form className="manual" onSubmit={e => { e.preventDefault(); if (manual.trim()) { leido(manual, 'manual'); setManual('') } }}>
            <input value={manual} onChange={e => setManual(e.target.value)}
              placeholder="Clave a mano (etiqueta rota)" autoCapitalize="characters" autoCorrect="off" />
            <button type="submit">Marcar</button>
          </form>
        </div>
      </div>
    </div>
  )
}
