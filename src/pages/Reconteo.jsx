import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Sidebar from '../components/Sidebar'
import { useTheme } from '../context/ThemeContext'
import { supabase } from '../supabase'
import { btnBarra, sStyle, iStyle, searchBoxStyle, thBase, tdBase, btnAccion } from './BienesMuebles'

// ── Reconteo (escritorio) ────────────────────────────────────────────────────
// El conteo físico se levanta desde el celular; aquí se consulta lo que quedó.
// Todo sale de la base (reconteos / reconteo_bienes / reconteo_ajenos), así que
// se ve lo de cualquier teléfono, no solo lo de este equipo.
//
// La pantalla tiene los mismos tres estados que el celular —Todos, Verificados,
// Faltan— y respeta la tabla de Bienes Muebles: mismas líneas, mismos tipos y
// los mismos colores de acción.

const PESTANAS = [
  { id: 'todos', label: 'Todos',       icon: 'ti-list' },
  { id: 'ok',    label: 'Verificados', icon: 'ti-check' },
  { id: 'faltan',label: 'Faltan',      icon: 'ti-question-mark' },
]

function fmtFechaHora(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}
function fmtFecha(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}
const soloDia = iso => (iso ? String(iso).slice(0, 10) : '')

// Chip de estado con la misma forma que el de la tabla de bienes
function chipEstado(dark, tipo) {
  const c = {
    ok:      { color: dark ? '#7ee8a2' : '#1e7e4a', bg: dark ? 'rgba(126,232,162,0.15)' : 'rgba(30,126,74,0.1)',   label: 'Verificado' },
    falta:   { color: dark ? '#ffd580' : '#b7790a', bg: dark ? 'rgba(255,213,128,0.15)' : 'rgba(183,121,10,0.1)',  label: 'No encontrado' },
    curso:   { color: dark ? '#a8c5f8' : '#2563eb', bg: dark ? 'rgba(168,197,248,0.15)' : 'rgba(37,99,235,0.1)',   label: 'En curso' },
    cerrado: { color: dark ? '#7ee8a2' : '#1e7e4a', bg: dark ? 'rgba(126,232,162,0.15)' : 'rgba(30,126,74,0.1)',   label: 'Terminado' },
    ajeno:   { color: dark ? '#f4a1a1' : '#c0392b', bg: dark ? 'rgba(244,161,161,0.15)' : 'rgba(192,57,43,0.1)',   label: 'De otra área' },
  }[tipo]
  return { style: { fontSize: '11px', fontWeight: 500, padding: '3px 8px', borderRadius: '20px', display: 'inline-block', background: c.bg, color: c.color, border: `1px solid ${c.color}44`, whiteSpace: 'nowrap' }, label: c.label }
}

// Control de tres estados: el fondo se desliza al que se elige
function Deslizante({ valor, onCambio, opciones, dark, t }) {
  const i = Math.max(0, opciones.findIndex(o => o.id === valor))
  return (
    <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${opciones.length}, minmax(0,1fr))`, gap: '4px', padding: '4px', borderRadius: '12px', background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.035)', border: `1px solid ${t.cardBorder}`, minWidth: '330px' }}>
      <div aria-hidden style={{ position: 'absolute', top: '4px', bottom: '4px', left: `calc(4px + ${i} * ((100% - 8px) / ${opciones.length}))`, width: `calc((100% - 8px) / ${opciones.length})`, borderRadius: '9px', background: dark ? 'rgba(255,255,255,0.09)' : '#fff', border: `1px solid ${dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)'}`, boxShadow: dark ? 'none' : '0 1px 3px rgba(0,0,0,0.07)', transition: 'left 0.25s cubic-bezier(0.4,0,0.2,1)' }} />
      {opciones.map(o => {
        const activo = o.id === valor
        return (
          <button key={o.id} onClick={() => onCambio(o.id)}
            style={{ position: 'relative', zIndex: 1, padding: '7px 6px', borderRadius: '9px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px', color: activo ? t.text1 : t.text3, transition: 'color 0.15s' }}>
            <b style={{ fontSize: '16px', fontWeight: 600 }}>{o.total?.toLocaleString() ?? '—'}</b>
            <span style={{ fontSize: '11.5px', fontWeight: 500 }}>{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Detalle de un reconteo ───────────────────────────────────────────────────
function Detalle({ reconteo, onVolver, dark, t, card }) {
  const [bienes, setBienes]   = useState([])
  const [ajenos, setAjenos]   = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError]     = useState(null)
  const [pestana, setPestana] = useState('todos')
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    let vivo = true
    setCargando(true); setError(null)
    ;(async () => {
      try {
        const [b, a] = await Promise.all([
          supabase.from('reconteo_bienes').select('*').eq('idreconteo', reconteo.idreconteo).order('clave'),
          supabase.from('reconteo_ajenos').select('*').eq('idreconteo', reconteo.idreconteo),
        ])
        if (b.error) throw b.error
        if (!vivo) return
        setBienes(b.data || [])
        setAjenos(a.error ? [] : (a.data || []))
      } catch (e) { if (vivo) setError(e.message) }
      finally { if (vivo) setCargando(false) }
    })()
    return () => { vivo = false }
  }, [reconteo.idreconteo])

  const encontrados = bienes.filter(b => b.encontrado).length
  const faltan      = bienes.length - encontrados
  const conNota     = bienes.filter(b => b.observacion).length

  const lista = useMemo(() => {
    const q = busqueda.trim().toUpperCase()
    return bienes
      .filter(b => (pestana === 'todos' ? true : pestana === 'ok' ? b.encontrado : !b.encontrado))
      .filter(b => !q || (b.clave || '').includes(q) || (b.nombre || '').toUpperCase().includes(q) ||
        (b.resguardante || '').toUpperCase().includes(q) || (b.observacion || '').toUpperCase().includes(q))
  }, [bienes, pestana, busqueda])

  const opciones = PESTANAS.map(p => ({ ...p, total: p.id === 'todos' ? bienes.length : p.id === 'ok' ? encontrados : faltan }))

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <button onClick={onVolver} title="Volver al historial"
            style={{ width: '34px', height: '34px', flexShrink: 0, borderRadius: '9px', background: t.cardBg, border: `1px solid ${t.cardBorder}`, cursor: 'pointer', color: t.text2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="ti ti-arrow-left" style={{ fontSize: '17px' }} />
          </button>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 600, color: t.text1, marginBottom: '4px' }}>{reconteo.nombrearea || 'Área'}</h1>
            <p style={{ fontSize: '13.5px', color: t.text3 }}>
              {reconteo.dependencia || '—'} · {fmtFechaHora(reconteo.inicio)}
              {reconteo.usuario ? ` · ${reconteo.usuario}` : ''}
            </p>
          </div>
        </div>
        {(() => { const c = chipEstado(dark, reconteo.fin ? 'cerrado' : 'curso'); return (
          <span style={{ ...c.style, padding: '5px 12px', fontSize: '12px' }}>{c.label}</span>
        ) })()}
      </div>

      {/* Resumen del conteo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: '12px', marginBottom: '1rem' }}>
        {[
          { label: 'Bienes del área',    valor: bienes.length, icon: 'ti-box',            color: t.text1 },
          { label: 'Verificados',        valor: encontrados,   icon: 'ti-circle-check',   color: dark ? '#7ee8a2' : '#1e7e4a' },
          { label: 'No encontrados',     valor: faltan,        icon: 'ti-question-mark',  color: dark ? '#ffd580' : '#b7790a' },
          { label: 'Con observación',    valor: conNota,       icon: 'ti-message-2',      color: dark ? '#a8c5f8' : '#2563eb' },
        ].map((k, i) => (
          <div key={i} style={{ ...card, padding: '1rem 1.15rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <i className={`ti ${k.icon}`} style={{ fontSize: '17px', color: k.color }} />
              <p style={{ fontSize: '12px', color: t.text3 }}>{k.label}</p>
            </div>
            <p style={{ fontSize: '26px', fontWeight: 600, color: t.text1, lineHeight: 1 }}>{cargando ? '…' : k.valor.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Los tres estados + búsqueda */}
      <div className="barra-fit" style={{ ...card, padding: '0.85rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <Deslizante valor={pestana} onCambio={setPestana} opciones={opciones} dark={dark} t={t} />
        <div style={{ ...searchBoxStyle(dark), flex: 1, minWidth: '220px' }}>
          <i className="ti ti-search" style={{ fontSize: '16px', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)', flexShrink: 0 }} />
          <input type="text" placeholder="Buscar por clave, bien, resguardo u observación..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', color: dark ? '#f0f0f0' : '#111', fontFamily: 'inherit' }} />
          {busqueda && <button onClick={() => setBusqueda('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text3, padding: 0, display: 'flex' }}><i className="ti ti-x" style={{ fontSize: '14px' }} /></button>}
        </div>
      </div>

      {error && (
        <div style={{ ...card, padding: '1rem 1.25rem', marginBottom: '1rem', color: dark ? '#f4a1a1' : '#c0392b', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="ti ti-alert-circle" style={{ fontSize: '18px' }} />{error}
        </div>
      )}

      {/* Bienes del reconteo */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}` }}>
                <th style={thBase(dark)}>CLAVE DE INVENTARIO</th>
                <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>NOMBRE DEL BIEN</th>
                <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>RESGUARDO A CARGO DE</th>
                <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>ESTADO</th>
                <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>MÉTODO</th>
                <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>FECHA</th>
                <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>OBSERVACIONES</th>
              </tr>
            </thead>
            <tbody>
              {cargando
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}` }}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} style={tdBase()}>
                          <div style={{ height: '14px', borderRadius: '6px', background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', animation: 'pulse 1.5s ease-in-out infinite', width: j === 1 ? '80%' : '60%' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : lista.length === 0
                  ? <tr><td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: t.text4 }}>
                      <i className={`ti ${pestana === 'faltan' ? 'ti-circle-check' : 'ti-search-off'}`} style={{ fontSize: '28px', display: 'block', marginBottom: '8px' }} />
                      {pestana === 'faltan' ? 'No falta ningún bien por verificar' : 'Sin resultados'}
                    </td></tr>
                  : lista.map((b, i) => {
                      const chip = chipEstado(dark, b.encontrado ? 'ok' : 'falta')
                      return (
                        <tr key={b.idbien}
                          style={{ borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`, background: i % 2 === 0 ? 'transparent' : (dark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.015)'), transition: 'background 0.2s' }}
                          onMouseEnter={e => e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'}
                          onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : (dark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.015)')}
                        >
                          <td style={tdBase()}><span style={{ fontFamily: 'monospace', fontSize: '11px', color: t.text3 }}>{b.clave || '—'}</span></td>
                          <td style={{ ...tdBase(), width: '240px', maxWidth: '240px', overflowWrap: 'anywhere' }}><p style={{ color: t.text1, fontWeight: 500, lineHeight: 1.3 }}>{b.nombre || '—'}</p></td>
                          <td style={{ ...tdBase(), width: '180px', maxWidth: '180px', overflowWrap: 'anywhere' }}><span style={{ color: t.text2 }}>{b.resguardante || '—'}</span></td>
                          <td style={tdBase()}><span style={chip.style}>{chip.label}</span></td>
                          <td style={tdBase()}>
                            <span style={{ color: t.text3 }}>
                              {b.metodo === 'qr' ? <><i className="ti ti-qrcode" style={{ marginRight: '4px' }} />Etiqueta</>
                                : b.metodo === 'manual' ? <><i className="ti ti-hand-click" style={{ marginRight: '4px' }} />A mano</>
                                : '—'}
                            </span>
                          </td>
                          <td style={{ ...tdBase(), whiteSpace: 'nowrap' }}><span style={{ color: t.text3 }}>{b.fecha ? fmtFechaHora(b.fecha) : '—'}</span></td>
                          <td style={{ ...tdBase(), width: '260px', maxWidth: '260px', overflowWrap: 'anywhere' }}>
                            <p title={b.observacion || ''} style={{ fontSize: '11px', color: b.observacion ? t.text2 : t.text4, lineHeight: 1.35 }}>
                              {b.observacion || '—'}
                            </p>
                          </td>
                        </tr>
                      )
                    })}
            </tbody>
          </table>
        </div>
      </div>

      {ajenos.length > 0 && (
        <div style={{ ...card, marginTop: '1rem', padding: '1rem 1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <i className="ti ti-alert-triangle" style={{ fontSize: '17px', color: dark ? '#f4a1a1' : '#c0392b' }} />
            <p style={{ fontSize: '13.5px', fontWeight: 500, color: t.text1 }}>
              {ajenos.length} código{ajenos.length !== 1 ? 's' : ''} de otra área
            </p>
          </div>
          <p style={{ fontSize: '12px', color: t.text3, marginBottom: '10px' }}>
            Se leyeron durante el conteo pero el bien no pertenece a esta área.
          </p>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {ajenos.map(a => (
              <span key={a.clave} style={{ fontFamily: 'monospace', fontSize: '11.5px', padding: '4px 9px', borderRadius: '7px', background: dark ? 'rgba(244,161,161,0.12)' : 'rgba(192,57,43,0.06)', border: `1px solid ${dark ? 'rgba(244,161,161,0.3)' : 'rgba(192,57,43,0.25)'}`, color: dark ? '#f4a1a1' : '#c0392b' }}>
                {a.clave}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

// ── Confirmación para quitar un reconteo del historial ───────────────────────
function ModalBorrar({ reconteo, onClose, onBorrado, dark, t }) {
  const [borrando, setBorrando] = useState(false)
  const [err, setErr] = useState(null)

  async function borrar() {
    setBorrando(true); setErr(null)
    try {
      // Las filas del conteo cuelgan del reconteo y se van con él
      const { error } = await supabase.from('reconteos').delete().eq('idreconteo', reconteo.idreconteo)
      if (error) throw error
      onBorrado()
    } catch (e) { setErr(e.message); setBorrando(false) }
  }

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} />
      <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 301, width: '460px', maxWidth: '94vw', background: dark ? '#1e1e20' : '#fff', borderRadius: '16px', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', animation: 'fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)', overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem 1.5rem' }}>
          <p style={{ fontSize: '15px', fontWeight: 600, color: dark ? '#fff' : '#111', marginBottom: '8px' }}>¿Borrar este reconteo del historial?</p>
          <p style={{ fontSize: '13px', color: t.text3, lineHeight: 1.55 }}>
            Se quita el conteo de {reconteo.nombrearea} del {fmtFecha(reconteo.inicio)}, con todo lo que se
            verificó ese día. No se borra ningún bien y las observaciones que se anotaron siguen en el
            inventario; lo que se pierde es el registro del conteo.
          </p>
          {err && <p style={{ fontSize: '12.5px', color: dark ? '#f8a8a8' : '#b91c1c', marginTop: '10px' }}>{err}</p>}
        </div>
        <div style={{ padding: '1rem 1.5rem', borderTop: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display: 'flex', gap: '8px' }}>
          <button onClick={onClose} disabled={borrando}
            style={{ flex: 1, padding: '10px', background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)', border: dark ? '1px solid rgba(255,255,255,0.13)' : '1px solid rgba(0,0,0,0.09)', borderRadius: '9px', fontSize: '14px', fontWeight: 500, color: dark ? '#ccc' : '#444', fontFamily: 'inherit', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={borrar} disabled={borrando}
            style={{ flex: 1, padding: '10px', borderRadius: '9px', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', background: dark ? 'rgba(244,161,161,0.18)' : 'rgba(192,57,43,0.08)', border: dark ? '1px solid rgba(244,161,161,0.35)' : '1px solid rgba(192,57,43,0.35)', color: dark ? '#f4a1a1' : '#c0392b' }}>
            {borrando ? 'Borrando…' : 'Sí, borrar'}
          </button>
        </div>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translate(-50%,-48%) scale(0.98)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}`}</style>
    </>,
    document.body
  )
}

// ── Pantalla ─────────────────────────────────────────────────────────────────
export default function Reconteo({ user, onNavigate, areaIds = null, soloLectura = false }) {
  const { dark, t, sidebarOpen } = useTheme()

  const [lista, setLista]     = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError]     = useState(null)
  const [abierto, setAbierto] = useState(null)   // reconteo en detalle
  const [borrar, setBorrar]   = useState(null)   // reconteo por quitar del historial

  const [busqueda, setBusqueda] = useState('')
  const [dep, setDep]           = useState('')
  const [desde, setDesde]       = useState('')
  const [hasta, setHasta]       = useState('')
  const [estado, setEstado]     = useState('Todos')

  const cargar = useCallback(async () => {
    setCargando(true); setError(null)
    try {
      let q = supabase.from('reconteos').select('*').order('inicio', { ascending: false })
      if (areaIds) q = q.in('idarea', areaIds.length ? areaIds : [-1])
      const { data, error } = await q
      if (error) throw error
      setLista(data || [])
    } catch (e) {
      setError(/does not exist|Could not find the table/i.test(e.message)
        ? 'Falta crear las tablas de reconteo en la base: aplica supabase/persistencia-muebles.sql.'
        : e.message)
    } finally { setCargando(false) }
  }, [areaIds ? areaIds.join(',') : ''])

  useEffect(() => { cargar() }, [cargar])

  // Las dependencias del filtro salen de los reconteos que hay, no del catálogo
  const dependencias = useMemo(() => {
    const s = new Set(lista.map(r => r.dependencia).filter(Boolean))
    return [...s].sort((a, b) => a.localeCompare(b, 'es'))
  }, [lista])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return lista.filter(r => {
      if (dep && r.dependencia !== dep) return false
      if (estado === 'Terminados' && !r.fin) return false
      if (estado === 'En curso'    && r.fin)  return false
      if (desde && soloDia(r.inicio) < desde) return false
      if (hasta && soloDia(r.inicio) > hasta) return false
      if (!q) return true
      return [r.nombrearea, r.dependencia, r.usuario].some(v => (v || '').toLowerCase().includes(q))
    })
  }, [lista, busqueda, dep, desde, hasta, estado])

  const hayFiltro = busqueda || dep || desde || hasta || estado !== 'Todos'
  function limpiar() { setBusqueda(''); setDep(''); setDesde(''); setHasta(''); setEstado('Todos') }

  const totalVerificados = filtrados.reduce((s, r) => s + (r.encontrados || 0), 0)
  const totalEsperados   = filtrados.reduce((s, r) => s + (r.esperados || 0), 0)

  const bg = dark ? 'linear-gradient(145deg,#111113 0%,#1c1c1e 50%,#222224 100%)' : 'linear-gradient(145deg,#e0e0e2 0%,#ebebed 50%,#e4e4e6 100%)'
  const card = { background: t.cardBg, border: `1px solid ${t.cardBorder}`, backdropFilter: t.cardBlur, WebkitBackdropFilter: t.cardBlur, borderRadius: '14px' }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: bg }}>
      <Sidebar user={user} active="reconteo" onNavigate={onNavigate} />

      <main style={{ flex: 1, marginLeft: sidebarOpen ? '230px' : '72px', padding: '2rem 1.25rem', overflowY: 'auto', overflowX: 'hidden', minWidth: 0, transition: 'margin-left 0.25s cubic-bezier(0.4,0,0.2,1)' }}>

        {abierto ? (
          <Detalle reconteo={abierto} onVolver={() => setAbierto(null)} dark={dark} t={t} card={card} />
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <h1 style={{ fontSize: '24px', fontWeight: 600, color: t.text1, marginBottom: '4px' }}>Reconteo</h1>
                <p style={{ fontSize: '14px', color: t.text3 }}>
                  Historial de conteos físicos · {cargando ? 'Cargando…' : `${filtrados.length} reconteo${filtrados.length !== 1 ? 's' : ''}`}
                  {!cargando && totalEsperados > 0 && ` · ${totalVerificados.toLocaleString()} de ${totalEsperados.toLocaleString()} bienes verificados`}
                </p>
              </div>
              <button onClick={cargar}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: '10px', background: t.cardBg, border: `1px solid ${t.cardBorder}`, backdropFilter: 'blur(10px)', fontSize: '14px', fontWeight: 500, color: t.text1, fontFamily: 'inherit', cursor: 'pointer' }}>
                <i className="ti ti-refresh" style={{ fontSize: '17px' }} />Actualizar
              </button>
            </div>

            {/* Filtros */}
            <div className="barra-fit" style={{ ...card, padding: '1rem 1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ ...searchBoxStyle(dark), flex: 1, minWidth: '210px' }}>
                <i className="ti ti-search" style={{ fontSize: '16px', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)', flexShrink: 0 }} />
                <input type="text" placeholder="Buscar por área, dependencia o usuario..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', color: dark ? '#f0f0f0' : '#111', fontFamily: 'inherit' }} />
                {busqueda && <button onClick={() => setBusqueda('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text3, padding: 0, display: 'flex' }}><i className="ti ti-x" style={{ fontSize: '14px' }} /></button>}
              </div>
              <select value={dep} onChange={e => setDep(e.target.value)} style={{ ...sStyle(dark), width: 'auto', minWidth: '210px' }}>
                <option value="">Todas las dependencias</option>
                {dependencias.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <select value={estado} onChange={e => setEstado(e.target.value)} style={{ ...sStyle(dark), width: 'auto', minWidth: '140px' }}>
                {['Todos', 'Terminados', 'En curso'].map(e => <option key={e}>{e}</option>)}
              </select>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: t.text4 }}>Del</span>
                <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={{ ...iStyle(dark), width: 'auto', padding: '9px 10px' }} />
                <span style={{ fontSize: '12px', color: t.text4 }}>al</span>
                <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={{ ...iStyle(dark), width: 'auto', padding: '9px 10px' }} />
              </div>
              {hayFiltro && (
                <button onClick={limpiar} style={btnBarra(dark, t)}>
                  <i className="ti ti-filter-off" style={{ fontSize: '16px' }} />Limpiar
                </button>
              )}
            </div>

            {error && (
              <div style={{ ...card, padding: '1rem 1.25rem', marginBottom: '1rem', color: dark ? '#f4a1a1' : '#c0392b', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="ti ti-alert-circle" style={{ fontSize: '18px' }} />{error}
              </div>
            )}

            {/* Historial */}
            <div style={{ ...card, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}` }}>
                      <th style={thBase(dark)}>FECHA</th>
                      <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>ÁREA</th>
                      <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>DEPENDENCIA</th>
                      <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>LEVANTÓ</th>
                      <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>BIENES</th>
                      <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>VERIFICADOS</th>
                      <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>FALTAN</th>
                      <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>AVANCE</th>
                      <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>ESTADO</th>
                      <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cargando
                      ? Array.from({ length: 6 }).map((_, i) => (
                          <tr key={i} style={{ borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}` }}>
                            {Array.from({ length: 10 }).map((_, j) => (
                              <td key={j} style={tdBase()}>
                                <div style={{ height: '14px', borderRadius: '6px', background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', animation: 'pulse 1.5s ease-in-out infinite', width: j === 1 ? '80%' : '60%' }} />
                              </td>
                            ))}
                          </tr>
                        ))
                      : filtrados.length === 0
                        ? <tr><td colSpan={10} style={{ padding: '3rem', textAlign: 'center', color: t.text4 }}>
                            <i className="ti ti-history" style={{ fontSize: '28px', display: 'block', marginBottom: '8px' }} />
                            {lista.length === 0 ? 'Todavía no hay reconteos levantados' : 'Sin resultados'}
                          </td></tr>
                        : filtrados.map((r, i) => {
                            const faltan = Math.max(0, (r.esperados || 0) - (r.encontrados || 0))
                            const pct = r.esperados ? Math.round((r.encontrados || 0) / r.esperados * 100) : 0
                            const chip = chipEstado(dark, r.fin ? 'cerrado' : 'curso')
                            const bgFila = i % 2 === 0 ? 'transparent' : (dark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.015)')
                            return (
                              <tr key={r.idreconteo}
                                onClick={() => setAbierto(r)}
                                style={{ borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`, background: bgFila, cursor: 'pointer', transition: 'background 0.2s' }}
                                onMouseEnter={e => e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'}
                                onMouseLeave={e => e.currentTarget.style.background = bgFila}
                              >
                                <td style={{ ...tdBase(), whiteSpace: 'nowrap' }}>
                                  <p style={{ color: t.text1, fontWeight: 500 }}>{fmtFecha(r.inicio)}</p>
                                  <p style={{ color: t.text4, fontSize: '11px', marginTop: '2px' }}>
                                    {new Date(r.inicio).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                </td>
                                <td style={{ ...tdBase(), width: '210px', maxWidth: '210px', overflowWrap: 'anywhere' }}><span style={{ color: t.text1, fontWeight: 500, lineHeight: 1.3 }}>{r.nombrearea || '—'}</span></td>
                                <td style={{ ...tdBase(), width: '190px', maxWidth: '190px', overflowWrap: 'anywhere' }}><span style={{ color: t.text2 }}>{r.dependencia || '—'}</span></td>
                                <td style={tdBase()}><span style={{ color: t.text2 }}>{r.usuario || '—'}</span></td>
                                <td style={tdBase()}><span style={{ color: t.text2, fontWeight: 500 }}>{(r.esperados || 0).toLocaleString()}</span></td>
                                <td style={tdBase()}><span style={{ color: dark ? '#7ee8a2' : '#1e7e4a', fontWeight: 500 }}>{(r.encontrados || 0).toLocaleString()}</span></td>
                                <td style={tdBase()}><span style={{ color: faltan ? (dark ? '#ffd580' : '#b7790a') : t.text4, fontWeight: 500 }}>{faltan.toLocaleString()}</span></td>
                                <td style={{ ...tdBase(), width: '130px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                                      <div style={{ width: `${pct}%`, height: '100%', borderRadius: '3px', background: dark ? '#7ee8a2' : '#1e7e4a' }} />
                                    </div>
                                    <span style={{ color: t.text3, fontSize: '11px', minWidth: '30px', textAlign: 'right' }}>{pct}%</span>
                                  </div>
                                </td>
                                <td style={tdBase()}><span style={chip.style}>{chip.label}</span></td>
                                <td style={tdBase()}>
                                  <div style={{ display: 'flex', gap: '4px' }}>
                                    <button onClick={e => { e.stopPropagation(); setAbierto(r) }} title="Ver el detalle del reconteo"
                                      style={btnAccion(dark, 'consulta')}
                                      onMouseEnter={e => e.currentTarget.style.opacity = '0.7'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                                      <i className="ti ti-eye" style={{ fontSize: '14px' }} />
                                    </button>
                                    {/* Igual que en el celular: el historial se puede depurar.
                                        Una dependencia solo consulta, así que no le aparece. */}
                                    {!soloLectura && (
                                      <button onClick={e => { e.stopPropagation(); setBorrar(r) }} title="Borrar del historial"
                                        style={btnAccion(dark, 'baja')}
                                        onMouseEnter={e => e.currentTarget.style.opacity = '0.7'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                                        <i className="ti ti-trash" style={{ fontSize: '14px' }} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                  </tbody>
                </table>
              </div>
            </div>

            <p style={{ fontSize: '12.5px', color: t.text4, marginTop: '14px', maxWidth: '80ch', lineHeight: 1.6 }}>
              Los reconteos se levantan desde el celular escaneando la etiqueta de cada bien. Las observaciones
              que se anotan durante el conteo se guardan en el bien del inventario y también quedan aquí, para
              poder revisarlas después.
            </p>
          </>
        )}
      </main>

      {borrar && (
        <ModalBorrar reconteo={borrar} dark={dark} t={t}
          onClose={() => setBorrar(null)}
          onBorrado={() => { setBorrar(null); cargar() }} />
      )}

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}} @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
