import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import Sidebar from '../components/Sidebar'
import { useTheme } from '../context/ThemeContext'
import { barraSticky, btnBarra, sStyle } from './BienesMuebles'
import { fetchBienesPorEstado, actualizarEstadoBienes, PanelConsulta, ModalBaja, exportarExcelMuebles, exportarPDFMuebles, getFechasBajas, setFechaBaja, hoyISO, GroupedAreaSelector, fetchAreas, areasConConteo, colsReporte, COLS_BIENES, COLS_ALTAS, fetchPorFechaFactura, contarPorFechaFactura, fetchTodosMuebles, fetchBienesConAlta, valorMueble, ModalAdquisicionesMuebles } from './BienesMuebles'
import { guardarPreferencia, metadataUsuario } from '../auth'

// Los reportes personalizados se guardan en la CUENTA del usuario (user_metadata
// de Supabase) para que lo sigan en cualquier dispositivo; localStorage queda
// solo como caché local para que la vista cargue al instante.
const LS_RP = 'reportes_personalizados'
function getReportes() { try { return JSON.parse(localStorage.getItem(LS_RP) || '[]') } catch { return [] } }
function saveReportes(arr) {
  try { localStorage.setItem(LS_RP, JSON.stringify(arr)) } catch { /* noop */ }
  guardarPreferencia('reportes_personalizados', arr)
}
const MODOS_RP = [
  { id: 'mobiliario', label: 'Mobiliario' }, { id: 'computo', label: 'Cómputo' }, { id: 'maquinaria', label: 'Maquinaria' }, { id: 'vehiculos', label: 'Vehículos' }, { id: 'radiocomunicacion', label: 'Radiocomunicaciones' },
]
const labelModo = (id) => MODOS_RP.find(m => m.id === id)?.label || id

// Modal para crear/editar una configuración de reporte
function ModalConfigReporte({ config, allAreas, onClose, onGuardar, dark, t }) {
  const [titulo, setTitulo] = useState(config?.titulo || '')
  const [modos, setModos] = useState(() => new Set(config?.modos || (config?.modo ? [config.modo] : ['mobiliario'])))
  const modoCols = modos.size === 1 ? [...modos][0] : 'mobiliario'
  const COLS = colsReporte(modoCols)
  const [colsSel, setColsSel] = useState(() => new Set(config?.cols || COLS.map(c => c.key)))
  const [areasSelec, setAreasSelec] = useState(config?.areaIds || [])
  function toggleCol(k) { setColsSel(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n }) }
  function toggleModo(m) {
    const n = new Set(modos)
    n.has(m) ? n.delete(m) : n.add(m)
    if (n.size === 0) return                       // siempre al menos un tipo
    setModos(n)
    const nm = n.size === 1 ? [...n][0] : 'mobiliario'
    setColsSel(new Set(colsReporte(nm).map(c => c.key)))   // recalcula columnas disponibles
  }
  function guardar() {
    if (!titulo.trim()) return
    onGuardar({ id: config?.id || Date.now(), titulo: titulo.trim(), modos: [...modos], cols: COLS.filter(c => colsSel.has(c.key)).map(c => c.key), areaIds: areasSelec })
  }
  const sep = dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)'
  const lbl = { fontSize: '10px', fontWeight: 700, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }
  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} />
      <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 301, width: '600px', maxWidth: '94vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: dark ? '#1e1e20' : '#fff', borderRadius: '16px', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', animation: 'fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)', overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: sep, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <p style={{ fontSize: '15px', fontWeight: 600, color: dark ? '#fff' : '#111' }}>{config ? 'Editar reporte' : 'Nuevo reporte personalizado'}</p>
          <button onClick={onClose} style={{ width: '30px', height: '30px', borderRadius: '7px', background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: dark ? '#ccc' : '#555' }}><i className="ti ti-x" style={{ fontSize: '15px' }} /></button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div><p style={lbl}>Título del reporte</p><input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ej. Mobiliario Tesorería" style={{ width: '100%', padding: '9px 13px', borderRadius: '9px', outline: 'none', fontFamily: 'inherit', fontSize: '13px', background: dark ? '#2a2a2c' : '#fff', border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.18)', color: dark ? '#f0f0f0' : '#111', boxSizing: 'border-box' }} /></div>
          <div><p style={lbl}>Tipos de bien <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(puedes elegir varios)</span></p>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: '12px', padding: '5px' }}>
              {MODOS_RP.map(m => {
                const on = modos.has(m.id)
                return (
                  <button key={m.id} onClick={() => toggleModo(m.id)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '9px', fontSize: '13px', fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', background: on ? (dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)') : 'transparent', border: on ? `1px solid ${t.cardBorder}` : '1px solid transparent', color: on ? t.text1 : t.text3 }}>
                    {on && <i className="ti ti-check" style={{ fontSize: '13px' }} />}{m.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div><p style={lbl}>Dependencias</p><GroupedAreaSelector areas={allAreas} selected={areasSelec} onChange={setAreasSelec} dark={dark} /></div>
          <div>
            <p style={lbl}>Columnas ({colsSel.size}/{COLS.length})</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {COLS.map(c => {
                const s = colsSel.has(c.key)
                return (
                  <div key={c.key} onClick={() => toggleCol(c.key)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '8px', cursor: 'pointer', border: `1px solid ${s ? (dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)') : (dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)')}`, background: s ? (dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)') : 'transparent' }}>
                    <div style={{ width: '17px', height: '17px', borderRadius: '5px', flexShrink: 0, background: s ? (dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.78)') : 'transparent', border: dark ? '1.5px solid rgba(255,255,255,0.4)' : '1.5px solid rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s && <i className="ti ti-check" style={{ fontSize: '11px', color: dark ? '#1c1c1e' : '#fff' }} />}</div>
                    <span style={{ fontSize: '13px', color: dark ? '#f0f0f0' : '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.m}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        <div style={{ flexShrink: 0, padding: '1rem 1.5rem', borderTop: sep, display: 'flex', gap: '8px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: '9px', background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)', border: dark ? '1px solid rgba(255,255,255,0.13)' : '1px solid rgba(0,0,0,0.09)', fontSize: '14px', fontWeight: 500, color: dark ? '#ccc' : '#444', fontFamily: 'inherit', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={guardar} disabled={!titulo.trim() || colsSel.size === 0} style={{ flex: 1, padding: '10px', borderRadius: '9px', background: dark ? 'rgba(168,230,207,0.18)' : 'rgba(30,126,74,0.08)', border: dark ? '1px solid rgba(168,230,207,0.35)' : '1px solid rgba(30,126,74,0.35)', fontSize: '14px', fontWeight: 600, color: dark ? '#a8e6cf' : '#15803d', fontFamily: 'inherit', cursor: 'pointer' }}>Guardar</button>
        </div>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translate(-50%,-48%) scale(0.98)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}} @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </>,
    document.body
  )
}

// Modal de previsualización + descarga
function ModalPreviewReporte({ config, onClose, dark, t }) {
  const [rows, setRows] = useState(null)
  const [generando, setGenerando] = useState(null)
  const modos = config.modos || [config.modo]
  const COLS = colsReporte(modos.length === 1 ? modos[0] : 'mobiliario')
  const cols = COLS.filter(c => config.cols.includes(c.key))
  useEffect(() => {
    (async () => {
      try {
        const partes = await Promise.all(modos.map(m => fetchTodosMuebles({ modo: m, busqueda: '', filtroBien: '', filtroEstado: 'Todos', filtroAreaIds: config.areaIds || [] })))
        const vistos = new Set(), todo = []
        for (const p of partes) for (const b of p) if (!vistos.has(b.idbien)) { vistos.add(b.idbien); todo.push(b) }
        setRows(todo)
      } catch { setRows([]) }
    })()
  }, [config])
  async function generar(formato) {
    if (!rows) return
    setGenerando(formato)
    try {
      if (formato === 'excel') await exportarExcelMuebles(rows, cols, config.titulo)
      else                     await exportarPDFMuebles(rows, cols, config.titulo)
      onClose()
    } catch (e) { console.error(e); setGenerando(null) }
  }
  const sep = dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)'
  const th = { padding: '8px 9px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)', textTransform: 'uppercase', whiteSpace: 'nowrap', background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderBottom: sep }
  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} />
      <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 301, width: '900px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: dark ? '#1e1e20' : '#fff', borderRadius: '16px', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', animation: 'fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)', overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: sep, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <p style={{ fontSize: '15px', fontWeight: 600, color: dark ? '#fff' : '#111' }}>{config.titulo}</p>
            <p style={{ fontSize: '12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>Vista previa · {rows == null ? 'Cargando…' : `${rows.length.toLocaleString()} registros`}</p>
          </div>
          <button onClick={onClose} style={{ width: '30px', height: '30px', borderRadius: '7px', background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: dark ? '#ccc' : '#555' }}><i className="ti ti-x" style={{ fontSize: '15px' }} /></button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead><tr>{cols.map(c => <th key={c.key} style={th}>{c.label}</th>)}</tr></thead>
            <tbody>
              {rows == null
                ? <tr><td colSpan={cols.length} style={{ padding: '2rem', textAlign: 'center', color: t.text4 }}>Cargando…</td></tr>
                : rows.slice(0, 30).map((b, i) => (
                    <tr key={i} style={{ borderBottom: sep, background: i % 2 !== 0 ? (dark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.015)') : 'transparent' }}>
                      {cols.map(c => <td key={c.key} style={{ padding: '8px 9px', color: t.text2, verticalAlign: 'top', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{valorMueble(c, b)}</td>)}
                    </tr>
                  ))
              }
            </tbody>
          </table>
          {rows && rows.length > 30 && <p style={{ padding: '10px 14px', fontSize: '12px', color: t.text4 }}>Mostrando 30 de {rows.length.toLocaleString()} · el reporte incluye todos.</p>}
        </div>
        <div style={{ flexShrink: 0, padding: '1rem 1.5rem', borderTop: sep, display: 'flex', gap: '8px' }}>
          <button onClick={() => generar('excel')} disabled={generando || !rows} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', padding: '11px', borderRadius: '9px', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', cursor: generando || !rows ? 'not-allowed' : 'pointer', background: dark ? 'rgba(168,230,207,0.18)' : 'rgba(30,126,74,0.08)', border: dark ? '1px solid rgba(168,230,207,0.35)' : '1px solid rgba(30,126,74,0.35)', color: dark ? '#a8e6cf' : '#15803d' }}>{generando === 'excel' ? <><i className="ti ti-loader-2" style={{ fontSize: '15px', animation: 'spin 1s linear infinite' }} />Generando…</> : <><i className="ti ti-file-spreadsheet" style={{ fontSize: '16px' }} />Excel</>}</button>
          <button onClick={() => generar('pdf')} disabled={generando || !rows} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', padding: '11px', borderRadius: '9px', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', cursor: generando || !rows ? 'not-allowed' : 'pointer', background: dark ? 'rgba(244,161,161,0.15)' : 'rgba(192,57,43,0.07)', border: dark ? '1px solid rgba(244,161,161,0.35)' : '1px solid rgba(192,57,43,0.3)', color: dark ? '#f4a1a1' : '#c0392b' }}>{generando === 'pdf' ? <><i className="ti ti-loader-2" style={{ fontSize: '15px', animation: 'spin 1s linear infinite' }} />Generando…</> : <><i className="ti ti-file-type-pdf" style={{ fontSize: '16px' }} />PDF</>}</button>
        </div>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translate(-50%,-48%) scale(0.98)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}} @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </>,
    document.body
  )
}

function fmtFecha(iso) {
  if (!iso) return '—'
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']
function mesAnioActual() { const d = new Date(); return `${MESES[d.getMonth()]} ${d.getFullYear()}` }

// Columnas del reporte de bajas (incluye NÚMERO DE OFICIO vacío al final)
const COLS_BAJAS = [
  { key: 'claveinventario', label: 'CLAVE DE INVENTARIO', m: 'Clave de inventario', w: 16, noWrap: true },
  { key: 'nombrebien',  label: 'NOMBRE DEL BIEN', m: 'Nombre del bien', w: 34, grupo: 'DESCRIPCIÓN' },
  { key: 'marca',       label: 'MARCA',           m: 'Marca',           w: 16, grupo: 'DESCRIPCIÓN' },
  { key: 'tipo',        label: 'TIPO / MODELO',   m: 'Tipo / Modelo',   w: 18, grupo: 'DESCRIPCIÓN' },
  { key: 'serie',       label: 'SERIE',           m: 'Serie',           w: 20, grupo: 'DESCRIPCIÓN' },
  { key: 'area',         label: 'ÁREA DE ADSCRIPCIÓN',   m: 'Área de adscripción',   w: 30 },
  { key: 'valorfactura', label: 'VALOR FACTURA / AVALÚO', m: 'Valor factura / avalúo', w: 18 },
  { key: 'numerofactura', label: 'FACTURA / AVALÚO',      m: 'Factura / avalúo',       w: 18 },
  { key: 'numero_oficio', label: 'NÚMERO DE OFICIO',      m: 'Número de oficio',       w: 22 },
]

function thBase(dark) {
  return { padding: '9px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', verticalAlign: 'middle', background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }
}
function tdBase() { return { padding: '10px 10px', verticalAlign: 'top' } }
function iStyle(dark) {
  return { padding: '9px 12px', borderRadius: '9px', outline: 'none', width: 'auto', fontFamily: 'inherit', fontSize: '14px', background: dark ? '#2a2a2c' : '#ffffff', border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.18)', color: dark ? '#f0f0f0' : '#111111', colorScheme: dark ? 'dark' : 'light' }
}
function searchBoxStyle(dark) {
  return { display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 13px', borderRadius: '9px', background: dark ? '#2a2a2c' : '#ffffff', border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.18)' }
}
function fmt(n) { return n ? '$ ' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '$ —' }

function ModalReporteBajas({ onClose, dark, t, datos, seleccionados, tituloInicial }) {
  const haySel = seleccionados.length > 0
  const [colsSel, setColsSel] = useState(() => new Set(COLS_BAJAS.map(c => c.key)))
  const [alcance, setAlcance] = useState(haySel ? 'seleccion' : 'todos')
  const [titulo, setTitulo]   = useState(tituloInicial || '')
  const [generando, setGenerando] = useState(null)
  const [err, setErr] = useState(null)

  function toggleCol(key) { setColsSel(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n }) }
  const todasCols = colsSel.size === COLS_BAJAS.length
  function toggleTodas() { setColsSel(todasCols ? new Set() : new Set(COLS_BAJAS.map(c => c.key))) }

  const selSet = new Set(seleccionados)
  const totalSel = seleccionados.length
  const totalTodos = datos.length
  const conteoAlcance = alcance === 'seleccion' ? totalSel : totalTodos

  async function generar(formato) {
    if (colsSel.size === 0) { setErr('Selecciona al menos una columna'); return }
    setGenerando(formato); setErr(null)
    try {
      const rows = alcance === 'seleccion' ? datos.filter(d => selSet.has(d.idbien)) : datos
      if (!rows.length) { setErr('No hay registros para el reporte'); setGenerando(null); return }
      const cols = COLS_BAJAS.filter(c => colsSel.has(c.key))
      const tit = titulo.trim()
      if (formato === 'excel') await exportarExcelMuebles(rows, cols, tit)
      else                     await exportarPDFMuebles(rows, cols, tit)
      onClose()
    } catch (e) { setErr(e.message) } finally { setGenerando(null) }
  }

  const sepBorder = dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)'

  return createPortal(
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,0.4)', backdropFilter:'blur(4px)' }} />
      <div onClick={e => e.stopPropagation()} style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:301, width:'560px', maxWidth:'94vw', maxHeight:'92vh', display:'flex', flexDirection:'column', background: dark ? '#1e1e20' : '#fff', borderRadius:'16px', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', boxShadow:'0 20px 60px rgba(0,0,0,0.4)', animation:'fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)', overflow:'hidden' }}>

        <div style={{ padding:'1.25rem 1.5rem', borderBottom: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <div style={{ width:'34px', height:'34px', borderRadius:'9px', background: dark ? 'rgba(168,230,207,0.15)' : 'rgba(30,126,74,0.08)', border: dark ? '1px solid rgba(168,230,207,0.3)' : '1px solid rgba(30,126,74,0.2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <i className="ti ti-file-export" style={{ fontSize:'18px', color: dark ? '#a8e6cf' : '#1e7e4a' }} />
            </div>
            <div>
              <p style={{ fontSize:'15px', fontWeight:600, color: dark ? '#fff' : '#111' }}>Generar Reporte</p>
              <p style={{ fontSize:'12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>Elige columnas y formato</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width:'30px', height:'30px', borderRadius:'7px', background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color: dark ? '#ccc' : '#555' }}>
            <i className="ti ti-x" style={{ fontSize:'15px' }} />
          </button>
        </div>

        <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:'1.25rem 1.5rem', display:'flex', flexDirection:'column', gap:'1.25rem' }}>
          {/* Título */}
          <div>
            <p style={{ fontSize:'10px', fontWeight:700, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'8px' }}>Título del documento <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0 }}>(opcional)</span></p>
            <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder={tituloInicial}
              style={{ width:'100%', padding:'9px 13px', borderRadius:'9px', outline:'none', fontFamily:'inherit', fontSize:'13px', background: dark ? '#2a2a2c' : '#fff', border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.18)', color: dark ? '#f0f0f0' : '#111', boxSizing:'border-box' }} />
            <p style={{ fontSize:'11px', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)', marginTop:'6px' }}>Si lo dejas vacío, el documento se genera sin título.</p>
          </div>

          {/* Registros */}
          <div>
            <p style={{ fontSize:'10px', fontWeight:700, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'8px' }}>Registros a incluir</p>
            <div style={{ display:'flex', gap:'5px', background: t.cardBg, border:`1px solid ${t.cardBorder}`, borderRadius:'12px', padding:'5px', backdropFilter:'blur(10px)' }}>
              <button onClick={() => haySel && setAlcance('seleccion')} disabled={!haySel}
                style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'8px', padding:'8px 12px', borderRadius:'9px', fontSize:'13px', fontWeight:500, fontFamily:'inherit', cursor: haySel ? 'pointer' : 'not-allowed', opacity: haySel ? 1 : 0.4, transition:'all 0.15s', background: alcance === 'seleccion' ? (dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)') : 'transparent', border: alcance === 'seleccion' ? `1px solid ${t.cardBorder}` : '1px solid transparent', color: alcance === 'seleccion' ? t.text1 : t.text3 }}>
                <i className="ti ti-square-check" style={{ fontSize:'16px' }} />{totalSel} seleccionado{totalSel !== 1 ? 's' : ''}
              </button>
              <button onClick={() => setAlcance('todos')}
                style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'8px', padding:'8px 12px', borderRadius:'9px', fontSize:'13px', fontWeight:500, fontFamily:'inherit', cursor:'pointer', transition:'all 0.15s', background: alcance === 'todos' ? (dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)') : 'transparent', border: alcance === 'todos' ? `1px solid ${t.cardBorder}` : '1px solid transparent', color: alcance === 'todos' ? t.text1 : t.text3 }}>
                <i className="ti ti-list" style={{ fontSize:'16px' }} />Todos ({totalTodos.toLocaleString()})
              </button>
            </div>
          </div>

          {/* Columnas */}
          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
              <p style={{ fontSize:'10px', fontWeight:700, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Columnas ({colsSel.size}/{COLS_BAJAS.length})</p>
              <button onClick={toggleTodas} style={{ background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:'12px', color: dark ? '#f0f0f0' : '#000', fontWeight:500 }}>{todasCols ? 'Quitar todas' : 'Todas'}</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px' }}>
              {COLS_BAJAS.map(c => {
                const sel = colsSel.has(c.key)
                return (
                  <div key={c.key} onClick={() => toggleCol(c.key)} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'9px 11px', borderRadius:'8px', cursor:'pointer', border:`1px solid ${sel ? (dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)') : (dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)')}`, background: sel ? (dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)') : 'transparent', transition:'all 0.12s' }}>
                    <div style={{ width:'17px', height:'17px', borderRadius:'5px', flexShrink:0, background: sel ? (dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.78)') : 'transparent', border: dark ? '1.5px solid rgba(255,255,255,0.4)' : '1.5px solid rgba(0,0,0,0.3)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {sel && <i className="ti ti-check" style={{ fontSize:'11px', color: dark ? '#1c1c1e' : '#fff' }} />}
                    </div>
                    <span style={{ fontSize:'13px', color: dark ? '#f0f0f0' : '#111', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.m}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div style={{ flexShrink:0, padding:'1rem 1.5rem', borderTop: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)' }}>
          {err && <p style={{ fontSize:'12px', color: dark ? '#f4a1a1' : '#c0392b', marginBottom:'10px' }}><i className="ti ti-alert-circle" style={{ marginRight:'5px' }} />{err}</p>}
          <div style={{ display:'flex', gap:'8px' }}>
            <button onClick={() => generar('excel')} disabled={generando || conteoAlcance === 0}
              style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'7px', padding:'11px', borderRadius:'9px', fontSize:'14px', fontWeight:600, fontFamily:'inherit', cursor: generando || conteoAlcance === 0 ? 'not-allowed' : 'pointer', opacity: conteoAlcance === 0 ? 0.5 : 1, background: dark ? 'rgba(168,230,207,0.18)' : 'rgba(30,126,74,0.08)', border: dark ? '1px solid rgba(168,230,207,0.35)' : '1px solid rgba(30,126,74,0.35)', color: dark ? '#a8e6cf' : '#15803d' }}>
              {generando === 'excel' ? <><i className="ti ti-loader-2" style={{ fontSize:'15px', animation:'spin 1s linear infinite' }} />Generando…</> : <><i className="ti ti-file-spreadsheet" style={{ fontSize:'16px' }} />Excel</>}
            </button>
            <button onClick={() => generar('pdf')} disabled={generando || conteoAlcance === 0}
              style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'7px', padding:'11px', borderRadius:'9px', fontSize:'14px', fontWeight:600, fontFamily:'inherit', cursor: generando || conteoAlcance === 0 ? 'not-allowed' : 'pointer', opacity: conteoAlcance === 0 ? 0.5 : 1, background: dark ? 'rgba(244,161,161,0.15)' : 'rgba(192,57,43,0.07)', border: dark ? '1px solid rgba(244,161,161,0.35)' : '1px solid rgba(192,57,43,0.3)', color: dark ? '#f4a1a1' : '#c0392b' }}>
              {generando === 'pdf' ? <><i className="ti ti-loader-2" style={{ fontSize:'15px', animation:'spin 1s linear infinite' }} />Generando…</> : <><i className="ti ti-file-type-pdf" style={{ fontSize:'16px' }} />PDF</>}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translate(-50%,-48%) scale(0.98)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}} @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </>,
    document.body
  )
}

function rangoPeriodo(tipo) {
  const hasta = new Date()
  const desde = new Date()
  if (tipo === 'mensual')    desde.setMonth(desde.getMonth() - 1)
  if (tipo === 'trimestral') desde.setMonth(desde.getMonth() - 3)
  if (tipo === 'anual')      desde.setFullYear(desde.getFullYear() - 1)
  // El reporte de bienes se entrega por ejercicio, arranca el 1 de enero
  if (tipo === 'bienes')     desde.setMonth(0, 1)
  const iso = d => d.toISOString().slice(0, 10)
  return { desde: iso(desde), hasta: iso(hasta) }
}

// Deja seguidos los bienes que se compraron con la misma factura. Solo cambia el
// orden de los renglones: no agrupa, no resume y no quita ninguno.
function ordenarPorFactura(rows) {
  const fecha = b => /^\d{4}-\d{2}-\d{2}$/.test(b.fechafactura || '') ? b.fechafactura : '9999'
  return [...rows].sort((a, b) => {
    if (fecha(a) !== fecha(b)) return fecha(a) < fecha(b) ? -1 : 1
    const na = String(a.numerofactura || ''), nb = String(b.numerofactura || '')
    if (na !== nb) return na.localeCompare(nb, 'es', { numeric: true })
    return String(a.claveinventario || '').localeCompare(String(b.claveinventario || ''), 'es', { numeric: true })
  })
}

// ── Reporte mensual de ALTAS ──────────────────────────────────────────────────
// Va por fecha de alta, no por fecha de factura. Esa fecha no vive en una
// columna: se lee del texto de observaciones, que es donde Oficialía la escribe
// ("ALTA POR OFICIO OM/436/2025 10-JUNIO-2025"). Por eso el modal avisa cuántos
// bienes del mes no traen esa fecha y quedarían fuera.
function ModalReporteAltas({ allAreas, onClose, dark, t }) {
  const hoy = new Date()
  const [mes, setMes] = useState(`${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`)
  const [areasSelec, setAreasSelec] = useState([])
  const [titulo, setTitulo] = useState('')
  const [generando, setGenerando] = useState(null)
  const [err, setErr] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [todas, setTodas] = useState([])

  useEffect(() => {
    let vivo = true
    setCargando(true)
    fetchBienesConAlta({})
      .then(d => { if (vivo) setTodas(d) })
      .catch(e => { if (vivo) setErr(e.message) })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [])

  const delMes = useMemo(() => {
    const enArea = areasSelec.length ? todas.filter(b => areasSelec.includes(b.idarea)) : todas
    return enArea.filter(b => b.fechaalta && b.fechaalta.slice(0, 7) === mes)
      .sort((a, b) => (a.fechaalta || '').localeCompare(b.fechaalta || '') ||
        String(a.claveinventario || '').localeCompare(String(b.claveinventario || ''), 'es', { numeric: true }))
  }, [todas, mes, areasSelec])

  const importeMes = delMes.reduce((s, b) => s + (Number(b.costoinicial) || 0), 0)
  const nombreMes = (() => {
    const [a, m] = mes.split('-')
    return `${MESES[Number(m) - 1] || ''} ${a}`.toUpperCase()
  })()

  useEffect(() => { setTitulo(`REPORTE MENSUAL DE ALTAS BIENES MUEBLES ${nombreMes}`) }, [nombreMes])

  async function generar(formato) {
    setGenerando(formato); setErr(null)
    try {
      if (!delMes.length) { setErr('No hay altas registradas en ese mes'); setGenerando(null); return }
      const rows = delMes.map((b, i) => ({ ...b, no: i + 1 }))
      if (formato === 'excel') await exportarExcelMuebles(rows, COLS_ALTAS, titulo.trim())
      else                     await exportarPDFMuebles(rows, COLS_ALTAS, titulo.trim())
      onClose()
    } catch (e) { setErr(e.message) } finally { setGenerando(null) }
  }

  const inputStyle = { width:'100%', padding:'9px 12px', borderRadius:'9px', outline:'none', fontFamily:'inherit', fontSize:'14px', background: dark ? '#2a2a2c' : '#fff', border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.18)', color: dark ? '#f0f0f0' : '#111', colorScheme: dark ? 'dark' : 'light', boxSizing:'border-box' }
  const lbl = { fontSize:'10px', fontWeight:700, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'6px' }

  return createPortal(
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,0.4)', backdropFilter:'blur(4px)' }} />
      <div onClick={e => e.stopPropagation()} style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:301, width:'540px', maxWidth:'94vw', maxHeight:'92vh', display:'flex', flexDirection:'column', background: dark ? '#1e1e20' : '#fff', borderRadius:'16px', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', boxShadow:'0 20px 60px rgba(0,0,0,0.4)', animation:'fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)', overflow:'visible' }}>
        <div style={{ padding:'1.25rem 1.5rem', borderBottom: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <div style={{ width:'34px', height:'34px', borderRadius:'9px', background: t.iconBox, border:`1px solid ${t.iconBoxBorder}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <i className="ti ti-calendar-plus" style={{ fontSize:'18px', color: t.text1 }} />
            </div>
            <div>
              <p style={{ fontSize:'15px', fontWeight:600, color: dark ? '#fff' : '#111' }}>Reporte mensual de altas</p>
              <p style={{ fontSize:'12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>Por fecha de alta, no por fecha de factura</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width:'30px', height:'30px', borderRadius:'7px', background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color: dark ? '#ccc' : '#555' }}>
            <i className="ti ti-x" style={{ fontSize:'15px' }} />
          </button>
        </div>
        <div style={{ padding:'1.25rem 1.5rem', display:'flex', flexDirection:'column', gap:'1rem' }}>
          <div><p style={lbl}>Mes</p><input type="month" value={mes} onChange={e => setMes(e.target.value)} style={inputStyle} /></div>
          <div><p style={lbl}>Dependencias</p><GroupedAreaSelector areas={allAreas} selected={areasSelec} onChange={setAreasSelec} dark={dark} /></div>
          <div><p style={lbl}>Título del documento</p><input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} style={inputStyle} /></div>

          {/* El recuadro aparece hasta que hay algo que decir; mientras carga no
              se muestra nada. Los botones ya quedan deshabilitados en ese rato. */}
          {!cargando && (
            <div style={{ padding:'11px 13px', borderRadius:'10px', background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', border:`1px solid ${t.cardBorder}` }}>
              <p style={{ fontSize:'13px', color:t.text1, fontWeight:600 }}>
                {delMes.length} {delMes.length === 1 ? 'alta' : 'altas'} en {nombreMes}
              </p>
              {delMes.length > 0 && <p style={{ fontSize:'12px', color:t.text3, marginTop:'3px' }}>
                Importe: {fmt(importeMes)}
              </p>}
            </div>
          )}
          {err && <p style={{ fontSize:'12px', color: dark ? '#f4a1a1' : '#c0392b' }}><i className="ti ti-alert-circle" style={{ marginRight:'5px' }} />{err}</p>}
        </div>
        <div style={{ padding:'0 1.5rem 1.25rem', display:'flex', gap:'8px' }}>
          <button onClick={() => generar('excel')} disabled={generando || cargando}
            style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'7px', padding:'11px', borderRadius:'9px', fontSize:'14px', fontWeight:600, fontFamily:'inherit', cursor: (generando || cargando) ? 'not-allowed' : 'pointer', opacity: cargando ? 0.5 : 1, background: dark ? 'rgba(168,230,207,0.18)' : 'rgba(30,126,74,0.08)', border: dark ? '1px solid rgba(168,230,207,0.35)' : '1px solid rgba(30,126,74,0.35)', color: dark ? '#a8e6cf' : '#15803d' }}>
            {generando === 'excel' ? <><i className="ti ti-loader-2" style={{ fontSize:'15px', animation:'spin 1s linear infinite' }} />Generando…</> : <><i className="ti ti-file-spreadsheet" style={{ fontSize:'16px' }} />Excel</>}
          </button>
          <button onClick={() => generar('pdf')} disabled={generando || cargando}
            style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'7px', padding:'11px', borderRadius:'9px', fontSize:'14px', fontWeight:600, fontFamily:'inherit', cursor: (generando || cargando) ? 'not-allowed' : 'pointer', opacity: cargando ? 0.5 : 1, background: dark ? 'rgba(244,161,161,0.15)' : 'rgba(192,57,43,0.07)', border: dark ? '1px solid rgba(244,161,161,0.35)' : '1px solid rgba(192,57,43,0.3)', color: dark ? '#f4a1a1' : '#c0392b' }}>
            {generando === 'pdf' ? <><i className="ti ti-loader-2" style={{ fontSize:'15px', animation:'spin 1s linear infinite' }} />Generando…</> : <><i className="ti ti-file-type-pdf" style={{ fontSize:'16px' }} />PDF</>}
          </button>
        </div>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translate(-50%,-48%) scale(0.98)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}} @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </>,
    document.body
  )
}

function ModalReportePeriodo({ tipo, allAreas, onClose, dark, t }) {
  const r0 = rangoPeriodo(tipo)
  const [desde, setDesde] = useState(r0.desde)
  const [hasta, setHasta] = useState(r0.hasta)
  const [areasSelec, setAreasSelec] = useState([])
  const etiqueta = { mensual: 'MENSUAL', trimestral: 'TRIMESTRAL', anual: 'ANUAL', bienes: 'BIENES' }[tipo]
  const [titulo, setTitulo] = useState(`REPORTE ${etiqueta} BIENES MUEBLES ${mesAnioActual()}`)
  const [generando, setGenerando] = useState(null)
  const [err, setErr] = useState(null)

  async function generar(formato) {
    setGenerando(formato); setErr(null)
    try {
      let rows = ordenarPorFactura(await fetchPorFechaFactura({ desde, hasta, areaIds: areasSelec }))
      if (!rows.length) { setErr('No hay registros en ese rango de fechas'); setGenerando(null); return }
      // El reporte de bienes lleva sus propias columnas y numeración corrida
      const esBienes = tipo === 'bienes'
      if (esBienes) rows = rows.map((b, i) => ({ ...b, no: i + 1 }))
      const cols = esBienes ? COLS_BIENES : colsReporte('mobiliario')
      if (formato === 'excel') await exportarExcelMuebles(rows, cols, titulo.trim())
      else                     await exportarPDFMuebles(rows, cols, titulo.trim())
      onClose()
    } catch (e) { setErr(e.message) } finally { setGenerando(null) }
  }

  const inputStyle = { width:'100%', padding:'9px 12px', borderRadius:'9px', outline:'none', fontFamily:'inherit', fontSize:'14px', background: dark ? '#2a2a2c' : '#fff', border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.18)', color: dark ? '#f0f0f0' : '#111', colorScheme: dark ? 'dark' : 'light', boxSizing:'border-box' }
  const lbl = { fontSize:'10px', fontWeight:700, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'6px' }

  return createPortal(
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,0.4)', backdropFilter:'blur(4px)' }} />
      <div onClick={e => e.stopPropagation()} style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:301, width:'520px', maxWidth:'94vw', maxHeight:'92vh', display:'flex', flexDirection:'column', background: dark ? '#1e1e20' : '#fff', borderRadius:'16px', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', boxShadow:'0 20px 60px rgba(0,0,0,0.4)', animation:'fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)', overflow:'visible' }}>
        <div style={{ padding:'1.25rem 1.5rem', borderBottom: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <div style={{ width:'34px', height:'34px', borderRadius:'9px', background: t.iconBox, border:`1px solid ${t.iconBoxBorder}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <i className="ti ti-calendar-stats" style={{ fontSize:'18px', color: t.text1 }} />
            </div>
            <div>
              <p style={{ fontSize:'15px', fontWeight:600, color: dark ? '#fff' : '#111' }}>Reporte {etiqueta.toLowerCase()}</p>
              <p style={{ fontSize:'12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>Filtrado por fecha de factura</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width:'30px', height:'30px', borderRadius:'7px', background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color: dark ? '#ccc' : '#555' }}>
            <i className="ti ti-x" style={{ fontSize:'15px' }} />
          </button>
        </div>
        <div style={{ padding:'1.25rem 1.5rem', display:'flex', flexDirection:'column', gap:'1rem' }}>
          <div style={{ display:'flex', gap:'10px' }}>
            <div style={{ flex:1 }}><p style={lbl}>Desde</p><input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={inputStyle} /></div>
            <div style={{ flex:1 }}><p style={lbl}>Hasta</p><input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={inputStyle} /></div>
          </div>
          <div><p style={lbl}>Dependencias</p><GroupedAreaSelector areas={allAreas} selected={areasSelec} onChange={setAreasSelec} dark={dark} /></div>
          <div><p style={lbl}>Título del documento</p><input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} style={inputStyle} /></div>
          {err && <p style={{ fontSize:'12px', color: dark ? '#f4a1a1' : '#c0392b' }}><i className="ti ti-alert-circle" style={{ marginRight:'5px' }} />{err}</p>}
        </div>
        <div style={{ padding:'0 1.5rem 1.25rem', display:'flex', gap:'8px' }}>
          <button onClick={() => generar('excel')} disabled={generando}
            style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'7px', padding:'11px', borderRadius:'9px', fontSize:'14px', fontWeight:600, fontFamily:'inherit', cursor: generando ? 'not-allowed' : 'pointer', background: dark ? 'rgba(168,230,207,0.18)' : 'rgba(30,126,74,0.08)', border: dark ? '1px solid rgba(168,230,207,0.35)' : '1px solid rgba(30,126,74,0.35)', color: dark ? '#a8e6cf' : '#15803d' }}>
            {generando === 'excel' ? <><i className="ti ti-loader-2" style={{ fontSize:'15px', animation:'spin 1s linear infinite' }} />Generando…</> : <><i className="ti ti-file-spreadsheet" style={{ fontSize:'16px' }} />Excel</>}
          </button>
          <button onClick={() => generar('pdf')} disabled={generando}
            style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'7px', padding:'11px', borderRadius:'9px', fontSize:'14px', fontWeight:600, fontFamily:'inherit', cursor: generando ? 'not-allowed' : 'pointer', background: dark ? 'rgba(244,161,161,0.15)' : 'rgba(192,57,43,0.07)', border: dark ? '1px solid rgba(244,161,161,0.35)' : '1px solid rgba(192,57,43,0.3)', color: dark ? '#f4a1a1' : '#c0392b' }}>
            {generando === 'pdf' ? <><i className="ti ti-loader-2" style={{ fontSize:'15px', animation:'spin 1s linear infinite' }} />Generando…</> : <><i className="ti ti-file-type-pdf" style={{ fontSize:'16px' }} />PDF</>}
          </button>
        </div>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translate(-50%,-48%) scale(0.98)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}} @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </>,
    document.body
  )
}

export default function Reportes({ user, onNavigate }) {
  const { dark, t, sidebarOpen } = useTheme()
  const [vista, setVista]   = useState('inicio')   // 'inicio' | 'solicitudes' | 'confirmadas'
  const [datos, setDatos]   = useState([])
  const [loading, setLoading] = useState(false)
  const [panelBien, setPanelBien] = useState(null)
  const [modalConfirmar, setModalConfirmar] = useState(null)
  const [procId, setProcId] = useState(null)
  const [busqueda, setBusqueda]   = useState('')
  const [filtroBien, setFiltroBien] = useState('')
  const [areasSelec, setAreasSelec] = useState([])
  const [allAreas, setAllAreas]   = useState([])
  const [conteos, setConteos] = useState({ solicitud: null, baja: null })
  const [fechas, setFechas]   = useState(() => getFechasBajas())
  const [pagina, setPagina]   = useState(0)
  const [porPagina, setPorPagina] = useState(20)
  const OPCIONES_POR_PAGINA = [10, 15, 20]
  const [modoSeleccion, setModoSeleccion] = useState(false)
  const [seleccionados, setSeleccionados] = useState(() => new Set())
  const [modalReporte, setModalReporte]           = useState(false)
  const [modalAdquisiciones, setModalAdquisiciones] = useState(false)
  const [modalAltas, setModalAltas] = useState(false)
  const [modalPeriodo, setModalPeriodo]             = useState(null)   // 'mensual'|'trimestral'|'anual'|null
  const [conteoPeriodo, setConteoPeriodo] = useState({ mensual: null, trimestral: null, anual: null })
  const [reportes, setReportes] = useState(() => getReportes())

  // Sincroniza los reportes con la cuenta del usuario (Supabase):
  //  - si la cuenta ya tiene reportes → son la fuente de verdad
  //  - si la cuenta no tiene pero este dispositivo sí (guardados antes de la
  //    sincronización) → se migran automáticamente a la cuenta
  useEffect(() => {
    let vivo = true
    metadataUsuario().then(m => {
      if (!vivo) return
      const cuenta = Array.isArray(m.reportes_personalizados) ? m.reportes_personalizados : null
      if (cuenta) {
        setReportes(cuenta)
        try { localStorage.setItem(LS_RP, JSON.stringify(cuenta)) } catch { /* noop */ }
      } else {
        const locales = getReportes()
        if (locales.length > 0) guardarPreferencia('reportes_personalizados', locales)
      }
    })
    return () => { vivo = false }
  }, [])
  const [modalConfig, setModalConfig] = useState(null)   // config | 'nuevo' | null
  const [modalPreview, setModalPreview] = useState(null) // config | null

  function guardarReporte(cfg) {
    setReportes(prev => { const sinEste = prev.filter(r => r.id !== cfg.id); const next = [...sinEste, cfg]; saveReportes(next); return next })
    setModalConfig(null)
  }
  function borrarReporte(id) {
    setReportes(prev => { const next = prev.filter(r => r.id !== id); saveReportes(next); return next })
  }

  const card = { background: t.cardBg, border: `1px solid ${t.cardBorder}`, backdropFilter: t.cardBlur, WebkitBackdropFilter: t.cardBlur, borderRadius: '14px', padding: '1.25rem' }
  const cardTabla = { background: t.cardBg, border: `1px solid ${t.cardBorder}`, backdropFilter: t.cardBlur, WebkitBackdropFilter: t.cardBlur, borderRadius: '14px' }
  const bg = dark ? 'linear-gradient(145deg,#111113 0%,#1c1c1e 50%,#222224 100%)' : 'linear-gradient(145deg,#e0e0e2 0%,#ebebed 50%,#e4e4e6 100%)'

  const esConfirmadas = vista === 'confirmadas'
  const estadoActual = esConfirmadas ? 'BAJA' : 'SOLICITUD BAJA'

  // El filtro de dependencias de estas listas cuenta sobre la lista misma: el
  // total del catálogo es de bienes vigentes y aquí no viene al caso. Los
  // modales de reporte siguen recibiendo el catálogo completo.
  const areasDeLista = useMemo(() => areasConConteo(allAreas, datos), [allAreas, datos])

  const cargarConteos = useCallback(async () => {
    try {
      const [sol, baj] = await Promise.all([fetchBienesPorEstado('SOLICITUD BAJA'), fetchBienesPorEstado('BAJA')])
      setConteos({ solicitud: sol.length, baja: baj.length })
    } catch { /* noop */ }
  }, [])

  useEffect(() => { cargarConteos() }, [cargarConteos])
  useEffect(() => { fetchAreas().then(setAllAreas).catch(console.error) }, [])
  useEffect(() => {
    (async () => {
      try {
        const [m, tr, a] = await Promise.all([
          contarPorFechaFactura(rangoPeriodo('mensual')),
          contarPorFechaFactura(rangoPeriodo('trimestral')),
          contarPorFechaFactura(rangoPeriodo('anual')),
        ])
        setConteoPeriodo({ mensual: m, trimestral: tr, anual: a })
      } catch { /* noop */ }
    })()
  }, [])

  const cargar = useCallback(async (estado) => {
    setLoading(true)
    try { setDatos(await fetchBienesPorEstado(estado)) }
    catch (e) { console.error(e); setDatos([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (vista === 'inicio') return
    cargar(estadoActual)
  }, [vista, estadoActual, cargar])

  async function cancelarSolicitud(b) {
    setProcId(b.idbien)
    try {
      await actualizarEstadoBienes([b.idbien], 'ACTIVO')   // regresa a inventario activo
      await cargar('SOLICITUD BAJA')
      cargarConteos()
    } catch (e) { console.error(e) }
    finally { setProcId(null) }
  }

  function toggleSeleccion(id) {
    setSeleccionados(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleModoSeleccion() {
    setModoSeleccion(m => { if (m) setSeleccionados(new Set()); return !m })
  }

  const cards = [
    { id: 'solicitudes',    icon: 'ti-circle-minus',  label: 'Solicitud de bajas',    value: conteos.solicitud, hint: 'Bienes propuestos para baja', color: t.colorYellow },
    { id: 'confirmadas',    icon: 'ti-circle-minus',  label: 'Bajas confirmadas',      value: conteos.baja,      hint: 'Bienes dados de baja',        color: t.colorRed },
  ]

  const q = busqueda.toLowerCase(), qb = filtroBien.toLowerCase()
  const areasSet = new Set(areasSelec)

  // La búsqueda cubre todas las columnas de la tabla, no solo nombre y clave.
  // Con números se acepta aproximación: "2000" también encuentra 2000.25.
  const qNum = Number(busqueda.replace(/[$,\s]/g, ''))
  const qEsNum = busqueda.trim() !== '' && Number.isFinite(qNum)
  function coincide(b) {
    if (!q) return true
    const campos = [b.nombrebien, b.claveinventario, b.marca, b.tipo, b.serie, b.area, b.numerofactura, b.observaciones, b.resguardante]
    if (campos.some(v => String(v ?? '').toLowerCase().includes(q))) return true
    if (qEsNum) {
      const c = Number(b.costoinicial)
      if (Number.isFinite(c) && c >= qNum && c < qNum + (busqueda.includes('.') ? 0.01 : 1)) return true
    }
    return false
  }

  const filtrados = datos.filter(b =>
    coincide(b) &&
    (!qb || (b.nombrebien || '').toLowerCase().includes(qb) || (b.tipo || '').toLowerCase().includes(qb) || (b.marca || '').toLowerCase().includes(qb)) &&
    (areasSelec.length === 0 || areasSet.has(b.idarea))
  )

  useEffect(() => { setPagina(0) }, [vista, busqueda, filtroBien, porPagina, areasSelec])
  const totalPag = Math.max(1, Math.ceil(filtrados.length / porPagina))
  const paginados = filtrados.slice(pagina * porPagina, (pagina + 1) * porPagina)

  const bordeIzq = dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)'
  const totalCols = 10 + (modoSeleccion ? 1 : 0)

  const idsPagina = paginados.map(d => d.idbien)
  const todosEnPag = idsPagina.length > 0 && idsPagina.every(id => seleccionados.has(id))
  const algunoEnPag = idsPagina.some(id => seleccionados.has(id))
  function toggleTodosPagina() {
    setSeleccionados(prev => {
      const n = new Set(prev)
      if (todosEnPag) idsPagina.forEach(id => n.delete(id))
      else            idsPagina.forEach(id => n.add(id))
      return n
    })
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: bg, transition: 'background 0.3s' }}>
      <Sidebar user={user} active="reportes" onNavigate={onNavigate} />

      <main style={{ flex: 1, marginLeft: sidebarOpen ? '230px' : '72px', padding: '2rem 1.25rem', overflowY: 'auto', overflowX: 'hidden', minWidth: 0, transition: 'margin-left 0.25s cubic-bezier(0.4,0,0.2,1)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
          {vista !== 'inicio' && (
            <button onClick={() => setVista('inicio')} title="Volver"
              style={{ width: '34px', height: '34px', borderRadius: '9px', background: t.cardBg, border: `1px solid ${t.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: t.text1 }}>
              <i className="ti ti-arrow-left" style={{ fontSize: '18px' }} />
            </button>
          )}
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 600, color: t.text1, marginBottom: '4px' }}>
              {vista === 'inicio' ? 'Reportes' : (esConfirmadas ? 'Bajas confirmadas' : 'Solicitud de bajas')}
            </h1>
            {vista === 'inicio'
              ? <p style={{ fontSize: '11px', fontWeight: 600, color: t.text4, textTransform: 'uppercase', letterSpacing: '0.09em' }}>GESTIÓN DE BAJAS DE BIENES MUEBLES</p>
              : <p style={{ fontSize: '14px', color: t.text3 }}>{`Bienes muebles · ${loading ? 'Cargando…' : `${filtrados.length} registros`}`}</p>
            }
          </div>
        </div>

        {vista === 'inicio' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
            {cards.map(c => (
              <button key={c.id} onClick={() => { if (c.id === 'adquisiciones') { setModalAdquisiciones(true) } else { setVista(c.id); setBusqueda(''); setFiltroBien(''); setAreasSelec([]); setModoSeleccion(false); setSeleccionados(new Set()) } }}
                style={{ ...card, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
                  <div style={{ width: '42px', height: '42px', borderRadius: '11px', flexShrink: 0, background: t.iconBox, border: `1px solid ${t.iconBoxBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className={`ti ${c.icon}`} style={{ fontSize: '22px', color: c.color }} />
                  </div>
                  <p style={{ fontSize: '15px', fontWeight: 600, color: t.text1 }}>{c.label}</p>
                </div>
                {c.id !== 'adquisiciones' && <p style={{ fontSize: '30px', fontWeight: 600, color: t.text1, lineHeight: 1, marginBottom: '6px' }}>{c.value == null ? '…' : c.value.toLocaleString()}</p>}
                <p style={{ fontSize: '12px', color: t.text4 }}>{c.hint}</p>
              </button>
            ))}

            {/* Reportes por periodo (por fecha de factura) */}
            <div style={{ gridColumn: '1 / -1', marginTop: '0.75rem' }}>
              <p style={{ fontSize: '11px', fontWeight: 600, color: t.text4, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '10px' }}>Reportes</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
                {[
                  { id: 'mensual',    icon: 'ti-file-text',    label: 'Reporte Mensual',       hint: 'Facturas del último mes',      value: conteoPeriodo.mensual,    color: t.text2 },
                  { id: 'trimestral', icon: 'ti-file-text',    label: 'Reporte Trimestral',    hint: 'Facturas de 3 meses',          value: conteoPeriodo.trimestral, color: t.text2 },
                  { id: 'anual',      icon: 'ti-file-text',    label: 'Reporte Anual',         hint: 'Facturas del último año',      value: conteoPeriodo.anual,      color: t.text2 },
                  { id: 'adquisiciones', icon: 'ti-file-invoice', label: 'Reporte Adquisiciones', hint: 'Altas por factura y capítulo', value: null,                     color: t.text2 },
                  { id: 'bienes',     icon: 'ti-list-numbers',  label: 'Reporte Bienes',        hint: 'Inventario detallado por fecha',  value: null,                  color: t.text2 },
                  // Va por fecha de alta, no por fecha de factura
                  { id: 'altas',      icon: 'ti-calendar-plus', label: 'Altas del Mes',         hint: 'Por fecha de alta, no de factura', value: null,                 color: t.text2 },
                ].map(p => (
                  <button key={p.id} onClick={() => {
                    if (p.id === 'adquisiciones') setModalAdquisiciones(true)
                    else if (p.id === 'altas')    setModalAltas(true)
                    else                          setModalPeriodo(p.id)
                  }}
                    style={{ ...card, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.75'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
                      <div style={{ width: '42px', height: '42px', borderRadius: '11px', flexShrink: 0, background: t.iconBox, border: `1px solid ${t.iconBoxBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className={`ti ${p.icon}`} style={{ fontSize: '22px', color: p.color }} />
                      </div>
                      <p style={{ fontSize: '15px', fontWeight: 600, color: t.text1 }}>{p.label}</p>
                    </div>
                    {/* Las tarjetas sin conteo reservan el mismo alto que las
                        demás, para que la fila quede pareja */}
                    <p style={{ fontSize: '30px', fontWeight: 600, lineHeight: 1, marginBottom: '6px', color: p.value !== null ? t.text1 : 'transparent' }}>
                      {p.value !== null ? (p.value == null ? '…' : p.value.toLocaleString()) : ' '}
                    </p>
                    <p style={{ fontSize: '12px', color: t.text4 }}>{p.hint}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Reportes personalizados (configuraciones guardadas) */}
            <div style={{ gridColumn: '1 / -1', marginTop: '0.75rem' }}>
              <p style={{ fontSize: '11px', fontWeight: 600, color: t.text4, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '10px' }}>Reportes personalizados</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
                {reportes.map(r => (
                  <div key={r.id} onClick={() => setModalPreview(r)}
                    style={{ ...card, minWidth: 0, cursor: 'pointer', position: 'relative', transition: 'opacity 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.8'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                    <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '4px' }}>
                      <button onClick={e => { e.stopPropagation(); setModalConfig(r) }} title="Editar" style={{ width: '26px', height: '26px', borderRadius: '7px', background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', border: `1px solid ${t.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: t.text3 }}><i className="ti ti-pencil" style={{ fontSize: '13px' }} /></button>
                      <button onClick={e => { e.stopPropagation(); borrarReporte(r.id) }} title="Eliminar" style={{ width: '26px', height: '26px', borderRadius: '7px', background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', border: `1px solid ${t.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: t.text3 }}><i className="ti ti-trash" style={{ fontSize: '13px' }} /></button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem', paddingRight: '60px' }}>
                      <div style={{ width: '42px', height: '42px', borderRadius: '11px', flexShrink: 0, background: t.iconBox, border: `1px solid ${t.iconBoxBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="ti ti-file-text" style={{ fontSize: '22px', color: t.text2 }} />
                      </div>
                      <p style={{ fontSize: '15px', fontWeight: 600, color: t.text1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.titulo}</p>
                    </div>
                    <p style={{ fontSize: '30px', fontWeight: 600, lineHeight: 1, marginBottom: '6px' }}><i className="ti ti-chevron-right" style={{ fontSize: '24px', color: t.text4 }} /></p>
                    <p style={{ fontSize: '12px', color: t.text4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(r.modos || [r.modo]).map(labelModo).join(', ')} · {r.cols.length} columnas</p>
                  </div>
                ))}
                {/* Card "+" para crear */}
                <button onClick={() => setModalConfig('nuevo')}
                  style={{ ...card, minHeight: '148px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', fontFamily: 'inherit', border: `2px dashed ${t.cardBorder}`, background: 'transparent', transition: 'opacity 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.7'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                  <i className="ti ti-plus" style={{ fontSize: '26px', color: t.text3 }} />
                  <span style={{ fontSize: '13px', fontWeight: 500, color: t.text3 }}>Nuevo reporte</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Filtros */}
            <div style={{ ...cardTabla, padding: '1rem 1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', overflow: 'visible', position: 'relative', zIndex: 100 }}>
              <div style={{ ...searchBoxStyle(dark), flex: 1, minWidth: '180px' }}>
                <i className="ti ti-search" style={{ fontSize: '16px', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)', flexShrink: 0 }} />
                <input type="text" placeholder="Buscar por nombre o clave..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', color: dark ? '#f0f0f0' : '#111', fontFamily: 'inherit' }} />
                {busqueda && <button onClick={() => setBusqueda('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)', padding: 0, display: 'flex' }}><i className="ti ti-x" style={{ fontSize: '14px' }} /></button>}
              </div>
              <div style={{ ...searchBoxStyle(dark), flex: '1 1 160px', minWidth: '160px' }}>
                <i className="ti ti-tag" style={{ fontSize: '16px', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)', flexShrink: 0 }} />
                <input type="text" placeholder="silla, escritorio..." value={filtroBien} onChange={e => setFiltroBien(e.target.value)}
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', color: dark ? '#f0f0f0' : '#111', fontFamily: 'inherit' }} />
                {filtroBien && <button onClick={() => setFiltroBien('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)', padding: 0, display: 'flex' }}><i className="ti ti-x" style={{ fontSize: '14px' }} /></button>}
              </div>
              <GroupedAreaSelector areas={areasDeLista} selected={areasSelec} onChange={setAreasSelec} dark={dark} />
            </div>

            {/* Barra pegajosa: las acciones siguen visibles al bajar en la tabla */}
            <div className="barra-fit" style={barraSticky(dark, t)}>
              <div onClick={toggleModoSeleccion}
                style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 16px', borderRadius: '9px', fontSize: '14px', fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', background: t.cardBg, border: `1px solid ${t.cardBorder}`, color: t.text1, backdropFilter: 'blur(10px)', userSelect: 'none', whiteSpace: 'nowrap' }}>
                <div style={{ width: '17px', height: '17px', borderRadius: '5px', flexShrink: 0, background: modoSeleccion ? (dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.78)') : 'transparent', border: dark ? '1.5px solid rgba(255,255,255,0.4)' : '1.5px solid rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {modoSeleccion && <i className="ti ti-check" style={{ fontSize: '11px', color: dark ? '#1c1c1e' : '#fff' }} />}
                </div>
                Seleccionar Registros
              </div>
              {modoSeleccion && (
                <span style={{ fontSize: '13px', color: t.text3 }}>
                  {seleccionados.size === 0 ? 'Ningún registro seleccionado' : `${seleccionados.size} seleccionado${seleccionados.size !== 1 ? 's' : ''}`}
                </span>
              )}
              {modoSeleccion && seleccionados.size > 0 && (
                <button onClick={() => setSeleccionados(new Set())}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', cursor: 'pointer', background: 'transparent', border: `1px solid ${t.cardBorder}`, color: t.text3 }}>
                  <i className="ti ti-x" style={{ fontSize: '14px' }} />Limpiar
                </button>
              )}
              <button onClick={() => setModalReporte(true)}
                style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 16px', borderRadius: '9px', fontSize: '14px', fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', background: t.cardBg, border: `1px solid ${t.cardBorder}`, color: t.text1, backdropFilter: 'blur(10px)' }}>
                <i className="ti ti-file-export" style={{ fontSize: '17px' }} />Generar Reporte
              </button>
            </div>

            {/* Tabla */}
            <div style={{ ...cardTabla, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}` }}>
                      {modoSeleccion && (
                        <th rowSpan={2} style={{ ...thBase(dark), width: '40px', minWidth: '40px', textAlign: 'center' }}>
                          <div onClick={toggleTodosPagina} title={todosEnPag ? 'Deseleccionar página' : 'Seleccionar página'}
                            style={{ width: '17px', height: '17px', borderRadius: '5px', margin: '0 auto', cursor: 'pointer', background: todosEnPag ? (dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.78)') : 'transparent', border: dark ? '1.5px solid rgba(255,255,255,0.4)' : '1.5px solid rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {todosEnPag && <i className="ti ti-check" style={{ fontSize: '11px', color: dark ? '#1c1c1e' : '#fff' }} />}
                            {!todosEnPag && algunoEnPag && <i className="ti ti-minus" style={{ fontSize: '11px', color: dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)' }} />}
                          </div>
                        </th>
                      )}
                      <th rowSpan={2} style={thBase(dark)}>CLAVE DE INVENTARIO</th>
                      <th colSpan={4} style={{ ...thBase(dark), textAlign: 'center', borderLeft: bordeIzq, borderRight: bordeIzq, letterSpacing: '0.2em' }}>
                        D &nbsp; E &nbsp; S &nbsp; C &nbsp; R &nbsp; I &nbsp; P &nbsp; C &nbsp; I &nbsp; Ó &nbsp; N
                      </th>
                      <th rowSpan={2} style={{ ...thBase(dark), borderLeft: bordeIzq }}>ÁREA DE ADSCRIPCIÓN</th>
                      <th rowSpan={2} style={{ ...thBase(dark), borderLeft: bordeIzq }}>VALOR FACTURA / AVALÚO</th>
                      <th rowSpan={2} style={{ ...thBase(dark), borderLeft: bordeIzq }}>FACTURA / AVALÚO</th>
                      <th rowSpan={2} style={{ ...thBase(dark), borderLeft: bordeIzq }}>{esConfirmadas ? 'FECHA DE BAJA' : 'FECHA DE SOLICITUD'}</th>
                      <th rowSpan={2} style={{ ...thBase(dark), borderLeft: bordeIzq }}>ACCIONES</th>
                    </tr>
                    <tr style={{ borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}` }}>
                      <th style={{ ...thBase(dark), borderLeft: bordeIzq }}>NOMBRE DEL BIEN</th>
                      <th style={{ ...thBase(dark), borderLeft: bordeIzq }}>MARCA</th>
                      <th style={{ ...thBase(dark), borderLeft: bordeIzq }}>TIPO / MODELO</th>
                      <th style={{ ...thBase(dark), borderLeft: bordeIzq }}>SERIE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading
                      ? <tr><td colSpan={totalCols} style={{ padding: '3rem', textAlign: 'center', color: t.text4 }}>Cargando…</td></tr>
                      : filtrados.length === 0
                        ? <tr><td colSpan={totalCols} style={{ padding: '3rem', textAlign: 'center', color: t.text4 }}>
                            <i className="ti ti-inbox-off" style={{ fontSize: '28px', display: 'block', marginBottom: '8px' }} />
                            Sin registros
                          </td></tr>
                        : paginados.map((b, i) => {
                            const sel = seleccionados.has(b.idbien)
                            const bgFila = sel ? (dark ? 'rgba(168,197,248,0.10)' : 'rgba(37,99,235,0.06)') : (i % 2 !== 0 ? (dark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.015)') : 'transparent')
                            return (
                            <tr key={b.idbien} onClick={() => modoSeleccion && toggleSeleccion(b.idbien)} style={{ borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`, background: bgFila, cursor: modoSeleccion ? 'pointer' : 'default' }}>
                              {modoSeleccion && (
                                <td style={{ ...tdBase(), textAlign: 'center', verticalAlign: 'middle' }}>
                                  <div style={{ width: '17px', height: '17px', borderRadius: '5px', margin: '0 auto', background: sel ? (dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.78)') : 'transparent', border: dark ? '1.5px solid rgba(255,255,255,0.4)' : '1.5px solid rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {sel && <i className="ti ti-check" style={{ fontSize: '11px', color: dark ? '#1c1c1e' : '#fff' }} />}
                                  </div>
                                </td>
                              )}
                              <td style={tdBase()}><span style={{ fontFamily: 'monospace', fontSize: '11px', color: t.text3 }}>{b.claveinventario || '—'}</span></td>
                              <td style={{ ...tdBase(), maxWidth: '200px', overflowWrap: 'anywhere', wordBreak: 'break-word' }}><span style={{ color: t.text1, fontWeight: 500 }}>{b.nombrebien || '—'}</span></td>
                              <td style={tdBase()}><span style={{ color: t.text2 }}>{b.marca || '—'}</span></td>
                              <td style={tdBase()}><span style={{ color: t.text2 }}>{b.tipo || '—'}</span></td>
                              <td style={tdBase()}><span style={{ fontFamily: 'monospace', fontSize: '11px', color: t.text3 }}>{b.serie || '—'}</span></td>
                              <td style={{ ...tdBase(), maxWidth: '170px', overflowWrap: 'anywhere', wordBreak: 'break-word' }}><span style={{ color: t.text2 }}>{b.area || '—'}</span></td>
                              <td style={{ ...tdBase(), whiteSpace: 'nowrap' }}><span style={{ color: t.text2, fontWeight: 500 }}>{fmt(b.costoinicial)}</span></td>
                              <td style={tdBase()}><span style={{ color: t.text3, fontSize: '11px' }}>{b.numerofactura && b.numerofactura !== 'SIN FACTURA' ? b.numerofactura : 'SIN FACTURA'}</span></td>
                              <td style={{ ...tdBase(), whiteSpace: 'nowrap' }}><span style={{ color: t.text3, fontSize: '12px' }}>{fmtFecha(esConfirmadas ? fechas[b.idbien]?.confirmacion : fechas[b.idbien]?.solicitud)}</span></td>
                              <td style={tdBase()}>
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'nowrap' }}>
                                  <button onClick={(e) => { e.stopPropagation(); setPanelBien(b) }} title="Consultar"
                                    style={{ width: '30px', height: '30px', borderRadius: '7px', background: dark ? 'rgba(168,197,248,0.12)' : 'rgba(37,99,235,0.07)', border: dark ? '1px solid rgba(168,197,248,0.25)' : '1px solid rgba(37,99,235,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: dark ? '#a8c5f8' : '#2563eb' }}
                                    onMouseEnter={e => e.currentTarget.style.opacity = '0.7'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                                    <i className="ti ti-eye" style={{ fontSize: '14px' }} />
                                  </button>
                                  {!esConfirmadas && (
                                    <button onClick={(e) => { e.stopPropagation(); setModalConfirmar(b) }} title="Confirmar baja"
                                      style={{ width: '30px', height: '30px', borderRadius: '7px', background: dark ? 'rgba(244,161,161,0.15)' : 'rgba(192,57,43,0.07)', border: dark ? '1px solid rgba(244,161,161,0.35)' : '1px solid rgba(192,57,43,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: dark ? '#f4a1a1' : '#c0392b' }}
                                      onMouseEnter={e => e.currentTarget.style.opacity = '0.7'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                                      <i className="ti ti-circle-minus" style={{ fontSize: '14px' }} />
                                    </button>
                                  )}
                                  {!esConfirmadas && (
                                    <button onClick={(e) => { e.stopPropagation(); cancelarSolicitud(b) }} disabled={procId === b.idbien} title="Cancelar solicitud de baja"
                                      style={{ width: '30px', height: '30px', borderRadius: '7px', background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', border: `1px solid ${t.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: procId === b.idbien ? 'wait' : 'pointer', color: t.text3 }}
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

              {/* Footer paginación */}
              <div style={{ padding: '10px 14px', borderTop: `1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <p style={{ fontSize: '12px', color: t.text4 }}>
                    {loading ? 'Cargando…' : `Mostrando ${filtrados.length === 0 ? 0 : pagina * porPagina + 1}–${Math.min((pagina + 1) * porPagina, filtrados.length)} de ${filtrados.length.toLocaleString()} registros`}
                  </p>
                  <div style={{ display: 'flex', gap: '3px' }}>
                    {OPCIONES_POR_PAGINA.map(n => (
                      <button key={n} onClick={() => setPorPagina(n)}
                        style={{ padding: '3px 9px', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer', fontWeight: porPagina === n ? 600 : 400, background: porPagina === n ? (dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)') : 'transparent', border: porPagina === n ? `1px solid ${t.cardBorder}` : '1px solid transparent', color: porPagina === n ? t.text1 : t.text4, transition: 'all 0.15s' }}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button onClick={() => setPagina(p => Math.max(0, p - 1))} disabled={pagina === 0 || loading}
                    style={{ width: '30px', height: '30px', borderRadius: '7px', background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.12)', cursor: pagina === 0 ? 'not-allowed' : 'pointer', opacity: pagina === 0 ? 0.4 : 1, color: t.text1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="ti ti-chevron-left" style={{ fontSize: '14px' }} />
                  </button>
                  <span style={{ fontSize: '13px', color: t.text2, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Pág.
                    <select value={pagina} onChange={e => setPagina(Number(e.target.value))} aria-label="Ir a la página"
                      style={{ ...sStyle(dark), width: 'auto', height: '28px', padding: '0 30px 0 9px', fontSize: '13px', backgroundPosition: 'right 8px center', backgroundSize: '13px 13px' }}>
                      {Array.from({ length: totalPag }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}
                    </select>
                    / {totalPag}
                  </span>
                  <button onClick={() => setPagina(p => Math.min(totalPag - 1, p + 1))} disabled={pagina >= totalPag - 1 || loading}
                    style={{ width: '30px', height: '30px', borderRadius: '7px', background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.12)', cursor: pagina >= totalPag - 1 ? 'not-allowed' : 'pointer', opacity: pagina >= totalPag - 1 ? 0.4 : 1, color: t.text1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="ti ti-chevron-right" style={{ fontSize: '14px' }} />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {panelBien && <PanelConsulta bien={panelBien} onClose={() => setPanelBien(null)} t={t} dark={dark} sinEtiqueta />}
      {modalConfirmar && (
        <ModalBaja bien={modalConfirmar} onClose={() => setModalConfirmar(null)} dark={dark} t={t} titulo="Confirmar Baja"
          onConfirm={async () => {
            await actualizarEstadoBienes([modalConfirmar.idbien], 'BAJA')
            setFechaBaja([modalConfirmar.idbien], 'confirmacion', hoyISO())
            setFechas(getFechasBajas())
            await cargar('SOLICITUD BAJA')
            cargarConteos()
          }} />
      )}
      {modalAdquisiciones && <ModalAdquisicionesMuebles onClose={() => setModalAdquisiciones(false)} dark={dark} t={t} filtros={{ filtroAreaIds: [] }} />}
      {modalAltas && <ModalReporteAltas allAreas={allAreas} onClose={() => setModalAltas(false)} dark={dark} t={t} />}
      {modalPeriodo && <ModalReportePeriodo tipo={modalPeriodo} allAreas={allAreas} onClose={() => setModalPeriodo(null)} dark={dark} t={t} />}
      {modalConfig && <ModalConfigReporte config={modalConfig === 'nuevo' ? null : modalConfig} allAreas={allAreas} onClose={() => setModalConfig(null)} onGuardar={guardarReporte} dark={dark} t={t} />}
      {modalPreview && <ModalPreviewReporte config={modalPreview} onClose={() => setModalPreview(null)} dark={dark} t={t} />}
      {modalReporte && <ModalReporteBajas onClose={() => setModalReporte(false)} dark={dark} t={t} datos={filtrados} seleccionados={[...seleccionados]}
        tituloInicial={`${esConfirmadas ? 'BAJAS CONFIRMADAS' : 'SOLICITUD DE BAJAS'} HAN ${mesAnioActual()}`} />}
      <style>{`@keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} } @keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}} @keyframes slideOut{from{transform:translateX(0)}to{transform:translateX(100%)}}`}</style>
    </div>
  )
}
