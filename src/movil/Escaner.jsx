import { useEffect, useRef, useState } from 'react'
import { volver, irA } from '../rutas'
import { Cabecera } from './AppMovil'
import { Cargando, Vacio } from './comunes'
import { hayCamara, abrirCamara, cerrarCamara, leerContinuo, avisar } from './camara'
import {
  reconteoAbierto, reconteo, revisar, marcar, marcarSubida, resumen,
  normalizarClave, fechaCorta, fusionarMarcas,
} from './reconteo'
import { bienPorClave, anotarObservacionEnBien } from './datos'
import { subirAvance, detalleRemoto } from './sincronizar'
import { pantallaCompletaDisponible, enPantallaCompleta, alternarPantallaCompleta } from './pantallaCompleta'

// ── Escáner del reconteo ──────────────────────────────────────────────────────
// Esta pantalla hace una sola cosa: leer el código. En cuanto lee uno, apaga la
// cámara y pasa a la pantalla del bien.
//
// Antes el bien se enseñaba en una tarjeta encima del video, con la cámara
// siguiendo encendida detrás: se trababa, tapaba media pantalla y el teclado
// dejaba el campo fuera de sitio. Separado en dos pantallas, cada una se ve
// completa y la cámara solo vive mientras hace falta.
//
// Leer NO marca: primero se enseña el bien y se espera el visto bueno. Si solo
// con apuntar la cámara se verificara, bastaría pasar cerca de un estante para
// dar por bueno lo que no se revisó.

// Lo que se espera con el código a la vista antes de darlo por leído. Sin esta
// pausa la lectura saltaba en el instante en que la cámara rozaba una etiqueta,
// y bastaba pasar de largo frente a un estante para abrirla sin querer.
const RETARDO_LECTURA = 1500

export function Escaner({ idarea }) {
  const refVideo = useRef(null)
  const refEspera = useRef(null)     // { clave, timer } mientras se aguanta el código
  const refLeido = useRef(false)     // ya se pasó a la pantalla del bien
  const [leyendo, setLeyendo] = useState('')
  const [error, setError] = useState(null)
  const [rc] = useState(() => reconteoAbierto(idarea))
  // Al conceder el permiso de la cámara, Android saca de pantalla completa. Para
  // volver a entrar hace falta un toque del usuario —el navegador no deja
  // hacerlo solo—, así que el botón vive aquí mismo y no en el menú de atrás.
  const [completa, setCompleta] = useState(enPantallaCompleta)

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
      clearTimeout(refEspera.current?.timer)
      if (stream) cerrarCamara(stream)
    }
  }, [])

  function leido(texto) {
    if (refLeido.current) return                 // ya se está saliendo de aquí
    const actual = rc || reconteoAbierto(idarea)
    if (!actual) return
    const clave = normalizarClave(texto)
    if (!clave) return

    // Hay que sostener el código un momento: así no se lee de pasada
    if (refEspera.current?.clave === clave) return
    clearTimeout(refEspera.current?.timer)
    setLeyendo(clave)
    refEspera.current = {
      clave,
      timer: setTimeout(() => {
        refEspera.current = null
        refLeido.current = true
        avisar('ok')
        // Al salir de la pantalla, el efecto de arriba apaga la cámara
        irA('m', 'lectura', idarea, clave, 'qr')
      }, RETARDO_LECTURA),
    }
  }

  const s = resumen(rc)

  return (
    <div className="movil-escaner">
      <video ref={refVideo} muted playsInline />
      <div className="capa">
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

        <div className="mira" />

        {/* Mientras se aguanta el código se avisa, para que se note que hay que
            sostenerlo un momento y no que la lectura falló. */}
        {leyendo && (
          <div className="leyendo">
            <i className="ti ti-loader-2 gira" />
            <span>{leyendo}</span>
          </div>
        )}

        <div className="abajo">
          {error && <div className="aviso error">{error}</div>}
          <button className="boton suave" onClick={() => irA('m', 'capturar', idarea)}>
            <i className="ti ti-keyboard" style={{ fontSize: '18px' }} />Capturar clave o serie
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Capturar a mano ──────────────────────────────────────────────────────────
// Su propia pantalla, sin cámara detrás: el campo arriba y el teclado con sitio
// de sobra. Sirve tanto para la clave de inventario como para el número de
// serie, que es lo que queda cuando la etiqueta está rota o el bien todavía no
// se etiqueta.
export function CapturarClave({ idarea }) {
  const [texto, setTexto] = useState('')
  const rc = reconteoAbierto(idarea)

  function buscar(e) {
    e?.preventDefault()
    const t = texto.trim()
    if (t) irA('m', 'lectura', idarea, t, 'manual')
  }

  return (
    <>
      <Cabecera titulo="Capturar a mano" sub={rc?.nombrearea} atras />
      <div className="contenido">
        <form onSubmit={buscar} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <p className="etiqueta" style={{ marginBottom: '6px' }}>Clave de inventario o número de serie</p>
            <input value={texto} onChange={e => setTexto(e.target.value)} autoFocus
              placeholder="I25-3401-2-765" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
              style={{ width: '100%', padding: '13px 14px', borderRadius: '12px', background: 'var(--campo)',
                border: '1px solid var(--borde-fuerte)', color: 'var(--texto-1)', fontSize: '17px', outline: 'none' }} />
          </div>
          <button className="boton" type="submit" disabled={!texto.trim()}>
            <i className="ti ti-search" style={{ fontSize: '18px' }} />Buscar
          </button>
        </form>

        <p className="detalle">
          Si la etiqueta está rota o el bien todavía no se etiqueta, se puede capturar
          el número de serie que trae el aparato.
        </p>

        <button className="boton suave" onClick={() => irA('m', 'escanear', idarea)}>
          <i className="ti ti-scan" style={{ fontSize: '18px' }} />Volver a la cámara
        </button>
      </div>
    </>
  )
}

// ── El bien que se acaba de leer ─────────────────────────────────────────────
// Pantalla completa, sin la cámara encendida detrás. Al verificar se vuelve al
// escáner para seguir con el siguiente.
export function LecturaBien({ idarea, clave, metodo = 'qr' }) {
  const [rc, setRc] = useState(() => reconteoAbierto(idarea))
  const [lectura, setLectura] = useState(null)
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const refNota = useRef(null)

  useEffect(() => {
    const actual = reconteoAbierto(idarea)
    setRc(actual)
    if (!actual) return
    const r = revisar(actual.id, clave)
    setLectura(r)

    // Si no es de esta área, se averigua dónde debería estar: encontrar un bien
    // fuera de su área es justo lo que un reconteo tiene que sacar a la luz.
    if (r.estado === 'ajeno') {
      bienPorClave(r.clave)
        .then(b => setLectura(l => (l ? { ...l, ajeno: b, buscado: true } : l)))
        .catch(() => setLectura(l => (l ? { ...l, buscado: true } : l)))
    }
    // Y se trae lo que hayan marcado los demás, por si este bien ya lo verificó
    // la otra persona mientras tanto.
    detalleRemoto(actual.id)
      .then(marcas => {
        if (marcas && fusionarMarcas(actual.id, marcas)) {
          setRc(reconteo(actual.id))
          setLectura(revisar(actual.id, clave))
        }
      })
      .catch(() => {})
  }, [idarea, clave])

  const seguir = () => irA('m', 'escanear', idarea)

  function verificar() {
    const actual = rc || reconteoAbierto(idarea)
    if (!actual || lectura?.estado !== 'nuevo') return seguir()
    setGuardando(true)
    const observacion = nota.trim()
    marcar(actual.id, lectura.clave, metodo, observacion)
    const guardado = reconteo(actual.id)

    // La marca sube en el momento: es lo que hace que la otra persona que
    // cuenta la misma área la vea enseguida. Sin señal queda pendiente y se
    // reintenta sola, sin frenar el escaneo.
    subirAvance(guardado, [lectura.clave]).catch(() => {})

    // La observación se escribe también en el bien, para que quede en el
    // inventario y no solo en el conteo.
    if (observacion && lectura.bien?.idbien) {
      anotarObservacionEnBien(lectura.bien.idbien, observacion)
        .then(() => marcarSubida(actual.id, lectura.clave))
        .catch(() => { /* queda pendiente; se reintenta desde la lista */ })
    }
    seguir()
  }

  if (!rc) return (
    <>
      <Cabecera titulo="Reconteo" atras />
      <div className="contenido"><Vacio icono="ti-scan" texto="No hay un reconteo abierto en esta área" /></div>
    </>
  )
  if (!lectura) return (
    <>
      <Cabecera titulo="Buscando…" sub={clave} atras />
      <div className="contenido"><Cargando /></div>
    </>
  )

  const { estado, bien, cuando, observacion, ajeno, buscado } = lectura
  const cab = estado === 'nuevo'
    ? { color: 'var(--ok)',     fondo: 'var(--ok-suave)',     icono: 'ti-qrcode',       texto: 'Bien encontrado' }
    : estado === 'repetido'
      ? { color: 'var(--falta)',  fondo: 'var(--falta-suave)',  icono: 'ti-checks',       texto: 'Ya está verificado' }
      : { color: 'var(--alerta)', fondo: 'var(--alerta-suave)', icono: 'ti-alert-circle', texto: 'No es de esta área' }

  const dato = (etq, valor) => (
    <div className="fila" key={etq}>
      <div className="crece">
        <p className="etiqueta">{etq}</p>
        <p className="nombre" style={{ fontWeight: 400 }}>{valor || '—'}</p>
      </div>
    </div>
  )

  return (
    <>
      <Cabecera titulo={estado === 'nuevo' ? 'Verificar bien' : cab.texto} sub={rc.nombrearea} atras />
      <div className="contenido">
        <div className="tarjeta" style={{ background: cab.fondo, borderColor: cab.color, color: cab.color }}>
          <p style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 600 }}>
            <i className={`ti ${cab.icono}`} style={{ fontSize: '19px' }} />{cab.texto}
          </p>
          <p className="clave" style={{ color: 'inherit', marginTop: '4px' }}>{lectura.clave}</p>
        </div>

        {bien ? (
          <>
            <div className="tarjeta">
              <p style={{ fontSize: '17px', fontWeight: 600, lineHeight: 1.3 }}>{bien.nombre}</p>
              {bien.area && <p className="detalle">{bien.area}</p>}
            </div>

            <div className="tarjeta plana">
              {dato('Marca', bien.marca)}
              {dato('Modelo', bien.modelo)}
              {dato('Serie', bien.serie)}
              {dato('Resguardo', bien.resguardante)}
            </div>

            {estado === 'repetido' && (
              <div className="tarjeta">
                <p className="detalle">
                  <i className="ti ti-clock" style={{ marginRight: '6px' }} />
                  Verificado el {fechaCorta(cuando)}
                </p>
                {observacion && <p className="detalle" style={{ marginTop: '4px' }}>{observacion}</p>}
              </div>
            )}

            {estado === 'nuevo' && (
              <div>
                <p className="etiqueta" style={{ marginBottom: '6px' }}>Observaciones</p>
                <textarea ref={refNota} value={nota} onChange={e => setNota(e.target.value)} rows={3}
                  placeholder="Agregar Comentarios."
                  onFocus={() => setTimeout(() => refNota.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350)}
                  style={{ width: '100%', padding: '12px 13px', borderRadius: '12px', background: 'var(--campo)',
                    border: '1px solid var(--borde-fuerte)', color: 'var(--texto-1)', fontSize: '16px',
                    outline: 'none', resize: 'vertical', lineHeight: 1.4 }} />
                {/* Lo que dice hoy el bien: al guardar se reemplaza por lo que se
                    escriba aquí; si se deja vacío, se queda como está. */}
                {bien.observaciones && (
                  <p className="detalle" style={{ marginTop: '6px' }}>
                    <i className="ti ti-message-2" style={{ marginRight: '4px' }} />
                    Ahora dice: {bien.observaciones}
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="tarjeta">
            <p className="detalle">
              {!buscado ? 'Buscando en el inventario…'
                : ajeno ? <>{ajeno.nombre}<br />Está asignado a <b>{ajeno.area}</b>.</>
                : 'Esta clave no existe en el inventario.'}
            </p>
          </div>
        )}

        {estado === 'nuevo' ? (
          <>
            <button className="boton" onClick={verificar} disabled={guardando}>
              <i className="ti ti-check" style={{ fontSize: '18px' }} />Verificar y seguir escaneando
            </button>
            <button className="boton suave" onClick={seguir} disabled={guardando}>Cancelar</button>
          </>
        ) : (
          <button className="boton" onClick={seguir}>
            <i className="ti ti-scan" style={{ fontSize: '18px' }} />Seguir escaneando
          </button>
        )}
        <button className="boton suave" onClick={() => irA('m', 'reconteo', idarea)}>
          <i className="ti ti-list" style={{ fontSize: '18px' }} />Ver la lista del área
        </button>
      </div>
    </>
  )
}
