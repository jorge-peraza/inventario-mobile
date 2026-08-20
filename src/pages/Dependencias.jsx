import { useState, useEffect, useCallback, Fragment } from 'react'
import { createPortal } from 'react-dom'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import { useTheme } from '../context/ThemeContext'
import { barraSticky, btnBarra, sStyle, iStyle, panelStyle, tituloSec } from './BienesMuebles'
import { fetchDependencias, fetchAreasPorDependencia, fetchResguardos, guardarEncargado, soportaColumnas } from '../encargados'

const POR_PAGINA = [15, 25, 50, 100]

function thBase(dark) {
  return { padding:'9px 10px', textAlign:'left', fontSize:'10px', fontWeight:700, color: dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)', textTransform:'uppercase', letterSpacing:'0.06em', whiteSpace:'nowrap', verticalAlign:'middle', background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }
}
function tdBase() { return { padding:'10px 10px', verticalAlign:'middle' } }

// Iniciales para el avatar del encargado
function iniciales(nombre) {
  const limpio = String(nombre || '').replace(/^(ING|LIC|C|DR|DRA|ARQ|MTRO|MTRA|PROF)\.?\s+/i, '').trim()
  const partes = limpio.split(/\s+/).filter(Boolean)
  if (!partes.length) return '—'
  return (partes[0][0] + (partes[1]?.[0] || '')).toUpperCase()
}

// ── Modal de edición ──────────────────────────────────────────────────────────
function ModalEncargado({ dep, resguardos, onClose, onSaved, dark, t }) {
  const [nombre, setNombre] = useState(dep.encargado || '')
  const [puesto, setPuesto] = useState(dep.puesto_encargado || '')
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState(null)

  // Al elegir a alguien del catálogo de resguardos se completa su puesto
  function elegirNombre(v) {
    setNombre(v)
    const hallado = resguardos.find(r => r.nombre.toUpperCase() === v.trim().toUpperCase())
    if (hallado && hallado.puesto) setPuesto(hallado.puesto)
  }
  const enCatalogo = !!nombre.trim() && resguardos.some(r => r.nombre.toUpperCase() === nombre.trim().toUpperCase())

  async function guardar() {
    setGuardando(true); setErr(null)
    try {
      await guardarEncargado(dep.iddependencia, { encargado: nombre, puesto })
      onSaved({ ...dep, encargado: nombre.trim(), puesto_encargado: puesto.trim() })
      onClose()
    } catch (e) {
      setErr(e.message)
      setGuardando(false)
    }
  }

  const lbl = txt => <p style={{ fontSize:'10px', fontWeight:700, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'6px' }}>{txt}</p>

  return createPortal(
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,0.4)', backdropFilter:'blur(4px)' }} />
      <div onClick={e => e.stopPropagation()} style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:301, width:'480px', maxWidth:'92vw', background: dark ? '#1e1e20' : '#fff', borderRadius:'16px', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', boxShadow:'0 20px 60px rgba(0,0,0,0.4)', animation:'fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)', overflow:'hidden' }}>

        <div style={{ padding:'1.25rem 1.5rem', borderBottom: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', minWidth:0 }}>
            <div style={{ width:'34px', height:'34px', borderRadius:'9px', flexShrink:0, background: dark ? 'rgba(168,197,248,0.15)' : 'rgba(37,99,235,0.08)', border: dark ? '1px solid rgba(168,197,248,0.3)' : '1px solid rgba(37,99,235,0.2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <i className="ti ti-user-cog" style={{ fontSize:'18px', color: dark ? '#a8c5f8' : '#2563eb' }} />
            </div>
            <div style={{ minWidth:0 }}>
              <p style={{ fontSize:'15px', fontWeight:600, color: dark ? '#fff' : '#111' }}>Encargado</p>
              <p style={{ fontSize:'12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{dep.nombredependencia}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width:'30px', height:'30px', flexShrink:0, borderRadius:'7px', background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color: dark ? '#ccc' : '#555' }}>
            <i className="ti ti-x" style={{ fontSize:'15px' }} />
          </button>
        </div>

        <div style={{ padding:'1.25rem 1.5rem', display:'flex', flexDirection:'column', gap:'0.9rem' }}>
          <section style={panelStyle(dark)}>
            <p style={tituloSec(t)}>
              <i className="ti ti-user" style={{ marginRight:'7px' }} />Resguardo
              <span style={{ fontWeight:400, color:t.text4 }}> — del catálogo de titulares</span>
            </p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
              <div>{lbl('A cargo de')}
                <input value={nombre} autoFocus list="catalogo-resguardos" autoComplete="off" spellCheck={false}
                  onChange={e => elegirNombre(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') guardar() }} style={iStyle(dark)} />
                <datalist id="catalogo-resguardos">
                  {resguardos.map(r => <option key={r.idresguardo} value={r.nombre}>{r.puesto}</option>)}
                </datalist>
              </div>
              <div>{lbl('Puesto')}
                <input value={puesto} autoComplete="off" spellCheck={false}
                  onChange={e => setPuesto(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') guardar() }} style={iStyle(dark)} />
              </div>
            </div>
            <p style={{ fontSize:'11px', color:t.text4, marginTop:'8px', display:'flex', alignItems:'center', gap:'5px' }}>
              <i className={`ti ${enCatalogo ? 'ti-circle-check' : 'ti-info-circle'}`} style={{ fontSize:'13px' }} />
              {enCatalogo
                ? 'Titular del catálogo de resguardos'
                : `Escribe o elige de los ${resguardos.length.toLocaleString()} titulares registrados`}
            </p>
          </section>
          {err && (
            <p style={{ fontSize:'12px', color: dark ? '#f8a8a8' : '#b91c1c' }}>{err}</p>
          )}
        </div>

        <div style={{ padding:'0 1.5rem 1.25rem', display:'flex', gap:'8px' }}>
          <button onClick={onClose} disabled={guardando}
            style={{ flex:1, padding:'11px', borderRadius:'9px', fontSize:'14px', fontWeight:500, fontFamily:'inherit', cursor: guardando ? 'not-allowed' : 'pointer', background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', color: dark ? '#ccc' : '#444' }}>
            Cancelar
          </button>
          <button onClick={guardar} disabled={guardando}
            style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'7px', padding:'11px', borderRadius:'9px', fontSize:'14px', fontWeight:600, fontFamily:'inherit', cursor: guardando ? 'not-allowed' : 'pointer', background: dark ? 'rgba(168,230,207,0.18)' : 'rgba(30,126,74,0.08)', border: dark ? '1px solid rgba(168,230,207,0.35)' : '1px solid rgba(30,126,74,0.35)', color: dark ? '#a8e6cf' : '#15803d' }}>
            {guardando
              ? <><i className="ti ti-loader-2" style={{ fontSize:'15px', animation:'spin 1s linear infinite' }} />Guardando…</>
              : <><i className="ti ti-check" style={{ fontSize:'16px' }} />Guardar</>}
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function Dependencias({ user, onNavigate }) {
  const { dark, t, sidebarOpen } = useTheme()

  const [deps, setDeps]       = useState([])
  const [resumen, setResumen] = useState({})
  const [resguardos, setResguardos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [enSupabase, setEnSupabase] = useState(true)

  const [busqueda, setBusqueda]   = useState('')
  const [pagina, setPagina]       = useState(0)
  const [porPagina, setPorPagina] = useState(25)
  const [editando, setEditando]   = useState(null)
  const [abiertas, setAbiertas]   = useState(() => new Set())

  const cargar = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [lista, res, cat] = await Promise.all([
        fetchDependencias(), fetchAreasPorDependencia(), fetchResguardos(),
      ])
      // soportaColumnas() ya quedó resuelto por fetchDependencias
      setDeps(lista); setResumen(res); setResguardos(cat); setEnSupabase(soportaColumnas())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  function alternar(id) {
    setAbiertas(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { setPagina(0) }, [busqueda, porPagina])

  // Busca por dependencia, encargado, puesto y también por nombre de área
  const q = busqueda.trim().toLowerCase()
  const filtradas = q
    ? deps.filter(d => {
        const propios = [d.nombredependencia, d.encargado, d.puesto_encargado]
        if (propios.some(v => String(v || '').toLowerCase().includes(q))) return true
        const areas = resumen[d.iddependencia]?.areas || []
        return areas.some(a => String(a.nombrearea || '').toLowerCase().includes(q))
      })
    : deps

  const totalPag  = Math.max(1, Math.ceil(filtradas.length / porPagina))
  const paginadas = filtradas.slice(pagina * porPagina, (pagina + 1) * porPagina)
  const conEncargado = deps.filter(d => d.encargado).length

  const bg = dark
    ? 'linear-gradient(145deg, #111113 0%, #1c1c1e 50%, #222224 100%)'
    : 'linear-gradient(145deg, #e0e0e2 0%, #ebebed 50%, #e4e4e6 100%)'
  const cardTabla = {
    background: t.cardBg, border: `1px solid ${t.cardBorder}`,
    backdropFilter: t.cardBlur, WebkitBackdropFilter: t.cardBlur,
    borderRadius: '14px', overflow: 'hidden',
  }

  function trasGuardar(actualizada) {
    setDeps(prev => prev.map(d => d.iddependencia === actualizada.iddependencia ? actualizada : d))
  }

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background: bg, transition:'background 0.3s' }}>
      <Sidebar user={user} active="dependencias" onNavigate={onNavigate} />
      <main style={{ flex:1, marginLeft: sidebarOpen ? '230px' : '72px', padding:'2rem 1.25rem', overflowY:'auto', overflowX:'hidden', minWidth:0, transition:'margin-left 0.25s cubic-bezier(0.4,0,0.2,1)' }}>

        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'12px', marginBottom:'1.5rem' }}>
          <div>
            <h1 style={{ fontSize:'24px', fontWeight:600, color:t.text1, marginBottom:'4px' }}>Dependencias</h1>
            <p style={{ fontSize:'14px', color:t.text3 }}>
              {loading ? 'Cargando…' : `${deps.length} dependencias · ${conEncargado} con encargado asignado`}
            </p>
          </div>
          <ThemeToggle />
        </div>

        {/* Barra de búsqueda, fija al desplazar */}
        <div style={barraSticky(dark, t)}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'9px 13px', borderRadius:'9px', background: dark ? '#2a2a2c' : '#fff', border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.18)', flex:1, minWidth:'220px' }}>
            <i className="ti ti-search" style={{ fontSize:'16px', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)', flexShrink:0 }} />
            <input type="text" placeholder="Buscar por dependencia, encargado o puesto..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
              style={{ flex:1, background:'transparent', border:'none', outline:'none', fontSize:'14px', color: dark ? '#f0f0f0' : '#111', fontFamily:'inherit' }} />
            {busqueda && (
              <button onClick={() => setBusqueda('')} style={{ background:'none', border:'none', cursor:'pointer', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)', padding:0, display:'flex' }}>
                <i className="ti ti-x" style={{ fontSize:'14px' }} />
              </button>
            )}
          </div>
          <button onClick={cargar} disabled={loading} style={btnBarra(dark, t, !loading)}>
            <i className={`ti ti-refresh${loading ? '' : ''}`} style={{ fontSize:'15px', animation: loading ? 'spin 1s linear infinite' : undefined }} />
            Actualizar
          </button>
        </div>

        {!loading && !enSupabase && (
          <div style={{ ...cardTabla, padding:'11px 14px', marginBottom:'1rem', display:'flex', alignItems:'center', gap:'9px' }}>
            <i className="ti ti-device-laptop" style={{ fontSize:'16px', color:t.text4, flexShrink:0 }} />
            <p style={{ fontSize:'12px', color:t.text3 }}>
              Los encargados se guardan en este equipo. Para compartirlos entre computadoras hay que agregar las columnas <code>encargado</code> y <code>puesto_encargado</code> a la tabla <code>dependencias</code>.
            </p>
          </div>
        )}

        {error && (
          <div style={{ ...cardTabla, padding:'11px 14px', marginBottom:'1rem' }}>
            <p style={{ fontSize:'13px', color: dark ? '#f8a8a8' : '#b91c1c' }}>{error}</p>
          </div>
        )}

        <div style={cardTabla}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:'760px' }}>
              <thead>
                <tr style={{ borderBottom:`1px solid ${t.cardBorder}` }}>
                  <th style={thBase(dark)}>Dependencia</th>
                  <th style={thBase(dark)}>Encargado</th>
                  <th style={thBase(dark)}>Puesto</th>
                  <th style={{ ...thBase(dark), textAlign:'right' }}>Áreas</th>
                  <th style={{ ...thBase(dark), textAlign:'right' }}>Bienes</th>
                  <th style={{ ...thBase(dark), width:'56px' }}></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ ...tdBase(), textAlign:'center', color:t.text4, fontSize:'13px', padding:'2.5rem' }}>Cargando…</td></tr>
                ) : paginadas.length === 0 ? (
                  <tr><td colSpan={6} style={{ ...tdBase(), textAlign:'center', color:t.text4, fontSize:'13px', padding:'2.5rem' }}>
                    {q ? 'Ninguna dependencia coincide con la búsqueda' : 'No hay dependencias'}
                  </td></tr>
                ) : paginadas.map((d, i) => {
                  const r = resumen[d.iddependencia] || { areas: [], bienes: 0 }
                  const abierta = abiertas.has(d.iddependencia)
                  return (
                    <Fragment key={d.iddependencia}>
                    <tr
                      style={{ borderBottom: (abierta || i < paginadas.length - 1) ? `1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}` : 'none', transition:'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={tdBase()}>
                        <button onClick={() => alternar(d.iddependencia)}
                          title={abierta ? 'Ocultar áreas' : 'Ver áreas'}
                          style={{ display:'flex', alignItems:'center', gap:'8px', background:'none', border:'none', padding:0, cursor: r.areas.length ? 'pointer' : 'default', fontFamily:'inherit', textAlign:'left' }}>
                          <i className={`ti ti-chevron-${abierta ? 'down' : 'right'}`}
                            style={{ fontSize:'15px', flexShrink:0, color: r.areas.length ? t.text3 : 'transparent', transition:'transform 0.15s' }} />
                          <span style={{ fontSize:'13px', fontWeight:500, color:t.text1 }}>{d.nombredependencia}</span>
                        </button>
                      </td>
                      <td style={tdBase()}>
                        {d.encargado ? (
                          <div style={{ display:'flex', alignItems:'center', gap:'9px' }}>
                            <div style={{ width:'28px', height:'28px', borderRadius:'50%', flexShrink:0, background:t.iconBox, border:`1px solid ${t.iconBoxBorder}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:600, color:t.text1 }}>
                              {iniciales(d.encargado)}
                            </div>
                            <span style={{ fontSize:'13px', color:t.text1 }}>{d.encargado}</span>
                          </div>
                        ) : (
                          <span style={{ fontSize:'13px', color:t.text4, fontStyle:'italic' }}>Sin asignar</span>
                        )}
                      </td>
                      <td style={tdBase()}>
                        <span style={{ fontSize:'12px', color:t.text2 }}>{d.puesto_encargado || '—'}</span>
                      </td>
                      <td style={{ ...tdBase(), textAlign:'right' }}>
                        <span style={{ fontSize:'13px', color:t.text2 }}>{r.areas.length.toLocaleString()}</span>
                      </td>
                      <td style={{ ...tdBase(), textAlign:'right' }}>
                        <span style={{ fontSize:'13px', color:t.text2 }}>{r.bienes.toLocaleString()}</span>
                      </td>
                      <td style={tdBase()}>
                        <button onClick={() => setEditando(d)} title="Editar encargado"
                          style={{ width:'30px', height:'30px', borderRadius:'7px', background: dark ? 'rgba(168,230,207,0.12)' : 'rgba(30,126,74,0.07)', border: dark ? '1px solid rgba(168,230,207,0.25)' : '1px solid rgba(30,126,74,0.18)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color: dark ? '#a8e6cf' : '#1e7e4a' }}
                          onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                          onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                          <i className="ti ti-pencil" style={{ fontSize:'14px' }} />
                        </button>
                      </td>
                    </tr>

                    {/* Áreas de la dependencia */}
                    {abierta && (
                      <tr style={{ borderBottom: i < paginadas.length - 1 ? `1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}` : 'none' }}>
                        <td colSpan={6} style={{ padding:'0 10px 12px 10px', background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)' }}>
                          {r.areas.length === 0 ? (
                            <p style={{ fontSize:'12px', color:t.text4, padding:'10px 0 0 32px' }}>Esta dependencia no tiene áreas con bienes.</p>
                          ) : (
                            <div style={{ paddingLeft:'32px', paddingTop:'10px', display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:'6px' }}>
                              {r.areas.map(a => (
                                <button key={a.idarea}
                                  onClick={() => onNavigate && onNavigate('bienes', { areaIds: [a.idarea] })}
                                  title="Ver los bienes de esta área"
                                  style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'10px', padding:'7px 11px', borderRadius:'9px', background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.6)', border:`1px solid ${t.cardBorder}`, cursor:'pointer', fontFamily:'inherit', textAlign:'left', transition:'opacity 0.15s' }}
                                  onMouseEnter={e => e.currentTarget.style.opacity = '0.72'}
                                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                                  <span style={{ fontSize:'12px', color:t.text2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.nombrearea}</span>
                                  <span style={{ fontSize:'11px', fontWeight:600, color:t.text4, flexShrink:0 }}>{a.total_bienes.toLocaleString()}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {!loading && filtradas.length > 0 && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'10px', flexWrap:'wrap', padding:'0.85rem 1.25rem', borderTop:`1px solid ${t.cardBorder}` }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <span style={{ fontSize:'12px', color:t.text4 }}>Mostrar</span>
                <select value={porPagina} onChange={e => setPorPagina(Number(e.target.value))} style={sStyle(dark)}>
                  {POR_PAGINA.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <span style={{ fontSize:'12px', color:t.text4 }}>
                  de {filtradas.length.toLocaleString()} {filtradas.length === 1 ? 'dependencia' : 'dependencias'}
                </span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                <button onClick={() => setPagina(p => Math.max(0, p - 1))} disabled={pagina === 0} style={btnBarra(dark, t, pagina > 0)}>
                  <i className="ti ti-chevron-left" style={{ fontSize:'15px' }} />
                </button>
                <span style={{ fontSize:'12px', color:t.text3, minWidth:'92px', textAlign:'center' }}>
                  Página {pagina + 1} de {totalPag}
                </span>
                <button onClick={() => setPagina(p => Math.min(totalPag - 1, p + 1))} disabled={pagina >= totalPag - 1} style={btnBarra(dark, t, pagina < totalPag - 1)}>
                  <i className="ti ti-chevron-right" style={{ fontSize:'15px' }} />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {editando && (
        <ModalEncargado dep={editando} resguardos={resguardos} onClose={() => setEditando(null)} onSaved={trasGuardar} dark={dark} t={t} />
      )}
    </div>
  )
}
