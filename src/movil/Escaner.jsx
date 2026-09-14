import { useEffect, useRef, useState } from 'react'
import { volver, irA } from '../rutas'
import { hayCamara, abrirCamara, cerrarCamara, leerContinuo, avisar } from './camara'
import { reconteoAbierto, reconteo, revisar, marcar, marcarSubida, resumen, normalizarClave, fechaCorta, fusionarMarcas } from './reconteo'
import { bienPorClave, anotarObservacionEnBien } from './datos'
import { subirAvance, detalleRemoto } from './sincronizar'
import { pantallaCompletaDisponible, enPantallaCompleta, alternarPantallaCompleta } from './pantallaCompleta'

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
// Lo que se espera con el código a la vista antes de darlo por leído. Sin esta
// pausa la tarjeta saltaba en el instante en que la cámara rozaba una etiqueta,
// y bastaba pasar de largo frente a un estante para abrirla sin querer.
const RETARDO_LECTURA = 1500

export function Escaner({ idarea }) {
  const refVideo = useRef(null)
  const refPausa = useRef(false)
  const refUltima = useRef({ clave: '', cuando: 0 })
  const refEspera = useRef(null)                 // { clave, timer } mientras se aguanta el código
  const [leyendo, setLeyendo] = useState('')     // clave que se está aguantando
  const [rc, setRc] = useState(() => reconteoAbierto(idarea))
  const [lectura, setLectura] = useState(null)   // { estado, clave, bien, cuando, ajeno }
  const [error, setError] = useState(null)
  const [manual, setManual] = useState('')
  // Al conceder el permiso de la cámara, Android saca de pantalla completa. Para
  // volver a entrar hace falta un toque del usuario —el navegador no deja
  // hacerlo solo—, así que el botón vive aquí mismo y no en el menú de atrás.
  const [completa, setCompleta] = useState(enPantallaCompleta)
  // Alto que ocupa el teclado del celular. Sin esto, al escribir la observación
  // el teclado tapaba la tarjeta entera y no se veía lo que se estaba tecleando.
  const [teclado, setTeclado] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const ajustar = () => setTeclado(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    ajustar()
    vv.addEventListener('resize', ajustar)
    vv.addEventListener('scroll', ajustar)
    return () => {
      vv.removeEventListener('resize', ajustar)
      vv.removeEventListener('scroll', ajustar)
    }
  }, [])

  useEffect(() => {
    const alCambiar = () => setCompleta(enPantallaCompleta())
    document.addEventListener('fullscreenchange', alCambiar)
    document.addEventListener('webkitfullscreenchange', alCambiar)
    return () => {
      document.removeEventListener('fullscreenchange', alCambiar)
      document.removeEventListener('webkitfullscreenchange', alCambiar)
    }
  }, [])

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

    // Con la cámara hay que sostener el código un momento; lo capturado a mano
    // entra de una vez, que para eso se escribió.
    if (metodo === 'qr') {
      if (refEspera.current?.clave === clave) return      // ya se está contando
      clearTimeout(refEspera.current?.timer)
      setLeyendo(clave)
      refEspera.current = {
        clave,
        timer: setTimeout(() => {
          refEspera.current = null
          setLeyendo('')
          refUltima.current = { clave, cuando: Date.now() }
          abrirLectura(actual, clave, metodo)
        }, RETARDO_LECTURA),
      }
      return
    }

    refUltima.current = { clave, cuando: ahora }
    abrirLectura(actual, clave, metodo)
  }

  function abrirLectura(actual, clave, metodo) {
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
    clearTimeout(refEspera.current?.timer)
    refEspera.current = null
    setLeyendo('')
  }

  // Si se sale de la pantalla con un código a medio leer, no queda nada corriendo
  useEffect(() => () => clearTimeout(refEspera.current?.timer), [])

  // Lo que marcan los demás llega también aquí: así no se pide confirmación de
  // un bien que la otra persona acaba de verificar.
  useEffect(() => {
    const actual = rc || reconteoAbierto(idarea)
    if (!actual || actual.fin) return
    const traer = async () => {
      const marcas = await detalleRemoto(actual.id).catch(() => null)
      if (marcas && fusionarMarcas(actual.id, marcas)) setRc(reconteo(actual.id))
    }
    const id = setInterval(traer, 12000)
    return () => clearInterval(id)
  }, [idarea, rc?.id])

  function confirmar(observacion) {
    const actual = rc || reconteoAbierto(idarea)
    if (actual && lectura?.estado === 'nuevo') {
      marcar(actual.id, lectura.clave, lectura.metodo || 'qr', observacion)
      const guardado = reconteo(actual.id)
      setRc(guardado)

      // La marca sube en el momento, no al rato: es lo que hace que la otra
      // persona que cuenta la misma área lo vea enseguida. Sin señal se queda
      // pendiente y se reintenta solo, sin frenar el escaneo.
      subirAvance(guardado, [lectura.clave]).catch(() => {})

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
      <div className="capa" style={teclado ? { bottom: `${teclado}px` } : undefined}>
        {/* La equis regresa a la lista del área, así que el botón de lista que
            estaba junto sobraba: hacía exactamente lo mismo. */}
        <div className="arriba">
          <div className="cuenta">
            {s.encontrados} de {s.total}
            <span>{rc?.nombrearea || 'Reconteo'} · faltan {s.faltan}</span>
          </div>
          {pantallaCompletaDisponible() && (
            <button className="icono-btn" onClick={alternarPantallaCompleta}
              aria-label={completa ? 'Salir de pantalla completa' : 'Pantalla completa'}>
              <i className={`ti ti-${completa ? 'arrows-minimize' : 'arrows-maximize'}`} />
            </button>
          )}
          <button className="icono-btn" onClick={volver} aria-label="Cerrar">
            <i className="ti ti-x" />
          </button>
        </div>

        {!lectura && <div className="mira" />}

        {/* Mientras se aguanta el código se avisa, para que se note que hay que
            sostenerlo un momento y no que la lectura falló. */}
        {!lectura && leyendo && (
          <div className="leyendo">
            <i className="ti ti-loader-2 gira" />
            <span>{leyendo}</span>
          </div>
        )}

        <div className="abajo">
          {error && <div className="aviso error">{error}</div>}

          {lectura
            ? <TarjetaLectura lectura={lectura} onConfirmar={confirmar} onCancelar={cerrarLectura} />
            : (
              <form className="manual" onSubmit={e => { e.preventDefault(); if (manual.trim()) { leido(manual, 'manual'); setManual('') } }}>
                <input value={manual} onChange={e => setManual(e.target.value)}
                  placeholder="Clave o número de serie" autoCapitalize="characters" autoCorrect="off" />
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
  // El campo arranca en blanco: se escribe lo que se ve hoy, no se corrige un
  // texto viejo. Lo que tenía el bien se enseña debajo, y al guardar se
  // reemplaza; si no se escribe nada, la observación del bien se queda igual.
  const [nota, setNota] = useState('')
  const refNota = useRef(null)

  const cab = estado === 'nuevo'
    ? { color: 'var(--ok)',     fondo: 'var(--ok-suave)',     icono: 'ti-qrcode',       texto: 'Bien encontrado' }
    : estado === 'repetido'
      ? { color: 'var(--falta)',  fondo: 'var(--falta-suave)',  icono: 'ti-checks',       texto: 'Ya está verificado' }
      : { color: 'var(--alerta)', fondo: 'var(--alerta-suave)', icono: 'ti-alert-circle', texto: 'No es de esta área' }

  const dato = (etq, valor) => (
    <div key={etq} style={{ minWidth: 0 }}>
      <p className="etiqueta">{etq}</p>
      <p style={{ fontSize: '13.5px', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{valor || '—'}</p>
    </div>
  )

  return (
    <div className="confirma">
      {/* Encabezado con el estado de la lectura, del ancho de la tarjeta */}
      <div className="cabeza" style={{ background: cab.fondo, color: cab.color }}>
        <i className={`ti ${cab.icono}`} />
        <span>{cab.texto}</span>
        <span className="clave-cab">{clave}</span>
      </div>

      {bien ? (
        <div className="cuerpo">
          <p className="titulo">{bien.nombre}</p>
          {bien.area && <p className="detalle">{bien.area}</p>}

          <div className="campos">
            {dato('Marca', bien.marca)}
            {dato('Modelo', bien.modelo)}
            {dato('Serie', bien.serie)}
            {dato('Resguardo', bien.resguardante)}
          </div>

          {estado === 'repetido' && (
            <div className="aviso-linea">
              <i className="ti ti-clock" />
              <span>Verificado el {fechaCorta(cuando)}{observacion ? ` · ${observacion}` : ''}</span>
            </div>
          )}

          {estado === 'nuevo' && (
            <div style={{ marginTop: '12px' }}>
              <p className="etiqueta" style={{ marginBottom: '6px' }}>Observaciones</p>
              <textarea ref={refNota} value={nota} onChange={e => setNota(e.target.value)} rows={2}
                placeholder="Agregar Comentarios."
                // Al abrirse el teclado la tarjeta se desliza para que el campo
                // quede a la vista: si no, el teclado la tapaba por completo.
                onFocus={() => setTimeout(() => refNota.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '11px',
                  background: 'var(--campo)', border: '1px solid var(--borde-fuerte)', color: 'var(--texto-1)',
                  fontSize: '16px', outline: 'none', resize: 'none', lineHeight: 1.4 }} />
              {bien?.observaciones && (
                <p className="detalle" style={{ marginTop: '6px' }}>
                  <i className="ti ti-message-2" style={{ marginRight: '4px' }} />
                  Ahora dice: {bien.observaciones}
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="cuerpo">
          <p className="detalle">
            {!buscado ? 'Buscando en el inventario…'
              : ajeno ? <>{ajeno.nombre}<br />Está asignado a <b>{ajeno.area}</b>.</>
              : 'Esta clave no existe en el inventario.'}
          </p>
        </div>
      )}

      <div className="botones">
        <button className="boton suave" onClick={onCancelar}>
          {estado === 'nuevo' ? 'Cancelar' : 'Seguir escaneando'}
        </button>
        {estado === 'nuevo' && (
          <button className="boton" onClick={() => onConfirmar(nota.trim())}>
            <i className="ti ti-check" style={{ fontSize: '17px' }} />Verificar
          </button>
        )}
      </div>
    </div>
  )
}
