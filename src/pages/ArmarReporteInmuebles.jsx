import { useState, useEffect, useCallback, useRef } from 'react'
import { sStyle } from './BienesMuebles'
import { createPortal } from 'react-dom'
import { fetchInventarioInmuebles } from '../desincorporaciones'
import { exportarEvidenciasPDF, exportarEvidenciasExcel, fileADataURL } from '../reporteEvidencias'

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']
function mesAnioActual() { const d = new Date(); return `${MESES[d.getMonth()]} ${d.getFullYear()}` }

function thBase(dark) {
  return { padding: '9px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', verticalAlign: 'middle', background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }
}
function tdBase() { return { padding: '10px 10px', verticalAlign: 'top' } }

// Zona para arrastrar / elegir un archivo de imagen
function Dropzone({ valor, onArchivo, dark }) {
  const [drag, setDrag] = useState(false)
  const ref = useRef(null)
  function tomar(files) { const f = Array.from(files).find(x => x.type.startsWith('image/')); if (f) onArchivo(f) }
  return (
    <div onClick={() => ref.current.click()}
      onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); tomar(e.dataTransfer.files) }}
      style={{ position: 'relative', width: '100%', height: '64px', borderRadius: '8px', cursor: 'pointer',
        border: `2px dashed ${drag ? (dark ? '#a8c5f8' : '#2563eb') : (dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)')}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        background: drag ? (dark ? 'rgba(168,197,248,0.08)' : 'rgba(37,99,235,0.04)') : 'transparent' }}>
      <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => tomar(e.target.files)} />
      {valor
        ? <img src={valor.dataURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        : <span style={{ fontSize: '11px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textAlign: 'center', padding: '0 6px' }}><i className="ti ti-photo-up" style={{ fontSize: '16px', display: 'block', marginBottom: '2px' }} />Arrastra o elige</span>}
    </div>
  )
}


// ── Página de evidencias ──────────────────────────────────────────────────────
// Se muestra como segunda página del modal de Generar Reporte: adjunta la foto y
// el documento de cada inmueble y genera el reporte con esas imágenes.
export function PaginaEvidencias({ onVolver, bienes, adjuntos, setAdjuntos, dark, t }) {
  const sep = dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)'
  const conImagen = bienes.filter(b => adjuntos[b.idinmueble]?.foto || adjuntos[b.idinmueble]?.documento).length

  async function setArchivo(id, campo, file) {
    const img = await fileADataURL(file)
    setAdjuntos(prev => ({ ...prev, [id]: { ...prev[id], [campo]: img } }))
  }
  function quitar(id, campo) { setAdjuntos(prev => ({ ...prev, [id]: { ...prev[id], [campo]: null } })) }

  return (
    <>
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: sep, display: 'flex', alignItems: 'center', gap: '11px', flexShrink: 0 }}>
        <button onClick={onVolver} title="Volver"
          style={{ width: '34px', height: '34px', borderRadius: '9px', flexShrink: 0, background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', border: `1px solid ${t.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: t.text2 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: '17px' }} />
        </button>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: '15px', fontWeight: 600, color: dark ? '#fff' : '#111' }}>Evidencias</p>
          <p style={{ fontSize: '12px', color: t.text4 }}>
            {conImagen} de {bienes.length} con evidencia · se anexan al final del reporte
          </p>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {bienes.length === 0
          ? <p style={{ fontSize: '13px', color: t.text4, textAlign: 'center', padding: '3rem 0' }}>Cargando inmuebles…</p>
          : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={{ ...thBase(dark), width: '56px' }}>NO.</th>
                  <th style={{ ...thBase(dark), width: '110px' }}>CLAVE</th>
                  <th style={{ ...thBase(dark) }}>NOMBRE DEL INMUEBLE</th>
                  <th style={{ ...thBase(dark), width: '140px' }}>FOTO</th>
                  <th style={{ ...thBase(dark), width: '140px' }}>DOCUMENTO</th>
                </tr>
              </thead>
              <tbody>
                {bienes.map((b, i) => (
                  <tr key={b.idinmueble} style={{ borderBottom: sep }}>
                    <td style={{ ...tdBase(), verticalAlign: 'middle', color: t.text4 }}>{i + 1}</td>
                    <td style={{ ...tdBase(), verticalAlign: 'middle' }}><span style={{ fontFamily: 'monospace', fontSize: '11px', color: t.text3 }}>{b.claveinmueble || '—'}</span></td>
                    <td style={{ ...tdBase(), verticalAlign: 'middle' }}><span style={{ color: t.text1, fontSize: '12px' }}>{b.nombreinmueble || '—'}</span></td>
                    <td style={tdBase()}>
                      <div style={{ position: 'relative' }}>
                        <Dropzone valor={adjuntos[b.idinmueble]?.foto} onArchivo={f => setArchivo(b.idinmueble, 'foto', f)} dark={dark} />
                        {adjuntos[b.idinmueble]?.foto && <button onClick={() => quitar(b.idinmueble, 'foto')} style={{ position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px', borderRadius: '50%', background: dark ? '#333' : '#fff', border: `1px solid ${dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'}`, cursor: 'pointer', fontSize: '10px', color: dark ? '#ccc' : '#555', padding: 0 }}>✕</button>}
                      </div>
                    </td>
                    <td style={tdBase()}>
                      <div style={{ position: 'relative' }}>
                        <Dropzone valor={adjuntos[b.idinmueble]?.documento} onArchivo={f => setArchivo(b.idinmueble, 'documento', f)} dark={dark} />
                        {adjuntos[b.idinmueble]?.documento && <button onClick={() => quitar(b.idinmueble, 'documento')} style={{ position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px', borderRadius: '50%', background: dark ? '#333' : '#fff', border: `1px solid ${dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'}`, cursor: 'pointer', fontSize: '10px', color: dark ? '#ccc' : '#555', padding: 0 }}>✕</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>}
      </div>

      <div style={{ flexShrink: 0, padding: '1rem 1.5rem', borderTop: sep, display: 'flex' }}>
        <button onClick={onVolver}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '7px', padding: '11px 22px', borderRadius: '9px', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)', border: `1px solid ${t.cardBorder}`, color: t.text1 }}>
          <i className="ti ti-check" style={{ fontSize: '15px' }} />Listo
        </button>
      </div>
    </>
  )
}

export default function ArmarReporteInmuebles({ dark, t, categorias }) {
  const [datos, setDatos] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [pagina, setPagina] = useState(0)
  const [porPagina, setPorPagina] = useState(20)
  const [busqueda, setBusqueda] = useState('')
  const [seleccionados, setSeleccionados] = useState(() => new Map())
  const [modal, setModal] = useState(false)
  const OPCIONES = [10, 15, 20]

  const cargar = useCallback((pag, q) => {
    setLoading(true)
    fetchInventarioInmuebles({ busqueda: q, areaIds: [], pagina: pag, porPagina })
      .then(({ data, count }) => { setDatos(data); setTotal(count); setPagina(pag) })
      .catch(console.error).finally(() => setLoading(false))
  }, [porPagina])

  useEffect(() => { const tm = setTimeout(() => cargar(0, busqueda), 350); return () => clearTimeout(tm) }, [busqueda, porPagina, cargar])

  function toggle(b) { setSeleccionados(prev => { const n = new Map(prev); n.has(b.idinmueble) ? n.delete(b.idinmueble) : n.set(b.idinmueble, b); return n }) }
  const totalPag = Math.max(1, Math.ceil(total / porPagina))
  const cardTabla = { background: t.cardBg, border: `1px solid ${t.cardBorder}`, backdropFilter: t.cardBlur, WebkitBackdropFilter: t.cardBlur, borderRadius: '14px' }
  const bordeIzq = dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)'

  return (
    <>
      <div style={{ ...cardTabla, padding: '1rem 1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 13px', borderRadius: '9px', background: dark ? '#2a2a2c' : '#fff', border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.18)', flex: 1, minWidth: '200px' }}>
          <i className="ti ti-search" style={{ fontSize: '16px', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)' }} />
          <input type="text" placeholder="Buscar inmueble por nombre o clave..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', color: dark ? '#f0f0f0' : '#111', fontFamily: 'inherit' }} />
        </div>
        <span style={{ fontSize: '13px', color: t.text3 }}>{seleccionados.size} seleccionado{seleccionados.size !== 1 ? 's' : ''}</span>
        {seleccionados.size > 0 && (
          <button onClick={() => setSeleccionados(new Map())} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', cursor: 'pointer', background: 'transparent', border: `1px solid ${t.cardBorder}`, color: t.text3 }}><i className="ti ti-x" style={{ fontSize: '14px' }} />Limpiar</button>
        )}
        <button onClick={() => setModal(true)} disabled={seleccionados.size === 0}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 16px', borderRadius: '9px', fontSize: '14px', fontWeight: 500, fontFamily: 'inherit', cursor: seleccionados.size === 0 ? 'not-allowed' : 'pointer', opacity: seleccionados.size === 0 ? 0.5 : 1, background: t.cardBg, border: `1px solid ${t.cardBorder}`, color: t.text1, backdropFilter: 'blur(10px)' }}>
          <i className="ti ti-file-export" style={{ fontSize: '17px' }} />Armar reporte
        </button>
      </div>

      <div style={{ ...cardTabla, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}` }}>
                <th style={{ ...thBase(dark), width: '44px' }}></th>
                <th style={thBase(dark)}>CLAVE</th>
                <th style={{ ...thBase(dark), borderLeft: bordeIzq }}>NOMBRE DEL INMUEBLE</th>
                <th style={{ ...thBase(dark), borderLeft: bordeIzq }}>UBICACIÓN</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? <tr><td colSpan={4} style={{ padding: '3rem', textAlign: 'center', color: t.text4 }}>Cargando…</td></tr>
                : datos.length === 0
                  ? <tr><td colSpan={4} style={{ padding: '3rem', textAlign: 'center', color: t.text4 }}>Sin resultados</td></tr>
                  : datos.map((b, i) => {
                      const sel = seleccionados.has(b.idinmueble)
                      return (
                        <tr key={b.idinmueble} onClick={() => toggle(b)} style={{ borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`, cursor: 'pointer', background: sel ? (dark ? 'rgba(168,197,248,0.10)' : 'rgba(37,99,235,0.06)') : (i % 2 !== 0 ? (dark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.015)') : 'transparent') }}>
                          <td style={{ ...tdBase(), textAlign: 'center', verticalAlign: 'middle' }}>
                            <div style={{ width: '17px', height: '17px', borderRadius: '5px', margin: '0 auto', background: sel ? (dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.78)') : 'transparent', border: dark ? '1.5px solid rgba(255,255,255,0.4)' : '1.5px solid rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {sel && <i className="ti ti-check" style={{ fontSize: '11px', color: dark ? '#1c1c1e' : '#fff' }} />}
                            </div>
                          </td>
                          <td style={tdBase()}><span style={{ fontFamily: 'monospace', fontSize: '11px', color: t.text3 }}>{b.claveinmueble || '—'}</span></td>
                          <td style={{ ...tdBase(), maxWidth: '260px', overflowWrap: 'anywhere', wordBreak: 'break-word' }}><span style={{ color: t.text1, fontWeight: 500 }}>{b.nombreinmueble || '—'}</span></td>
                          <td style={{ ...tdBase(), maxWidth: '220px', overflowWrap: 'anywhere', wordBreak: 'break-word' }}><span style={{ color: t.text2 }}>{b.ubicacion || '—'}</span></td>
                        </tr>
                      )
                    })
              }
            </tbody>
          </table>
        </div>
        <div style={{ padding: '10px 14px', borderTop: `1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <p style={{ fontSize: '12px', color: t.text4 }}>{loading ? 'Cargando…' : `${total.toLocaleString()} inmuebles`}</p>
            <div style={{ display: 'flex', gap: '3px' }}>
              {OPCIONES.map(n => <button key={n} onClick={() => setPorPagina(n)} style={{ padding: '3px 9px', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer', fontWeight: porPagina === n ? 600 : 400, background: porPagina === n ? (dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)') : 'transparent', border: porPagina === n ? `1px solid ${t.cardBorder}` : '1px solid transparent', color: porPagina === n ? t.text1 : t.text4 }}>{n}</button>)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button onClick={() => cargar(pagina - 1, busqueda)} disabled={pagina === 0 || loading} style={{ width: '30px', height: '30px', borderRadius: '7px', background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.12)', cursor: pagina === 0 ? 'not-allowed' : 'pointer', opacity: pagina === 0 ? 0.4 : 1, color: t.text1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="ti ti-chevron-left" style={{ fontSize: '14px' }} /></button>
            <span style={{ fontSize: '13px', color: t.text2, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Pág.
                    <select value={pagina} onChange={e => setPagina(Number(e.target.value))} aria-label="Ir a la página"
                      style={{ ...sStyle(dark), width: 'auto', height: '28px', padding: '0 30px 0 9px', fontSize: '13px', backgroundPosition: 'right 8px center', backgroundSize: '13px 13px' }}>
                      {Array.from({ length: totalPag }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}
                    </select>
                    / {totalPag}
                  </span>
            <button onClick={() => cargar(pagina + 1, busqueda)} disabled={(pagina + 1) * porPagina >= total || loading} style={{ width: '30px', height: '30px', borderRadius: '7px', background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.12)', cursor: (pagina + 1) * porPagina >= total ? 'not-allowed' : 'pointer', opacity: (pagina + 1) * porPagina >= total ? 0.4 : 1, color: t.text1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="ti ti-chevron-right" style={{ fontSize: '14px' }} /></button>
          </div>
        </div>
      </div>

      {modal && <ModalEvidencias bienes={[...seleccionados.values()]} categorias={categorias} onClose={() => setModal(false)} dark={dark} t={t} />}
    </>
  )
}
