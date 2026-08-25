import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Sidebar from '../components/Sidebar'
import { useTheme } from '../context/ThemeContext'
import { supabaseInmuebles } from '../supabaseInmuebles'
import { PanelConsulta, ModalEditar, ModalNuevoInmueble, ModalDesincorporacion, ModalReporte, exportarPDF, exportarExcel, REPORT_COLS, exportarEnajenacionesPDF, exportarEnajenacionesExcel } from './BienesInmuebles'
import { barraSticky, btnBarra, sStyle } from './BienesMuebles'
import { ID_PROCESO, ID_DESINC, fetchInmueblesPorCategoria, contarCategoria, cambiarCategoria, getDesinc, setDesinc, quitarDesinc, hoyISO } from '../desincorporaciones'

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']
function mesAnioActual() { const d = new Date(); return `${MESES[d.getMonth()]} ${d.getFullYear()}` }
function fmtFecha(iso) { if (!iso) return '—'; const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}` }
function fmtVal(n) { return n != null ? '$ ' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '$ —' }
function fmtM2(n) { return n != null ? Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 }) + ' m²' : '—' }

function thBase(dark) {
  return { padding: '9px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', verticalAlign: 'middle', background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }
}
function tdBase() { return { padding: '10px 10px', verticalAlign: 'top' } }

// Modal Generar Reporte (título + Excel/PDF)
function ModalRepDesinc({ onClose, dark, t, rows, tituloInicial }) {
  const [titulo, setTitulo] = useState(tituloInicial || '')
  const [generando, setGenerando] = useState(null)
  async function generar(formato) {
    setGenerando(formato)
    try {
      const cols = REPORT_COLS.filter(c => c.key !== 'categoria')   // tabla plana
      if (formato === 'excel') await exportarExcel(rows, cols, [], titulo.trim())
      else                     await exportarPDF(rows, cols, [], titulo.trim())
      onClose()
    } catch (e) { console.error(e); setGenerando(null) }
  }
  return createPortal(
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,0.4)', backdropFilter:'blur(4px)' }} />
      <div onClick={e => e.stopPropagation()} style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:301, width:'460px', maxWidth:'92vw', background: dark ? '#1e1e20' : '#fff', borderRadius:'16px', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', boxShadow:'0 20px 60px rgba(0,0,0,0.4)', animation:'fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)', overflow:'hidden' }}>
        <div style={{ padding:'1.25rem 1.5rem', borderBottom: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
            <div style={{ width:'34px', height:'34px', borderRadius:'9px', background: dark ? 'rgba(168,230,207,0.15)' : 'rgba(30,126,74,0.08)', border: dark ? '1px solid rgba(168,230,207,0.3)' : '1px solid rgba(30,126,74,0.2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <i className="ti ti-file-export" style={{ fontSize:'18px', color: dark ? '#a8e6cf' : '#1e7e4a' }} />
            </div>
            <div>
              <p style={{ fontSize:'15px', fontWeight:600, color: dark ? '#fff' : '#111' }}>Generar Reporte</p>
              <p style={{ fontSize:'12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>{rows.length} registros</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width:'30px', height:'30px', borderRadius:'7px', background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color: dark ? '#ccc' : '#555' }}>
            <i className="ti ti-x" style={{ fontSize:'15px' }} />
          </button>
        </div>
        <div style={{ padding:'1.25rem 1.5rem' }}>
          <p style={{ fontSize:'10px', fontWeight:700, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'8px' }}>Título del documento <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0 }}>(opcional)</span></p>
          <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder={tituloInicial}
            style={{ width:'100%', padding:'9px 13px', borderRadius:'9px', outline:'none', fontFamily:'inherit', fontSize:'13px', background: dark ? '#2a2a2c' : '#fff', border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.18)', color: dark ? '#f0f0f0' : '#111', boxSizing:'border-box' }} />
        </div>
        <div style={{ padding:'0 1.5rem 1.25rem', display:'flex', gap:'8px' }}>
          <button onClick={() => generar('excel')} disabled={generando || rows.length === 0}
            style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'7px', padding:'11px', borderRadius:'9px', fontSize:'14px', fontWeight:600, fontFamily:'inherit', cursor: generando || rows.length === 0 ? 'not-allowed' : 'pointer', opacity: rows.length === 0 ? 0.5 : 1, background: dark ? 'rgba(168,230,207,0.18)' : 'rgba(30,126,74,0.08)', border: dark ? '1px solid rgba(168,230,207,0.35)' : '1px solid rgba(30,126,74,0.35)', color: dark ? '#a8e6cf' : '#15803d' }}>
            {generando === 'excel' ? <><i className="ti ti-loader-2" style={{ fontSize:'15px', animation:'spin 1s linear infinite' }} />Generando…</> : <><i className="ti ti-file-spreadsheet" style={{ fontSize:'16px' }} />Excel</>}
          </button>
          <button onClick={() => generar('pdf')} disabled={generando || rows.length === 0}
            style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'7px', padding:'11px', borderRadius:'9px', fontSize:'14px', fontWeight:600, fontFamily:'inherit', cursor: generando || rows.length === 0 ? 'not-allowed' : 'pointer', opacity: rows.length === 0 ? 0.5 : 1, background: dark ? 'rgba(244,161,161,0.15)' : 'rgba(192,57,43,0.07)', border: dark ? '1px solid rgba(244,161,161,0.35)' : '1px solid rgba(192,57,43,0.3)', color: dark ? '#f4a1a1' : '#c0392b' }}>
            {generando === 'pdf' ? <><i className="ti ti-loader-2" style={{ fontSize:'15px', animation:'spin 1s linear infinite' }} />Generando…</> : <><i className="ti ti-file-type-pdf" style={{ fontSize:'16px' }} />PDF</>}
          </button>
        </div>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translate(-50%,-48%) scale(0.98)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}} @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </>,
    document.body
  )
}

export default function ReportesInmuebles({ user, onNavigate }) {
  const { dark, t, sidebarOpen } = useTheme()
  const [vista, setVista]   = useState('inicio')   // 'inicio' | 'proceso' | 'desincorporado'
  const [datos, setDatos]   = useState([])
  const [loading, setLoading] = useState(false)
  const [panel, setPanel]   = useState(null)
  const [modalEditar, setModalEditar] = useState(null)
  const [modalNuevo, setModalNuevo]   = useState(false)
  const [modalDesinc, setModalDesinc] = useState(null)
  const [modalReporte, setModalReporte] = useState(false)
  const [modalEnaj, setModalEnaj] = useState(false)
  const [modoSeleccion, setModoSeleccion] = useState(false)
  const [seleccionados, setSeleccionados] = useState(() => new Map())   // idinmueble -> bien
  const [conteos, setConteos] = useState({ proceso: null, desinc: null })
  const [categorias, setCategorias] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [m2Min, setM2Min] = useState('')
  const [m2Max, setM2Max] = useState('')
  const [pagina, setPagina] = useState(0)
  const [porPagina, setPorPagina] = useState(20)
  const OPCIONES = [10, 15, 20]

  const card = { background: t.cardBg, border: `1px solid ${t.cardBorder}`, backdropFilter: t.cardBlur, WebkitBackdropFilter: t.cardBlur, borderRadius: '14px', padding: '1.25rem' }
  const cardTabla = { background: t.cardBg, border: `1px solid ${t.cardBorder}`, backdropFilter: t.cardBlur, WebkitBackdropFilter: t.cardBlur, borderRadius: '14px' }
  const bg = dark ? 'linear-gradient(145deg,#111113 0%,#1c1c1e 50%,#222224 100%)' : 'linear-gradient(145deg,#e0e0e2 0%,#ebebed 50%,#e4e4e6 100%)'
  const bordeIzq = dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)'

  const esDesinc = vista === 'desincorporado'
  const idCatActual = esDesinc ? ID_DESINC : ID_PROCESO

  const cargarConteos = useCallback(async () => {
    try {
      const [p, d] = await Promise.all([contarCategoria(ID_PROCESO), contarCategoria(ID_DESINC)])
      setConteos({ proceso: p, desinc: d })
    } catch { /* noop */ }
  }, [])
  useEffect(() => { cargarConteos() }, [cargarConteos])
  useEffect(() => {
    supabaseInmuebles.from('categoriasinmuebles').select('idcategoria, nombrecategoria')
      .then(({ data }) => setCategorias(data || [])).catch(console.error)
  }, [])

  const cargar = useCallback(async (idcat) => {
    setLoading(true)
    try {
      const rows = await fetchInmueblesPorCategoria(idcat)
      const m = getDesinc()
      setDatos(rows.map(r => ({ ...r, _d: m[r.idinmueble] || {} })))
    } catch (e) { console.error(e); setDatos([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (vista !== 'inicio') cargar(idCatActual) }, [vista, idCatActual, cargar])

  async function desincorporar(b, { obs, fecha }) {
    setDesinc([b.idinmueble], { fechaDesinc: fecha, obsDesinc: obs })
    await cambiarCategoria([b.idinmueble], ID_DESINC)   // pasa a "DESINCORPORADO DEL HAN"
    setModalDesinc(null)
    await cargar(ID_PROCESO)
    cargarConteos()
  }

  function toggleSeleccion(b) { setSeleccionados(prev => { const n = new Map(prev); n.has(b.idinmueble) ? n.delete(b.idinmueble) : n.set(b.idinmueble, b); return n }) }
  function toggleModoSeleccion() { setModoSeleccion(m => { if (m) setSeleccionados(new Map()); return !m }) }

  async function cancelarProceso(b) {
    const cat = getDesinc()[b.idinmueble]?.catOriginal
    if (!cat) return   // sin categoría original conocida, no se puede revertir
    await cambiarCategoria([b.idinmueble], cat)   // regresa a su categoría original
    quitarDesinc([b.idinmueble])
    await cargar(ID_PROCESO)
    cargarConteos()
  }

  const q = busqueda.toLowerCase()
  const min = m2Min !== '' ? Number(m2Min) : null
  const max = m2Max !== '' ? Number(m2Max) : null
  // Mismos criterios que la búsqueda del inventario general: nombre, claves,
  // ubicación, documento (escritura), expediente, adquisición, categoría, y
  // también número (superficie o valor) y fecha/año.
  const coincide = (b) => {
    if (!q) return true
    const cat = (categorias.find(c => c.idcategoria === b.idcategoria)?.nombrecategoria || '').toLowerCase()
    const textos = [b.nombreinmueble, b.claveinmueble, b.clavecatastral, b.ubicacion,
      b.documentopropiedad, b.expediente, b.adquisicion, cat]
    if (textos.some(v => (v || '').toString().toLowerCase().includes(q))) return true
    // Número por aproximación: "2000" también encuentra 2000.25
    const limpio = q.replace(/[$,\s]/g, '')
    const num = Number(limpio)
    if (Number.isFinite(num) && limpio !== '') {
      const paso = limpio.includes('.') ? 0.01 : 1
      const enRango = v => v != null && Number(v) >= num && Number(v) < num + paso
      if (enRango(b.superficiem2) || enRango(b.valorcatastral)) return true
    }
    return (b.fecha_enajenacion || '').startsWith(q)
  }
  const filtrados = datos.filter(b =>
    coincide(b) &&
    (min == null || (b.superficiem2 != null && Number(b.superficiem2) >= min)) &&
    (max == null || (b.superficiem2 != null && Number(b.superficiem2) <= max))
  )
  useEffect(() => { setPagina(0) }, [vista, busqueda, m2Min, m2Max, porPagina])
  const totalPag = Math.max(1, Math.ceil(filtrados.length / porPagina))
  const paginados = filtrados.slice(pagina * porPagina, (pagina + 1) * porPagina)
  const totalCols = 8 + (modoSeleccion ? 1 : 0)

  const idsPagina = paginados.map(d => d.idinmueble)
  const todosEnPag = idsPagina.length > 0 && idsPagina.every(id => seleccionados.has(id))
  const algunoEnPag = idsPagina.some(id => seleccionados.has(id))
  function toggleTodosPagina() {
    setSeleccionados(prev => { const n = new Map(prev); if (todosEnPag) paginados.forEach(b => n.delete(b.idinmueble)); else paginados.forEach(b => n.set(b.idinmueble, b)); return n })
  }

  const cards = [
    { id: 'proceso',        icon: 'ti-progress',     label: 'En Proceso de Desincorporación', value: conteos.proceso, hint: 'Inmuebles en trámite', color: t.colorYellow },
    { id: 'desincorporado', icon: 'ti-archive-off',  label: 'Desincorporado',                 value: conteos.desinc,  hint: 'Inmuebles desincorporados', color: t.colorRed },
    { id: 'enajenaciones',  icon: 'ti-transfer',     label: 'Reporte de Enajenaciones',       value: null, accion: true, hint: 'Desincorporaciones e incorporaciones por periodo', color: t.text2 },
  ]

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: bg, transition: 'background 0.3s' }}>
      <Sidebar user={user} active="reportes" onNavigate={onNavigate} />
      <main style={{ flex: 1, marginLeft: sidebarOpen ? '230px' : '72px', padding: '2rem 1.25rem', overflowY: 'auto', overflowX: 'hidden', minWidth: 0, transition: 'margin-left 0.25s cubic-bezier(0.4,0,0.2,1)' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
          {vista !== 'inicio' && (
            <button onClick={() => setVista('inicio')} title="Volver"
              style={{ width: '34px', height: '34px', borderRadius: '9px', background: t.cardBg, border: `1px solid ${t.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: t.text1 }}>
              <i className="ti ti-arrow-left" style={{ fontSize: '18px' }} />
            </button>
          )}
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 600, color: t.text1, marginBottom: '4px' }}>
              {vista === 'inicio' ? 'Reportes' : (esDesinc ? 'Desincorporado' : 'En Proceso de Desincorporación')}
            </h1>
            <p style={{ fontSize: '14px', color: t.text3 }}>
              {vista === 'inicio' ? 'GENERACIÓN DE REPORTES DE BIENES INMUEBLES' : `Bienes inmuebles · ${loading ? 'Cargando…' : `${filtrados.length} registros`}`}
            </p>
          </div>
        </div>

        {vista === 'inicio' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
            {cards.map(c => (
              <button key={c.id} onClick={() => { if (c.id === 'enajenaciones') { setModalEnaj(true) } else { setVista(c.id); setBusqueda(''); setModoSeleccion(false); setSeleccionados(new Map()) } }}
                style={{ ...card, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.75'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
                  <div style={{ width: '42px', height: '42px', borderRadius: '11px', flexShrink: 0, background: t.iconBox, border: `1px solid ${t.iconBoxBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className={`ti ${c.icon}`} style={{ fontSize: '22px', color: c.color }} />
                  </div>
                  <p style={{ fontSize: '15px', fontWeight: 600, color: t.text1 }}>{c.label}</p>
                </div>
                {!c.accion && <p style={{ fontSize: '30px', fontWeight: 600, color: t.text1, lineHeight: 1, marginBottom: '6px' }}>{c.value == null ? '…' : c.value.toLocaleString()}</p>}
                <p style={{ fontSize: '12px', color: t.text4 }}>{c.hint}</p>
              </button>
            ))}
          </div>
        ) : (
          <>
            {/* Filtros */}
            <div style={{ ...cardTabla, padding: '1rem 1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 13px', borderRadius: '9px', background: dark ? '#2a2a2c' : '#fff', border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.18)', flex: 1, minWidth: '200px' }}>
                <i className="ti ti-search" style={{ fontSize: '16px', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)', flexShrink: 0 }} />
                <input type="text" placeholder="Buscar por nombre, clave, catastral o ubicación..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', color: dark ? '#f0f0f0' : '#111', fontFamily: 'inherit' }} />
                {busqueda && <button onClick={() => setBusqueda('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)', padding: 0, display: 'flex' }}><i className="ti ti-x" style={{ fontSize: '14px' }} /></button>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 13px', borderRadius: '9px', background: dark ? '#2a2a2c' : '#fff', border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.18)', width: '120px' }}>
                  <i className="ti ti-ruler-measure" style={{ fontSize: '14px', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)', flexShrink: 0 }} />
                  <input type="number" placeholder="Min m²" value={m2Min} onChange={e => setM2Min(e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: '13px', color: dark ? '#f0f0f0' : '#111', fontFamily: 'inherit', MozAppearance: 'textfield' }} />
                  {m2Min && <button onClick={() => setM2Min('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)', padding: 0, display: 'flex', flexShrink: 0 }}><i className="ti ti-x" style={{ fontSize: '13px' }} /></button>}
                </div>
                <span style={{ fontSize: '12px', color: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)' }}>—</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 13px', borderRadius: '9px', background: dark ? '#2a2a2c' : '#fff', border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.18)', width: '120px' }}>
                  <input type="number" placeholder="Max m²" value={m2Max} onChange={e => setM2Max(e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: '13px', color: dark ? '#f0f0f0' : '#111', fontFamily: 'inherit', MozAppearance: 'textfield' }} />
                  {m2Max && <button onClick={() => setM2Max('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)', padding: 0, display: 'flex', flexShrink: 0 }}><i className="ti ti-x" style={{ fontSize: '13px' }} /></button>}
                </div>
              </div>
            </div>

            {/* Seleccionar + Generar */}
            {/* Barra pegajosa: las acciones siguen visibles al bajar en la tabla */}
            <div style={barraSticky(dark, t)}>
              <div onClick={toggleModoSeleccion}
                style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 16px', borderRadius: '9px', fontSize: '14px', fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', background: t.cardBg, border: `1px solid ${t.cardBorder}`, color: t.text1, backdropFilter: 'blur(10px)', userSelect: 'none' }}>
                <div style={{ width: '17px', height: '17px', borderRadius: '5px', flexShrink: 0, background: modoSeleccion ? (dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.78)') : 'transparent', border: dark ? '1.5px solid rgba(255,255,255,0.4)' : '1.5px solid rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {modoSeleccion && <i className="ti ti-check" style={{ fontSize: '11px', color: dark ? '#1c1c1e' : '#fff' }} />}
                </div>
                Seleccionar registros
              </div>
              {modoSeleccion && seleccionados.size > 0 && (
                <span style={{ fontSize: '13px', color: t.text3 }}>{seleccionados.size} seleccionado{seleccionados.size !== 1 ? 's' : ''}</span>
              )}
              <button onClick={() => setModalNuevo(true)}
                style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 16px', borderRadius: '9px', fontSize: '14px', fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', background: t.cardBg, border: `1px solid ${t.cardBorder}`, color: t.text1, backdropFilter: 'blur(10px)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                <i className="ti ti-building-plus" style={{ fontSize: '17px' }} />Nuevo Inmueble
              </button>
              <button onClick={() => setModalReporte(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 16px', borderRadius: '9px', fontSize: '14px', fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', background: t.cardBg, border: `1px solid ${t.cardBorder}`, color: t.text1, backdropFilter: 'blur(10px)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                <i className="ti ti-file-export" style={{ fontSize: '17px' }} />Generar Reporte
              </button>
            </div>

            <div style={{ ...cardTabla, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}` }}>
                      {modoSeleccion && (
                        <th rowSpan={2} style={{ ...thBase(dark), width: '40px', minWidth: '40px', textAlign: 'center' }}>
                          <div onClick={toggleTodosPagina} title={todosEnPag ? 'Deseleccionar página' : 'Seleccionar página'}
                            style={{ width: '17px', height: '17px', borderRadius: '5px', margin: '0 auto', cursor: 'pointer', background: todosEnPag ? (dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.78)') : 'transparent', border: dark ? '1.5px solid rgba(255,255,255,0.4)' : '1.5px solid rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {todosEnPag && <i className="ti ti-check" style={{ fontSize: '11px', color: dark ? '#1c1c1e' : '#fff' }} />}
                            {!todosEnPag && algunoEnPag && <i className="ti ti-minus" style={{ fontSize: '11px', color: dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)' }} />}
                          </div>
                        </th>
                      )}
                      <th style={{ ...thBase(dark), width: '80px', minWidth: '80px' }}>CLAVE</th>
                      <th style={{ ...thBase(dark), borderLeft: bordeIzq }}>NOMBRE DEL INMUEBLE</th>
                      <th style={{ ...thBase(dark), borderLeft: bordeIzq }}>CLAVE CATASTRAL</th>
                      <th style={{ ...thBase(dark), borderLeft: bordeIzq }}>UBICACIÓN</th>
                      <th style={{ ...thBase(dark), borderLeft: bordeIzq, width: '120px', minWidth: '120px' }}>SUPERFICIE</th>
                      <th style={{ ...thBase(dark), borderLeft: bordeIzq }}>DOCUMENTO</th>
                      <th style={{ ...thBase(dark), borderLeft: bordeIzq, width: '110px', minWidth: '110px' }}>EXPEDIENTE</th>
                      <th style={{ ...thBase(dark), borderLeft: bordeIzq }}>ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading
                      ? <tr><td colSpan={totalCols} style={{ padding: '3rem', textAlign: 'center', color: t.text4 }}>Cargando…</td></tr>
                      : filtrados.length === 0
                        ? <tr><td colSpan={totalCols} style={{ padding: '3rem', textAlign: 'center', color: t.text4 }}>
                            <i className="ti ti-inbox-off" style={{ fontSize: '28px', display: 'block', marginBottom: '8px' }} />Sin registros
                          </td></tr>
                        : paginados.map((b, i) => {
                            const sel = seleccionados.has(b.idinmueble)
                            const bgFila = sel ? (dark ? 'rgba(168,197,248,0.10)' : 'rgba(37,99,235,0.06)') : (i % 2 !== 0 ? (dark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.015)') : 'transparent')
                            return (
                            <tr key={b.idinmueble} onClick={() => modoSeleccion && toggleSeleccion(b)} style={{ borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`, background: bgFila, cursor: modoSeleccion ? 'pointer' : 'default' }}>
                              {modoSeleccion && (
                                <td style={{ ...tdBase(), textAlign: 'center', verticalAlign: 'middle' }}>
                                  <div style={{ width: '17px', height: '17px', borderRadius: '5px', margin: '0 auto', background: sel ? (dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.78)') : 'transparent', border: dark ? '1.5px solid rgba(255,255,255,0.4)' : '1.5px solid rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {sel && <i className="ti ti-check" style={{ fontSize: '11px', color: dark ? '#1c1c1e' : '#fff' }} />}
                                  </div>
                                </td>
                              )}
                              <td style={tdBase()}><span style={{ fontFamily: 'monospace', fontSize: '11px', color: t.text3 }}>{b.claveinmueble || '—'}</span></td>
                              <td style={{ ...tdBase(), maxWidth: '240px', overflowWrap: 'anywhere', wordBreak: 'break-word' }}><p style={{ color: t.text1, fontWeight: 500, lineHeight: 1.3 }}>{b.nombreinmueble || '—'}</p></td>
                              <td style={tdBase()}><span style={{ fontFamily: 'monospace', fontSize: '11px', color: t.text3 }}>{b.clavecatastral || '—'}</span></td>
                              <td style={{ ...tdBase(), maxWidth: '200px', overflowWrap: 'anywhere', wordBreak: 'break-word' }}><span style={{ color: t.text2, fontSize: '12px', lineHeight: 1.3, display: 'block' }}>{b.ubicacion || '—'}</span></td>
                              <td style={{ ...tdBase(), whiteSpace: 'nowrap' }}><span style={{ color: t.text2 }}>{b.superficiem2 ? fmtM2(b.superficiem2) : '—'}</span></td>
                              <td style={{ ...tdBase(), maxWidth: '200px' }}><span title={b.documentopropiedad} style={{ color: t.text3, fontSize: '11px', display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{b.documentopropiedad || '—'}</span></td>
                              <td style={tdBase()}><span style={{ color: t.text2, fontSize: '12px' }}>{b.expediente || '—'}</span></td>
                              <td style={tdBase()}>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  <button onClick={(e) => { e.stopPropagation(); setPanel(b) }} title="Consultar"
                                    style={{ width: '30px', height: '30px', borderRadius: '7px', background: dark ? 'rgba(168,197,248,0.12)' : 'rgba(37,99,235,0.07)', border: dark ? '1px solid rgba(168,197,248,0.25)' : '1px solid rgba(37,99,235,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: dark ? '#a8c5f8' : '#2563eb' }}
                                    onMouseEnter={e => e.currentTarget.style.opacity = '0.7'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                                    <i className="ti ti-eye" style={{ fontSize: '14px' }} />
                                  </button>
                                  {/* Mismos campos editables que en el inventario principal */}
                                  <button onClick={(e) => { e.stopPropagation(); setModalEditar(b) }} title="Editar"
                                    style={{ width: '30px', height: '30px', borderRadius: '7px', background: dark ? 'rgba(168,230,207,0.12)' : 'rgba(30,126,74,0.07)', border: dark ? '1px solid rgba(168,230,207,0.25)' : '1px solid rgba(30,126,74,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: dark ? '#a8e6cf' : '#1e7e4a' }}
                                    onMouseEnter={e => e.currentTarget.style.opacity = '0.7'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                                    <i className="ti ti-pencil" style={{ fontSize: '14px' }} />
                                  </button>
                                  {!esDesinc && (
                                    <button onClick={(e) => { e.stopPropagation(); setModalDesinc(b) }} title="Desincorporar"
                                      style={{ width: '30px', height: '30px', borderRadius: '7px', background: dark ? 'rgba(244,161,161,0.15)' : 'rgba(192,57,43,0.07)', border: dark ? '1px solid rgba(244,161,161,0.35)' : '1px solid rgba(192,57,43,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: dark ? '#f4a1a1' : '#c0392b' }}
                                      onMouseEnter={e => e.currentTarget.style.opacity = '0.7'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                                      <i className="ti ti-archive-off" style={{ fontSize: '14px' }} />
                                    </button>
                                  )}
                                  {!esDesinc && b._d.catOriginal && (
                                    <button onClick={(e) => { e.stopPropagation(); cancelarProceso(b) }} title="Cancelar y regresar al inventario"
                                      style={{ width: '30px', height: '30px', borderRadius: '7px', background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', border: `1px solid ${t.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: t.text3 }}
                                      onMouseEnter={e => e.currentTarget.style.opacity = '0.7'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                                      <i className="ti ti-x" style={{ fontSize: '14px' }} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                            )
                          })
                    }
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '10px 14px', borderTop: `1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <p style={{ fontSize: '12px', color: t.text4 }}>{loading ? 'Cargando…' : `Mostrando ${filtrados.length === 0 ? 0 : pagina * porPagina + 1}–${Math.min((pagina + 1) * porPagina, filtrados.length)} de ${filtrados.length.toLocaleString()} registros`}</p>
                  <div style={{ display: 'flex', gap: '3px' }}>
                    {OPCIONES.map(n => (
                      <button key={n} onClick={() => setPorPagina(n)} style={{ padding: '3px 9px', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer', fontWeight: porPagina === n ? 600 : 400, background: porPagina === n ? (dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)') : 'transparent', border: porPagina === n ? `1px solid ${t.cardBorder}` : '1px solid transparent', color: porPagina === n ? t.text1 : t.text4 }}>{n}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button onClick={() => setPagina(p => Math.max(0, p - 1))} disabled={pagina === 0} style={{ width: '30px', height: '30px', borderRadius: '7px', background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.12)', cursor: pagina === 0 ? 'not-allowed' : 'pointer', opacity: pagina === 0 ? 0.4 : 1, color: t.text1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="ti ti-chevron-left" style={{ fontSize: '14px' }} /></button>
                  <span style={{ fontSize: '13px', color: t.text2, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Pág.
                    <select value={pagina} onChange={e => setPagina(Number(e.target.value))} aria-label="Ir a la página"
                      style={{ ...sStyle(dark), width: 'auto', height: '28px', padding: '0 30px 0 9px', fontSize: '13px', backgroundPosition: 'right 8px center', backgroundSize: '13px 13px' }}>
                      {Array.from({ length: totalPag }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}
                    </select>
                    / {totalPag}
                  </span>
                  <button onClick={() => setPagina(p => Math.min(totalPag - 1, p + 1))} disabled={pagina >= totalPag - 1} style={{ width: '30px', height: '30px', borderRadius: '7px', background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.12)', cursor: pagina >= totalPag - 1 ? 'not-allowed' : 'pointer', opacity: pagina >= totalPag - 1 ? 0.4 : 1, color: t.text1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="ti ti-chevron-right" style={{ fontSize: '14px' }} /></button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Las columnas ocultas de la tabla (observaciones y fecha) se ven aquí */}
      {panel && <PanelConsulta inmueble={panel} onClose={() => setPanel(null)} t={t} dark={dark} categorias={categorias}
        extra={[
          [esDesinc ? 'Observaciones de desincorporación' : 'Observaciones de la solicitud', (esDesinc ? panel._d?.obsDesinc : panel._d?.obsProceso) || ''],
          [esDesinc ? 'Fecha de desincorporación' : 'Fecha de solicitud', fmtFecha(esDesinc ? panel._d?.fechaDesinc : panel._d?.fechaProceso)],
        ]} />}
      {modalDesinc && (
        <ModalDesincorporacion cantidad={1} onClose={() => setModalDesinc(null)} dark={dark} t={t}
          titulo="Desincorporar" textoBoton="Desincorporar"
          onConfirm={({ obs, fecha }) => desincorporar(modalDesinc, { obs, fecha })} />
      )}
      {/* Mismo generador de reportes que en Bienes Inmuebles */}
      {modalReporte && (
        <ModalReporte onClose={() => setModalReporte(false)} dark={dark} t={t}
          categorias={categorias}
          seleccionados={[...seleccionados.keys()]}
          filtros={{ busqueda, m2Min, m2Max, categoriaIds: [idCatActual], categorias }}
          totalFiltrados={filtrados.length}
          tituloInicial={`${esDesinc ? 'DESINCORPORACIONES' : 'EN PROCESO DE DESINCORPORACIÓN'} HAN ${mesAnioActual()}`} />
      )}
      {modalEditar && (
        <ModalEditar inmueble={modalEditar} onClose={() => setModalEditar(null)} dark={dark} t={t}
          categorias={categorias} onSaved={() => cargar(vista === 'desinc' ? ID_DESINC : ID_PROCESO)} />
      )}
      {modalNuevo && (
        <ModalNuevoInmueble onClose={() => setModalNuevo(false)} dark={dark} t={t}
          categorias={categorias} onCreated={() => cargar(vista === 'desinc' ? ID_DESINC : ID_PROCESO)} />
      )}
      {modalEnaj && <ModalEnajenaciones onClose={() => setModalEnaj(false)} dark={dark} t={t} />}
    </div>
  )
}

// ── Modal Enajenaciones ───────────────────────────────────────────────────────
function ModalEnajenaciones({ onClose, dark, t }) {
  const [modo, setModo]       = useState('anio')   // 'anio' | 'semestre' | 'trimestre' | 'fechas'
  const [anio, setAnio]       = useState(new Date().getFullYear())
  const [semestre, setSem]    = useState('1')
  const [trimestre, setTrim]  = useState('1')
  const [desde, setDesde]     = useState('')
  const [hasta, setHasta]     = useState('')
  const [titulo, setTitulo]   = useState('')
  const [generando, setGen]   = useState(null)

  function calcRango() {
    if (modo === 'anio') return { d: `${anio}-01-01`, h: `${anio}-12-31`, lbl: `${anio}` }
    if (modo === 'semestre') {
      const d = semestre === '1' ? `${anio}-01-01` : `${anio}-07-01`
      const h = semestre === '1' ? `${anio}-06-30` : `${anio}-12-31`
      return { d, h, lbl: `${semestre}ER SEMESTRE DEL ${anio}` }
    }
    if (modo === 'trimestre') {
      const ini = ['01-01','04-01','07-01','10-01'][trimestre - 1]
      const fin = ['03-31','06-30','09-30','12-31'][trimestre - 1]
      return { d: `${anio}-${ini}`, h: `${anio}-${fin}`, lbl: `${trimestre}ER TRIMESTRE DEL ${anio}` }
    }
    return { d: desde, h: hasta, lbl: desde && hasta ? `${desde} AL ${hasta}` : '' }
  }

  async function generar(formato) {
    const { d, h, lbl } = calcRango()
    if (!d || !h) return
    setGen(formato)
    try {
      let q = supabaseInmuebles.from('bienesinmuebles')
        .select('idinmueble,idcategoria,nombreinmueble,clavecatastral,superficiem2,ubicacion,afavorde,valorcatastral,documentopropiedad,tipo_enajenacion,fecha_enajenacion')
        .not('fecha_enajenacion', 'is', null)
        .gte('fecha_enajenacion', d)
        .lte('fecha_enajenacion', h)
      const { data } = await q
      const rows = data || []
      // El movimiento se determina por la categoría del inmueble: si está en
      // proceso o ya desincorporado salió del patrimonio; el resto son altas.
      const esSalida = r => [ID_PROCESO, ID_DESINC].includes(r.idcategoria)
      const marcar = (r, tipo) => ({ ...r, tipo_mov: tipo })
      const desinc = rows.filter(esSalida).map(r => marcar(r, 'DESINCORPORACIÓN'))
      const incorp = rows.filter(r => !esSalida(r)).map(r => marcar(r, 'INCORPORACIÓN'))
      const tit = titulo.trim() || `ENAJENACIONES DEL H. AYUNTAMIENTO DE NOGALES ${lbl}`
      if (formato === 'pdf') await exportarEnajenacionesPDF(desinc, incorp, tit)
      else                   await exportarEnajenacionesExcel(desinc, incorp, tit)
      onClose()
    } catch(e) { console.error(e) } finally { setGen(null) }
  }

  const iStyle = { width: '100%', padding: '8px 12px', borderRadius: '8px', border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.18)', background: dark ? '#2a2a2c' : '#fff', color: dark ? '#f0f0f0' : '#111', fontFamily: 'inherit', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }
  const lbl = (txt) => <p style={{ fontSize: '10px', fontWeight: 700, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>{txt}</p>

  return createPortal(<>
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} />
    <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 301, width: '480px', maxWidth: '94vw', background: dark ? '#1e1e20' : '#fff', borderRadius: '16px', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: dark ? 'rgba(168,230,207,0.15)' : 'rgba(30,126,74,0.08)', border: dark ? '1px solid rgba(168,230,207,0.3)' : '1px solid rgba(30,126,74,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="ti ti-transfer" style={{ fontSize: '18px', color: dark ? '#a8e6cf' : '#1e7e4a' }} />
          </div>
          <div>
            <p style={{ fontSize: '15px', fontWeight: 600, color: dark ? '#fff' : '#111' }}>Reporte de Enajenaciones</p>
            <p style={{ fontSize: '12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>Desincorporaciones e incorporaciones</p>
          </div>
        </div>
        <button onClick={onClose} style={{ width: '30px', height: '30px', borderRadius: '7px', background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: dark ? '#ccc' : '#555' }}>
          <i className="ti ti-x" style={{ fontSize: '15px' }} />
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Tipo de periodo */}
        <div>
          {lbl('Filtrar por')}
          <div style={{ display: 'flex', gap: '6px' }}>
            {[['anio','Año'],['semestre','Semestre'],['trimestre','Trimestre'],['fechas','Fechas']].map(([id, lab]) => (
              <button key={id} onClick={() => setModo(id)}
                style={{ flex: 1, padding: '7px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', background: modo === id ? (dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)') : 'transparent', border: modo === id ? `1px solid ${t.cardBorder}` : `1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)'}`, color: modo === id ? (dark ? '#fff' : '#111') : (dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)') }}>
                {lab}
              </button>
            ))}
          </div>
        </div>

        {/* Controles según modo */}
        {modo !== 'fechas' && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              {lbl('Año')}
              <input type="number" value={anio} onChange={e => setAnio(e.target.value)} style={iStyle} min="2020" max="2030" />
            </div>
            {modo === 'semestre' && (
              <div style={{ flex: 1 }}>
                {lbl('Semestre')}
                <select value={semestre} onChange={e => setSem(e.target.value)} style={iStyle}>
                  <option value="1">1er Semestre (Ene–Jun)</option>
                  <option value="2">2do Semestre (Jul–Dic)</option>
                </select>
              </div>
            )}
            {modo === 'trimestre' && (
              <div style={{ flex: 1 }}>
                {lbl('Trimestre')}
                <select value={trimestre} onChange={e => setTrim(e.target.value)} style={iStyle}>
                  <option value="1">1er Trimestre (Ene–Mar)</option>
                  <option value="2">2do Trimestre (Abr–Jun)</option>
                  <option value="3">3er Trimestre (Jul–Sep)</option>
                  <option value="4">4to Trimestre (Oct–Dic)</option>
                </select>
              </div>
            )}
          </div>
        )}
        {modo === 'fechas' && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>{lbl('Desde')}<input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={iStyle} /></div>
            <div style={{ flex: 1 }}>{lbl('Hasta')}<input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={iStyle} /></div>
          </div>
        )}

        {/* Título opcional */}
        <div>
          {lbl('Título (opcional)')}
          <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder={`ENAJENACIONES DEL H. AYUNTAMIENTO DE NOGALES ${calcRango().lbl}`} style={iStyle} />
        </div>

        {/* Botones */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button onClick={() => generar('excel')} disabled={!!generando}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', padding: '11px', borderRadius: '9px', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', cursor: generando ? 'not-allowed' : 'pointer', background: dark ? 'rgba(168,230,207,0.18)' : 'rgba(30,126,74,0.08)', border: dark ? '1px solid rgba(168,230,207,0.35)' : '1px solid rgba(30,126,74,0.35)', color: dark ? '#a8e6cf' : '#15803d' }}>
            {generando === 'excel' ? <i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite' }} /> : <i className="ti ti-file-spreadsheet" style={{ fontSize: '16px' }} />}Excel
          </button>
          <button onClick={() => generar('pdf')} disabled={!!generando}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', padding: '11px', borderRadius: '9px', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', cursor: generando ? 'not-allowed' : 'pointer', background: dark ? 'rgba(244,161,161,0.15)' : 'rgba(192,57,43,0.07)', border: dark ? '1px solid rgba(244,161,161,0.35)' : '1px solid rgba(192,57,43,0.3)', color: dark ? '#f4a1a1' : '#c0392b' }}>
            {generando === 'pdf' ? <i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite' }} /> : <i className="ti ti-file-type-pdf" style={{ fontSize: '16px' }} />}PDF
          </button>
        </div>
      </div>
    </div>
  </>, document.body)
}
