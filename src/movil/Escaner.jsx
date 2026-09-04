import { useEffect, useRef, useState } from 'react'
import { volver, irA } from '../rutas'
import { hayCamara, abrirCamara, cerrarCamara, leerContinuo, avisar } from './camara'
import { reconteoAbierto, reconteo, revisar, marcar, marcarSubida, resumen, normalizarClave, fechaCorta } from './reconteo'
import { bienPorClave, anotarObservacionEnBien } from './datos'

// ── Escáner del reconteo ──────────────────────────────────────────────────────
// Pantalla completa con la cámara detrás. Cada lectura se resuelve contra la
// lista del área que ya está en memoria, así que no hace falta señal: en una
// bodega esa es la diferencia entre poder contar y no poder.
//
// Leer NO marca: primero se enseña el bien y se espera el visto bueno. Si solo
// con apuntar la cámara se verificara, bastaría pasar cerca de un estante para
// dar por bueno lo que no se revisó.
//
// Una etiqueta rota o un bien sin etiquetar se capturan a mano en la misma
// pantalla, sin salir del escaneo.
export function Escaner({ idarea }) {
  const refVideo = useRef(null)
  const refPausa = useRef(false)
  const refUltima = useRef({ clave: '', cuando: 0 })
  const [rc, setRc] = useState(() => reconteoAbierto(idarea))
  const [lectura, setLectura] = useState(null)   // { estado, clave, bien, cuando, ajeno }
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

  function leido(texto, metodo = 'qr') {
    if (refPausa.current) return                 // hay una confirmación abierta
    const actual = rc || reconteoAbierto(idarea)
    if (!actual) return
    const clave = normalizarClave(texto)
    if (!clave) return

    // La cámara lee el mismo código muchas veces por segundo: se ignora la
    // repetición inmediata para no vibrar sin parar sobre la misma etiqueta.
    const ahora = Date.now()
    if (clave === refUltima.current.clave && ahora - refUltima.current.cuando < 1500) return
    refUltima.current = { clave, cuando: ahora }

    const r = revisar(actual.id, clave)
    refPausa.current = true
    avisar(r.estado === 'nuevo' ? 'ok' : 'mal')
    setLectura({ ...r, metodo })

    // Si no es de esta área, se averigua dónde debería estar: encontrar un bien
    // fuera de su área es justo lo que un reconteo tiene que sacar a la luz.
    if (r.estado === 'ajeno') {
      bienPorClave(clave)
        .then(b => setLectura(l => (l && l.clave === clave ? { ...l, ajeno: b, buscado: true } : l)))
        .catch(() => setLectura(l => (l && l.clave === clave ? { ...l, buscado: true } : l)))
    }
  }

  function cerrarLectura() {
    setLectura(null)
    refPausa.current = false
    refUltima.current = { clave: '', cuando: 0 }
  }

  function confirmar(observacion) {
    const actual = rc || reconteoAbierto(idarea)
    if (actual && lectura?.estado === 'nuevo') {
      marcar(actual.id, lectura.clave, lectura.metodo || 'qr', observacion)
      setRc(reconteo(actual.id))

      // La observación se escribe también en el bien, para que quede en el
      // inventario y no solo en el conteo. Va en segundo plano: si no hay
      // señal se queda pendiente y se reintenta, sin frenar el escaneo.
      if (observacion && lectura.bien?.idbien) {
        anotarObservacionEnBien(lectura.bien.idbien, observacion)
          .then(() => { marcarSubida(actual.id, lectura.clave); setRc(reconteo(actual.id)) })
          .catch(() => { /* queda pendiente; se reintenta desde la lista */ })
      }
    }
    cerrarLectura()
  }

  const s = resumen(rc)

  return (
    <div className="movil-escaner">
      <video ref={refVideo} muted playsInline />
      <div className="capa">
        {/* La equis regresa a la lista del área, así que el botón de lista que
            estaba junto sobraba: hacía exactamente lo mismo. */}
        <div className="arriba">
          <div className="cuenta">
            {s.encontrados} de {s.total}
            <span>{rc?.nombrearea || 'Reconteo'} · faltan {s.faltan}</span>
          </div>
          <button className="icono-btn" onClick={volver} aria-label="Cerrar">
            <i className="ti ti-x" />
          </button>
        </div>

        {!lectura && <div className="mira" />}

        <div className="abajo">
          {error && <div className="aviso error">{error}</div>}

          {lectura
            ? <TarjetaLectura lectura={lectura} onConfirmar={confirmar} onCancelar={cerrarLectura} />
            : (
              <form className="manual" onSubmit={e => { e.preventDefault(); if (manual.trim()) { leido(manual, 'manual'); setManual('') } }}>
                <input value={manual} onChange={e => setManual(e.target.value)}
                  placeholder="Clave a mano" autoCapitalize="characters" autoCorrect="off" />
                <button type="submit">Buscar</button>
              </form>
            )}
        </div>
      </div>
    </div>
  )
}

// Lo que se leyó, con sus datos, antes de darlo por verificado
function TarjetaLectura({ lectura, onConfirmar, onCancelar }) {
  const { estado, clave, bien, cuando, observacion, ajeno, buscado } = lectura
  const [nota, setNota] = useState('')

  const encabezado = estado === 'nuevo'
    ? { color: 'var(--ok)',     icono: 'ti-qrcode',       texto: '¿Es este el bien?' }
    : estado === 'repetido'
      ? { color: 'var(--falta)', icono: 'ti-checks',      texto: 'Este mueble ya está verificado' }
      : { color: 'var(--alerta)', icono: 'ti-alert-circle', texto: 'No es de esta área' }

  const dato = (etq, valor) => (
    <div key={etq}>
      <p className="etiqueta">{etq}</p>
      <p style={{ fontSize: '13px' }}>{valor || '—'}</p>
    </div>
  )

  return (
    <div className="confirma">
      <p style={{ display: 'flex', alignItems: 'center', gap: '7px', color: encabezado.color, fontWeight: 600, fontSize: '13.5px' }}>
        <i className={`ti ${encabezado.icono}`} style={{ fontSize: '17px' }} />{encabezado.texto}
      </p>

      <p className="clave" style={{ marginTop: '8px' }}>{clave}</p>

      {bien ? (
        <>
          <p className="nombre" style={{ fontSize: '15px' }}>{bien.nombre}</p>
          <div className="campos">
            {dato('Marca', bien.marca)}
            {dato('Modelo', bien.modelo)}
            {dato('Serie', bien.serie)}
            {dato('Resguardo', bien.resguardante)}
          </div>
          {estado === 'repetido' && (
            <>
              <p className="detalle" style={{ marginTop: '8px' }}>Se verificó el {fechaCorta(cuando)}.</p>
              {observacion && <p className="detalle">Observación: {observacion}</p>}
            </>
          )}
          {/* La observación queda guardada con el bien en el historial: sirve
              para anotar en el momento lo que se vio —está dañado, no tiene
              etiqueta, está en otra oficina— sin cortar el escaneo. */}
          {estado === 'nuevo' && (
            <input value={nota} onChange={e => setNota(e.target.value)}
              placeholder="Observación (opcional)"
              style={{ width: '100%', marginTop: '10px', padding: '10px 12px', borderRadius: '10px',
                background: 'var(--campo)', border: '1px solid var(--borde-fuerte)', color: 'var(--texto-1)',
                fontSize: '14px', outline: 'none' }} />
          )}
        </>
      ) : (
        <p className="detalle" style={{ marginTop: '4px' }}>
          {!buscado ? 'Buscando en el inventario…'
            : ajeno ? <>{ajeno.nombre}<br />Está asignado a <b>{ajeno.area}</b>.</>
            : 'Esta clave no existe en el inventario.'}
        </p>
      )}

      <div className="botones">
        <button className="boton suave" onClick={onCancelar}>
          {estado === 'nuevo' ? 'Cancelar' : 'Seguir escaneando'}
        </button>
        {estado === 'nuevo' && (
          <button className="boton" onClick={() => onConfirmar(nota.trim())}>
            <i className="ti ti-check" style={{ fontSize: '17px' }} />OK
          </button>
        )}
      </div>
    </div>
  )
}
