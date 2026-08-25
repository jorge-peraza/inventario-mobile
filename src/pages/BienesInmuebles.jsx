import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import Sidebar from '../components/Sidebar'
import { useTheme } from '../context/ThemeContext'
import { supabaseInmuebles as supabase } from '../supabaseInmuebles'
 import { getComentario, setComentario } from '../comentarios'
import { barraSticky, btnBarra, MenuFila } from './BienesMuebles'
import { PaginaEvidencias } from './ArmarReporteInmuebles'
import { ID_PROCESO, ID_DESINC, CATS_FUERA, cambiarCategoria, setDesinc, hoyISO, fetchInmueblesPorIds } from '../desincorporaciones'

const POR_PAGINA_OPTS = [10, 15, 20]

function fmt(n) {
  return n != null ? '$ ' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '$ —'
}
function fmtM2(n) {
  return n != null ? Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 }) + ' m²' : '—'
}

function iStyle(dark) {
  return {
    padding:'9px 12px', borderRadius:'9px', outline:'none',
    width:'100%', fontFamily:'inherit', fontSize:'14px',
    background: dark ? '#2a2a2c' : '#ffffff',
    border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.18)',
    color: dark ? '#f0f0f0' : '#111111',
    colorScheme: dark ? 'dark' : 'light',
  }
}

// Estilo para <select>: dibuja su propia flecha separada del borde derecho
// (la flecha nativa queda pegada al filo del control).
function sStyle(dark) {
  const c = dark ? '%23f0f0f0' : '%23111111'
  return {
    ...iStyle(dark),
    appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
    paddingRight: '34px',
    backgroundImage: "url(\"data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='" + c + "' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 11px center',
    backgroundSize: '15px 15px',
  }
}

function searchBoxStyle(dark) {
  return {
    display:'flex', alignItems:'center', gap:'8px',
    padding:'9px 13px', borderRadius:'9px',
    background: dark ? '#2a2a2c' : '#ffffff',
    border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.18)',
  }
}

function thBase(dark) {
  return { padding:'9px 10px', textAlign:'left', fontSize:'10px', fontWeight:700, color: dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)', textTransform:'uppercase', letterSpacing:'0.06em', whiteSpace:'nowrap', verticalAlign:'middle', background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }
}
function tdBase() { return { padding:'10px 10px', verticalAlign:'top' } }

// ── Panel de consulta ─────────────────────────────────────────────────────────
export function PanelConsulta({ inmueble, onClose, t, dark, categorias = [], extra = [] }) {
  const { close, anim } = useClosing(onClose)
  if (!inmueble) return null

  // Aquí se muestra todo, incluidas las columnas que la tabla oculta
  // (categoría, valor catastral, adquisición) y el comentario interno.
  const campos = [
    ['Clave de Inventario',   inmueble.claveinmueble],
    ['Nombre del Inmueble',   inmueble.nombreinmueble],
    ['Categoría',             categorias.find(c => c.idcategoria === inmueble.idcategoria)?.nombrecategoria],
    ['Clave Catastral',       inmueble.clavecatastral],
    ['Adquisición',           inmueble.adquisicion],
    ['Superficie (m²)',       inmueble.superficiem2 ? fmtM2(inmueble.superficiem2) : '—'],
    ['Valor Catastral',       fmt(inmueble.valorcatastral)],
    ['Ubicación',             inmueble.ubicacion],
    ['Documento de Propiedad',inmueble.documentopropiedad],
    ['Expediente',            inmueble.expediente],
    ...extra,
  ]

  // El comentario va arriba y resaltado: al fondo de la lista quedaba fuera de
  // la vista y parecía que no se guardaba.
  const comentario = getComentario(inmueble.idinmueble)

  return createPortal(
    <>
      <div onClick={close} style={{ position:'fixed', inset:0, zIndex:150, background:'rgba(0,0,0,0.4)', backdropFilter:'blur(4px)' }} />
      <div style={{ position:'fixed', top:0, right:0, bottom:0, zIndex:200, width:'380px', background: dark ? '#1e1e20' : '#ffffff', borderLeft:`1px solid ${t.cardBorder}`, display:'flex', flexDirection:'column', boxShadow:'-8px 0 40px rgba(0,0,0,0.3)', animation: anim }}>
        <div style={{ padding:'1.25rem 1.5rem', borderBottom:`1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <p style={{ fontSize:'12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', marginBottom:'2px' }}>Detalle del inmueble</p>
            <p style={{ fontSize:'16px', fontWeight:600, color: dark ? '#fff' : '#111' }}>Consulta</p>
          </div>
          <button onClick={close} style={{ width:'32px', height:'32px', borderRadius:'8px', background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color: dark ? '#ccc' : '#444' }}>
            <i className="ti ti-x" style={{ fontSize:'16px' }} />
          </button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'0.5rem 1.5rem' }}>
          <div style={{ margin:'0.75rem 0 0.35rem', padding:'11px 13px', borderRadius:'10px', background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.035)', border:`1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)'}` }}>
            <p style={{ fontSize:'10px', color: dark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'4px' }}>Comentarios</p>
            <p style={{ fontSize:'14px', color: comentario ? (dark ? '#f0f0f0' : '#111') : (dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)'), lineHeight:1.45, whiteSpace:'pre-wrap' }}>
              {comentario || 'Sin comentarios'}
            </p>
          </div>
          {campos.map(([label, val], i) => (
            <div key={i} style={{ padding:'11px 0', borderBottom: i < campos.length - 1 ? `1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}` : '' }}>
              <p style={{ fontSize:'10px', color: dark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'4px' }}>{label}</p>
              <p style={{ fontSize:'14px', color: dark ? '#f0f0f0' : '#111', lineHeight:1.4 }}>{val || '—'}</p>
            </div>
          ))}
        </div>
        <div style={{ padding:'1rem 1.5rem', borderTop:`1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}` }}>
          <button onClick={close} style={{ width:'100%', padding:'10px', borderRadius:'9px', background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', fontSize:'13px', fontWeight:500, color: dark ? '#ccc' : '#444', fontFamily:'inherit', cursor:'pointer' }}>
            Cerrar
          </button>
        </div>
      </div>
      <style>{`@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}} @keyframes slideOut{from{transform:translateX(0)}to{transform:translateX(100%)}}`}</style>
    </>,
    document.body,
  )
}

function useClosing(onClose, duration = 250) {
  const [closing, setClosing] = useState(false)
  function close() { setClosing(true); setTimeout(onClose, duration) }
  const anim = closing
    ? `slideOut ${duration}ms cubic-bezier(0.4,0,0.2,1) forwards`
    : `slideIn ${duration}ms cubic-bezier(0.4,0,0.2,1)`
  return { close, anim }
}

// ── Modal Categorías ──────────────────────────────────────────────────────────
function ModalCategorias({ categorias, selected, onChange, dark, t }) {
  const [open, setOpen]           = useState(false)
  const [busq, setBusq]           = useState('')
  const [localSel, setLocalSel]   = useState(selected)

  function abrir() { setLocalSel(selected); setBusq(''); setOpen(true) }
  function aplicar() { onChange(localSel); setOpen(false) }
  function limpiar() { setLocalSel([]); onChange([]); setOpen(false) }

  const filtradas = categorias.filter(c =>
    !busq || c.nombrecategoria.toLowerCase().includes(busq.toLowerCase())
  )
  const selectedSet = new Set(localSel)
  const totalSel = selected.length

  function toggle(id) {
    setLocalSel(prev => selectedSet.has(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const sepBorder = dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)'

  return (
    <>
      <div onClick={abrir} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'9px 13px', borderRadius:'9px', cursor:'pointer', background: dark ? '#2a2a2c' : '#ffffff', border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.18)', whiteSpace:'nowrap' }}>
        <i className="ti ti-category" style={{ fontSize:'15px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', flexShrink:0 }} />
        <span style={{ fontSize:'14px', color: dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)' }}>
          {totalSel === 0 ? 'Todas las categorías' : `${totalSel} categoría${totalSel !== 1 ? 's' : ''}`}
        </span>
      </div>

      {open && createPortal(
        <>
          <div onClick={() => setOpen(false)} style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,0.4)', backdropFilter:'blur(4px)' }} />

          <div onClick={e => e.stopPropagation()} style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:301, width:'420px', maxWidth:'90vw', maxHeight:'80vh', display:'flex', flexDirection:'column', background: dark ? '#1e1e20' : '#fff', borderRadius:'16px', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', boxShadow:'0 20px 60px rgba(0,0,0,0.4)', animation:'fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)', overflow:'hidden' }}>

            <div style={{ padding:'1.25rem 1.5rem', borderBottom: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
                <div style={{ width:'34px', height:'34px', borderRadius:'9px', background: dark ? 'rgba(168,197,248,0.15)' : 'rgba(37,99,235,0.08)', border: dark ? '1px solid rgba(168,197,248,0.3)' : '1px solid rgba(37,99,235,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <i className="ti ti-category" style={{ fontSize:'18px', color: dark ? '#a8c5f8' : '#2563eb' }} />
                </div>
                <div>
                  <p style={{ fontSize:'15px', fontWeight:600, color: dark ? '#fff' : '#111' }}>Categorías</p>
                  <p style={{ fontSize:'12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>
                    {totalSel === 0 ? 'Todas por defecto' : `${totalSel} seleccionada${totalSel !== 1 ? 's' : ''}`}
                  </p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} style={{ width:'30px', height:'30px', borderRadius:'7px', background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color: dark ? '#ccc' : '#555' }}>
                <i className="ti ti-x" style={{ fontSize:'15px' }} />
              </button>
            </div>

            <div style={{ padding:'1rem 1.5rem', borderBottom: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'9px 13px', borderRadius:'9px', background: dark ? '#2a2a2c' : '#ffffff', border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.18)' }}>
                <i className="ti ti-search" style={{ fontSize:'16px', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)', flexShrink:0 }} />
                <input autoFocus type="text" placeholder="Buscar categoría..." value={busq} onChange={e => setBusq(e.target.value)}
                  style={{ flex:1, background:'transparent', border:'none', outline:'none', fontSize:'14px', color: dark ? '#f0f0f0' : '#111', fontFamily:'inherit' }} />
                {busq && <button onClick={() => setBusq('')} style={{ background:'none', border:'none', cursor:'pointer', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)', padding:0, display:'flex' }}><i className="ti ti-x" style={{ fontSize:'14px' }} /></button>}
              </div>
            </div>

            <div style={{ flex:1, overflowY:'auto' }}>
              {filtradas.length === 0
                ? <p style={{ padding:'2rem', textAlign:'center', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)', fontSize:'14px' }}>Sin resultados</p>
                : filtradas.map(c => {
                    const sel = selectedSet.has(c.idcategoria)
                    return (
                      <div key={c.idcategoria} onClick={() => toggle(c.idcategoria)} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'11px 16px', cursor:'pointer', borderBottom: sepBorder, background: sel ? (dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)') : 'transparent' }}>
                        <div style={{ width:'17px', height:'17px', borderRadius:'5px', flexShrink:0, background: sel ? (dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.78)') : 'transparent', border: dark ? '1.5px solid rgba(255,255,255,0.4)' : '1.5px solid rgba(0,0,0,0.3)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                          {sel && <i className="ti ti-check" style={{ fontSize:'11px', color: dark ? '#1c1c1e' : '#fff' }} />}
                        </div>
                        <span style={{ flex:1, fontSize:'13px', color: dark ? '#f0f0f0' : '#111' }}>{c.nombrecategoria}</span>
                        <span style={{ fontSize:'11px', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)', flexShrink:0 }}>{c.total.toLocaleString()}</span>
                      </div>
                    )
                  })
              }
            </div>

            <div style={{ padding:'1rem 1.5rem', borderTop: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display:'flex', gap:'8px', flexShrink:0 }}>
              <button onClick={limpiar} style={{ flex:1, padding:'10px', background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)', border: dark ? '1px solid rgba(255,255,255,0.13)' : '1px solid rgba(0,0,0,0.09)', borderRadius:'9px', fontSize:'14px', fontWeight:500, color: dark ? '#ccc' : '#444', fontFamily:'inherit', cursor:'pointer' }}>Limpiar</button>
              <button onClick={aplicar} style={{ flex:1, padding:'10px', background: dark ? 'rgba(168,197,248,0.18)' : 'rgba(37,99,235,0.08)', border: dark ? '1px solid rgba(168,197,248,0.35)' : '1px solid rgba(37,99,235,0.35)', borderRadius:'9px', fontSize:'14px', fontWeight:600, color: dark ? '#a8c5f8' : '#2563eb', fontFamily:'inherit', cursor:'pointer' }}>Aplicar</button>
            </div>
          </div>
          <style>{`@keyframes fadeUp{from{opacity:0;transform:translate(-50%,-48%) scale(0.98)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}`}</style>
        </>,
        document.body
      )}
    </>
  )
}

async function fetchCategorias() {
  const { data: cats, error } = await supabase
    .from('categoriasinmuebles')
    // clavecategoria hace falta para armar la clave del inmueble nuevo
    .select('idcategoria, nombrecategoria, clavecategoria')
    .order('nombrecategoria', { ascending: true })
  if (error) throw error

  // Un conteo por categoría, todos a la vez. Antes se descargaban los ~1,400
  // inmuebles completos solo para contarlos y la pantalla tardaba el doble.
  const totales = await Promise.all(
    (cats || []).map(c =>
      supabase.from('bienesinmuebles')
        .select('*', { count: 'exact', head: true })
        .eq('idcategoria', c.idcategoria)
        .then(({ count }) => count || 0)
        .catch(() => 0)
    )
  )
  return (cats || []).map((c, i) => ({ ...c, total: totales[i] }))
}

// ── Actualizar inmueble ───────────────────────────────────────────────────────
async function actualizarInmueble(idinmueble, campos) {
  const payload = { ...campos }
  if (payload.superficiem2 === '' || payload.superficiem2 == null) payload.superficiem2 = null
  else payload.superficiem2 = Number(payload.superficiem2) || null
  if (payload.valorcatastral === '' || payload.valorcatastral == null) payload.valorcatastral = null
  else payload.valorcatastral = Number(payload.valorcatastral) || null
  if (payload.idcategoria === '' || payload.idcategoria == null) delete payload.idcategoria
  else payload.idcategoria = Number(payload.idcategoria)

  const { error } = await supabase.from('bienesinmuebles').update(payload).eq('idinmueble', idinmueble)
  if (error) throw error
}

// ── Combobox de Categoría (menú desplegable estilizado) ─────────────────────────
function ComboCategoria({ value, onChange, categorias, dark }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const sel = categorias.find(c => String(c.idcategoria) === String(value))
  const inputBox = {
    display:'flex', alignItems:'center', gap:'8px', padding:'9px 12px', borderRadius:'9px', cursor:'pointer',
    background: dark ? '#2a2a2c' : '#ffffff',
    border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.18)',
  }
  return (
    <div ref={ref} style={{ position:'relative' }}>
      <div onClick={() => setOpen(o => !o)} style={inputBox}>
        <span style={{ flex:1, fontSize:'14px', color: sel ? (dark ? '#f0f0f0' : '#111') : (dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'), overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {sel ? sel.nombrecategoria : 'Selecciona una categoría...'}
        </span>
        <i className="ti ti-chevron-down" style={{ fontSize:'16px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', transition:'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </div>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:20, background: dark ? '#2a2a2c' : '#fff', border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.15)', borderRadius:'9px', boxShadow:'0 10px 30px rgba(0,0,0,0.25)', overflow:'hidden', maxHeight:'240px', overflowY:'auto' }}>
          <div onClick={() => { onChange(''); setOpen(false) }}
            style={{ padding:'10px 13px', fontSize:'14px', cursor:'pointer', color: dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)' }}
            onMouseEnter={e => e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            — Sin categoría —
          </div>
          {categorias.map(c => {
            const activo = String(c.idcategoria) === String(value)
            return (
              <div key={c.idcategoria} onClick={() => { onChange(c.idcategoria); setOpen(false) }}
                style={{ padding:'10px 13px', fontSize:'14px', cursor:'pointer', color: dark ? '#f0f0f0' : '#111', background: activo ? (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)') : 'transparent' }}
                onMouseEnter={e => e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = activo ? (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)') : 'transparent'}>
                {c.nombrecategoria}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── ModalEditar Inmueble ──────────────────────────────────────────────────────
export function ModalEditar({ inmueble, onClose, dark, t, onSaved, categorias = [] }) {
  const { close, anim } = useClosing(onClose)

  const [form, setForm] = useState({
    nombreinmueble:     inmueble.nombreinmueble     || '',
    ubicacion:          inmueble.ubicacion          || '',
    idcategoria:        inmueble.idcategoria        ?? '',
    superficiem2:       inmueble.superficiem2       ?? '',
    valorcatastral:     inmueble.valorcatastral     ?? '',
    clavecatastral:     inmueble.clavecatastral     || '',
    adquisicion:        inmueble.adquisicion        || '',
    documentopropiedad: inmueble.documentopropiedad || '',
    expediente:         inmueble.expediente         || '',
    tipo_enajenacion:   inmueble.tipo_enajenacion   || '',
    afavorde:           inmueble.afavorde           || '',
    fecha_enajenacion:  inmueble.fecha_enajenacion  || '',
  })
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState(null)
  const [saved, setSaved] = useState(false)
  const [comentario, setComentarioTxt] = useState(() => getComentario(inmueble.idinmueble))

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function guardar() {
    setSaving(true); setSaveErr(null)
    try {
      setComentario(inmueble.idinmueble, comentario)
      await actualizarInmueble(inmueble.idinmueble, form)
      setSaved(true)
      setTimeout(() => { onSaved?.(); close() }, 800)
    } catch(e) {
      setSaveErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  const campos = [
    { label: 'Nombre del Inmueble',   key: 'nombreinmueble' },
    { label: 'Ubicación',             key: 'ubicacion' },
    { label: 'Superficie (m²)',       key: 'superficiem2',   type: 'number' },
    { label: 'Valor Catastral',       key: 'valorcatastral', type: 'number' },
    { label: 'Clave Catastral',       key: 'clavecatastral' },
    { label: 'Adquisición',           key: 'adquisicion' },
    { label: 'Documento de Propiedad',key: 'documentopropiedad' },
    { label: 'Expediente',            key: 'expediente' },
    { label: 'A Favor De',            key: 'afavorde' },
    { label: 'Fecha Enajenación',     key: 'fecha_enajenacion', type: 'date' },
  ]

  return createPortal(
    <>
      <div onClick={close} style={{ position:'fixed', inset:0, zIndex:150, background:'rgba(0,0,0,0.4)', backdropFilter:'blur(4px)' }} />
      <div style={{ position:'fixed', top:0, right:0, bottom:0, zIndex:200, width:'400px',
        background: dark ? '#1e1e20' : '#ffffff', borderLeft:`1px solid ${t.cardBorder}`,
        display:'flex', flexDirection:'column', boxShadow:'-8px 0 40px rgba(0,0,0,0.3)', animation:anim }}>

        <div style={{ padding:'1.25rem 1.5rem', borderBottom:`1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
            <div style={{ width:'34px', height:'34px', borderRadius:'9px',
              background: dark ? 'rgba(168,230,207,0.15)' : 'rgba(30,126,74,0.08)',
              border: dark ? '1px solid rgba(168,230,207,0.3)' : '1px solid rgba(30,126,74,0.2)',
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              <i className="ti ti-pencil" style={{ fontSize:'17px', color: dark ? '#a8e6cf' : '#1e7e4a' }} />
            </div>
            <div>
              <p style={{ fontSize:'15px', fontWeight:600, color: dark ? '#fff' : '#111' }}>Modificar Inmueble</p>
              <p style={{ fontSize:'12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>{inmueble.claveinmueble}</p>
            </div>
          </div>
          <button onClick={close} style={{ width:'30px', height:'30px', borderRadius:'7px',
            background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
            border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)',
            display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color: dark ? '#ccc' : '#555' }}>
            <i className="ti ti-x" style={{ fontSize:'15px' }} />
          </button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'0.5rem 1.5rem' }}>
          {/* Comentario interno: solo se ve aquí y en el panel de consulta */}
          <div style={{ padding:'11px 0', borderBottom:`1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}` }}>
            <p style={{ fontSize:'10px', color: dark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'5px' }}>Comentarios</p>
            <textarea value={comentario} onChange={e => setComentarioTxt(e.target.value)} rows={2}
              placeholder="Nota interna sobre este inmueble"
              style={{ width:'100%', background:'transparent', border:'none', outline:'none', fontSize:'14px', color: dark ? '#f0f0f0' : '#111', fontFamily:'inherit', resize:'none', lineHeight:1.5, padding:0 }} />
          </div>
          {/* Categoría (combobox) */}
          <div style={{ padding:'11px 0', borderBottom:`1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}` }}>
            <p style={{ fontSize:'10px', color: dark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'5px' }}>Categoría</p>
            <ComboCategoria value={form.idcategoria} onChange={v => set('idcategoria', v)} categorias={categorias} dark={dark} />
          </div>
          {/* Tipo Enajenación */}
          <div style={{ padding:'11px 0', borderBottom:`1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}` }}>
            <p style={{ fontSize:'10px', color: dark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'5px' }}>Tipo Enajenación</p>
            <select value={form.tipo_enajenacion} onChange={e => set('tipo_enajenacion', e.target.value)}
              style={{ width:'100%', background:'transparent', border:'none', outline:'none', fontSize:'14px', fontWeight:500, color: dark ? '#f0f0f0' : '#111', fontFamily:'inherit', padding:0, cursor:'pointer' }}>
              <option value=''>— Sin enajenación —</option>
              <option value='DESINCORPORACION'>Desincorporación</option>
              <option value='INCORPORACION'>Incorporación</option>
            </select>
          </div>
          {campos.map(({ label, key, type }) => (
            <div key={key} style={{ padding:'11px 0', borderBottom:`1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}` }}>
              <p style={{ fontSize:'10px', color: dark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'5px' }}>{label}</p>
              <input
                type={type || 'text'}
                value={form[key] ?? ''}
                onChange={e => set(key, e.target.value)}
                style={{ width:'100%', background:'transparent', border:'none', outline:'none', fontSize:'14px', fontWeight:500, color: dark ? '#f0f0f0' : '#111', fontFamily:'inherit', padding:0 }}
              />
            </div>
          ))}
          {saveErr && (
            <div style={{ marginTop:'10px', padding:'10px 12px', borderRadius:'8px',
              background: dark ? 'rgba(244,161,161,0.12)' : 'rgba(192,57,43,0.07)',
              border: dark ? '1px solid rgba(244,161,161,0.3)' : '1px solid rgba(192,57,43,0.2)',
              fontSize:'12px', color: dark ? '#f4a1a1' : '#c0392b' }}>
              <i className="ti ti-alert-circle" style={{ marginRight:'6px' }} />{saveErr}
            </div>
          )}
        </div>

        <div style={{ padding:'1rem 1.5rem', borderTop:`1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`, display:'flex', gap:'8px' }}>
          <button onClick={close} style={{ flex:1, padding:'10px', background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)', border: dark ? '1px solid rgba(255,255,255,0.13)' : '1px solid rgba(0,0,0,0.09)', borderRadius:'9px', fontSize:'14px', fontWeight:500, color: dark ? '#ccc' : '#444', fontFamily:'inherit', cursor:'pointer' }}>Cancelar</button>
          <button onClick={guardar} disabled={saving || saved}
            style={{ flex:1, padding:'10px', borderRadius:'9px', fontSize:'14px', fontWeight:600, fontFamily:'inherit', cursor: saving || saved ? 'not-allowed' : 'pointer',
              background: dark ? 'rgba(168,230,207,0.18)' : 'rgba(30,126,74,0.08)',
              border: dark ? '1px solid rgba(168,230,207,0.35)' : '1px solid rgba(30,126,74,0.35)',
              color: dark ? '#a8e6cf' : '#15803d',
              display:'flex', alignItems:'center', justifyContent:'center', gap:'6px' }}>
            {saving ? <><i className="ti ti-loader-2" style={{ fontSize:'15px', animation:'spin 1s linear infinite' }} />Guardando…</>
              : saved ? <><i className="ti ti-check" style={{ fontSize:'15px' }} />Guardado</>
              : <><i className="ti ti-device-floppy" style={{ fontSize:'15px' }} />Guardar Cambios</>}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}} @keyframes entraDer{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}} @keyframes entraIzq{from{opacity:0;transform:translateX(-40px)}to{opacity:1;transform:translateX(0)}} @keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}} @keyframes slideOut{from{transform:translateX(0)}to{transform:translateX(100%)}}`}</style>
    </>,
    document.body,
  )
}

// ── Reporte: columnas disponibles (orden y etiquetas del formato oficial) ──────────
// En los reportes, un campo vacío se imprime como "—"; si es de dinero, como 0
// (la celda lleva formato de moneda, así que se ve "$ 0.00").
const TXT = v => (v == null || String(v).trim() === '' ? '—' : v)
export const REPORT_COLS = [
  { key:'claveinmueble',      label:'No. (clave)',           rLabel:'NO.',                    ancho:12,     value:(r) => TXT(r.claveinmueble) },
  { key:'nombreinmueble',     label:'Nombre del Inmueble',   rLabel:'NOMBRE DEL INMUEBLE',    ancho:50.375, value:(r) => TXT(r.nombreinmueble) },
  { key:'clavecatastral',     label:'Clave Catastral',       rLabel:'CLAVE CATASTRAL',        ancho:19.125, value:(r) => TXT(r.clavecatastral) },
  { key:'superficiem2',       label:'Superficie',            rLabel:'SUPERFICIE M2',          ancho:15.25,  value:(r) => r.superficiem2 != null ? r.superficiem2 : '—' },
  { key:'ubicacion',          label:'Ubicación',             rLabel:'UBICACIÓN',              ancho:44.75,  value:(r) => TXT(r.ubicacion) },
  { key:'adquisicion',        label:'Adquisición',           rLabel:'ADQUISICIÓN',            ancho:34.25,  value:(r) => TXT(r.adquisicion) },
  { key:'valorcatastral',     label:'Valor Catastral',       rLabel:'VALOR CATASTRAL',        ancho:18.125, value:(r) => r.valorcatastral != null ? r.valorcatastral : 0 },
  { key:'documentopropiedad', label:'Documento de Propiedad',rLabel:'DOCUMENTO DE PROPIEDAD', ancho:51,     value:(r) => TXT(r.documentopropiedad) },
  { key:'expediente',         label:'Expediente',            rLabel:'EXPEDIENTE',             ancho:20,     value:(r) => TXT(r.expediente) },
  { key:'categoria',          label:'Agrupar por Categoría', rLabel:'CATEGORÍA',              ancho:30,     value:(r, cats) => TXT(cats.find(c => c.idcategoria === r.idcategoria)?.nombrecategoria) },
]

const TITULO_REPORTE = 'INVENTARIO DE BIENES INMUEBLES MUNICIPIO DE NOGALES SONORA PERIODO 2024-2027'

// Formato oficial: encabezados gris claro, datos en blanco, bordes negros
const GRIS_HEADER = 'BFBFBF'   // blanco con tinte -25% (encabezado / categoría)
const NEGRO       = '000000'

function valorTexto(col, r, cats) {
  const raw = col.value(r, cats)
  if (raw === '' || raw == null) return ''
  if (col.key === 'valorcatastral') { const n = Number(raw); return isNaN(n) ? String(raw) : '$ ' + n.toLocaleString('es-MX', { minimumFractionDigits: 2 }) }
  if (col.key === 'superficiem2')   { const n = Number(raw); return isNaN(n) ? String(raw) : n.toLocaleString('es-MX', { minimumFractionDigits: 2 }) + ' M2' }
  return String(raw)
}

function nombreArchivo(ext) {
  const f = new Date().toISOString().slice(0, 10)
  return `inventario-inmuebles-${f}.${ext}`
}

function nombreCategoria(r, cats) {
  return cats.find(c => c.idcategoria === r.idcategoria)?.nombrecategoria || 'SIN CATEGORÍA'
}

// Agrupa filas por categoría conservando orden de aparición
function agruparPorCategoria(rows, cats) {
  const grupos = new Map()
  for (const r of rows) {
    const nombre = nombreCategoria(r, cats)
    if (!grupos.has(nombre)) grupos.set(nombre, [])
    grupos.get(nombre).push(r)
  }
  return grupos
}

function alineacion(key) {
  return key === 'documentopropiedad' ? 'left' : 'center'
}

const RGB_GRIS = [191, 191, 191]

// Carga una imagen a máxima resolución (dataURL PNG) para los encabezados
// Carga una imagen del sitio probando primero la ruta base (GitHub Pages sirve
// bajo /inventario-nogales/) y, si falla, la raíz. Antes un solo fallo dejaba el
// reporte sin ningún logo.
function cargarImagen(src) {
  if (!src.startsWith('/')) return cargarImagenDe(src)
  const conBase = import.meta.env.BASE_URL + src.slice(1)
  return cargarImagenDe(conBase).catch(() => cargarImagenDe(src))
}
function cargarImagenDe(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      c.getContext('2d').drawImage(img, 0, 0)
      resolve({ dataURL: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight })
    }
    img.onerror = reject
    img.src = src
  })
}

async function dibujarLogosPDF(doc, pageW, margin) {
  try {
    const [ay, nog, mex] = await Promise.all([
      cargarImagen('/logo-ayuntamiento.png'),
      cargarImagen('/escudo-nogales.png'),
      cargarImagen('/escudo-mexico.png'),
    ])
    const H = 46
    const Hmex = 66   // escudo de México más grande
    const wAy = H * ay.w / ay.h, wNog = H * nog.w / nog.h, wMex = Hmex * mex.w / mex.h
    const y = 18
    doc.addImage(ay.dataURL, 'PNG', margin, y, wAy, H, undefined, 'FAST')
    doc.addImage(nog.dataURL, 'PNG', (pageW - wNog) / 2, y, wNog, H, undefined, 'FAST')
    doc.addImage(mex.dataURL, 'PNG', pageW - margin - wMex, y - (Hmex - H) / 2, wMex, Hmex, undefined, 'FAST')
    return y + Hmex - (Hmex - H) / 2 + 12
  } catch {
    return 24
  }
}

// ── Export PDF ──────────────────────────────────────────────────────────────────
export async function exportarPDF(rows, cols, cats, titulo = '', evidencias = []) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 28

  // Logos + título opcional (Arial/helvetica bold subrayado)
  let startY = await dibujarLogosPDF(doc, pageW, margin)
  if (titulo) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(0)
    doc.text(titulo, pageW / 2, startY + 6, { align: 'center' })
    const tw = doc.getTextWidth(titulo)
    doc.setLineWidth(1)
    doc.line(pageW / 2 - tw / 2, startY + 10, pageW / 2 + tw / 2, startY + 10)
    startY += 24
  }

  const agrupar  = cols.some(c => c.key === 'categoria')
  // Si hay evidencias, se agregan como dos columnas al final de la misma tabla
  const evid = new Map((evidencias || []).map(e => [e.idinmueble, e]))
  const colsImg = evid.size > 0
    ? [{ key: '__foto', rLabel: 'FOTO' }, { key: '__doc', rLabel: 'DOCUMENTO' }]
    : []
  const dataCols = [...cols.filter(c => c.key !== 'categoria'), ...colsImg]

  const hStyle = { fillColor: RGB_GRIS, textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' }
  const blanco = () => ({ fillColor: [255, 255, 255], lineWidth: 0 })

  const body = []
  const meta = []   // por fila: el inmueble con imagen, o null
  const push = (fila, r) => { body.push(fila); meta.push(r && evid.get(r.idinmueble) ? evid.get(r.idinmueble) : null) }
  const filaBlanca = () => dataCols.map(() => ({ content: '', styles: blanco() }))
  const celdas = (r) => dataCols.map(c =>
    c.key.startsWith('__')
      ? ({ content: '' })
      : ({ content: valorTexto(c, r, cats), styles: { halign: alineacion(c.key) } }))

  // Anchos fijos por columna: al dibujar una tabla por categoría, si se dejan
  // automáticos cada una se dimensiona según su contenido y salen distintas.
  const anchoImg = 110
  const anchoUtilPDF = pageW - 48
  const anchoImgTotal = colsImg.length * anchoImg
  const sumaPesos = dataCols.filter(c => !c.key.startsWith('__')).reduce((s, c) => s + (c.ancho || 20), 0)
  const colStylesPDF = {}
  dataCols.forEach((c, i) => {
    colStylesPDF[i] = c.key.startsWith('__')
      ? { cellWidth: anchoImg }
      : { cellWidth: (anchoUtilPDF - anchoImgTotal) * (c.ancho || 20) / sumaPesos, halign: alineacion(c.key) }
  })

  const common = {
    startY,
    styles: { font: 'helvetica', fontSize: 7, cellPadding: 3, overflow: 'linebreak', valign: 'middle', halign: 'center', lineColor: [0, 0, 0], lineWidth: 0.5, textColor: [0, 0, 0], fillColor: [255, 255, 255] },
    margin: { left: 24, right: 24 },
    columnStyles: colStylesPDF,   // iguales en todas las categorías
    // Las filas con imagen necesitan alto suficiente para que se vea
    didParseCell: (d) => { if (d.section === 'body' && meta[d.row.index]) d.cell.styles.minCellHeight = 74 },
    didDrawCell: (d) => {
      if (d.section !== 'body') return
      const m = meta[d.row.index]; if (!m) return
      const col = dataCols[d.column.index]
      if (!col || !col.key.startsWith('__')) return
      const img = col.key === '__foto' ? m.foto : m.documento
      if (!img) return
      const pad = 3
      const maxW = d.cell.width - pad * 2, maxH = d.cell.height - pad * 2
      let w = img.w, h = img.h
      const rr = Math.min(maxW / w, maxH / h)
      w *= rr; h *= rr
      const px = d.cell.x + (d.cell.width - w) / 2, py = d.cell.y + (d.cell.height - h) / 2
      try { doc.addImage(img.dataURL, 'PNG', px, py, w, h) } catch { /* noop */ }
    },
  }

  if (agrupar) {
    // Cada categoría se dibuja en su propia tabla: así se controla el salto de
    // página y la banda gris nunca queda sola al final de una hoja.
    const grupos = agruparPorCategoria(rows, cats)
    const altoPag = doc.internal.pageSize.getHeight()
    let y = startY
    for (const [nombre, items] of grupos) {
      // Espacio mínimo para la banda + encabezado + una fila; si no cabe, nueva hoja
      const minimo = evid.size > 0 ? 150 : 90
      if (y + minimo > altoPag - 24) { doc.addPage(); y = 40 }

      body.length = 0; meta.length = 0
      push([{ content: nombre.toUpperCase(), colSpan: dataCols.length, styles: { ...hStyle, fontSize: 8 } }], null)
      push(dataCols.map(c => ({ content: c.rLabel, styles: hStyle })), null)
      items.forEach(r => push(celdas(r), r))

      autoTable(doc, { ...common, startY: y, body: [...body], rowPageBreak: 'avoid' })
      y = doc.lastAutoTable.finalY + 18   // separación entre categorías
    }
  } else {
    const head = [dataCols.map(c => c.rLabel)]
    rows.forEach(r => push(celdas(r), r))
    autoTable(doc, { ...common, head, body, headStyles: hStyle })
  }
  doc.save(nombreArchivo('pdf'))
}

// ── Export Excel (ExcelJS — réplica exacta del formato oficial) ────────────────────
export async function exportarExcel(rows, cols, cats, titulo = '', evidencias = []) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('INVENTARIO BIENES INMUEBLES')
  // Impresión: horizontal, ajustada al ancho de la hoja para que no se corten
  // las columnas ni los encabezados al imprimir o exportar a PDF.
  ws.pageSetup = {
    orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  }


  const agrupar  = cols.some(c => c.key === 'categoria')
  // Si hay evidencias, se agregan dos columnas al final de la misma tabla
  const evid = new Map((evidencias || []).map(e => [e.idinmueble, e]))
  // Recuadro fijo de la evidencia (px) y celda calculada a partir de él
  const FOTO_W = 190, FOTO_H = 120, PAD = 10
  const CELDA_W_PX = FOTO_W + PAD * 2
  const CELDA_H_PX = FOTO_H + PAD * 2
  const ANCHO_IMG = (CELDA_W_PX - 5) / 7            // ancho de columna en "chars"
  const ALTO_IMG_PT = Math.round(CELDA_H_PX * 3 / 4) // alto de fila en puntos
  const colsImg = evid.size > 0
    ? [{ key: '__foto', rLabel: 'FOTO', ancho: ANCHO_IMG }, { key: '__doc', rLabel: 'DOCUMENTO', ancho: ANCHO_IMG }]
    : []
  const dataCols = [...cols.filter(c => c.key !== 'categoria'), ...colsImg]
  const nCols    = dataCols.length

  const borde  = { style: 'thin', color: { argb: 'FF' + NEGRO } }
  const bordes = { top: borde, left: borde, bottom: borde, right: borde }
  const fillHeader = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + GRIS_HEADER } }
  const FUENTE = 'Arial'
  const FRANJA = 'F2F2F2'   // gris muy claro para filas alternas

  function headerCell(cell, val, align = 'center') {
    cell.value = val
    cell.font = { name: FUENTE, family: 2, size: 12, bold: true, color: { argb: 'FF' + NEGRO } }
    cell.fill = fillHeader
    cell.alignment = { horizontal: align, vertical: 'middle', wrapText: true }
    cell.border = bordes
  }
  function dataCell(cell, val, align, wrap = true, fill = null) {
    cell.value = val
    cell.font = { name: FUENTE, family: 2, size: 12, color: { argb: 'FF' + NEGRO } }
    cell.alignment = { horizontal: align, vertical: 'middle', wrapText: wrap }
    cell.border = bordes
    if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + fill } }
  }

  // Anchos exactos
  dataCols.forEach((c, i) => { ws.getColumn(i + 1).width = c.ancho })

  // Coloca la foto y el documento del inmueble en las dos últimas columnas
  function ponerEvidencias(r, nFila) {
    const e = evid.get(r.idinmueble); if (!e) return
    ws.getRow(nFila).height = ALTO_IMG_PT
    const EMU = 9525                       // EMUs por píxel
    const idxFoto = dataCols.findIndex(c => c.key === '__foto')
    const poner = (img, col) => {
      if (!img) return
      // La imagen se ajusta al recuadro fijo conservando su proporción
      const k = Math.min(FOTO_W / img.w, FOTO_H / img.h)
      const w = img.w * k, h = img.h * k
      const id = wb.addImage({ base64: img.dataURL, extension: 'png' })
      ws.addImage(id, {
        tl: {
          nativeCol: col,    nativeColOff: Math.round((CELDA_W_PX - w) / 2 * EMU),
          nativeRow: nFila - 1, nativeRowOff: Math.round((CELDA_H_PX - h) / 2 * EMU),
        },
        ext: { width: w, height: h },
        editAs: 'oneCell',
      })
    }
    poner(e.foto, idxFoto)
    poner(e.documento, idxFoto + 1)
  }

  let fila = 1

  // Banda de logos: Ayuntamiento (izq), Escudo Nogales (centro), Escudo México (der)
  let logos = null
  // Se cargan por separado: si uno falla, los demás igual se dibujan
  {
    const r = await Promise.allSettled([
      cargarImagen('/logo-ayuntamiento.png'),
      cargarImagen('/escudo-nogales.png'),
      cargarImagen('/escudo-mexico.png'),
    ])
    const [ay, nog, mex] = r.map(x => x.status === 'fulfilled' ? x.value : null)
    r.filter(x => x.status === 'rejected').forEach(() => console.warn('No se pudo cargar un logo del reporte'))
    logos = (ay || nog || mex) ? { ay, nog, mex } : null
  }

  if (logos) {
    const colPx = dataCols.map(c => Math.round(c.ancho * 7 + 5))
    const totalPx = colPx.reduce((a, b) => a + b, 0)
    const pxToCol = (x) => { let acc = 0; for (let k = 0; k < colPx.length; k++) { if (x < acc + colPx[k]) return k + (x - acc) / colPx[k]; acc += colPx[k] } return dataCols.length }
    // La banda mide 2 filas; los logos se dimensionan para caber dentro con
    // holgura, si no invaden la fila del título.
    const H = 58, Hmex = 80
    const ROW_H = 46
    ws.getRow(1).height = ROW_H; ws.getRow(2).height = ROW_H
    const EMU_PX = 9525
    const rowPx  = ROW_H * 96 / 72
    const bandPx = rowPx * 2
    function colNative(px) {
      let acc = 0
      for (let k = 0; k < colPx.length; k++) {
        if (px <= acc + colPx[k]) return { nativeCol: k, nativeColOff: Math.round((px - acc) * EMU_PX) }
        acc += colPx[k]
      }
      return { nativeCol: colPx.length - 1, nativeColOff: 0 }
    }
    function rowNative(px) {
      const idx = Math.floor(px / rowPx)
      return { nativeRow: idx, nativeRowOff: Math.round((px - idx * rowPx) * EMU_PX) }
    }
    const place = (im, leftPx, h) => {
      const w   = h * im.w / im.h
      const top = (bandPx - h) / 2
      const { nativeCol, nativeColOff } = colNative(leftPx)
      const { nativeRow, nativeRowOff } = rowNative(top)
      const id  = wb.addImage({ base64: im.dataURL, extension: 'png' })
      ws.addImage(id, { tl: { nativeCol, nativeColOff, nativeRow, nativeRowOff }, ext: { width: w, height: h }, editAs: 'oneCell' })
    }
    if (logos.ay)  place(logos.ay, 6, H)
    if (logos.nog) place(logos.nog, totalPx / 2 - (H * logos.nog.w / logos.nog.h) / 2, H)
    if (logos.mex) place(logos.mex, totalPx - 6 - (Hmex * logos.mex.w / logos.mex.h), Hmex)
    // Filas de aire entre los logos y el título, para que nada se encime
    ws.getRow(3).height = 14; ws.getRow(4).height = 14
    fila = 5
  }

  // Título opcional
  if (titulo) {
    ws.mergeCells(fila, 1, fila, nCols)
    const tCell = ws.getCell(fila, 1)
    tCell.value = titulo
    tCell.font = { name: FUENTE, family: 2, size: 18, bold: true, underline: true, color: { argb: 'FF' + NEGRO } }
    tCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    fila += 2
  }

  if (agrupar) {
    const grupos = agruparPorCategoria(rows, cats)
    let primero = true
    for (const [nombre, items] of grupos) {
      if (!primero) fila += 3       // 3 renglones en blanco entre categorías
      primero = false

      // Banda con el nombre de la categoría, combinada a lo ancho de la tabla
      ws.mergeCells(fila, 1, fila, dataCols.length)
      dataCols.forEach((c, idx) => headerCell(ws.getCell(fila, idx + 1), idx === 0 ? nombre.toUpperCase() : ''))
      ws.getCell(fila, 1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      fila++

      // Debajo, el encabezado de columnas
      const hRow = ws.getRow(fila)
      dataCols.forEach((c, idx) => headerCell(hRow.getCell(idx + 1), c.rLabel))
      fila++

      // Datos (altura automática + franjas alternas)
      items.forEach((r, i) => {
        const row = ws.getRow(fila)
        const fill = i % 2 === 1 ? FRANJA : null
        dataCols.forEach((c, idx) => dataCell(row.getCell(idx + 1), c.key.startsWith('__') ? '' : valorTexto(c, r, cats), alineacion(c.key), c.key !== 'claveinmueble', fill))
        if (evid.has(r.idinmueble)) ponerEvidencias(r, fila)
        fila++
      })
    }
  } else {
    // Encabezado único
    const hRow = ws.getRow(fila)
    dataCols.forEach((c, idx) => headerCell(hRow.getCell(idx + 1), c.rLabel))
    ws.views = [{ state: 'frozen', ySplit: fila }]
    fila++

    rows.forEach((r, i) => {
      const row = ws.getRow(fila)
      const fill = i % 2 === 1 ? FRANJA : null
      dataCols.forEach((c, idx) => dataCell(row.getCell(idx + 1), c.key.startsWith('__') ? '' : valorTexto(c, r, cats), alineacion(c.key), c.key !== 'claveinmueble', fill))
        if (evid.has(r.idinmueble)) ponerEvidencias(r, fila)
      fila++
    })
  }

  const buf = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nombreArchivo('xlsx'))
}

// Trae todos los registros que cumplen los filtros actuales (paginado)
async function fetchTodosFiltrados({ busqueda, m2Min, m2Max, categoriaIds, categorias }) {
  const BATCH = 1000
  let todos = [], desde = 0
  while (true) {
    let q = supabase.from('bienesinmuebles').select('*').order('consecutivo', { ascending: true }).range(desde, desde + BATCH - 1)
    q = aplicarBusquedaInmuebles(q, busqueda, categorias)
    if (m2Min !== '' && m2Min != null) q = q.gte('superficiem2', Number(m2Min))
    if (m2Max !== '' && m2Max != null) q = q.lte('superficiem2', Number(m2Max))
    if (categoriaIds && categoriaIds.length > 0) q = q.in('idcategoria', categoriaIds)
    else q = q.not('idcategoria', 'in', `(${CATS_FUERA.join(',')})`)
    const { data, error } = await q
    if (error) throw error
    if (!data || data.length === 0) break
    todos = [...todos, ...data]
    if (data.length < BATCH) break
    desde += BATCH
  }
  return todos
}

// Trae registros por lista de ids (en lotes)
async function fetchPorIds(ids) {
  const BATCH = 300
  let todos = []
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH)
    const { data, error } = await supabase.from('bienesinmuebles').select('*').in('idinmueble', chunk).order('consecutivo', { ascending: true })
    if (error) throw error
    todos = [...todos, ...(data || [])]
  }
  return todos
}


// Mide la página activa de un modal de dos páginas y devuelve su altura, para
// que el recuadro se ajuste al contenido en vez de quedar con espacio vacío.
function useAlturaPagina(pagina, deps = []) {
  const refs = [useRef(null), useRef(null)]
  const [alto, setAlto] = useState(null)
  useLayoutEffect(() => {
    const el = refs[pagina]?.current
    if (!el) return
    const medir = () => setAlto(el.scrollHeight)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [pagina, ...deps])
  return [refs, alto]
}

// ── Modal Reporte ───────────────────────────────────────────────────────────────
export function ModalReporte({ onClose, dark, t, categorias, seleccionados, filtros, totalFiltrados, tituloInicial }) {
  const haySel = seleccionados.length > 0
  const [colsSel, setColsSel] = useState(() => new Set(REPORT_COLS.map(c => c.key)))
  const [titulo, setTitulo]   = useState(tituloInicial || '')
  const [alcance, setAlcance] = useState(haySel ? 'seleccion' : 'todos')
  const [generando, setGenerando] = useState(null)   // 'excel' | 'pdf' | null
  const [err, setErr] = useState(null)
  const [pagina, setPagina] = useState(0)   // 0 = reporte, 1 = evidencias
  const [filasEvid, setFilasEvid] = useState([])
  const [adjuntos, setAdjuntos] = useState({})   // { idinmueble: { foto, documento } }
  const [refsPag, altoPag] = useAlturaPagina(pagina, [filasEvid, err])
  // Cuántos inmuebles llevan alguna imagen: si es 0, el reporte sale sin anexo
  const totalEvidencias = Object.values(adjuntos).filter(a => a && (a.foto || a.documento)).length

  // Al pasar a evidencias se traen los inmuebles del alcance elegido
  useEffect(() => {
    if (pagina !== 1) return
    let vivo = true
    const p = alcance === 'seleccion' ? fetchPorIds(seleccionados) : fetchTodosFiltrados(filtros)
    p.then(r => { if (vivo) setFilasEvid(r || []) }).catch(() => { if (vivo) setFilasEvid([]) })
    return () => { vivo = false }
  }, [pagina])

  function toggleCol(key) {
    setColsSel(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }
  const todasCols = colsSel.size === REPORT_COLS.length
  function toggleTodas() {
    setColsSel(todasCols ? new Set() : new Set(REPORT_COLS.map(c => c.key)))
  }

  async function generar(formato) {
    if (colsSel.size === 0) { setErr('Selecciona al menos una columna'); return }
    setGenerando(formato); setErr(null)
    try {
      const rows = alcance === 'seleccion'
        ? await fetchPorIds(seleccionados)
        : await fetchTodosFiltrados(filtros)
      if (!rows.length) { setErr('No hay registros para el reporte'); setGenerando(null); return }
      const cols = REPORT_COLS.filter(c => colsSel.has(c.key))
      const tit  = titulo.trim()
      // Las evidencias se anexan al final del MISMO documento, y solo si se
      // capturó alguna imagen; si no, el reporte sale como siempre.
      const evidencias = rows
        .filter(r => adjuntos[r.idinmueble]?.foto || adjuntos[r.idinmueble]?.documento)
        .map(r => ({
          idinmueble: r.idinmueble,
          clave: r.claveinmueble,
          nombre: r.nombreinmueble,
          categoria: categorias.find(c => c.idcategoria === r.idcategoria)?.nombrecategoria || 'SIN CATEGORÍA',
          foto: adjuntos[r.idinmueble]?.foto || null,
          documento: adjuntos[r.idinmueble]?.documento || null,
        }))
      if (formato === 'excel') await exportarExcel(rows, cols, categorias, tit, evidencias)
      else                     await exportarPDF(rows, cols, categorias, tit, evidencias)
      onClose()
    } catch (e) {
      setErr(e.message)
    } finally {
      setGenerando(null)
    }
  }

  const sepBorder = dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)'
  const conteoAlcance = alcance === 'seleccion' ? seleccionados.length : totalFiltrados

  return createPortal(
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,0.4)', backdropFilter:'blur(4px)' }} />
      <div onClick={e => e.stopPropagation()} style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:301, width:'760px', maxWidth:'94vw', maxHeight:'92vh', display:'flex', flexDirection:'column', background: dark ? '#1e1e20' : '#fff', borderRadius:'16px', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', boxShadow:'0 20px 60px rgba(0,0,0,0.4)', animation:'fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)', overflow:'hidden' }}>

        {/* Dos páginas dentro del mismo modal */}
        <div style={{ display:'flex', flexDirection:'column', minHeight:0, overflow:'hidden' }}>

        {/* ── Página 1: columnas y formato ── */}
        <div ref={refsPag[0]} style={{ display: pagina === 0 ? 'flex' : 'none', flexDirection:'column', maxHeight:'92vh', animation: pagina === 0 ? 'entraIzq 0.22s cubic-bezier(0.32,0.72,0,1)' : undefined }}>

        {/* Header */}
        <div style={{ padding:'1.25rem 1.5rem', borderBottom: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
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

        {/* Cuerpo en dos columnas */}
        <div style={{ display:'flex', minHeight:0 }}>

          {/* Izquierda: columnas */}
          <div style={{ width:'300px', flexShrink:0, borderRight: sepBorder, display:'flex', flexDirection:'column' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'1rem 1.25rem 0.5rem' }}>
              <p style={{ fontSize:'10px', fontWeight:700, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Columnas ({colsSel.size}/{REPORT_COLS.length})</p>
              <button onClick={toggleTodas} style={{ background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:'12px', color: dark ? '#f0f0f0' : '#000', fontWeight:500 }}>
                {todasCols ? 'Quitar todas' : 'Todas'}
              </button>
            </div>
            <div style={{ padding:'0.25rem 0.85rem 1rem', display:'flex', flexDirection:'column', gap:'3px' }}>
              {REPORT_COLS.map(c => {
                const sel = colsSel.has(c.key)
                return (
                  <div key={c.key} onClick={() => toggleCol(c.key)} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 10px', borderRadius:'8px', cursor:'pointer', border:`1px solid ${sel ? (dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)') : 'transparent'}`, background: sel ? (dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)') : 'transparent', transition:'all 0.12s' }}>
                    <div style={{ width:'17px', height:'17px', borderRadius:'5px', flexShrink:0, background: sel ? (dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.78)') : 'transparent', border: dark ? '1.5px solid rgba(255,255,255,0.4)' : '1.5px solid rgba(0,0,0,0.3)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {sel && <i className="ti ti-check" style={{ fontSize:'11px', color: dark ? '#1c1c1e' : '#fff' }} />}
                    </div>
                    <span style={{ fontSize:'13px', color: dark ? '#f0f0f0' : '#111', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.label}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Derecha: título + alcance + botones */}
          <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', padding:'1rem 1.25rem', gap:'1rem' }}>

            {/* Título */}
            <div>
              <p style={{ fontSize:'10px', fontWeight:700, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'8px' }}>Título del documento <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0 }}>(opcional)</span></p>
              <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder={TITULO_REPORTE}
                style={{ width:'100%', padding:'9px 13px', borderRadius:'9px', outline:'none', fontFamily:'inherit', fontSize:'13px', background: dark ? '#2a2a2c' : '#fff', border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.18)', color: dark ? '#f0f0f0' : '#111' }} />
              <p style={{ fontSize:'11px', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)', marginTop:'6px' }}>Si lo dejas vacío, el documento se genera sin título.</p>
            </div>

            {/* Alcance */}
            <div>
              <p style={{ fontSize:'10px', fontWeight:700, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'8px' }}>Registros a incluir</p>
              <div style={{ display:'flex', gap:'5px', background: t.cardBg, border:`1px solid ${t.cardBorder}`, borderRadius:'12px', padding:'5px', backdropFilter:'blur(10px)' }}>
                <button onClick={() => haySel && setAlcance('seleccion')} disabled={!haySel}
                  style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'8px', padding:'8px 12px', borderRadius:'9px', fontSize:'13px', fontWeight:500, fontFamily:'inherit', cursor: haySel ? 'pointer' : 'not-allowed', opacity: haySel ? 1 : 0.4, transition:'all 0.15s',
                    background: alcance === 'seleccion' ? (dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)') : 'transparent',
                    border: alcance === 'seleccion' ? `1px solid ${t.cardBorder}` : '1px solid transparent',
                    color: alcance === 'seleccion' ? t.text1 : t.text3 }}>
                  <i className="ti ti-square-check" style={{ fontSize:'16px' }} />
                  {seleccionados.length} seleccionado{seleccionados.length !== 1 ? 's' : ''}
                </button>
                <button onClick={() => setAlcance('todos')}
                  style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'8px', padding:'8px 12px', borderRadius:'9px', fontSize:'13px', fontWeight:500, fontFamily:'inherit', cursor:'pointer', transition:'all 0.15s',
                    background: alcance === 'todos' ? (dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)') : 'transparent',
                    border: alcance === 'todos' ? `1px solid ${t.cardBorder}` : '1px solid transparent',
                    color: alcance === 'todos' ? t.text1 : t.text3 }}>
                  <i className="ti ti-list" style={{ fontSize:'16px' }} />
                  Todos ({totalFiltrados.toLocaleString()})
                </button>
              </div>
              <p style={{ fontSize:'11px', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)', marginTop:'7px' }}>
                {alcance === 'seleccion'
                  ? 'Solo los registros que marcaste con checkbox.'
                  : 'Todos los registros que cumplen los filtros actuales.'}
              </p>

              {/* Evidencias: se anexan al final del mismo reporte */}
              <button onClick={() => setPagina(1)} disabled={conteoAlcance === 0}
                style={{ width:'100%', marginTop:'10px', display:'flex', alignItems:'center', gap:'8px', padding:'10px 12px', borderRadius:'9px', fontSize:'13px', fontWeight:500, fontFamily:'inherit', cursor: conteoAlcance === 0 ? 'not-allowed' : 'pointer', opacity: conteoAlcance === 0 ? 0.5 : 1, background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)', border:`1px solid ${t.cardBorder}`, color: t.text1 }}>
                <i className="ti ti-camera" style={{ fontSize:'16px', color: t.text3 }} />
                <span style={{ flex:1, textAlign:'left' }}>
                  Agregar evidencias{totalEvidencias > 0 ? ` (${totalEvidencias})` : ''}
                </span>
                <i className="ti ti-chevron-right" style={{ fontSize:'14px', color: t.text4 }} />
              </button>
            </div>

            <div style={{ flex:1 }} />

            {/* Botones */}
            <div>
              {err && <p style={{ fontSize:'12px', color: dark ? '#f4a1a1' : '#c0392b', marginBottom:'10px' }}><i className="ti ti-alert-circle" style={{ marginRight:'5px' }} />{err}</p>}
              <div style={{ display:'flex', gap:'8px' }}>
                <button onClick={() => generar('excel')} disabled={generando || conteoAlcance === 0}
                  style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'7px', padding:'11px', borderRadius:'9px', fontSize:'14px', fontWeight:600, fontFamily:'inherit', cursor: generando || conteoAlcance === 0 ? 'not-allowed' : 'pointer', opacity: conteoAlcance === 0 ? 0.5 : 1,
                    background: dark ? 'rgba(168,230,207,0.18)' : 'rgba(30,126,74,0.08)', border: dark ? '1px solid rgba(168,230,207,0.35)' : '1px solid rgba(30,126,74,0.35)', color: dark ? '#a8e6cf' : '#15803d' }}>
                  {generando === 'excel' ? <><i className="ti ti-loader-2" style={{ fontSize:'15px', animation:'spin 1s linear infinite' }} />Generando…</> : <><i className="ti ti-file-spreadsheet" style={{ fontSize:'16px' }} />Excel</>}
                </button>
                <button onClick={() => generar('pdf')} disabled={generando || conteoAlcance === 0}
                  style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'7px', padding:'11px', borderRadius:'9px', fontSize:'14px', fontWeight:600, fontFamily:'inherit', cursor: generando || conteoAlcance === 0 ? 'not-allowed' : 'pointer', opacity: conteoAlcance === 0 ? 0.5 : 1,
                    background: dark ? 'rgba(244,161,161,0.15)' : 'rgba(192,57,43,0.07)', border: dark ? '1px solid rgba(244,161,161,0.35)' : '1px solid rgba(192,57,43,0.3)', color: dark ? '#f4a1a1' : '#c0392b' }}>
                  {generando === 'pdf' ? <><i className="ti ti-loader-2" style={{ fontSize:'15px', animation:'spin 1s linear infinite' }} />Generando…</> : <><i className="ti ti-file-type-pdf" style={{ fontSize:'16px' }} />PDF</>}
                </button>
              </div>
            </div>
          </div>
        </div>
        </div>

        {/* ── Página 2: evidencias ── */}
        <div ref={refsPag[1]} style={{ display: pagina === 1 ? 'flex' : 'none', flexDirection:'column', maxHeight:'92vh', animation: pagina === 1 ? 'entraDer 0.22s cubic-bezier(0.32,0.72,0,1)' : undefined }}>
          <PaginaEvidencias onVolver={() => setPagina(0)} bienes={filasEvid}
            adjuntos={adjuntos} setAdjuntos={setAdjuntos} dark={dark} t={t} />
        </div>

        </div>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translate(-50%,-48%) scale(0.98)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}} @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}} @keyframes entraDer{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}} @keyframes entraIzq{from{opacity:0;transform:translateX(-40px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </>,
    document.body
  )
}

// Aplica la búsqueda libre sobre la consulta de inmuebles.
//
// El valor va entre comillas dobles porque PostgREST separa las condiciones de
// or() con comas: si el texto trae una coma sin comillas, la consulta se rompe.
// Además del nombre y las claves, busca en ubicación, documento de propiedad
// (número de escritura), expediente y categoría; y si el texto es un número o una
// fecha, también en superficie, valor catastral y fecha.
function aplicarBusquedaInmuebles(query, busqueda, categorias) {
  const txt = String(busqueda || '').trim()
  if (!txt) return query
  const val = `"%${txt.replace(/"/g, '')}%"`
  const cond = [
    `nombreinmueble.ilike.${val}`,
    `claveinmueble.ilike.${val}`,
    `clavecatastral.ilike.${val}`,
    `ubicacion.ilike.${val}`,
    `documentopropiedad.ilike.${val}`,
    `expediente.ilike.${val}`,
    `adquisicion.ilike.${val}`,
  ]

  // Categoría: se resuelven los ids cuyo nombre coincide (p. ej. "espacios deportivos")
  const ids = (categorias || [])
    .filter(c => (c.nombrecategoria || '').toLowerCase().includes(txt.toLowerCase()))
    .map(c => c.idcategoria)
  if (ids.length) cond.push(`idcategoria.in.(${ids.join(',')})`)

  // Número: se busca por aproximación, no exacto. Al teclear "2000" también
  // deben salir 2000.25 o 2000.9, así que se toma el rango [n, n+1).
  const limpio = txt.replace(/[$,\s]/g, '')
  const num = Number(limpio)
  if (Number.isFinite(num) && limpio !== '') {
    const paso = limpio.includes('.') ? 0.01 : 1   // si ya trae decimales, margen fino
    cond.push(`and(superficiem2.gte.${num},superficiem2.lt.${num + paso})`)
    cond.push(`and(valorcatastral.gte.${num},valorcatastral.lt.${num + paso})`)
  }
  // Fecha completa (2024-05-01) o año (2024). El rango del año va dentro de un
  // and(...): como condiciones sueltas del or() el "lte" dejaría pasar todo.
  if (/^\d{4}-\d{2}-\d{2}$/.test(txt)) cond.push(`fecha_enajenacion.eq.${txt}`)
  else if (/^\d{4}$/.test(txt)) cond.push(`and(fecha_enajenacion.gte.${txt}-01-01,fecha_enajenacion.lte.${txt}-12-31)`)

  return query.or(cond.join(','))
}

// ── Query Supabase ────────────────────────────────────────────────────────────
// Los mismos filtros de la tabla menos el texto buscado. Se comparte con
// paginaDeInmueble para que el conteo salga sobre exactamente la misma lista.
function filtrosDeListaInmuebles(query, { m2Min, m2Max, categoriaIds }) {
  if (m2Min !== '' && m2Min != null)
    query = query.gte('superficiem2', Number(m2Min))

  if (m2Max !== '' && m2Max != null)
    query = query.lte('superficiem2', Number(m2Max))

  if (categoriaIds && categoriaIds.length > 0)
    query = query.in('idcategoria', categoriaIds)
  else
    query = query.not('idcategoria', 'in', `(${CATS_FUERA.join(',')})`)

  return query
}

// En qué página cae un inmueble: cuántos van antes que él con los filtros
// puestos pero sin el texto buscado, en el mismo orden que usa la tabla.
async function paginaDeInmueble(inm, filtros) {
  const { porPagina } = filtros
  const { data: fila, error: e0 } = await supabase
    .from('bienesinmuebles').select('idinmueble, consecutivo').eq('idinmueble', inm.idinmueble).maybeSingle()
  if (e0) throw e0
  if (!fila) throw new Error('El inmueble ya no está en la base')

  let q = filtrosDeListaInmuebles(
    supabase.from('bienesinmuebles').select('idinmueble', { count:'exact', head:true }), filtros)
  q = fila.consecutivo == null
    ? q.or(`consecutivo.not.is.null,and(consecutivo.is.null,idinmueble.lt.${fila.idinmueble})`)
    : q.or(`consecutivo.lt.${fila.consecutivo},and(consecutivo.eq.${fila.consecutivo},idinmueble.lt.${fila.idinmueble})`)

  const { count, error } = await q
  if (error) throw error
  return Math.floor((count || 0) / porPagina)
}

async function fetchInmuebles({ pagina, busqueda, porPagina, m2Min, m2Max, categoriaIds, categorias }) {
  const desde = pagina * porPagina
  const hasta  = desde + porPagina - 1

  let query = supabase
    .from('bienesinmuebles')
    .select('*', { count:'exact' })
    .order('consecutivo', { ascending:true })
    // Hay muchos consecutivos repetidos: sin este desempate el orden dentro de
    // un empate no es fijo y la misma página podía traer renglones distintos.
    .order('idinmueble', { ascending:true })
    .range(desde, hasta)

  query = aplicarBusquedaInmuebles(query, busqueda, categorias)
  query = filtrosDeListaInmuebles(query, { m2Min, m2Max, categoriaIds })

  const { data, error, count } = await query
  if (error) throw error
  return { data, count }
}

// ── Reporte Enajenaciones ─────────────────────────────────────────────────────
function cargarImagenEnaj(src) {
  if (src.startsWith('/')) src = import.meta.env.BASE_URL + src.slice(1)
  return new Promise((resolve, reject) => {
    const img = new Image(); img.crossOrigin = 'anonymous'
    img.onload = () => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); resolve({ dataURL: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight }) }
    img.onerror = reject; img.src = src
  })
}

const COLS_ENAJ = [
  { key: 'nombreinmueble',    label: 'INMUEBLE',              w: 50, align: 'left' },
  { key: 'clavecatastral',    label: 'CLAVE CATASTRAL',       w: 18 },
  { key: 'superficiem2',      label: 'SUPERFICIE M2',         w: 16 },
  { key: 'ubicacion',         label: 'UBICACIÓN',             w: 36, align: 'left' },
  { key: 'afavorde',          label: 'A FAVOR DE',            w: 30, align: 'left' },
  { key: 'valorcatastral',    label: 'VALOR CATASTRAL',       w: 18 },
  { key: 'documentopropiedad',label: 'DOCUMENTO DE PROPIEDAD',w: 40, align: 'left' },
  { key: 'tipo_mov',          label: 'MOVIMIENTO',            w: 22 },
]

function fmtValEnaj(n) { return n != null && n !== '' ? '$ ' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '$0.00' }
function fmtM2Enaj(n)  { return n != null && n !== '' ? Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 }) + ' M2' : '—' }

function valorEnaj(col, row) {
  const v = row[col.key]
  if (col.key === 'valorcatastral') return fmtValEnaj(v)
  if (col.key === 'superficiem2')   return fmtM2Enaj(v)
  return v != null ? String(v) : '—'
}

export async function exportarEnajenacionesPDF(desinc, incorp, titulo = '') {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 18
  const GRIS_RGB = [191, 191, 191], AZUL_RGB = [68, 114, 196]

  // Logos
  let startY = margin + 8
  try {
    const [ay, nog, mex] = await Promise.all([cargarImagenEnaj('/logo-ayuntamiento.png'), cargarImagenEnaj('/escudo-nogales.png'), cargarImagenEnaj('/escudo-mexico.png')])
    const H = 46, Hmex = 66
    const wAy = H * ay.w / ay.h, wNog = H * nog.w / nog.h, wMex = Hmex * mex.w / mex.h
    doc.addImage(ay.dataURL,  'PNG', margin, startY, wAy, H, undefined, 'FAST')
    doc.addImage(nog.dataURL, 'PNG', (pageW - wNog) / 2, startY, wNog, H, undefined, 'FAST')
    doc.addImage(mex.dataURL, 'PNG', pageW - margin - wMex, startY - (Hmex - H) / 2, wMex, Hmex, undefined, 'FAST')
    startY += Hmex + 10
  } catch { startY += 20 }

  // Título principal
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(0)
  doc.text(titulo || 'ENAJENACIONES DEL H. AYUNTAMIENTO DE NOGALES', pageW / 2, startY, { align: 'center' })
  startY += 22

  const hStyle = { fillColor: GRIS_RGB, textColor: [0,0,0], fontStyle: 'bold', halign: 'center', valign: 'middle', fontSize: 7 }
  const dStyle = { fontSize: 7, cellPadding: 3 }
  const colStyles = {}
  // El ancho se fija por columna: si se deja automático, cada sección se
  // dimensiona según su propio contenido y las dos tablas salen distintas.
  const anchoUtil = pageW - margin * 2
  const sumaW = COLS_ENAJ.reduce((s, c) => s + c.w, 0)
  COLS_ENAJ.forEach((c, i) => {
    colStyles[i] = {
      halign: c.align === 'left' ? 'left' : 'center',
      cellWidth: anchoUtil * c.w / sumaW,
    }
  })

  const renderSeccion = (filas, tituloSeccion, y) => {
    if (filas.length === 0) return y
    // Si no queda espacio para la banda + encabezado + una fila, se pasa a la
    // hoja siguiente: así el título nunca queda solo al pie de la página.
    const altoPag = doc.internal.pageSize.getHeight()
    if (y + 90 > altoPag - margin) { doc.addPage(); y = margin + 8 }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
    // Casilla con relleno gris Y contorno (antes solo sombreado, sin borde)
    doc.setFillColor(...GRIS_RGB)
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.5)
    doc.rect(margin, y, pageW - margin * 2, 16, 'FD')
    doc.setTextColor(0); doc.text(tituloSeccion, pageW / 2, y + 10.5, { align: 'center' })
    y += 26   // salto de línea entre el título y la tabla (antes iban pegados)
    autoTable(doc, {
      startY: y,
      head: [COLS_ENAJ.map(c => c.label)],
      body: filas.map(row => COLS_ENAJ.map(c => valorEnaj(c, row))),
      headStyles: hStyle,
      bodyStyles: dStyle,
      columnStyles: colStyles,
      styles: { lineColor: [0,0,0], lineWidth: 0.3, font: 'helvetica', overflow: 'linebreak' },
      margin: { left: margin, right: margin },
      rowPageBreak: 'avoid',   // ninguna fila se parte entre dos hojas
      showHead: 'everyPage',   // si continúa en otra hoja, repite el encabezado
    })
    return doc.lastAutoTable.finalY + 10
  }

  startY = renderSeccion(desinc, 'DESINCORPORACIONES DEL REGIMEN DEL DOMINIO PUBLICO MUNICIPAL DE LA ADMINISTRACION MUNICIPAL DE NOGALES, SONORA', startY)
  renderSeccion(incorp, 'INCORPORACIONES AL REGIMEN DEL DOMINIO PUBLICO MUNICIPAL DE LA ADMINISTRACION MUNICIPAL DE NOGALES, SONORA', startY)

  doc.save(`enajenaciones-${new Date().toISOString().slice(0,10)}.pdf`)
}

export async function exportarEnajenacionesExcel(desinc, incorp, titulo = '') {
  const ExcelJS = (await import('exceljs')).default
  const { saveAs } = await import('file-saver')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('ENAJENACIONES')
  // Impresión: horizontal, ajustada al ancho de la hoja para que no se corten
  // las columnas ni los encabezados al imprimir o exportar a PDF.
  ws.pageSetup = {
    orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  }

  const FUENTE = 'Arial'
  const borde = { style: 'thin', color: { argb: 'FF000000' } }
  const bordes = { top: borde, left: borde, bottom: borde, right: borde }
  const nCols = COLS_ENAJ.length

  // ── Geometría espejo del PDF (jsPDF landscape A4, margin=18) ──
  // El PDF reparte el ancho útil según los pesos c.w de COLS_ENAJ. Convertimos ese
  // ancho en pt a unidades de Excel: px = pt*4/3 ; ancho_chars = (px - 5) / 7.
  const PT_A_PX = 4 / 3
  const totalPt = 841.89 - 18 * 2
  const sumW = COLS_ENAJ.reduce((a, c) => a + c.w, 0)
  const colChar = COLS_ENAJ.map(c => (totalPt * c.w / sumW * PT_A_PX - 5) / 7)
  colChar.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  const colPxArr = colChar.map(w => Math.round(w * 7 + 5))
  const totPx = colPxArr.reduce((a, b) => a + b, 0)
  let fila = 1

  // Logos — mismos tamaños y posiciones que el PDF (H=46, Hmex=66, márgenes laterales)
  try {
    const [ay, nog, mex] = await Promise.all([cargarImagenEnaj('/logo-ayuntamiento.png'), cargarImagenEnaj('/escudo-nogales.png'), cargarImagenEnaj('/escudo-mexico.png')])
    const H = 46, Hmex = 66, ROW_H = 34, EMU_PX = 9525
    ws.getRow(1).height = ROW_H; ws.getRow(2).height = ROW_H
    const rowPx = ROW_H * 96 / 72, bandPx = rowPx * 2
    const colNR = px => { let acc = 0; for (let k = 0; k < colPxArr.length; k++) { if (px <= acc + colPxArr[k]) return { nativeCol: k, nativeColOff: Math.round((px - acc) * EMU_PX) }; acc += colPxArr[k] } return { nativeCol: colPxArr.length - 1, nativeColOff: 0 } }
    const rowNR = px => { const idx = Math.floor(px / rowPx); return { nativeRow: idx, nativeRowOff: Math.round((px - idx * rowPx) * EMU_PX) } }
    const pl = (im, lx, h) => { const w = h * im.w / im.h; const top = (bandPx - h) / 2; const { nativeCol, nativeColOff } = colNR(lx); const { nativeRow, nativeRowOff } = rowNR(top); const id = wb.addImage({ base64: im.dataURL, extension: 'png' }); ws.addImage(id, { tl: { nativeCol, nativeColOff, nativeRow, nativeRowOff }, ext: { width: w, height: h }, editAs: 'oneCell' }) }
    const wNog = H * nog.w / nog.h, wMex = Hmex * mex.w / mex.h
    pl(ay, 6, H); pl(nog, totPx / 2 - wNog / 2, H); pl(mex, totPx - 6 - wMex, Hmex)
    ws.getRow(3).height = 14; ws.getRow(4).height = 14; ws.getRow(5).height = 14
    fila = 6   // el título arranca en la fila 6: los logos ya no quedan encima
  } catch { fila = 1 }

  // Título principal — centrado, 12pt bold (igual que el PDF)
  ws.mergeCells(fila, 1, fila, nCols)
  Object.assign(ws.getCell(fila, 1), { value: titulo || 'ENAJENACIONES DEL H. AYUNTAMIENTO DE NOGALES', font: { name: FUENTE, size: 12, bold: true }, alignment: { horizontal: 'center', vertical: 'middle' } })
  ws.getRow(fila).height = 20; fila++
  ws.getRow(fila).height = 12; fila++   // espacio bajo el título (PDF: +22)

  const escribirSeccion = (filas, tituloSeccion) => {
    if (filas.length === 0) return
    // Casilla de sección: relleno gris + contorno, 16pt de alto (igual que el PDF)
    ws.mergeCells(fila, 1, fila, nCols)
    const cSec = ws.getCell(fila, 1)
    cSec.value = tituloSeccion
    cSec.font = { name: FUENTE, size: 8, bold: true }
    cSec.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBFBFBF' } }
    cSec.alignment = { horizontal: 'center', vertical: 'middle' }
    cSec.border = bordes
    ws.getRow(fila).height = 16; fila++
    ws.getRow(fila).height = 10; fila++   // salto entre la casilla y la tabla (PDF: gap 10pt)

    // Encabezado de columnas — gris, 7pt bold (igual que headStyles del PDF)
    COLS_ENAJ.forEach((c, ci) => {
      const cell = ws.getCell(fila, ci + 1)
      cell.value = c.label; cell.border = bordes
      cell.font = { name: FUENTE, size: 7, bold: true }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBFBFBF' } }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    })
    ws.getRow(fila).height = 26; fila++

    // Filas de datos — 7pt (igual que bodyStyles del PDF); altura en autoajuste
    filas.forEach(row => {
      COLS_ENAJ.forEach((c, ci) => {
        const cell = ws.getCell(fila, ci + 1)
        cell.value = valorEnaj(c, row); cell.border = bordes
        cell.font = { name: FUENTE, size: 7 }
        cell.alignment = { horizontal: c.align === 'left' ? 'left' : 'center', vertical: 'middle', wrapText: true }
      })
      fila++
    })
    ws.getRow(fila).height = 12; fila++   // espacio entre secciones
  }

  escribirSeccion(desinc, 'DESINCORPORACIONES DEL REGIMEN DEL DOMINIO PUBLICO MUNICIPAL DE LA ADMINISTRACION MUNICIPAL DE NOGALES, SONORA')
  escribirSeccion(incorp, 'INCORPORACIONES AL REGIMEN DEL DOMINIO PUBLICO MUNICIPAL DE LA ADMINISTRACION MUNICIPAL DE NOGALES, SONORA')

  const buf = await wb.xlsx.writeBuffer()
  const { saveAs: save } = await import('file-saver')
  save(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `enajenaciones-${new Date().toISOString().slice(0,10)}.xlsx`)
}

// ── Página ────────────────────────────────────────────────────────────────────
// ── Modal Desincorporación (observaciones + fecha) ──────────────────────────────
export function ModalDesincorporacion({ cantidad, onClose, dark, t, onConfirm, titulo = 'Desincorporación', textoBoton = 'Confirmar' }) {
  const [obs, setObs]   = useState('')
  const [fecha, setFecha] = useState('')
  const [guardando, setGuardando] = useState(false)
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  async function confirmar() {
    setGuardando(true)
    try { await onConfirm({ obs, fecha: fecha || hoyISO() }); onClose() }
    catch (e) { console.error(e); setGuardando(false) }
  }
  return createPortal(
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,0.4)', backdropFilter:'blur(4px)' }} />
      <div onClick={e => e.stopPropagation()} style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:301, width:'460px', maxWidth:'92vw', display:'flex', flexDirection:'column', background: dark ? '#1e1e20' : '#fff', borderRadius:'16px', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', boxShadow:'0 20px 60px rgba(0,0,0,0.4)', animation:'fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)', overflow:'hidden' }}>
        <div style={{ padding:'1.25rem 1.5rem', borderBottom: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
            <div style={{ width:'34px', height:'34px', borderRadius:'9px', background: dark ? 'rgba(244,161,161,0.15)' : 'rgba(192,57,43,0.08)', border: dark ? '1px solid rgba(244,161,161,0.3)' : '1px solid rgba(192,57,43,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <i className="ti ti-archive-off" style={{ fontSize:'18px', color: dark ? '#f4a1a1' : '#c0392b' }} />
            </div>
            <div>
              <p style={{ fontSize:'15px', fontWeight:600, color: dark ? '#fff' : '#111' }}>{titulo}</p>
              <p style={{ fontSize:'12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>{cantidad} inmueble{cantidad !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width:'30px', height:'30px', borderRadius:'7px', background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color: dark ? '#ccc' : '#555' }}>
            <i className="ti ti-x" style={{ fontSize:'15px' }} />
          </button>
        </div>
        <div style={{ padding:'1.25rem 1.5rem', display:'flex', flexDirection:'column', gap:'1rem' }}>
          <div>
            <p style={{ fontSize:'10px', fontWeight:700, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'6px' }}>Fecha</p>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              style={{ width:'100%', padding:'9px 12px', borderRadius:'9px', outline:'none', fontFamily:'inherit', fontSize:'14px', background: dark ? '#2a2a2c' : '#fff', border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.18)', color: dark ? '#f0f0f0' : '#111', colorScheme: dark ? 'dark' : 'light', boxSizing:'border-box' }} />
          </div>
          <div>
            <p style={{ fontSize:'10px', fontWeight:700, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'6px' }}>Observaciones</p>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={4} placeholder="Detalle de la desincorporación..."
              style={{ width:'100%', padding:'9px 12px', borderRadius:'9px', outline:'none', fontFamily:'inherit', fontSize:'14px', resize:'none', lineHeight:1.5, background: dark ? '#2a2a2c' : '#fff', border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.18)', color: dark ? '#f0f0f0' : '#111', boxSizing:'border-box' }} />
          </div>
        </div>
        <div style={{ padding:'1rem 1.5rem', borderTop: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display:'flex', gap:'8px' }}>
          <button onClick={onClose} disabled={guardando} style={{ flex:1, padding:'10px', background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)', border: dark ? '1px solid rgba(255,255,255,0.13)' : '1px solid rgba(0,0,0,0.09)', borderRadius:'9px', fontSize:'14px', fontWeight:500, color: dark ? '#ccc' : '#444', fontFamily:'inherit', cursor:'pointer' }}>Cancelar</button>
          <button onClick={confirmar} disabled={guardando} style={{ flex:1, padding:'10px', background: dark ? 'rgba(244,161,161,0.18)' : 'rgba(192,57,43,0.08)', border: dark ? '1px solid rgba(244,161,161,0.35)' : '1px solid rgba(192,57,43,0.35)', borderRadius:'9px', fontSize:'14px', fontWeight:600, color: dark ? '#f4a1a1' : '#c0392b', fontFamily:'inherit', cursor: guardando ? 'wait' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'6px' }}>
            {guardando ? <><i className="ti ti-loader-2" style={{ fontSize:'15px', animation:'spin 1s linear infinite' }} />Procesando…</> : <><i className="ti ti-archive-off" style={{ fontSize:'15px' }} />{textoBoton}</>}
          </button>
        </div>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translate(-50%,-48%) scale(0.98)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}} @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}} @keyframes entraDer{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}} @keyframes entraIzq{from{opacity:0;transform:translateX(-40px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </>,
    document.body
  )
}

// Siguiente clave de un inmueble dentro de su categoría.
// El formato que ya usa la base es {consecutivo}-{clave de categoría}: 37-E,
// 14-PL, 898-BOL. Se lee de la base, no se inventa.
export async function siguienteClaveInmueble(idcategoria, categorias) {
  // La clave de la categoría se toma de la base; la lista que llega solo se usa
  // como atajo. Así no depende de qué columnas haya pedido quien la llame.
  let cat = (categorias || []).find(c => Number(c.idcategoria) === Number(idcategoria))
  if (!cat?.clavecategoria) {
    const { data, error } = await supabase
      .from('categoriasinmuebles')
      .select('idcategoria, nombrecategoria, clavecategoria')
      .eq('idcategoria', idcategoria)
      .maybeSingle()
    if (error) throw error
    cat = data
  }
  if (!cat?.clavecategoria) return null

  const { data, error } = await supabase
    .from('bienesinmuebles')
    .select('claveinmueble')
    .eq('idcategoria', idcategoria)
  if (error) throw error

  let max = 0
  for (const r of data || []) {
    const m = String(r.claveinmueble || '').match(/^(\d+)\s*-/)
    if (!m) continue
    const n = parseInt(m[1], 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  const n = max + 1
  return { clave: `${String(n).padStart(2, '0')}-${cat.clavecategoria}`, numero: n }
}

// El consecutivo es el orden global del listado, no el de la categoría
async function siguienteConsecutivoInmueble() {
  const { data, error } = await supabase
    .from('bienesinmuebles').select('consecutivo')
    .order('consecutivo', { ascending: false }).limit(1)
  if (error) throw error
  return ((data && data[0]?.consecutivo) || 0) + 1
}

// ── Modal Nuevo Inmueble ──────────────────────────────────────────────────────
export function ModalNuevoInmueble({ onClose, onCreated, dark, t, categorias }) {
  const [clave, setClave]         = useState('')
  const [nombre, setNombre]       = useState('')
  const [idcategoria, setIdcat]   = useState('')
  const [catastral, setCatastral] = useState('')
  const [superficie, setSuperficie] = useState('')
  const [ubicacion, setUbicacion] = useState('')
  const [valor, setValor]         = useState('')
  const [documento, setDocumento] = useState('')
  const [expediente, setExpediente] = useState('')
  const [adquisicion, setAdquisicion] = useState('')
  const [afavorde, setAfavorde] = useState('H. AYUNTAMIENTO DE NOGALES')
  const [fechaEnaj, setFechaEnaj] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState(null)
  const [claveAuto, setClaveAuto] = useState(false)   // true mientras no se toque a mano
  const cacheClaves = useRef({})                      // idcategoria -> clave ya calculada

  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = '' } }, [])

  // Al abrir se calculan de una vez las claves de todas las categorías, en
  // paralelo. Así elegir una es instantáneo en lugar de esperar una consulta.
  useEffect(() => {
    let vivo = true
    Promise.all((categorias || []).map(c =>
      siguienteClaveInmueble(c.idcategoria, categorias)
        .then(g => [c.idcategoria, g?.clave])
        .catch(() => [c.idcategoria, null])
    )).then(pares => {
      if (!vivo) return
      for (const [id, cl] of pares) if (cl) cacheClaves.current[id] = cl
      // Si ya se eligió categoría mientras cargaba, se completa su clave
      setIdcat(actual => {
        if (actual && cacheClaves.current[actual]) { setClave(cacheClaves.current[actual]); setClaveAuto(true) }
        return actual
      })
    })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Al elegir la categoría se consulta a la base el último consecutivo de esa
  // categoría y se propone la clave. Si el usuario la escribe a mano, se respeta.
  useEffect(() => {
    if (!idcategoria) { if (claveAuto || clave === '') { setClave(''); setClaveAuto(false) } return }
    // Si ya se calculó para esa categoría se reusa: cambiar de categoría y
    // volver no dispara otra consulta.
    const enCache = cacheClaves.current[idcategoria]
    if (enCache) { setClave(enCache); setClaveAuto(true); return }

    let vivo = true
    setClave('Generando…'); setClaveAuto(true)
    siguienteClaveInmueble(idcategoria, categorias)
      .then(g => {
        if (!vivo) return
        if (g) cacheClaves.current[idcategoria] = g.clave
        setClave(g ? g.clave : ''); setClaveAuto(!!g)
      })
      .catch(() => { if (vivo) { setClave(''); setClaveAuto(false) } })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idcategoria])

  async function guardar() {
    if (!nombre.trim())  { setErr('El nombre del inmueble es obligatorio'); return }
    if (!idcategoria)    { setErr('Selecciona la categoría'); return }
    // No guardar el texto de espera si se envía antes de que llegue la clave
    if (clave === 'Generando…') { setErr('Espera a que se genere la clave'); return }
    setGuardando(true); setErr(null)
    try {
      const { error } = await supabase.from('bienesinmuebles').insert({
        claveinmueble: clave.trim() || null,
        consecutivo: await siguienteConsecutivoInmueble(),
        nombreinmueble: nombre.trim().toUpperCase(),
        idcategoria: Number(idcategoria),
        clavecatastral: catastral.trim() || null,
        superficiem2: superficie !== '' ? Number(superficie) : null,
        ubicacion: ubicacion.trim() || null,
        valorcatastral: valor !== '' ? Number(valor) : null,
        documentopropiedad: documento.trim() || null,
        expediente: expediente.trim() || null,
        adquisicion: adquisicion.trim() || null,
        afavorde: afavorde.trim() || null,
        fecha_enajenacion: fechaEnaj || null,
      })
      if (error) throw error
      onCreated()
      onClose()
    } catch (e) { setErr(e.message); setGuardando(false) }
  }

  const lbl = (txt) => <p style={{ fontSize:'10px', fontWeight:700, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'6px' }}>{txt}</p>

  return createPortal(
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,0.4)', backdropFilter:'blur(4px)' }} />
      <div onClick={e => e.stopPropagation()} style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:301, width:'560px', maxWidth:'94vw', maxHeight:'92vh', display:'flex', flexDirection:'column', background: dark ? '#1e1e20' : '#fff', borderRadius:'16px', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', boxShadow:'0 20px 60px rgba(0,0,0,0.4)', animation:'fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ padding:'1.25rem 1.5rem', borderBottom: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
            <div style={{ width:'34px', height:'34px', borderRadius:'9px', background: t.iconBox, border:`1px solid ${t.iconBoxBorder}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <i className="ti ti-building-plus" style={{ fontSize:'18px', color: t.text2 }} />
            </div>
            <div>
              <p style={{ fontSize:'15px', fontWeight:600, color: dark ? '#fff' : '#111' }}>Nuevo inmueble</p>
              <p style={{ fontSize:'12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>Registrar un bien inmueble en el inventario</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width:'30px', height:'30px', borderRadius:'7px', background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color: dark ? '#ccc' : '#555' }}>
            <i className="ti ti-x" style={{ fontSize:'15px' }} />
          </button>
        </div>

        {/* Cuerpo */}
        <div style={{ minHeight:0, maxHeight:'62vh', overflowY:'auto', padding:'1.25rem 1.5rem', display:'flex', flexDirection:'column', gap:'1rem' }}>
          {/* La categoría va primero: de ella sale el consecutivo de la clave */}
          <div>{lbl('Categoría *')}
            <select value={idcategoria} onChange={e => setIdcat(e.target.value)} style={sStyle(dark)}>
              <option value="">Selecciona una categoría…</option>
              {categorias.map(c => <option key={c.idcategoria} value={c.idcategoria}>{c.nombrecategoria}</option>)}
            </select>
          </div>
          <div>{lbl('Clave')}
            <input value={clave} onChange={e => { setClave(e.target.value); setClaveAuto(false) }}
              placeholder={idcategoria ? '' : 'Se genera al elegir la categoría'}
              style={iStyle(dark)} />
          </div>
          <div>{lbl('Nombre del inmueble *')}<input value={nombre} onChange={e => setNombre(e.target.value)} style={iStyle(dark)} /></div>
          <div>{lbl('Ubicación')}<input value={ubicacion} onChange={e => setUbicacion(e.target.value)} style={iStyle(dark)} /></div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px', flexWrap:'wrap' }}>
            <div>{lbl('Clave catastral')}<input value={catastral} onChange={e => setCatastral(e.target.value)} style={iStyle(dark)} /></div>
            <div>{lbl('Superficie (m²)')}<input type="number" value={superficie} onChange={e => setSuperficie(e.target.value)} style={iStyle(dark)} /></div>
            <div>{lbl('Valor catastral ($)')}<input type="number" value={valor} onChange={e => setValor(e.target.value)} style={iStyle(dark)} /></div>
          </div>
          <div>{lbl('Documento de propiedad')}<input value={documento} onChange={e => setDocumento(e.target.value)} style={iStyle(dark)} /></div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', flexWrap:'wrap' }}>
            <div>{lbl('Expediente')}<input value={expediente} onChange={e => setExpediente(e.target.value)} style={iStyle(dark)} /></div>
            <div>{lbl('Adquisición')}<input value={adquisicion} onChange={e => setAdquisicion(e.target.value)} style={iStyle(dark)} /></div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:'10px', flexWrap:'wrap' }}>
            <div>{lbl('A favor de')}<input value={afavorde} onChange={e => setAfavorde(e.target.value)} style={iStyle(dark)} /></div>
            <div>{lbl('Fecha enajenación')}<input type="date" value={fechaEnaj} onChange={e => setFechaEnaj(e.target.value)} style={iStyle(dark)} /></div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ flexShrink:0, padding:'1rem 1.5rem', borderTop: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)' }}>
          {err && <p style={{ fontSize:'12px', color: dark ? '#f4a1a1' : '#c0392b', marginBottom:'10px' }}><i className="ti ti-alert-circle" style={{ marginRight:'5px' }} />{err}</p>}
          <div style={{ display:'flex', gap:'8px' }}>
            <button onClick={onClose} style={{ flex:1, padding:'11px', borderRadius:'9px', fontSize:'14px', fontWeight:600, fontFamily:'inherit', cursor:'pointer', background:'transparent', border:`1px solid ${t.cardBorder}`, color: t.text2 }}>Cancelar</button>
            <button onClick={guardar} disabled={guardando}
              style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'7px', padding:'11px', borderRadius:'9px', fontSize:'14px', fontWeight:600, fontFamily:'inherit', cursor: guardando ? 'wait' : 'pointer', background: dark ? 'rgba(168,230,207,0.18)' : 'rgba(30,126,74,0.08)', border: dark ? '1px solid rgba(168,230,207,0.35)' : '1px solid rgba(30,126,74,0.35)', color: dark ? '#a8e6cf' : '#15803d' }}>
              {guardando ? <><i className="ti ti-loader-2" style={{ fontSize:'15px', animation:'spin 1s linear infinite' }} />Guardando…</> : <><i className="ti ti-device-floppy" style={{ fontSize:'16px' }} />Registrar</>}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translate(-50%,-48%) scale(0.98)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}} @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}} @keyframes entraDer{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}} @keyframes entraIzq{from{opacity:0;transform:translateX(-40px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </>,
    document.body
  )
}

export default function BienesInmuebles({ user, onNavigate, initialCatFilter = [], abrirNuevo = false, abrirReporte = false }) {
  const { dark, t, sidebarOpen } = useTheme()

  const [datos, setDatos]                   = useState([])
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState(null)
  const [pagina, setPagina]                 = useState(0)
  const [totalRegistros, setTotalRegistros] = useState(0)
  const [busqueda, setBusqueda]             = useState('')
  // Al usar "Ir a su página" se quita la búsqueda y se marca el inmueble un
  // momento para no perderlo de vista entre los demás renglones.
  const [resaltado, setResaltado]           = useState(null)
  const [ubicando, setUbicando]             = useState(false)
  const [menuFila, setMenuFila]             = useState(null)
  const refTabla = useRef(null)
  const filaResaltada = useRef(null)
  const [porPagina, setPorPagina]           = useState(20)
  // Lo que se ve escrito en la caja de página, aparte de la página real: así se
  // puede borrar y teclear otro número sin que la tabla salte en cada tecla.
  const [paginaTexto, setPaginaTexto]       = useState('1')
  const [panelInmueble, setPanelInmueble]   = useState(null)
  const [modalEditar, setModalEditar]       = useState(null)
  const [m2Min, setM2Min]                   = useState('')
  const [m2Max, setM2Max]                   = useState('')
  const [categorias, setCategorias]         = useState([])
  const [catSelec, setCatSelec]             = useState(initialCatFilter)
  const [modoSeleccion, setModoSeleccion]   = useState(false)
  const [seleccionados, setSeleccionados]   = useState(() => new Set())
  const [modalReporte, setModalReporte]     = useState(abrirReporte)
  const [modalDesinc, setModalDesinc]       = useState(null)   // array de ids | null
  // Al entrar desde las acciones rápidas del inicio se abre directo el formulario
  const [modalNuevo, setModalNuevo]         = useState(abrirNuevo)
  const skipDebounce = useRef(false)

  useEffect(() => {
    fetchCategorias().then(setCategorias).catch(console.error)
  }, [])

  const cargar = useCallback((pag, params = {}) => {
    setLoading(true); setError(null)
    fetchInmuebles({
      pagina:       pag,
      busqueda:     params.busqueda     ?? busqueda,
      porPagina:    params.porPagina    ?? porPagina,
      m2Min:        params.m2Min        ?? m2Min,
      m2Max:        params.m2Max        ?? m2Max,
      categoriaIds: params.categoriaIds ?? catSelec,
      categorias,
    })
      .then(({ data, count }) => { setDatos(data); setTotalRegistros(count); setPagina(pag) })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [busqueda, porPagina, m2Min, m2Max, catSelec, categorias])

  const totalPaginas = Math.max(1, Math.ceil(totalRegistros / porPagina))

  // La caja sigue a la página real: al filtrar o usar las flechas se actualiza sola
  useEffect(() => { setPaginaTexto(String(pagina + 1)) }, [pagina])

  // Se salta al escribir Enter o al salir de la caja, no en cada tecla. Un número
  // fuera de rango se ajusta al extremo más cercano en vez de dejar la tabla vacía.
  function irAPagina() {
    const n = Math.min(totalPaginas, Math.max(1, Number(paginaTexto) || 1))
    setPaginaTexto(String(n))
    if (n - 1 !== pagina) cargar(n - 1)
  }

  // Quita la búsqueda y carga la página donde ese inmueble vive en la lista
  // Clic derecho sobre un renglón. Listener nativo en fase de captura sobre la
  // tabla: se atiende antes que cualquier otro manejador.
  useEffect(() => {
    const tabla = refTabla.current
    if (!tabla) return
    const abrir = (e) => {
      const fila = e.target.closest?.('tr[data-idinmueble]')
      if (!fila || !tabla.contains(fila)) return
      const inm = datos.find(d => String(d.idinmueble) === fila.dataset.idinmueble)
      if (!inm) return
      e.preventDefault()
      setMenuFila({ x: e.clientX, y: e.clientY, bien: { ...inm, claveinventario: inm.claveinmueble } })
    }
    tabla.addEventListener('contextmenu', abrir, true)
    return () => tabla.removeEventListener('contextmenu', abrir, true)
  }, [datos])

  async function irAlInmueble(inm) {
    if (!inm) return
    setUbicando(true); setError(null)
    try {
      // Se deja puesto el filtro de SU categoría, igual que en Bienes Muebles
      // se deja el del área: así la lista queda acotada y el consecutivo que se
      // ve es el que le corresponde ahí, no el de todo el inventario.
      const suCat = inm.idcategoria != null ? [inm.idcategoria] : catSelec

      const pag = await paginaDeInmueble(inm, { m2Min, m2Max, categoriaIds: suCat, porPagina })
      // Cambiar búsqueda y filtro dispararía otra carga en página 0; se salta
      skipDebounce.current = true
      setBusqueda('')
      setCatSelec(suCat)
      setResaltado(inm.idinmueble)
      cargar(pag, { busqueda: '', categoriaIds: suCat })
    } catch (e) {
      setError(e.message)
    } finally {
      setUbicando(false)
    }
  }

  // Lleva el renglón a la vista y quita la marca sola a los pocos segundos
  useEffect(() => {
    if (!resaltado) return
    filaResaltada.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const tm = setTimeout(() => setResaltado(null), 6000)
    return () => clearTimeout(tm)
  }, [resaltado, datos])

  useEffect(() => {
    if (skipDebounce.current) { skipDebounce.current = false; return }
    const timer = setTimeout(() => cargar(0), 400)
    return () => clearTimeout(timer)
  }, [busqueda, porPagina, m2Min, m2Max, catSelec, categorias])

  function toggleSeleccion(id) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleModoSeleccion() {
    setModoSeleccion(m => {
      if (m) setSeleccionados(new Set())   // al salir, limpiar
      return !m
    })
  }

  async function confirmarDesinc(ids, { obs, fecha }) {
    // Guarda la categoría original (para poder cancelar) + fecha/observaciones
    const rows = await fetchInmueblesPorIds(ids)
    const catMap = {}
    rows.forEach(r => { catMap[r.idinmueble] = r.idcategoria })
    for (const id of ids) setDesinc([id], { catOriginal: catMap[id], fechaProceso: fecha, obsProceso: obs })
    await cambiarCategoria(ids, ID_PROCESO)   // pasa a "EN PROCESO DE DESINCORPORACION"
    setSeleccionados(new Set())
    setModoSeleccion(false)
    setModalDesinc(null)
    cargar(pagina)
  }

  const idsPagina   = datos.map(d => d.idinmueble)
  const todosEnPag  = idsPagina.length > 0 && idsPagina.every(id => seleccionados.has(id))
  const algunoEnPag = idsPagina.some(id => seleccionados.has(id))

  function toggleTodosPagina() {
    setSeleccionados(prev => {
      const next = new Set(prev)
      if (todosEnPag) idsPagina.forEach(id => next.delete(id))
      else            idsPagina.forEach(id => next.add(id))
      return next
    })
  }

  const bg   = dark ? 'linear-gradient(145deg,#111113 0%,#1c1c1e 50%,#222224 100%)' : 'linear-gradient(145deg,#e0e0e2 0%,#ebebed 50%,#e4e4e6 100%)'
  const card = { background:t.cardBg, border:`1px solid ${t.cardBorder}`, backdropFilter:t.cardBlur, WebkitBackdropFilter:t.cardBlur, borderRadius:'14px' }

  const cols = [
    { key:'claveinmueble',      label:'CLAVE' },
    { key:'nombreinmueble',     label:'NOMBRE DEL INMUEBLE' },
    { key:'clavecatastral',     label:'CLAVE CATASTRAL' },
    { key:'superficiem2',       label:'SUPERFICIE' },
    { key:'ubicacion',          label:'UBICACIÓN' },
    { key:'valorcatastral',     label:'VALOR CATASTRAL' },
    { key:'documentopropiedad', label:'DOCUMENTO' },
    { key:'expediente',         label:'EXPEDIENTE' },
    { key:'adquisicion',        label:'ADQUISICIÓN' },
  ]

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:bg }}>
      <Sidebar user={user} active="inmuebles" onNavigate={onNavigate} />

      <main style={{ flex:1, marginLeft: sidebarOpen ? '230px' : '72px', padding:'2rem 1.25rem', overflowY:'auto', overflowX:'hidden', minWidth:0, transition:'margin-left 0.25s cubic-bezier(0.4,0,0.2,1)' }}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1.5rem' }}>
          <div>
            <h1 style={{ fontSize:'24px', fontWeight:600, color:t.text1, marginBottom:'4px' }}>Bienes Inmuebles del HAN</h1>
            <p style={{ fontSize:'14px', color:t.text3 }}>
              Inventario Municipal · {loading ? 'Cargando…' : `${totalRegistros.toLocaleString()} registros`}
            </p>
          </div>
          {/* El botón de alta vive en la barra de acciones, junto a
              Desincorporación y Generar Reporte */}
        </div>

        {/* Filtros */}
        <div style={{ ...card, padding:'1rem 1.25rem', marginBottom:'1rem', display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap', overflow:'visible', position:'relative', zIndex:100 }}>
          {/* Búsqueda */}
          <div style={{ ...searchBoxStyle(dark), flex:1, minWidth:'200px' }}>
            <i className="ti ti-search" style={{ fontSize:'16px', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)', flexShrink:0 }} />
            <input type="text" placeholder="Buscar por nombre, clave, catastral o ubicación..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
              style={{ flex:1, background:'transparent', border:'none', outline:'none', fontSize:'14px', color: dark ? '#f0f0f0' : '#111', fontFamily:'inherit' }} />
            {/* Para ir a la página de un inmueble se usa el clic derecho sobre
                su renglón, igual que en Bienes Muebles. */}
            {ubicando && (
              <span style={{ display:'flex', alignItems:'center', gap:'5px', flexShrink:0, fontSize:'12.5px',
                color: dark ? '#a8c5f8' : '#2563eb', whiteSpace:'nowrap' }}>
                <i className="ti ti-loader-2" style={{ fontSize:'14px', animation:'spin 1s linear infinite' }} />Buscando…
              </span>
            )}
            {busqueda && <button onClick={() => setBusqueda('')} style={{ background:'none', border:'none', cursor:'pointer', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)', padding:0, display:'flex' }}><i className="ti ti-x" style={{ fontSize:'14px' }} /></button>}
          </div>

          {/* Rango m² */}
          <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
            <div style={{ ...searchBoxStyle(dark), gap:'6px', width:'130px' }}>
              <i className="ti ti-ruler-measure" style={{ fontSize:'14px', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)', flexShrink:0 }} />
              <input type="number" placeholder="Min m²" value={m2Min} onChange={e => setM2Min(e.target.value)}
                style={{ width:'100%', background:'transparent', border:'none', outline:'none', fontSize:'13px', color: dark ? '#f0f0f0' : '#111', fontFamily:'inherit', MozAppearance:'textfield' }} />
              {m2Min && <button onClick={() => setM2Min('')} style={{ background:'none', border:'none', cursor:'pointer', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)', padding:0, display:'flex', flexShrink:0 }}><i className="ti ti-x" style={{ fontSize:'13px' }} /></button>}
            </div>
            <span style={{ fontSize:'12px', color: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)' }}>—</span>
            <div style={{ ...searchBoxStyle(dark), gap:'6px', width:'130px' }}>
              <input type="number" placeholder="Max m²" value={m2Max} onChange={e => setM2Max(e.target.value)}
                style={{ width:'100%', background:'transparent', border:'none', outline:'none', fontSize:'13px', color: dark ? '#f0f0f0' : '#111', fontFamily:'inherit', MozAppearance:'textfield' }} />
              {m2Max && <button onClick={() => setM2Max('')} style={{ background:'none', border:'none', cursor:'pointer', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)', padding:0, display:'flex', flexShrink:0 }}><i className="ti ti-x" style={{ fontSize:'13px' }} /></button>}
            </div>
          </div>

          {/* Categorías */}
          <ModalCategorias categorias={categorias} selected={catSelec} onChange={setCatSelec} dark={dark} t={t} />
        </div>

        {/* Barra de selección */}
        {/* Barra pegajosa: las acciones siguen visibles al bajar en la tabla */}
        <div style={barraSticky(dark, t)}>
          <div onClick={toggleModoSeleccion}
            style={{ display:'flex', alignItems:'center', gap:'9px', padding:'9px 16px', borderRadius:'9px', fontSize:'14px', fontWeight:500, fontFamily:'inherit', cursor:'pointer',
              background: t.cardBg, border:`1px solid ${t.cardBorder}`, color:t.text1, backdropFilter:'blur(10px)', userSelect:'none' }}>
            <div style={{ width:'17px', height:'17px', borderRadius:'5px', flexShrink:0,
              background: modoSeleccion ? (dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.78)') : 'transparent',
              border: dark ? '1.5px solid rgba(255,255,255,0.4)' : '1.5px solid rgba(0,0,0,0.3)',
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              {modoSeleccion && <i className="ti ti-check" style={{ fontSize:'11px', color: dark ? '#1c1c1e' : '#fff' }} />}
            </div>
            Seleccionar registros
          </div>

          {modoSeleccion && (
            <span style={{ fontSize:'13px', color:t.text3 }}>
              {seleccionados.size === 0
                ? 'Ningún registro seleccionado'
                : `${seleccionados.size} registro${seleccionados.size !== 1 ? 's' : ''} seleccionado${seleccionados.size !== 1 ? 's' : ''}`}
            </span>
          )}

          {modoSeleccion && seleccionados.size > 0 && (
            <button onClick={() => setSeleccionados(new Set())}
              style={{ display:'flex', alignItems:'center', gap:'6px', padding:'7px 12px', borderRadius:'8px', fontSize:'13px', fontFamily:'inherit', cursor:'pointer',
                background:'transparent', border:`1px solid ${t.cardBorder}`, color:t.text3 }}>
              <i className="ti ti-x" style={{ fontSize:'14px' }} />Limpiar
            </button>
          )}

          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
            {/* Siempre visible; atenuado mientras no haya registros marcados */}
            <button onClick={() => seleccionados.size > 0 && setModalDesinc([...seleccionados])} disabled={seleccionados.size === 0}
              style={btnBarra(dark, t, seleccionados.size > 0)}>
              <i className="ti ti-archive-off" style={{ fontSize:'17px' }} />Desincorporación
            </button>
            <button onClick={() => setModalNuevo(true)}
              style={{ display:'flex', alignItems:'center', gap:'9px', padding:'9px 16px', borderRadius:'9px', fontSize:'14px', fontWeight:500, fontFamily:'inherit', cursor:'pointer',
                background: t.cardBg, border:`1px solid ${t.cardBorder}`, color:t.text1, backdropFilter:'blur(10px)', whiteSpace:'nowrap', flexShrink:0 }}>
              <i className="ti ti-building-plus" style={{ fontSize:'17px' }} />Nuevo inmueble
            </button>
            <button onClick={() => setModalReporte(true)}
              style={{ display:'flex', alignItems:'center', gap:'9px', padding:'9px 16px', borderRadius:'9px', fontSize:'14px', fontWeight:500, fontFamily:'inherit', cursor:'pointer',
                background: t.cardBg, border:`1px solid ${t.cardBorder}`, color:t.text1, backdropFilter:'blur(10px)', whiteSpace:'nowrap', flexShrink:0 }}>
              <i className="ti ti-file-export" style={{ fontSize:'17px' }} />Generar Reporte
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ ...card, padding:'1rem 1.25rem', marginBottom:'1rem', color: dark ? '#f4a1a1' : '#c0392b', fontSize:'14px', display:'flex', alignItems:'center', gap:'8px' }}>
            <i className="ti ti-alert-circle" style={{ fontSize:'18px' }} />Error: {error}
          </div>
        )}

        {/* Tabla */}
        <div style={{ ...card, overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table ref={refTabla} style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
              <thead>
                <tr style={{ borderBottom:`1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}` }}>
                  {modoSeleccion && (
                    <th rowSpan={2} style={{ ...thBase(dark), width:'40px', minWidth:'40px', textAlign:'center' }}>
                      <div onClick={toggleTodosPagina} title={todosEnPag ? 'Deseleccionar página' : 'Seleccionar página'}
                        style={{ width:'17px', height:'17px', borderRadius:'5px', margin:'0 auto', cursor:'pointer',
                          background: todosEnPag ? (dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.78)') : 'transparent',
                          border: dark ? '1.5px solid rgba(255,255,255,0.4)' : '1.5px solid rgba(0,0,0,0.3)',
                          display:'flex', alignItems:'center', justifyContent:'center' }}>
                        {todosEnPag    && <i className="ti ti-check" style={{ fontSize:'11px', color: dark ? '#1c1c1e' : '#fff' }} />}
                        {!todosEnPag && algunoEnPag && <i className="ti ti-minus" style={{ fontSize:'11px', color: dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)' }} />}
                      </div>
                    </th>
                  )}
                  <th style={{ ...thBase(dark), width:'80px', minWidth:'80px' }}>CLAVE</th>
                  <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>NOMBRE DEL INMUEBLE</th>
                  <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>CLAVE CATASTRAL</th>
                  <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>UBICACIÓN</th>
                  <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)', width:'120px', minWidth:'120px' }}>SUPERFICIE</th>
                  <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>DOCUMENTO</th>
                  <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)', width:'110px', minWidth:'110px' }}>EXPEDIENTE</th>
                  <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: porPagina }).map((_, i) => (
                      <tr key={i} style={{ borderBottom:`1px solid ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}` }}>
                        {Array.from({ length: modoSeleccion ? 9 : 8 }).map((_, j) => (
                          <td key={j} style={tdBase()}>
                            <div style={{ height:'14px', borderRadius:'6px', background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', animation:'pulse 1.5s ease-in-out infinite', width: j === 1 ? '80%' : '60%' }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  : datos.length === 0
                    ? <tr><td colSpan={modoSeleccion ? 9 : 8} style={{ padding:'3rem', textAlign:'center', color:t.text4 }}>
                        <i className="ti ti-search-off" style={{ fontSize:'28px', display:'block', marginBottom:'8px' }} />
                        Sin resultados
                      </td></tr>
                    : datos.map((b, i) => {
                        const sel = seleccionados.has(b.idinmueble)
                        // El que se acaba de ubicar va marcado en azul unos segundos
                        const marcado = b.idinmueble === resaltado
                        const bgFila = marcado
                          ? (dark ? 'rgba(168,197,248,0.18)' : 'rgba(37,99,235,0.10)')
                          : sel
                          ? (dark ? 'rgba(168,197,248,0.10)' : 'rgba(37,99,235,0.06)')
                          : (i % 2 !== 0 ? (dark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.015)') : 'transparent')
                        return (
                        <tr key={b.idinmueble}
                          data-idinmueble={b.idinmueble}
                          ref={marcado ? filaResaltada : null}
                          onClick={() => modoSeleccion && toggleSeleccion(b.idinmueble)}
                          style={{ borderBottom:`1px solid ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`, background: bgFila, transition:'background 0.35s', cursor: modoSeleccion ? 'pointer' : 'default',
                            boxShadow: marcado ? `inset 3px 0 0 ${dark ? '#a8c5f8' : '#2563eb'}` : 'none' }}
                          onMouseEnter={e => e.currentTarget.style.background = marcado ? bgFila : sel ? (dark ? 'rgba(168,197,248,0.16)' : 'rgba(37,99,235,0.1)') : (dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)')}
                          onMouseLeave={e => e.currentTarget.style.background = bgFila}
                        >
                          {modoSeleccion && (
                            <td style={{ ...tdBase(), textAlign:'center', verticalAlign:'middle' }}>
                              <div style={{ width:'17px', height:'17px', borderRadius:'5px', margin:'0 auto',
                                background: sel ? (dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.78)') : 'transparent',
                                border: dark ? '1.5px solid rgba(255,255,255,0.4)' : '1.5px solid rgba(0,0,0,0.3)',
                                display:'flex', alignItems:'center', justifyContent:'center' }}>
                                {sel && <i className="ti ti-check" style={{ fontSize:'11px', color: dark ? '#1c1c1e' : '#fff' }} />}
                              </div>
                            </td>
                          )}
                          <td style={tdBase()}><span style={{ fontFamily:'monospace', fontSize:'11px', color:t.text3 }}>{b.claveinmueble || '—'}</span></td>
                          <td style={{ ...tdBase(), maxWidth:'240px' }}><p style={{ color:t.text1, fontWeight:500, lineHeight:1.3 }}>{b.nombreinmueble || '—'}</p></td>
                          <td style={tdBase()}><span style={{ fontFamily:'monospace', fontSize:'11px', color:t.text3 }}>{b.clavecatastral || '—'}</span></td>
                          <td style={{ ...tdBase(), maxWidth:'200px' }}><span style={{ color:t.text2, fontSize:'12px', lineHeight:1.3, display:'block' }}>{b.ubicacion || '—'}</span></td>
                          <td style={{ ...tdBase(), whiteSpace:'nowrap' }}><span style={{ color:t.text2 }}>{b.superficiem2 ? fmtM2(b.superficiem2) : '—'}</span></td>
                          <td style={{ ...tdBase(), maxWidth:'200px' }}><span title={b.documentopropiedad} style={{ color:t.text3, fontSize:'11px', display:'-webkit-box', WebkitLineClamp:6, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{b.documentopropiedad || '—'}</span></td>
                          <td style={tdBase()}><span style={{ color:t.text2, fontSize:'12px' }}>{b.expediente || '—'}</span></td>
                          <td style={tdBase()}>
                            <div style={{ display:'flex', gap:'4px' }}>
                              <button onClick={(e) => { e.stopPropagation(); setPanelInmueble(b) }} title="Consultar"
                                style={{ width:'30px', height:'30px', borderRadius:'7px', background: dark ? 'rgba(168,197,248,0.12)' : 'rgba(37,99,235,0.07)', border: dark ? '1px solid rgba(168,197,248,0.25)' : '1px solid rgba(37,99,235,0.18)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color: dark ? '#a8c5f8' : '#2563eb' }}
                                onMouseEnter={e => e.currentTarget.style.opacity='0.7'}
                                onMouseLeave={e => e.currentTarget.style.opacity='1'}
                              >
                                <i className="ti ti-eye" style={{ fontSize:'14px' }} />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); setModalEditar(b) }} title="Editar"
                                style={{ width:'30px', height:'30px', borderRadius:'7px', background: dark ? 'rgba(168,230,207,0.12)' : 'rgba(30,126,74,0.07)', border: dark ? '1px solid rgba(168,230,207,0.25)' : '1px solid rgba(30,126,74,0.18)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color: dark ? '#a8e6cf' : '#1e7e4a' }}
                                onMouseEnter={e => e.currentTarget.style.opacity='0.7'}
                                onMouseLeave={e => e.currentTarget.style.opacity='1'}
                              >
                                <i className="ti ti-pencil" style={{ fontSize:'14px' }} />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); setModalDesinc([b.idinmueble]) }} title="Desincorporar"
                                style={{ width:'30px', height:'30px', borderRadius:'7px', background: dark ? 'rgba(244,161,161,0.12)' : 'rgba(192,57,43,0.07)', border: dark ? '1px solid rgba(244,161,161,0.25)' : '1px solid rgba(192,57,43,0.18)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color: dark ? '#f4a1a1' : '#c0392b' }}
                                onMouseEnter={e => e.currentTarget.style.opacity='0.7'}
                                onMouseLeave={e => e.currentTarget.style.opacity='1'}
                              >
                                <i className="ti ti-archive-off" style={{ fontSize:'14px' }} />
                              </button>
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
          <div style={{ padding:'10px 14px', borderTop:`1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
              <p style={{ fontSize:'12px', color:t.text4 }}>
                {loading ? 'Cargando…' : `Mostrando ${totalRegistros === 0 ? 0 : pagina * porPagina + 1}–${Math.min((pagina + 1) * porPagina, totalRegistros)} de ${totalRegistros.toLocaleString()} registros`}
              </p>
              <div style={{ display:'flex', gap:'3px' }}>
                {POR_PAGINA_OPTS.map(n => (
                  <button key={n} onClick={() => setPorPagina(n)}
                    style={{ padding:'3px 9px', borderRadius:'6px', fontSize:'12px', fontFamily:'inherit', cursor:'pointer', fontWeight: porPagina === n ? 600 : 400, background: porPagina === n ? (dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)') : 'transparent', border: porPagina === n ? `1px solid ${t.cardBorder}` : '1px solid transparent', color: porPagina === n ? t.text1 : t.text4, transition:'all 0.15s' }}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
              <button onClick={() => cargar(pagina - 1)} disabled={pagina === 0 || loading}
                style={{ width:'30px', height:'30px', borderRadius:'7px', background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.12)', cursor: pagina === 0 ? 'not-allowed' : 'pointer', opacity: pagina === 0 ? 0.4 : 1, color:t.text1, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <i className="ti ti-chevron-left" style={{ fontSize:'14px' }} />
              </button>
              <span style={{ fontSize:'13px', color:t.text2, display:'flex', alignItems:'center', gap:'6px' }}>
                Pág.
                {/* Selector de página, igual que en Bienes Muebles */}
                <select value={pagina} disabled={loading} aria-label="Ir a la página"
                  onChange={e => cargar(Number(e.target.value))}
                  style={{ ...sStyle(dark), width:'auto', height:'28px', padding:'0 30px 0 9px', fontSize:'13px', backgroundPosition:'right 8px center', backgroundSize:'13px 13px' }}>
                  {Array.from({ length: totalPaginas }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}
                </select>
                / {totalPaginas}
              </span>
              <button onClick={() => cargar(pagina + 1)} disabled={(pagina + 1) * porPagina >= totalRegistros || loading}
                style={{ width:'30px', height:'30px', borderRadius:'7px', background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.12)', cursor:(pagina + 1) * porPagina >= totalRegistros ? 'not-allowed' : 'pointer', opacity:(pagina + 1) * porPagina >= totalRegistros ? 0.4 : 1, color:t.text1, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <i className="ti ti-chevron-right" style={{ fontSize:'14px' }} />
              </button>
            </div>
          </div>
        </div>

      </main>

      {menuFila && (
        <MenuFila menu={menuFila} onClose={() => setMenuFila(null)} dark={dark} t={t}
          onIrAPagina={b => irAlInmueble(b)} onConsultar={b => setPanelInmueble(b)} />
      )}
      {panelInmueble && (
        <PanelConsulta inmueble={panelInmueble} onClose={() => setPanelInmueble(null)} t={t} dark={dark} categorias={categorias} />
      )}
      {modalEditar && (
        <ModalEditar inmueble={modalEditar} onClose={() => setModalEditar(null)} t={t} dark={dark} categorias={categorias} onSaved={() => cargar(pagina)} />
      )}
      {modalDesinc && (
        <ModalDesincorporacion cantidad={modalDesinc.length} onClose={() => setModalDesinc(null)} dark={dark} t={t}
          titulo="Solicitar Desincorporación" textoBoton="Confirmar"
          onConfirm={({ obs, fecha }) => confirmarDesinc(modalDesinc, { obs, fecha })} />
      )}
      {modalNuevo && (
        <ModalNuevoInmueble dark={dark} t={t}
          categorias={categorias.filter(c => c.idcategoria !== ID_PROCESO && c.idcategoria !== ID_DESINC)}
          onCreated={() => cargar(0)} onClose={() => setModalNuevo(false)} />
      )}
      {modalReporte && (
        <ModalReporte
          onClose={() => setModalReporte(false)}
          dark={dark} t={t}
          categorias={categorias}
          seleccionados={[...seleccionados]}
          filtros={{ busqueda, m2Min, m2Max, categoriaIds: catSelec, categorias }}
          totalFiltrados={totalRegistros}
        />
      )}

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}} input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}`}</style>
    </div>
  )
}