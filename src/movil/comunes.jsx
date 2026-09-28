import { useEffect, useRef, useState } from 'react'
import { useBloquearScroll } from './useBloquearScroll'
import { listarFotos, hayServidorFotos } from '../fotos'

// ── Piezas que usan varias pantallas del celular ─────────────────────────────
// Viven aquí y no dentro de una pantalla para que el escáner, el historial y las
// listas enseñen exactamente lo mismo.

export function Cargando({ texto = 'Cargando…' }) {
  return <div className="cargando"><i className="ti ti-loader-2 gira" />{texto}</div>
}

export function Vacio({ icono = 'ti-search-off', texto }) {
  return <div className="vacio"><i className={`ti ${icono}`} />{texto}</div>
}

// Pregunta antes de algo que no se puede deshacer. Es la misma idea de los
// modales de confirmación del escritorio, en hoja.
export function Confirmar({ titulo, detalle, textoOk, peligro, onOk, onCerrar }) {
  useBloquearScroll()
  return (
    <>
      <div className="movil-telon" onClick={onCerrar} />
      <div className="movil-hoja">
        <div className="asa" />
        <div style={{ padding: '4px 16px 14px' }}>
          <p style={{ fontSize: '16px', fontWeight: 600 }}>{titulo}</p>
          {detalle && <p style={{ fontSize: '13px', color: 'var(--texto-3)', marginTop: '6px', lineHeight: 1.5 }}>{detalle}</p>}
        </div>
        <div style={{ display: 'flex', gap: '8px', padding: '0 16px' }}>
          <button className="boton suave" onClick={onCerrar}>Cancelar</button>
          <button className={`boton${peligro ? ' peligro' : ''}`} onClick={() => { onOk(); onCerrar() }}>{textoOk}</button>
        </div>
      </div>
    </>
  )
}

// La misma hoja, pero pide la contraseña de quien tiene la sesión abierta antes
// de seguir. `onOk(contraseña)` puede fallar: el error se enseña y la hoja se
// queda abierta para volver a intentarlo.
export function ConfirmarConContrasena({ titulo, detalle, textoOk, onOk, onCerrar }) {
  useBloquearScroll()
  const [clave, setClave] = useState('')
  const [err, setErr] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  async function aceptar(e) {
    e?.preventDefault()
    if (ocupado) return
    setOcupado(true); setErr(null)
    try { await onOk(clave); onCerrar() }
    catch (x) { setErr(x.message || 'No se pudo completar'); setOcupado(false) }
  }
  return (
    <>
      <div className="movil-telon" onClick={ocupado ? undefined : onCerrar} />
      <form className="movil-hoja" onSubmit={aceptar}>
        <div className="asa" />
        <div style={{ padding: '4px 16px 12px' }}>
          <p style={{ fontSize: '16px', fontWeight: 600 }}>{titulo}</p>
          {detalle && <p style={{ fontSize: '13px', color: 'var(--texto-3)', marginTop: '6px', lineHeight: 1.5 }}>{detalle}</p>}
          <div className="buscador" style={{ marginTop: '12px' }}>
            <i className="ti ti-lock" />
            <input type="password" value={clave} onChange={e => setClave(e.target.value)}
              placeholder="Contraseña del administrador" autoComplete="current-password" />
          </div>
          {err && <p style={{ fontSize: '12.5px', color: 'var(--falta)', marginTop: '8px' }}>{err}</p>}
        </div>
        <div style={{ display: 'flex', gap: '8px', padding: '0 16px' }}>
          <button type="button" className="boton suave" onClick={onCerrar} disabled={ocupado}>Cancelar</button>
          <button type="submit" className="boton peligro" disabled={ocupado || !clave}>{ocupado ? 'Verificando…' : textoOk}</button>
        </div>
      </form>
    </>
  )
}

// ── Fotos del bien, deslizando ───────────────────────────────────────────────
// Al escanear un QR se enseñan las fotos que tiene el bien en el servidor de
// imágenes, para confirmar a simple vista que es el mismo. Una por pantalla, se
// pasan con el dedo; los puntos de abajo dicen en cuál va. Sin servidor o sin
// fotos no se enseña nada.
export function CarruselFotos({ idbien }) {
  const [fotos, setFotos] = useState(() => (hayServidorFotos() ? null : []))
  const [actual, setActual] = useState(0)
  useEffect(() => {
    if (!hayServidorFotos() || idbien == null) return
    let vivo = true
    listarFotos(idbien).then(l => { if (vivo) setFotos(l) }).catch(() => { if (vivo) setFotos([]) })
    return () => { vivo = false }
  }, [idbien])

  if (fotos === null) return <div className="carrusel-vacio"><i className="ti ti-loader-2 gira" /></div>
  if (!fotos.length) return null
  return (
    <div>
      <div className="carrusel" onScroll={e => {
        const el = e.currentTarget
        setActual(Math.round(el.scrollLeft / el.clientWidth))
      }}>
        {fotos.map((f, i) => <img key={f.id} src={f.url} alt={`Foto ${i + 1}`} loading={i ? 'lazy' : 'eager'} />)}
      </div>
      {fotos.length > 1 && (
        <div className="puntos">{fotos.map((f, i) => <span key={f.id} className={i === actual ? 'activo' : ''} />)}</div>
      )}
    </div>
  )
}

// ── Listas largas, por tramos ────────────────────────────────────────────────
// Una categoría como Equipamientos trae 910 inmuebles; pintarlos todos de golpe
// dejaba la pantalla congelada un momento y el scroll a tirones. Así se pintan
// los primeros y el resto va entrando conforme uno baja, antes de llegar al
// final: no se nota el corte.
//
// `reinicio` dice cuándo volver a empezar desde arriba —al cambiar de pestaña,
// de filtro o de búsqueda—. No se reinicia cuando solo cambia el contenido,
// como al marcar un bien: si no, la lista se recortaba bajo el dedo.
export function useProgresivo(lista, { paso = 60, reinicio = [] } = {}) {
  const [cuantos, setCuantos] = useState(paso)
  const refFin = useRef(null)
  const clave = JSON.stringify(reinicio)

  useEffect(() => { setCuantos(paso) }, [clave, paso])

  const total = lista.length
  useEffect(() => {
    const el = refFin.current
    if (!el || cuantos >= total) return
    const vigia = new IntersectionObserver(
      entradas => { if (entradas[0].isIntersecting) setCuantos(n => n + paso) },
      { rootMargin: '800px 0px' })   // se adelanta: carga antes de que se vea el final
    vigia.observe(el)
    return () => vigia.disconnect()
  }, [cuantos, total, paso])

  return {
    visibles: cuantos >= total ? lista : lista.slice(0, cuantos),
    // Se pone al final de la lista; mientras queden renglones por pintar, es
    // lo que avisa que ya se está llegando abajo
    fin: cuantos < total ? <div ref={refFin} aria-hidden style={{ height: 1 }} /> : null,
  }
}
