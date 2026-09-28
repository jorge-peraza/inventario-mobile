import { useState, useEffect, useRef } from 'react'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import { useTheme, FONDO_OSCURO } from '../context/ThemeContext'
import { iStyle } from './ui'
import {
  LOGOS, FIRMAS, cargarPersonalizacion, guardarLogo, restaurarLogo, srcLogo, hayCambiado,
  prepararImagen, moduloDeUsuario, firma, firmaCambiada, guardarFirma, restaurarFirma,
} from '../personalizacion'

// ── Configuración ────────────────────────────────────────────────────────────
//
// Por ahora, los logos del encabezado de los reportes. Se cambian aquí y no en
// el código para no tener que volver a publicar el programa cada vez que el
// Ayuntamiento cambie de imagen.
//
// Cada administrador ve y cambia los de SU módulo: los de muebles viven en la
// base de muebles y los de inmuebles en la suya, así que uno no le mueve los
// reportes al otro.

const kb = b => (b >= 1024 * 1024 ? (b / 1024 / 1024).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB')

const tituloSeccion = t => ({ fontSize: '15px', fontWeight: 600, color: t.text1, marginBottom: '4px' })

function Tarjeta({ modulo, logo, dark, t, onCambio }) {
  const [previo, setPrevio]     = useState(null)   // { dataURL, w, h, bytes } sin guardar
  const [ocupado, setOcupado]   = useState(false)
  const [err, setErr]           = useState(null)
  const [listo, setListo]       = useState(false)
  const archivo = useRef(null)

  const cambiado = hayCambiado(modulo, logo.id)
  const mostrado = previo ? previo.dataURL : srcLogo(modulo, logo.id)

  async function elegir(file) {
    setErr(null); setListo(false)
    try { setPrevio(await prepararImagen(file)) }
    catch (e) { setErr(e.message) }
    finally { if (archivo.current) archivo.current.value = '' }
  }

  async function guardar() {
    if (!previo) return
    setOcupado(true); setErr(null)
    try {
      await guardarLogo(modulo, logo.id, previo.dataURL)
      setPrevio(null); setListo(true)
      onCambio()
      setTimeout(() => setListo(false), 2500)
    } catch (e) { setErr(e.message) }
    finally { setOcupado(false) }
  }

  async function restaurar() {
    setOcupado(true); setErr(null)
    try {
      await restaurarLogo(modulo, logo.id)
      setPrevio(null); setListo(true)
      onCambio()
      setTimeout(() => setListo(false), 2500)
    } catch (e) { setErr(e.message) }
    finally { setOcupado(false) }
  }

  const btn = (tono) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
    padding: '9px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: 500,
    fontFamily: 'inherit', cursor: ocupado ? 'not-allowed' : 'pointer', opacity: ocupado ? 0.6 : 1,
    background: tono === 'verde' ? (dark ? 'rgba(168,230,207,0.18)' : 'rgba(30,126,74,0.08)') : 'transparent',
    border: tono === 'verde'
      ? (dark ? '1px solid rgba(168,230,207,0.35)' : '1px solid rgba(30,126,74,0.35)')
      : `1px solid ${t.cardBorder}`,
    color: tono === 'verde' ? (dark ? '#a8e6cf' : '#15803d') : t.text3,
  })

  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, backdropFilter: t.cardBlur, WebkitBackdropFilter: t.cardBlur, borderRadius: '14px', padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <p style={{ fontSize: '14px', fontWeight: 600, color: t.text1 }}>{logo.etiqueta}</p>
          {cambiado && (
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', padding: '2px 7px', borderRadius: '20px', background: dark ? 'rgba(168,230,207,0.16)' : 'rgba(30,126,74,0.1)', color: dark ? '#a8e6cf' : '#15803d' }}>
              CAMBIADO
            </span>
          )}
        </div>
        <p style={{ fontSize: '12px', color: t.text4, marginTop: '2px' }}>{logo.donde}</p>
      </div>

      {/* El logo tal como va a salir. Cuadros para que se note lo transparente. */}
      <div style={{ height: '150px', borderRadius: '11px', border: `1px solid ${t.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '14px',
        backgroundColor: dark ? '#f4f4f5' : '#fff',
        backgroundImage: 'linear-gradient(45deg,#e9e9ec 25%,transparent 25%),linear-gradient(-45deg,#e9e9ec 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e9e9ec 75%),linear-gradient(-45deg,transparent 75%,#e9e9ec 75%)',
        backgroundSize: '16px 16px', backgroundPosition: '0 0,0 8px,8px -8px,-8px 0' }}>
        <img src={mostrado} alt={logo.etiqueta} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      </div>

      {previo && (
        <p style={{ fontSize: '11.5px', color: t.text3 }}>
          Sin guardar: {previo.w}×{previo.h} px · {kb(previo.bytes)}
          {previo.original.w !== previo.w && ` (se redujo de ${previo.original.w}×${previo.original.h})`}
        </p>
      )}
      {listo && <p style={{ fontSize: '11.5px', color: dark ? '#7ee8a2' : '#1e7e4a' }}><i className="ti ti-check" style={{ marginRight: '5px' }} />Guardado</p>}
      {err && <p style={{ fontSize: '11.5px', color: dark ? '#f4a1a1' : '#c0392b' }}><i className="ti ti-alert-circle" style={{ marginRight: '5px' }} />{err}</p>}

      <input ref={archivo} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }}
        onChange={e => elegir(e.target.files?.[0])} />

      <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
        {previo ? (
          <>
            <button onClick={() => setPrevio(null)} disabled={ocupado} style={{ ...btn(), flex: '0 0 auto' }}>Cancelar</button>
            <button onClick={guardar} disabled={ocupado} style={{ ...btn('verde'), flex: 1 }}>
              <i className="ti ti-device-floppy" style={{ fontSize: '15px' }} />{ocupado ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        ) : (
          <>
            <button onClick={() => archivo.current?.click()} disabled={ocupado} style={{ ...btn('verde'), flex: 1 }}>
              <i className="ti ti-upload" style={{ fontSize: '15px' }} />Cambiar imagen
            </button>
            {cambiado && (
              <button onClick={restaurar} disabled={ocupado} style={btn()} title="Volver al logo que trae el programa">
                <i className="ti ti-rotate" style={{ fontSize: '15px' }} />Restaurar
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Quién firma ──────────────────────────────────────────────────────────────
// El nombre y el puesto que van al pie de los documentos. Se guardan juntos
// porque siempre cambian juntos: cuando entra otra persona, cambian los dos.
function TarjetaFirma({ modulo, def, dark, t, onCambio }) {
  const actual = firma(modulo, def.id)
  const [nombre, setNombre] = useState(actual.nombre)
  const [puesto, setPuesto] = useState(actual.puesto)
  const [ocupado, setOcupado] = useState(false)
  const [err, setErr]     = useState(null)
  const [listo, setListo] = useState(false)

  const cambiado = firmaCambiada(modulo, def.id)
  const sinGuardar = nombre !== actual.nombre || puesto !== actual.puesto

  async function guardar() {
    if (!nombre.trim()) { setErr('El nombre no puede quedar vacío'); return }
    setOcupado(true); setErr(null)
    try {
      await guardarFirma(modulo, def.id, { nombre, puesto })
      setListo(true); onCambio(); setTimeout(() => setListo(false), 2500)
    } catch (e) { setErr(e.message) }
    finally { setOcupado(false) }
  }

  async function restaurar() {
    setOcupado(true); setErr(null)
    try {
      await restaurarFirma(modulo, def.id)
      const vuelto = firma(modulo, def.id)
      setNombre(vuelto.nombre); setPuesto(vuelto.puesto)
      setListo(true); onCambio(); setTimeout(() => setListo(false), 2500)
    } catch (e) { setErr(e.message) }
    finally { setOcupado(false) }
  }

  const btn = (tono) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
    padding: '9px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: 500,
    fontFamily: 'inherit', cursor: ocupado ? 'not-allowed' : 'pointer', opacity: ocupado ? 0.6 : 1,
    background: tono === 'verde' ? (dark ? 'rgba(168,230,207,0.18)' : 'rgba(30,126,74,0.08)') : 'transparent',
    border: tono === 'verde'
      ? (dark ? '1px solid rgba(168,230,207,0.35)' : '1px solid rgba(30,126,74,0.35)')
      : `1px solid ${t.cardBorder}`,
    color: tono === 'verde' ? (dark ? '#a8e6cf' : '#15803d') : t.text3,
  })
  const lbl = { fontSize: '10px', fontWeight: 700, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '5px' }

  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, backdropFilter: t.cardBlur, WebkitBackdropFilter: t.cardBlur, borderRadius: '14px', padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <p style={{ fontSize: '14px', fontWeight: 600, color: t.text1 }}>{def.etiqueta}</p>
          {cambiado && (
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', padding: '2px 7px', borderRadius: '20px', background: dark ? 'rgba(168,230,207,0.16)' : 'rgba(30,126,74,0.1)', color: dark ? '#a8e6cf' : '#15803d' }}>
              CAMBIADO
            </span>
          )}
        </div>
        <p style={{ fontSize: '12px', color: t.text4, marginTop: '2px' }}>{def.donde}</p>
      </div>

      <div>
        <p style={lbl}>Nombre</p>
        <input value={nombre} onChange={e => setNombre(e.target.value.toUpperCase())}
          placeholder="MTRA. NOMBRE APELLIDO" style={iStyle(dark)} />
      </div>
      <div>
        <p style={lbl}>Puesto</p>
        <input value={puesto} onChange={e => setPuesto(e.target.value.toUpperCase())}
          placeholder="SINDICO MUNICIPAL" style={iStyle(dark)} />
      </div>

      {/* Tal como va a salir impreso */}
      <div style={{ padding: '12px', borderRadius: '10px', border: `1px solid ${t.cardBorder}`, background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)', textAlign: 'center' }}>
        <div style={{ borderTop: `1px solid ${dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)'}`, margin: '0 10px 6px' }} />
        <p style={{ fontSize: '11.5px', fontWeight: 700, color: t.text1 }}>{nombre || '—'}</p>
        <p style={{ fontSize: '10.5px', color: t.text3 }}>{puesto}</p>
      </div>

      {listo && <p style={{ fontSize: '11.5px', color: dark ? '#7ee8a2' : '#1e7e4a' }}><i className="ti ti-check" style={{ marginRight: '5px' }} />Guardado</p>}
      {err && <p style={{ fontSize: '11.5px', color: dark ? '#f4a1a1' : '#c0392b' }}><i className="ti ti-alert-circle" style={{ marginRight: '5px' }} />{err}</p>}

      <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
        <button onClick={guardar} disabled={ocupado || !sinGuardar} style={{ ...btn('verde'), flex: 1, opacity: (ocupado || !sinGuardar) ? 0.5 : 1, cursor: (ocupado || !sinGuardar) ? 'not-allowed' : 'pointer' }}>
          <i className="ti ti-device-floppy" style={{ fontSize: '15px' }} />{ocupado ? 'Guardando…' : 'Guardar'}
        </button>
        {cambiado && (
          <button onClick={restaurar} disabled={ocupado} style={btn()} title="Volver al nombre que trae el programa">
            <i className="ti ti-rotate" style={{ fontSize: '15px' }} />Restaurar
          </button>
        )}
      </div>
    </div>
  )
}

export default function Configuracion({ user, onNavigate }) {
  const { dark, t, sidebarOpen } = useTheme()
  const [version, setVersion] = useState(0)   // fuerza a repintar tras un cambio
  const [cargando, setCargando] = useState(true)

  // Cada quien administra los de su módulo, y nada más
  const modulo = moduloDeUsuario(user)
  const esInmuebles = modulo === 'inmuebles'

  useEffect(() => { cargarPersonalizacion().finally(() => setCargando(false)) }, [])

  const bg = dark
    ? FONDO_OSCURO
    : 'linear-gradient(145deg, #e0e0e2 0%, #ebebed 50%, #e4e4e6 100%)'

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: bg, transition: 'background 0.3s' }}>
      <Sidebar user={user} active="configuracion" onNavigate={onNavigate} />
      <main style={{ flex: 1, marginLeft: sidebarOpen ? '230px' : '72px', padding: '2rem 1.25rem', overflowY: 'auto', overflowX: 'hidden', minWidth: 0, transition: 'margin-left 0.25s cubic-bezier(0.4,0,0.2,1)' }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 600, color: t.text1, marginBottom: '4px' }}>Configuración</h1>
            <p style={{ fontSize: '14px', color: t.text3 }}>
              Logos y firmas de los reportes de {esInmuebles ? 'bienes inmuebles' : 'bienes muebles'}
            </p>
          </div>
          <ThemeToggle />
        </div>

        {/* Todo el ancho, con el mismo margen a los dos lados que las demás
            pantallas: en monitores grandes las tarjetas crecen en vez de dejar
            un hueco a la derecha */}
        <div>
          {cargando ? (
            <p style={{ fontSize: '13px', color: t.text4 }}>Cargando…</p>
          ) : (
            <div key={version}>
              {/* ── Logos ── */}
              <p style={{ ...tituloSeccion(t), marginBottom: '0.9rem' }}>Logos del encabezado</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '1rem', alignItems: 'stretch' }}>
                {LOGOS.map(l => (
                  <Tarjeta key={l.id} modulo={modulo} logo={l} dark={dark} t={t} onCambio={() => setVersion(v => v + 1)} />
                ))}
              </div>

              {/* ── Firmas ── */}
              <p style={{ ...tituloSeccion(t), marginTop: '2rem', marginBottom: '0.9rem' }}>Quién firma</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '1rem', alignItems: 'stretch' }}>
                {(FIRMAS[modulo] || []).map(f => (
                  <TarjetaFirma key={f.id} modulo={modulo} def={f} dark={dark} t={t} onCambio={() => setVersion(v => v + 1)} />
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
