import { useState, useRef, useEffect, useCallback, useMemo, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import Sidebar from '../components/Sidebar'
import { useTheme } from '../context/ThemeContext'
import { supabase } from "../supabase";
import { siguienteClave, siguienteClaveLote, tipoDeModo, tipoDeCategoria, ESTADO_PAPELERA } from '../claves'

// ── helpers ───────────────────────────────────────────────────────────────────
function estadoInfo(obs, dark) {
  const o = (obs || '').toLowerCase()
  if (o.includes('deteriorado') || o.includes('quebrado')) return {
    color: dark ? '#f4a1a1' : '#c0392b',
    bg:    dark ? 'rgba(244,161,161,0.15)' : 'rgba(192,57,43,0.1)',
    label: 'Deteriorado',
  }
  if (o.includes('no verificado')) return {
    color: dark ? '#ffd580' : '#b7790a',
    bg:    dark ? 'rgba(255,213,128,0.15)' : 'rgba(183,121,10,0.1)',
    label: 'No verificado',
  }
  // Solo al principio del texto, que es donde lo escribe el formulario. Buscarlo
  // en cualquier parte marcaría registros viejos que mencionan la palabra en otro
  // sentido ("...equipo usado donado por...", "AUTOS USADOS EL ARABE").
  if (/^usado\b/i.test((obs || '').trim())) return {
    color: dark ? '#e8c07e' : '#8a6414',
    bg:    dark ? 'rgba(232,192,126,0.15)' : 'rgba(138,100,20,0.1)',
    label: 'Usado',
  }
  return {
    color: dark ? '#7ee8a2' : '#1e7e4a',
    bg:    dark ? 'rgba(126,232,162,0.15)' : 'rgba(30,126,74,0.1)',
    label: 'Buen estado',
  }
}
function fmt(n) { return n ? '$ ' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '$ —' }

// Estados de verificación. El texto es el que leen los filtros y estadoInfo(),
// por eso se elige de una lista en vez de escribirse a mano.
const ESTADOS_OBS = ['VERIFICADO', 'NO VERIFICADO', 'DETERIORADO']

// Al dar de alta un bien todavía no hay verificación que reportar: lo que interesa
// es si entra nuevo o de segunda mano. El combo de editar sigue con ESTADOS_OBS.
const ESTADOS_ALTA = ['BUEN ESTADO', 'USADO']

// Separa unas observaciones en { estado, resto }. El estado se reconoce en
// cualquier parte del texto (en los registros históricos suele venir a la mitad)
// usando el mismo criterio que estadoInfo() y que los filtros.
function partirObs(obs) {
  const txt = (obs || '').trim()
  const estado = /deteriorado|quebrado/i.test(txt) ? 'DETERIORADO'
    : /no\s+verificado/i.test(txt) ? 'NO VERIFICADO'
    : /verificado/i.test(txt) ? 'VERIFICADO'
    : ''
  // Se quitan las palabras de estado del resto para que no contradigan al combo
  const resto = txt
    .replace(/no\s+verificado/ig, ' ')
    .replace(/deteriorado|quebrado|verificado/ig, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s.,;:·|-]+|[\s.,;:·|-]+$/g, '')
    .trim()
  return { estado, resto }
}
// Une estado + notas en el texto final que se guarda en observaciones
function unirObs(estado, resto) {
  const r = (resto || '').trim()
  if (!estado) return r || null
  return (r ? `${estado}. ${r}` : estado)
}

export function iStyle(dark) {
  return {
    padding: '9px 12px', borderRadius: '9px', outline: 'none',
    width: '100%', fontFamily: 'inherit', fontSize: '14px',
    background: dark ? '#2a2a2c' : '#ffffff',
    border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.18)',
    color: dark ? '#f0f0f0' : '#111111',
    colorScheme: dark ? 'dark' : 'light',
  }
}
// Estilo para <select>. La flecha nativa queda pegada al borde derecho; aquí se
// dibuja una propia y se separa del borde con el mismo margen que tiene arriba.
export function sStyle(dark) {
  const c = dark ? '%23f0f0f0' : '%23111111'
  return {
    ...iStyle(dark),
    appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
    paddingRight: '34px',
    backgroundImage: `url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${c}' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 11px center',
    backgroundSize: '15px 15px',
  }
}
function searchBoxStyle(dark) {
  return {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '9px 13px', borderRadius: '9px',
    background: dark ? '#2a2a2c' : '#ffffff',
    border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.18)',
  }
}
// Tarjeta que agrupa un bloque de campos dentro de un modal

// Barra de acciones que queda fija al bajar en la tabla. En claro se usa un
// blanco más transparente: con el fondo de la tarjeta se veía sólido y perdía
// el efecto de vidrio que sí se aprecia en oscuro.
// Botón de la barra de acciones. Cuando no aplica (sin registros marcados) se
// muestra igual pero atenuado, para que la barra no cambie de forma.
export function btnBarra(dark, t, activo = true) {
  return {
    display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 16px', borderRadius: '9px',
    fontSize: '14px', fontWeight: 500, fontFamily: 'inherit',
    cursor: activo ? 'pointer' : 'not-allowed', opacity: activo ? 1 : 0.45,
    background: t.cardBg, border: `1px solid ${t.cardBorder}`, color: t.text1,
    backdropFilter: 'blur(10px)', transition: 'opacity 0.15s',
    // El reparto del renglón en ventana chica lo hace .barra-fit (index.css)
    whiteSpace: 'nowrap', flexShrink: 0,
  }
}

export function barraSticky(dark, t) {
  return {
    display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem', flexWrap: 'wrap',
    position: 'sticky', top: '-1rem', zIndex: 90, padding: '0.7rem 1rem', borderRadius: '14px',
    background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.45)',
    border: `1px solid ${t.cardBorder}`,
    backdropFilter: 'blur(18px) saturate(150%)', WebkitBackdropFilter: 'blur(18px) saturate(150%)',
    boxShadow: dark ? '0 6px 20px rgba(0,0,0,0.28)' : '0 6px 20px rgba(0,0,0,0.07)',
  }
}

export function panelStyle(dark) {
  return {
    padding: '0.8rem 0.9rem 0.85rem',
    borderRadius: '12px',
    background: dark ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.022)',
    border: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)',
  }
}
export function tituloSec(t) {
  return { fontSize: '12px', fontWeight: 600, color: t.text2, marginBottom: '0.7rem' }
}

// ── Overlay ───────────────────────────────────────────────────────────────────
function Overlay({ onClick }) {
  return <div onClick={onClick} style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} />
}

// ── Hook para animar cierre de paneles laterales ──────────────────────────────
function useClosing(onClose, duration = 250, enterAnim, exitAnim) {
  const [closing, setClosing] = useState(false)
  function close() {
    setClosing(true)
    setTimeout(onClose, duration)
  }
  const enter = enterAnim ?? `slideIn ${duration}ms cubic-bezier(0.4,0,0.2,1)`
  const exit  = exitAnim  ?? `slideOut ${duration}ms cubic-bezier(0.4,0,0.2,1) forwards`
  const anim  = closing ? exit : enter
  return { close, anim }
}

// ── GroupedAreaSelector ───────────────────────────────────────────────────────
export function GroupedAreaSelector({ areas, selected, onChange, dark }) {
  const [open, setOpen]           = useState(false)
  const [expanded, setExpanded]   = useState({})
  const [busq, setBusq]           = useState('')
  const [localSel, setLocalSel]   = useState(selected)

  function abrir() { setLocalSel(selected); setBusq(''); setOpen(true) }
  function aplicar() { onChange(localSel); setOpen(false) }
  function limpiar() { setLocalSel([]); onChange([]); setOpen(false) }

  const groups = useMemo(() => {
    const map = {}
    for (const area of areas) {
      const dep = area.nombredependencia || 'SIN DEPENDENCIA'
      if (busq && !dep.toLowerCase().includes(busq.toLowerCase()) &&
          !area.nombrearea.toLowerCase().includes(busq.toLowerCase())) continue
      if (!map[dep]) map[dep] = []
      map[dep].push(area)
    }
    return Object.fromEntries(
      Object.entries(map).sort(([a], [b]) => a.localeCompare(b, 'es'))
    )
  }, [areas, busq])

  const selectedSet = useMemo(() => new Set(localSel), [localSel])

  function toggleArea(id) {
    setLocalSel(prev => selectedSet.has(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleGroup(groupAreas) {
    const groupIds = groupAreas.map(a => a.idarea)
    const allSel   = groupIds.every(id => selectedSet.has(id))
    setLocalSel(prev => allSel
      ? prev.filter(id => !groupIds.includes(id))
      : [...prev, ...groupIds.filter(id => !selectedSet.has(id))]
    )
  }

  const chipItems = useMemo(() => {
    const items = []
    for (const [depNombre, groupAreas] of Object.entries(groups)) {
      const groupIds      = groupAreas.map(a => a.idarea)
      const selectedInGrp = groupIds.filter(id => selectedSet.has(id))
      if (selectedInGrp.length === 0) continue
      if (selectedInGrp.length === groupIds.length) {
        items.push({ key: `dep-${depNombre}`, label: depNombre, ids: groupIds })
      } else {
        for (const id of selectedInGrp) {
          const area = groupAreas.find(a => a.idarea === id)
          items.push({ key: `area-${id}`, label: area?.nombrearea || `#${id}`, ids: [id] })
        }
      }
    }
    return items
  }, [groups, selectedSet])

  function removeChip(ids, e) {
    e.stopPropagation()
    onChange(selected.filter(x => !ids.includes(x)))
  }

  function groupState(groupAreas) {
    const cnt = groupAreas.filter(a => selectedSet.has(a.idarea)).length
    if (cnt === 0)               return 'none'
    if (cnt === groupAreas.length) return 'all'
    return 'some'
  }

  const sepBorder = dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)'
  // Cuenta "elementos": una dependencia completa = 1, áreas sueltas = c/u
  function contarItems(sel) {
    const s = new Set(sel)
    const byDep = {}
    for (const a of areas) { const d = a.nombredependencia || 'SIN DEPENDENCIA'; (byDep[d] = byDep[d] || []).push(a) }
    let n = 0
    for (const arr of Object.values(byDep)) {
      const ids = arr.map(a => a.idarea)
      const selIn = ids.filter(id => s.has(id))
      if (!selIn.length) continue
      n += (selIn.length === ids.length) ? 1 : selIn.length
    }
    return n
  }
  const totalSel      = contarItems(selected)
  const totalSelLocal = contarItems(localSel)

  function ListaGrupos() {
    return Object.entries(groups).map(([depNombre, groupAreas]) => {
      const isMulti    = groupAreas.length > 1
      const state      = groupState(groupAreas)
      const isExpanded = !!expanded[depNombre]
      const groupTotal = groupAreas.reduce((s, a) => s + (a.total_bienes || 0), 0)
      return (
        <div key={depNombre} style={{ borderBottom: sepBorder }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 16px', cursor: 'pointer', background: state !== 'none' ? (dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)') : 'transparent' }}
            onClick={() => isMulti ? toggleGroup(groupAreas) : toggleArea(groupAreas[0].idarea)}>
            <div style={{ width: '17px', height: '17px', borderRadius: '5px', flexShrink: 0, background: state === 'all' ? (dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.78)') : 'transparent', border: dark ? '1.5px solid rgba(255,255,255,0.4)' : '1.5px solid rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {state === 'all' && <i className="ti ti-check" style={{ fontSize: '11px', color: dark ? '#1c1c1e' : '#fff' }} />}
              {state === 'some' && <span style={{ width: '9px', height: '2.5px', borderRadius: '2px', display: 'block', background: dark ? '#fff' : '#333' }} />}
            </div>
            <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: dark ? '#f0f0f0' : '#111', lineHeight: 1.3 }}>{depNombre}</span>
            <span style={{ fontSize: '11px', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)', flexShrink: 0 }}>{groupTotal.toLocaleString()}</span>
            {isMulti && (
              <button onClick={e => { e.stopPropagation(); setExpanded(ex => ({ ...ex, [depNombre]: !ex[depNombre] })) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', color: dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)' }}>
                <i className={`ti ti-chevron-${isExpanded ? 'up' : 'down'}`} style={{ fontSize: '13px' }} />
              </button>
            )}
          </div>
          {isMulti && isExpanded && groupAreas.map(area => {
            const sel = selectedSet.has(area.idarea)
            return (
              <div key={area.idarea} onClick={() => toggleArea(area.idarea)}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 16px 9px 44px', cursor: 'pointer', borderTop: dark ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(0,0,0,0.04)', background: sel ? (dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)') : 'transparent' }}>
                <div style={{ width: '15px', height: '15px', borderRadius: '4px', flexShrink: 0, background: sel ? (dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.78)') : 'transparent', border: dark ? '1.5px solid rgba(255,255,255,0.35)' : '1.5px solid rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {sel && <i className="ti ti-check" style={{ fontSize: '10px', color: dark ? '#1c1c1e' : '#fff' }} />}
                </div>
                <span style={{ flex: 1, fontSize: '12px', color: dark ? '#d0d0d0' : '#333' }}>{area.nombrearea}</span>
                <span style={{ fontSize: '11px', color: dark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.3)', flexShrink: 0 }}>{(area.total_bienes || 0).toLocaleString()}</span>
              </div>
            )
          })}
        </div>
      )
    })
  }

  return (
    <>
      <div onClick={abrir} style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '9px 13px', borderRadius: '9px', cursor: 'pointer',
        background: dark ? '#2a2a2c' : '#ffffff',
        border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.18)',
      }}>
        <i className="ti ti-building" style={{ fontSize: '15px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', flexShrink: 0 }} />
        <span style={{ fontSize: '14px', color: dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)' }}>
          {totalSel === 0 ? 'Todas las dependencias' : `${totalSel} Seleccionada${totalSel !== 1 ? 's' : ''}`}
        </span>
      </div>

      {open && createPortal(
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} />
          <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 301, width: '480px', maxWidth: '90vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: dark ? '#1e1e20' : '#fff', borderRadius: '16px', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', animation: 'fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)', overflow: 'hidden' }}>

            <div style={{ padding: '1.25rem 1.5rem', borderBottom: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: dark ? 'rgba(168,197,248,0.15)' : 'rgba(37,99,235,0.08)', border: dark ? '1px solid rgba(168,197,248,0.3)' : '1px solid rgba(37,99,235,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="ti ti-building" style={{ fontSize: '18px', color: dark ? '#a8c5f8' : '#2563eb' }} />
                </div>
                <div>
                  <p style={{ fontSize: '15px', fontWeight: 600, color: dark ? '#fff' : '#111' }}>Dependencias</p>
                  <p style={{ fontSize: '12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>
                    {totalSelLocal === 0 ? 'Todas por defecto' : `${totalSelLocal} seleccionada${totalSelLocal !== 1 ? 's' : ''}`}
                  </p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} style={{ width: '30px', height: '30px', borderRadius: '7px', background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: dark ? '#ccc' : '#555' }}>
                <i className="ti ti-x" style={{ fontSize: '15px' }} />
              </button>
            </div>

            <div style={{ padding: '1rem 1.5rem', borderBottom: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 13px', borderRadius: '9px', background: dark ? '#2a2a2c' : '#ffffff', border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.18)' }}>
                <i className="ti ti-search" style={{ fontSize: '16px', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)', flexShrink: 0 }} />
                <input autoFocus type="text" placeholder="Buscar dependencia o área..." value={busq} onChange={e => setBusq(e.target.value)}
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', color: dark ? '#f0f0f0' : '#111', fontFamily: 'inherit' }} />
                {busq && <button onClick={() => setBusq('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)', padding: 0, display: 'flex' }}><i className="ti ti-x" style={{ fontSize: '14px' }} /></button>}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {Object.keys(groups).length === 0
                ? <p style={{ padding: '2rem', textAlign: 'center', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)', fontSize: '14px' }}>Sin resultados</p>
                : ListaGrupos()
              }
            </div>

            <div style={{ padding: '1rem 1.5rem', borderTop: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display: 'flex', gap: '8px', flexShrink: 0 }}>
              <button onClick={limpiar} style={{ flex: 1, padding: '10px', background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)', border: dark ? '1px solid rgba(255,255,255,0.13)' : '1px solid rgba(0,0,0,0.09)', borderRadius: '9px', fontSize: '14px', fontWeight: 500, color: dark ? '#ccc' : '#444', fontFamily: 'inherit', cursor: 'pointer' }}>
                Limpiar
              </button>
              <button onClick={aplicar} style={{ flex: 1, padding: '10px', background: dark ? 'rgba(168,197,248,0.18)' : 'rgba(37,99,235,0.08)', border: dark ? '1px solid rgba(168,197,248,0.35)' : '1px solid rgba(37,99,235,0.35)', borderRadius: '9px', fontSize: '14px', fontWeight: 600, color: dark ? '#a8c5f8' : '#2563eb', fontFamily: 'inherit', cursor: 'pointer' }}>
                Aplicar
              </button>
            </div>
          </div>
          <style>{`@keyframes fadeUp{from{opacity:0;transform:translate(-50%,-48%) scale(0.98)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}} @keyframes fadeDown{from{opacity:1;transform:translate(-50%,-50%) scale(1)}to{opacity:0;transform:translate(-50%,-48%) scale(0.98)}}`}</style>
        </>,
        document.body
      )}
    </>
  )
}

// ── ModalEditar ───────────────────────────────────────────────────────────────
export function ModalEditar({ bien, onClose, dark, t, onSaved }) {
  const esVehiculo = ['VEHICULAR','VEHICULAR-MAQUINARIA','VEHICULAR-REMOLQUES-CARROCERIAS'].includes(bien.categoriainventario)
  const { close, anim } = useClosing(onClose)

  const sinRaya = v => (v && v !== '—' && v !== 'SIN FACTURA' ? String(v) : '')

  const [form, setForm] = useState({
    nombrebien:      bien.nombrebien      || '',
    marca:           bien.marca           || '',
    tipo:            bien.tipo            || '',
    serie:           bien.serie           || '',
    anio:            bien.anio            || '',
    observaciones:   bien.observaciones   || '',
    claveinventario: bien.claveinventario || '',
    partida:         bien.partida         || '',
    idarea:          bien.idarea          ?? '',
  })

  // Datos de la factura: viven en otra tabla, así que van aparte del formulario
  // Sin factura la consulta devuelve costoinicial 0: se muestra vacío, no "0"
  const datosFactura = () => ({
    numerofactura: sinRaya(bien.numerofactura),
    fechafactura:  sinRaya(bien.fechafactura),
    costoinicial:  bien.costoinicial ? fmtMoneda(bien.costoinicial) : '',
    proveedor:     sinRaya(bien.proveedor),
  })
  const [fact, setFact] = useState(datosFactura)
  const factOriginal = useState(datosFactura)[0]
  function setF(k, v) { setFact(f => ({ ...f, [k]: v })) }

  // Catálogo de áreas para el combo de adscripción
  const [areas, setAreas] = useState([])
  useEffect(() => { fetchAreas().then(setAreas).catch(() => {}) }, [])
  // El titular no vive en la tabla de bienes sino en el catálogo de resguardos,
  // así que se maneja aparte del resto del formulario. El '—' que pone la
  // consulta cuando el bien no tiene titular se muestra como campo vacío.
  const sinGuion = v => (v && v !== '—' ? v : '')
  const [resgNombre, setResgNombre] = useState(sinGuion(bien.resguardatario))
  const [resgPuesto, setResgPuesto] = useState(sinGuion(bien.puesto))
  const [saving, setSaving]     = useState(false)
  const [saveErr, setSaveErr]   = useState(null)
  const [saved, setSaved]       = useState(false)
  // Borrado permanente: pide confirmación aparte porque no se puede deshacer
  const [confirmaBorrar, setConfirmaBorrar] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [borrado, setBorrado]   = useState(null)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  // El error se relanza para que el modal de confirmación lo muestre y no se
  // cierre haciendo creer que se guardó
  async function eliminar() {
    setBorrando(true); setSaveErr(null)
    try {
      await enviarAPapelera(bien)
      setBorrado(true)
      setTimeout(() => { onSaved?.(); close() }, 1600)
    } catch (e) {
      setBorrando(false)
      throw e
    }
  }

  async function guardar() {
    setSaving(true); setSaveErr(null)
    try {
      const campos = { ...form }
      // idarea es obligatorio en la base: si viniera vacío se deja el que tiene
      if (campos.idarea === '' || campos.idarea == null) delete campos.idarea
      else campos.idarea = Number(campos.idarea)
      campos.partida = campos.partida === '' ? null : campos.partida
      if (!campos.claveinventario.trim()) delete campos.claveinventario
      // Solo se toca el titular si se modificó, para no reescribirlo sin razón
      const cambioNombre = resgNombre.trim() !== sinGuion(bien.resguardatario)
      const cambioPuesto = resgPuesto.trim() !== sinGuion(bien.puesto)
      if (cambioNombre || cambioPuesto) {
        campos.idresguardo = await resolverResguardo(resgNombre, resgPuesto)
      }
      await actualizarBien(bien.idbien, campos)

      // La factura se guarda aparte y solo si cambió alguno de sus campos
      const cambioFactura = ['numerofactura', 'fechafactura', 'costoinicial', 'proveedor']
        .some(k => fact[k].trim() !== factOriginal[k].trim())
      if (cambioFactura) await guardarFactura(bien, fact)
      setSaved(true)
      setTimeout(() => { onSaved?.(); close() }, 800)
    } catch(e) {
      setSaveErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Overlay onClick={close} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 200, width: '400px',
        background: dark ? '#1e1e20' : '#ffffff', borderLeft: `1px solid ${t.cardBorder}`,
        display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 40px rgba(0,0,0,0.3)',
        animation: anim }}>

        <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '9px',
              background: dark ? 'rgba(168,230,207,0.15)' : 'rgba(30,126,74,0.08)',
              border: dark ? '1px solid rgba(168,230,207,0.3)' : '1px solid rgba(30,126,74,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="ti ti-pencil" style={{ fontSize: '17px', color: dark ? '#a8e6cf' : '#1e7e4a' }} />
            </div>
            <div>
              <p style={{ fontSize: '15px', fontWeight: 600, color: dark ? '#fff' : '#111' }}>Modificar Bien</p>
              <p style={{ fontSize: '12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>{bien.claveinventario}</p>
            </div>
          </div>
          <button onClick={close} style={{ width: '30px', height: '30px', borderRadius: '7px',
            background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
            border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            color: dark ? '#ccc' : '#555' }}>
            <i className="ti ti-x" style={{ fontSize: '15px' }} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 1.5rem' }}>
          {[
            { label: 'Clave de Inventario',        key: 'claveinventario' },
            { label: 'Nombre del Bien',            key: 'nombrebien' },
            { label: 'Marca',                       key: 'marca' },
            { label: esVehiculo ? 'Modelo / Placa' : 'Tipo', key: 'tipo' },
            { label: esVehiculo ? 'Serie (VIN)' : 'Serie',   key: 'serie' },
            ...(esVehiculo ? [{ label: 'Año', key: 'anio', type: 'number' }] : []),
          ].map(({ label, key, type }) => (
            <div key={key} style={{ padding: '11px 0', borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}` }}>
              <p style={{ fontSize: '10px', color: dark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '5px' }}>{label}</p>
              <input
                type={type || 'text'}
                value={form[key] ?? ''}
                onChange={e => set(key, e.target.value)}
                style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', fontWeight: 500, color: dark ? '#f0f0f0' : '#111', fontFamily: 'inherit', padding: 0 }}
              />
            </div>
          ))}
          {/* Partida y área de adscripción: listas cerradas */}
          <div style={{ padding: '11px 0', borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}` }}>
            <p style={{ fontSize: '10px', color: dark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '5px' }}>Partida</p>
            <select value={form.partida ?? ''} onChange={e => set('partida', e.target.value)}
              style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', fontWeight: 500, color: dark ? '#f0f0f0' : '#111', fontFamily: 'inherit', padding: 0 }}>
              <option value="">— Sin partida —</option>
              {PARTIDAS.map(p => <option key={p.cod} value={p.cod}>{p.cod} — {p.nombre}</option>)}
              {form.partida && !PARTIDAS.some(p => p.cod === form.partida) && (
                <option value={form.partida}>{form.partida}</option>
              )}
            </select>
          </div>
          <div style={{ padding: '11px 0', borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}` }}>
            <p style={{ fontSize: '10px', color: dark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '5px' }}>Área de Adscripción</p>
            <select value={form.idarea ?? ''} onChange={e => set('idarea', e.target.value)}
              style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', fontWeight: 500, color: dark ? '#f0f0f0' : '#111', fontFamily: 'inherit', padding: 0 }}>
              {/* Todo bien debe tener área, así que no hay opción vacía */}
              {areas.map(a => <option key={a.idarea} value={a.idarea}>{a.nombrearea}</option>)}
              {/* Mientras carga el catálogo se conserva la que ya tiene */}
              {areas.length === 0 && <option value={form.idarea}>{bien.area}</option>}
            </select>
          </div>

          {/* Datos de la compra: viven en la tabla de facturas */}
          {[
            { label: 'Número de Factura', key: 'numerofactura' },
            { label: 'Fecha de Factura',  key: 'fechafactura', type: 'date' },
            { label: 'Importe',           key: 'costoinicial', moneda: true },
            { label: 'Proveedor',         key: 'proveedor' },
          ].map(({ label, key, type, moneda }) => (
            <div key={key} style={{ padding: '11px 0', borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}` }}>
              <p style={{ fontSize: '10px', color: dark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '5px' }}>{label}</p>
              <input
                type={type || 'text'}
                inputMode={moneda ? 'decimal' : undefined}
                value={fact[key]}
                // Mientras se escribe se respeta lo tecleado; el formato de
                // moneda se aplica al salir, para no mover el cursor
                onChange={e => setF(key, moneda ? e.target.value.replace(/[^\d.,$ ]/g, '') : e.target.value)}
                onBlur={moneda ? () => setF(key, fact[key].trim() === '' ? '' : fmtMoneda(fact[key])) : undefined}
                autoComplete="off" spellCheck={false}
                style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', fontWeight: 500, color: dark ? '#f0f0f0' : '#111', fontFamily: 'inherit', padding: 0 }} />
            </div>
          ))}

          {/* Titular: vive en el catálogo de resguardos, no en el bien */}
          {[
            { label: 'Resguardo a cargo de', valor: resgNombre, set: setResgNombre },
            { label: 'Puesto del titular',   valor: resgPuesto, set: setResgPuesto },
          ].map(({ label, valor, set: setV }) => (
            <div key={label} style={{ padding: '11px 0', borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}` }}>
              <p style={{ fontSize: '10px', color: dark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '5px' }}>{label}</p>
              <input value={valor} onChange={e => setV(e.target.value)} autoComplete="off" spellCheck={false}
                style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', fontWeight: 500, color: dark ? '#f0f0f0' : '#111', fontFamily: 'inherit', padding: 0 }} />
            </div>
          ))}
          {(resgNombre.trim() !== sinGuion(bien.resguardatario) || resgPuesto.trim() !== sinGuion(bien.puesto)) && (
            <p style={{ fontSize: '11px', color: dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)', paddingTop: '8px' }}>
              <i className="ti ti-info-circle" style={{ marginRight: '5px' }} />
              El cambio aplica solo a este bien.
            </p>
          )}
          {/* Estado en lista (alimenta los filtros) + notas libres */}
          <div style={{ padding: '11px 0' }}>
            <p style={{ fontSize: '10px', color: dark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '5px' }}>Estado del bien</p>
            <select
              value={partirObs(form.observaciones).estado}
              onChange={e => set('observaciones', unirObs(e.target.value, partirObs(form.observaciones).resto) || '')}
              style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', fontWeight: 500, color: dark ? '#f0f0f0' : '#111', fontFamily: 'inherit', padding: 0 }}
            >
              <option value="">— Sin especificar —</option>
              {ESTADOS_OBS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div style={{ padding: '11px 0' }}>
            <p style={{ fontSize: '10px', color: dark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '5px' }}>Observaciones adicionales</p>
            <textarea
              value={partirObs(form.observaciones).resto}
              onChange={e => set('observaciones', unirObs(partirObs(form.observaciones).estado, e.target.value) || '')}
              rows={3}
              style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', color: dark ? '#f0f0f0' : '#111', fontFamily: 'inherit', resize: 'none', lineHeight: 1.5, padding: 0 }}
            />
          </div>
          {saveErr && (
            <div style={{ padding: '10px 12px', borderRadius: '8px',
              background: dark ? 'rgba(244,161,161,0.12)' : 'rgba(192,57,43,0.07)',
              border: dark ? '1px solid rgba(244,161,161,0.3)' : '1px solid rgba(192,57,43,0.2)',
              fontSize: '12px', color: dark ? '#f4a1a1' : '#c0392b' }}>
              <i className="ti ti-alert-circle" style={{ marginRight: '6px' }} />{saveErr}
            </div>
          )}

          {borrado && (
            <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}` }}>
              <div style={{ padding: '12px', borderRadius: '9px', fontSize: '12.5px', lineHeight: 1.6,
                background: dark ? 'rgba(168,230,207,0.12)' : 'rgba(30,126,74,0.07)',
                border: dark ? '1px solid rgba(168,230,207,0.3)' : '1px solid rgba(30,126,74,0.2)',
                color: dark ? '#a8e6cf' : '#15803d' }}>
                <p style={{ fontWeight: 600 }}><i className="ti ti-check" style={{ marginRight: '6px' }} />Enviado a la papelera</p>
                <p>{bien.claveinventario} salió del inventario y se puede consultar en Papelera.</p>
              </div>
            </div>
          )}
        </div>

        {/* La confirmación va en su propio modal, con los datos del bien */}
        {confirmaBorrar && (
          <ModalConfirmaBien bien={bien} accion="papelera" dark={dark} t={t}
            onClose={() => setConfirmaBorrar(false)} onConfirm={eliminar} />
        )}

        <div style={{ padding: '1rem 1.5rem', borderTop: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`, display: 'flex', gap: '8px' }}>
          {/* Va donde antes estaba Cancelar: para salir ya está la X de arriba */}
          <button onClick={() => { setConfirmaBorrar(true); setSaveErr(null) }} disabled={saving || saved || borrando || !!borrado}
            style={{ flex: 1, padding: '10px', borderRadius: '9px', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit',
              cursor: saving || saved || borrando || borrado ? 'not-allowed' : 'pointer',
              background: dark ? 'rgba(244,161,161,0.1)' : 'rgba(192,57,43,0.05)',
              border: dark ? '1px solid rgba(244,161,161,0.3)' : '1px solid rgba(192,57,43,0.25)',
              color: dark ? '#f4a1a1' : '#c0392b',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <i className="ti ti-trash" style={{ fontSize: '15px' }} />Eliminar Bien
          </button>
          {/* Si el bien ya se está borrando no tiene caso guardarlo */}
          <button onClick={guardar} disabled={saving || saved || borrando || !!borrado}
            style={{ flex: 1, padding: '10px', borderRadius: '9px', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', cursor: saving || saved || borrando || borrado ? 'not-allowed' : 'pointer',
              background: dark ? 'rgba(168,230,207,0.18)' : 'rgba(30,126,74,0.08)',
              border: dark ? '1px solid rgba(168,230,207,0.35)' : '1px solid rgba(30,126,74,0.35)',
              color: dark ? '#a8e6cf' : '#15803d',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            {saving ? <><i className="ti ti-loader-2" style={{ fontSize: '15px', animation: 'spin 1s linear infinite' }} />Guardando…</>
              : saved ? <><i className="ti ti-check" style={{ fontSize: '15px' }} />Guardado</>
              : <><i className="ti ti-device-floppy" style={{ fontSize: '15px' }} />Guardar Cambios</>}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}} @keyframes entraDer{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}} @keyframes entraIzq{from{opacity:0;transform:translateX(-40px)}to{opacity:1;transform:translateX(0)}} @keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}} @keyframes slideOut{from{transform:translateX(0)}to{transform:translateX(100%)}}`}</style>
    </>
  )
}

// ── ModalResguardo ────────────────────────────────────────────────────────────
function ModalResguardo({ bien, onClose, dark, t }) {
  const { close, anim } = useClosing(onClose)
  function imprimir() {
    const html = generarHTMLResguardo(bien)
    const w = window.open('', '_blank', 'width=880,height=1120')
    if (!w) { alert('Permite ventanas emergentes para imprimir.'); return }
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 600)
  }

  function descargar() {
    const html = generarHTMLResguardo(bien)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `resguardo-${bien.claveinventario || 'bien'}.html`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const sepColor = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'

  // ── CAMBIO 1: se agregan los 4 campos de factura ──────────────────────────
  const filas = [
    ['Clave de Inventario', bien.claveinventario],
    ['Nombre del Bien',     bien.nombrebien],
    ['Marca',              bien.marca],
    ['Tipo / Modelo',      bien.tipo],
    ['Serie',              bien.serie],
    ['No. de Inventario',  bien.claveinventario],
    ['Observaciones',      bien.observaciones],
    ['No. de Factura',     bien.numerofactura],
    ['Proveedor',          bien.proveedor],
    ['Costo Inicial',      fmt(bien.costoinicial)],
    ['Fecha Factura',      bien.fechafactura],
  ]

  return (
    <>
      <Overlay onClick={close} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 200, width: '420px',
        background: dark ? '#1e1e20' : '#ffffff', borderLeft: `1px solid ${t.cardBorder}`,
        display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 40px rgba(0,0,0,0.3)',
        animation: anim }}>

        <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${sepColor}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '9px',
              background: dark ? 'rgba(200,168,248,0.15)' : 'rgba(107,33,168,0.08)',
              border: dark ? '1px solid rgba(200,168,248,0.3)' : '1px solid rgba(107,33,168,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="ti ti-file-text" style={{ fontSize: '17px', color: dark ? '#c8a8f8' : '#6b21a8' }} />
            </div>
            <div>
              <p style={{ fontSize: '15px', fontWeight: 600, color: dark ? '#fff' : '#111' }}>Resguardo de Bien</p>
              <p style={{ fontSize: '12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>Sindicatura Municipal · Nogales</p>
            </div>
          </div>
          <button onClick={close} style={{ width: '30px', height: '30px', borderRadius: '7px',
            background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
            border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            color: dark ? '#ccc' : '#555' }}>
            <i className="ti ti-x" style={{ fontSize: '15px' }} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem' }}>
          <div style={{ padding: '12px 14px', borderRadius: '10px', marginBottom: '12px',
            background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
            border: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)',
            textAlign: 'center' }}>
            <p style={{ fontSize: '10px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>H. Ayuntamiento Constitucional Nogales, Sonora</p>
            <p style={{ fontSize: '13px', fontWeight: 700, color: dark ? '#f0f0f0' : '#111', marginTop: '2px' }}>SINDICATURA MUNICIPAL</p>
            <p style={{ fontSize: '11px', fontWeight: 600, color: dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)', marginTop: '4px', textDecoration: 'underline' }}>RESGUARDO DE MOBILIARIO Y EQUIPO</p>
          </div>

          <div style={{ padding: '10px 14px', borderRadius: '9px', marginBottom: '10px',
            background: dark ? 'rgba(200,168,248,0.08)' : 'rgba(107,33,168,0.05)',
            border: dark ? '1px solid rgba(200,168,248,0.2)' : '1px solid rgba(107,33,168,0.14)' }}>
            <p style={{ fontSize: '10px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>Titular del Resguardo</p>
            <p style={{ fontSize: '14px', fontWeight: 600, color: dark ? '#f0f0f0' : '#111' }}>
              C. {(bien.resguardatario || '—').toUpperCase()}
            </p>
            <p style={{ fontSize: '12px', color: dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.5)', marginTop: '2px' }}>{bien.puesto || '—'}</p>
            <p style={{ fontSize: '11px', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)', marginTop: '2px' }}>{(bien.area || '').toUpperCase()}</p>
          </div>

          {filas.map(([label, val], i) => (
            <div key={i} style={{ padding: '9px 0', borderBottom: `1px solid ${sepColor}` }}>
              <p style={{ fontSize: '10px', color: dark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>{label}</p>
              <p style={{ fontSize: '13px', color: dark ? '#f0f0f0' : '#111' }}>{val || '—'}</p>
            </div>
          ))}

          <div style={{ marginTop: '14px', padding: '10px 14px', borderRadius: '9px',
            background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
            border: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)',
            fontSize: '11px', color: dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)' }}>
            <p style={{ fontWeight: 600, marginBottom: '4px' }}>Firmas:</p>
            <p>· C. {(bien.resguardatario || '—').toUpperCase()} — Titular del Resguardo</p>
            <p>· MTRA. EDNA ELINORA SOTO GRACIA — Síndico Municipal</p>
            <p style={{ marginTop: '6px' }}>Elaboró: C. ELSA MÓNICA LÓPEZ LEYVA — Asistente Administrativo</p>
          </div>
        </div>

        <div style={{ padding: '1rem 1.5rem', borderTop: `1px solid ${sepColor}`, display: 'flex', gap: '8px' }}>
          <button onClick={close} style={{ flex: 1, padding: '10px', background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)', border: dark ? '1px solid rgba(255,255,255,0.13)' : '1px solid rgba(0,0,0,0.09)', borderRadius: '9px', fontSize: '14px', fontWeight: 500, color: dark ? '#ccc' : '#444', fontFamily: 'inherit', cursor: 'pointer' }}>Cerrar</button>
          <button onClick={descargar}
            style={{ flex: 1, padding: '10px', borderRadius: '9px', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
              background: dark ? 'rgba(200,168,248,0.18)' : 'rgba(107,33,168,0.08)',
              border: dark ? '1px solid rgba(200,168,248,0.35)' : '1px solid rgba(107,33,168,0.35)',
              color: dark ? '#c8a8f8' : '#6b21a8',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', whiteSpace: 'nowrap' }}>
            <i className="ti ti-download" style={{ fontSize: '16px' }} />
            Descargar
          </button>
          <button onClick={imprimir}
            style={{ flex: 1, padding: '10px', borderRadius: '9px', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
              background: dark ? 'rgba(200,168,248,0.18)' : 'rgba(107,33,168,0.08)',
              border: dark ? '1px solid rgba(200,168,248,0.35)' : '1px solid rgba(107,33,168,0.35)',
              color: dark ? '#c8a8f8' : '#6b21a8',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', whiteSpace: 'nowrap' }}>
            <i className="ti ti-printer" style={{ fontSize: '16px' }} />
            Imprimir
          </button>
        </div>
      </div>
      <style>{`@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}} @keyframes slideOut{from{transform:translateX(0)}to{transform:translateX(100%)}}`}</style>
    </>
  )
}

// ── PanelConsulta ─────────────────────────────────────────────────────────────
export function PanelConsulta({ bien, onClose, t, dark, sinEtiqueta = false }) {
  if (!bien) return null
  const { close, anim } = useClosing(onClose)
  const esVehiculo = ['VEHICULAR','VEHICULAR-MAQUINARIA','VEHICULAR-REMOLQUES-CARROCERIAS'].includes(bien.categoriainventario)

  const campos = esVehiculo
    ? [
        ['Clave de Inventario', bien.claveinventario],
        ['Nombre del Bien', bien.nombrebien],
        ['Marca', bien.marca],
        ['Año', bien.anio],
        ['Modelo / Placa', bien.tipo],
        ['Serie (VIN)', bien.serie],
        ['Área de Adscripción', bien.area],
        ['Resguardatario', bien.resguardatario],
        ['Puesto', bien.puesto],
        ['Observaciones', bien.observaciones],
        ['Costo Inicial', fmt(bien.costoinicial)],
        ['Número de Factura', bien.numerofactura],
        ['Proveedor', bien.proveedor],
        ['Fecha Factura', bien.fechafactura],
      ]
    : [
        ['Clave de Inventario', bien.claveinventario],
        ['Nombre del Bien', bien.nombrebien],
        ['Marca', bien.marca],
        ['Tipo', bien.tipo],
        ['Serie', bien.serie],
        ['Área de Adscripción', bien.area],
        ['Resguardatario', bien.resguardatario],
        ['Puesto', bien.puesto],
        ['Observaciones', bien.observaciones],
        ['Costo Inicial', fmt(bien.costoinicial)],
        ['Número de Factura', bien.numerofactura],
        ['Proveedor', bien.proveedor],
        ['Fecha Factura', bien.fechafactura],
      ]

  return (
    <>
      <Overlay onClick={close} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 200, width: '380px', background: dark ? '#1e1e20' : '#ffffff', borderLeft: `1px solid ${t.cardBorder}`, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 40px rgba(0,0,0,0.3)', animation: anim }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: '12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', marginBottom: '2px' }}>Detalle del bien</p>
            <p style={{ fontSize: '16px', fontWeight: 600, color: dark ? '#fff' : '#111' }}>Consulta</p>
          </div>
          <button onClick={close} style={{ width: '32px', height: '32px', borderRadius: '8px', background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: dark ? '#ccc' : '#444' }}>
            <i className="ti ti-x" style={{ fontSize: '16px' }} />
          </button>
        </div>
        <div style={{ padding: '1rem 1.5rem', borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}` }}>
          {(() => { const e = estadoInfo(bien.observaciones, dark); return (
            <span style={{ fontSize: '12px', fontWeight: 600, padding: '5px 13px', borderRadius: '20px', background: e.bg, color: e.color, border: `1px solid ${e.color}44` }}>
              {e.label}
            </span>
          ) })()}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 1.5rem' }}>
          {campos.map(([label, val], i) => (
            <div key={i} style={{ padding: '11px 0', borderBottom: i < campos.length - 1 ? `1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}` : '' }}>
              <p style={{ fontSize: '10px', color: dark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>{label}</p>
              <p style={{ fontSize: '14px', color: dark ? '#f0f0f0' : '#111', lineHeight: 1.4 }}>{val || '—'}</p>
            </div>
          ))}
        </div>
        <div style={{ padding: '1rem 1.5rem', borderTop: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`, display: 'flex', gap: '8px' }}>
          <button onClick={close} style={{ flex: 1, padding: '10px', borderRadius: '9px', background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', fontSize: '13px', fontWeight: 500, color: dark ? '#ccc' : '#444', fontFamily: 'inherit', cursor: 'pointer' }}>
            Cerrar
          </button>
          {!sinEtiqueta && (
            <button style={{ flex: 1, padding: '10px', borderRadius: '9px', background: dark ? 'rgba(168,197,248,0.15)' : 'rgba(37,99,235,0.08)', border: dark ? '1px solid rgba(168,197,248,0.3)' : '1px solid rgba(37,99,235,0.2)', fontSize: '14px', fontWeight: 600, color: dark ? '#a8c5f8' : '#2563eb', fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
              <i className="ti ti-printer" style={{ fontSize: '15px' }} />
              Reimprimir Etiqueta
            </button>
          )}
        </div>
      </div>
      <style>{`@keyframes slideIn { from{transform:translateX(100%)} to{transform:translateX(0)} } @keyframes slideOut { from{transform:translateX(0)} to{transform:translateX(100%)} }`}</style>
    </>
  )
}

// ── Combo de motivo (menú desplegable + texto libre) ───────────────────────────
function ComboMotivo({ value, onChange, dark }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const opciones = ['Deterioro irreparable', 'Obsolescencia', 'Pérdida o robo', 'Donación', 'Venta', 'Otro']
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ ...iStyle(dark), display: 'flex', alignItems: 'center', gap: '8px', padding: '0 12px 0 12px' }}>
        <input value={value} onChange={e => onChange(e.target.value)} onFocus={() => setOpen(true)} placeholder="Selecciona o escribe un motivo..."
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: '14px', color: dark ? '#f0f0f0' : '#111', padding: '9px 0' }} />
        <i onClick={() => setOpen(o => !o)} className="ti ti-chevron-down" style={{ fontSize: '16px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', cursor: 'pointer', transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </div>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20, background: dark ? '#2a2a2c' : '#fff', border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.15)', borderRadius: '9px', boxShadow: '0 10px 30px rgba(0,0,0,0.25)', overflow: 'hidden', maxHeight: '210px', overflowY: 'auto' }}>
          {opciones.map(o => {
            const sel = value === o
            return (
              <div key={o} onClick={() => { onChange(o); setOpen(false) }}
                style={{ padding: '10px 13px', fontSize: '14px', cursor: 'pointer', color: dark ? '#f0f0f0' : '#111', background: sel ? (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)') : 'transparent' }}
                onMouseEnter={e => e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = sel ? (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)') : 'transparent'}>
                {o}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── ModalBaja ─────────────────────────────────────────────────────────────────
export function ModalBaja({ bien, onClose, dark, t, titulo = 'Dar de Baja', onConfirm }) {
  const { close, anim } = useClosing(onClose, 250,
    'fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)',
    'fadeDown 0.25s cubic-bezier(0.4,0,0.2,1) forwards'
  )
  const [motivo, setMotivo]       = useState('')
  const [fecha, setFecha]         = useState('')
  const [obs, setObs]             = useState('')
  const [archivos, setArchivos]   = useState([])
  const [dragging, setDragging]   = useState(false)
  const [guardando, setGuardando] = useState(false)
  const inputRef                  = useRef(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  async function confirmar() {
    setGuardando(true)
    try {
      if (onConfirm) await onConfirm({ motivo, fecha, obs })
      close()
    } catch (e) { console.error(e); setGuardando(false) }
  }

  function agregarArchivos(files) {
    const imgs = Array.from(files).filter(f => f.type.startsWith('image/'))
    setArchivos(prev => [...prev, ...imgs])
  }
  function onDrop(e) {
    e.preventDefault(); setDragging(false)
    agregarArchivos(e.dataTransfer.files)
  }
  function eliminar(i) { setArchivos(prev => prev.filter((_, idx) => idx !== i)) }

  return (
    <>
      <Overlay onClick={close} />
      <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '460px', background: dark ? '#1e1e20' : '#fff', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', borderRadius: '16px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', overflow: 'hidden', animation: anim }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: dark ? 'rgba(244,161,161,0.15)' : 'rgba(192,57,43,0.08)', border: dark ? '1px solid rgba(244,161,161,0.3)' : '1px solid rgba(192,57,43,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="ti ti-circle-minus" style={{ fontSize: '18px', color: dark ? '#f4a1a1' : '#c0392b' }} />
              </div>
              <div>
                <p style={{ fontSize: '15px', fontWeight: 600, color: dark ? '#fff' : '#111' }}>{titulo}</p>
                <p style={{ fontSize: '12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>{bien.claveinventario}</p>
              </div>
            </div>
            <button onClick={onClose} style={{ width: '30px', height: '30px', borderRadius: '7px', background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: dark ? '#ccc' : '#555' }}>
              <i className="ti ti-x" style={{ fontSize: '15px' }} />
            </button>
          </div>
          <div style={{ margin: '1rem 1.5rem', padding: '10px 14px', borderRadius: '10px', background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)', border: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)' }}>
            <p style={{ fontSize: '13px', fontWeight: 500, color: dark ? '#f0f0f0' : '#111' }}>{bien.nombrebien}</p>
            <p style={{ fontSize: '12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', marginTop: '2px' }}>{bien.area}</p>
          </div>
          <div style={{ padding: '0 1.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <MField label="Motivo de baja" dark={dark}>
              <ComboMotivo value={motivo} onChange={setMotivo} dark={dark} />
            </MField>
            <MField label="Fecha de baja" dark={dark}>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={iStyle(dark)} />
            </MField>

            <MField label="Evidencia" dark={dark}>
              <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => agregarArchivos(e.target.files)} />
              {archivos.length === 0 ? (
                <div
                  onClick={() => inputRef.current.click()}
                  onDragOver={e => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  style={{
                    border: `2px dashed ${dragging ? (dark ? '#a8c5f8' : '#2563eb') : (dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)')}`,
                    borderRadius: '10px', padding: '18px 12px', textAlign: 'center',
                    cursor: 'pointer', transition: 'all 0.15s',
                    background: dragging ? (dark ? 'rgba(168,197,248,0.08)' : 'rgba(37,99,235,0.04)') : 'transparent',
                  }}>
                  <i className="ti ti-photo-up" style={{ fontSize: '22px', color: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)', display: 'block', marginBottom: '6px' }} />
                  <p style={{ fontSize: '13px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', lineHeight: 1.4 }}>
                    Arrastra imágenes aquí o <span style={{ color: dark ? '#a8c5f8' : '#2563eb', fontWeight: 500 }}>haz clic para seleccionar</span>
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {archivos.map((f, i) => (
                    <div key={i} style={{ position: 'relative', width: '64px', height: '64px' }}>
                      <img src={URL.createObjectURL(f)} alt={f.name}
                        style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '8px', border: `1px solid ${dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'}` }} />
                      <button onClick={() => eliminar(i)} style={{
                        position: 'absolute', top: '-6px', right: '-6px',
                        width: '18px', height: '18px', borderRadius: '50%',
                        background: dark ? '#333' : '#fff', border: `1px solid ${dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', fontSize: '10px', color: dark ? '#ccc' : '#555', padding: 0,
                      }}>✕</button>
                    </div>
                  ))}
                  <div
                    onClick={() => inputRef.current.click()}
                    onDragOver={e => { e.preventDefault(); setDragging(true) }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    style={{
                      width: '64px', height: '64px', borderRadius: '8px', cursor: 'pointer',
                      border: `2px dashed ${dragging ? (dark ? '#a8c5f8' : '#2563eb') : (dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)')}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: dragging ? (dark ? 'rgba(168,197,248,0.08)' : 'rgba(37,99,235,0.04)') : 'transparent',
                      transition: 'all 0.15s',
                    }}>
                    <i className="ti ti-plus" style={{ fontSize: '20px', color: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)' }} />
                  </div>
                </div>
              )}
            </MField>

            <MField label="Observaciones adicionales" dark={dark}>
              <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3} placeholder="Descripción del estado..." style={{ ...iStyle(dark), resize: 'none', lineHeight: 1.5 }} />
            </MField>
          </div>
          <div style={{ padding: '1rem 1.5rem', borderTop: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display: 'flex', gap: '8px' }}>
            <button onClick={close} disabled={guardando} style={{ flex: 1, padding: '10px', background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)', border: dark ? '1px solid rgba(255,255,255,0.13)' : '1px solid rgba(0,0,0,0.09)', borderRadius: '9px', fontSize: '14px', fontWeight: 500, color: dark ? '#ccc' : '#444', fontFamily: 'inherit', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={confirmar} disabled={guardando} style={{ flex: 1, padding: '10px', background: dark ? 'rgba(244,161,161,0.18)' : 'rgba(192,57,43,0.08)', border: dark ? '1px solid rgba(244,161,161,0.35)' : '1px solid rgba(192,57,43,0.35)', borderRadius: '9px', fontSize: '14px', fontWeight: 600, color: dark ? '#f4a1a1' : '#c0392b', fontFamily: 'inherit', cursor: guardando ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              {guardando ? <><i className="ti ti-loader-2" style={{ fontSize: '15px', animation: 'spin 1s linear infinite' }} />Procesando…</> : <><i className="ti ti-circle-minus" style={{ fontSize: '15px' }} />Confirmar Baja</>}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(20px) scale(0.98)}to{opacity:1;transform:translateY(0) scale(1)}} @keyframes fadeDown{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(20px) scale(0.98)}}`}</style>
    </>
  )
}

// ── ModalTraspaso ─────────────────────────────────────────────────────────────
function ModalTraspaso({ bien, onClose, onDone, dark, t, allAreas }) {
  const { close, anim } = useClosing(onClose, 250,
    'fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)',
    'fadeDown 0.25s cubic-bezier(0.4,0,0.2,1) forwards'
  )
  const [dep, setDep]       = useState('')
  const [resg, setResg]     = useState('')
  const [puesto, setPuesto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [fecha, setFecha]   = useState('')
  const [nuevaClave, setNuevaClave] = useState('')
  const [guardando, setGuardando]   = useState(false)
  const [err, setErr]               = useState(null)

  // El bien conserva su año y su tipo; solo cambian el prefijo y la clave de la
  // dependencia destino, con un consecutivo nuevo dentro de esa dependencia.
  const anioBien = useMemo(() => {
    const m = String(bien.claveinventario || '').match(/^[A-ZÑ]+(\d{2})-/i)
    return m ? 2000 + Number(m[1]) : new Date().getFullYear()
  }, [bien.claveinventario])
  const tipoBien = useMemo(() => {
    const m = String(bien.claveinventario || '').match(/^[A-ZÑ]+\d{2}-[A-Z0-9]+-(\d+)-/i)
    return m ? m[1] : tipoDeCategoria(bien.categoriainventario)
  }, [bien.claveinventario, bien.categoriainventario])

  useEffect(() => {
    if (!dep) { setNuevaClave(''); return }
    let vivo = true
    setNuevaClave('Generando…')
    siguienteClave({ idarea: dep, tipo: tipoBien, anio: anioBien })
      .then(r => { if (vivo) setNuevaClave(r ? r.clave : '') })
      .catch(() => { if (vivo) setNuevaClave('') })
    return () => { vivo = false }
  }, [dep, tipoBien, anioBien])

  async function confirmar() {
    if (!dep) { setErr('Selecciona la dependencia destino'); return }
    setGuardando(true); setErr(null)
    try {
      // Recalcula la clave por si otro usuario tomó el consecutivo mientras tanto
      const gen = await siguienteClave({ idarea: dep, tipo: tipoBien, anio: anioBien })
      // Al cambiar idarea, el bien deja de aparecer en el área de origen y pasa
      // al destino con su nueva clave de inventario.
      const parche = { idarea: Number(dep) }
      if (gen) { parche.claveinventario = gen.clave; parche.consecutivo = gen.consecutivo }

      // Nuevo titular: si la persona ya está en el catálogo se reutiliza su
      // registro; si no, se da de alta. Igual que al registrar un bien.
      if (resg.trim()) parche.idresguardo = await resolverResguardo(resg, puesto)

      // El motivo y la fecha no tienen columna propia, así que se anotan en
      // observaciones. Se conserva el estado al inicio del texto (de ahí lo leen
      // el filtro y el badge) y lo que ya estuviera escrito antes.
      // Se deja constancia del origen y de la clave anterior: al traspasar, la
      // clave se reemplaza por la del área destino y si no se anota aquí no queda
      // forma de saber de dónde salió el bien.
      const destino = allAreas.find(a => String(a.idarea) === String(dep))
      const nota = ['TRASPASO A ' + String(destino?.nombrearea || 'OTRA AREA').toUpperCase()]
      if (fecha) { const [a, m, d] = fecha.split('-'); nota.push(`EL ${d}/${m}/${a}`) }
      const origen = []
      if (bien.area && bien.area !== '—') origen.push(String(bien.area).toUpperCase())
      if (bien.claveinventario) origen.push('CLAVE ANTERIOR ' + bien.claveinventario)
      if (origen.length) nota.push('· DE ' + origen.join(', '))
      if (motivo) nota.push('· MOTIVO: ' + motivo.toUpperCase())
      const { estado, resto } = partirObs(bien.observaciones)
      parche.observaciones = unirObs(estado, [resto, nota.join(' ')].filter(Boolean).join(' | '))

      const { error } = await supabase.from('bienes').update(parche).eq('idbien', bien.idbien)
      if (error) throw error
      onDone && onDone()
      close()
    } catch (e) { setErr(e.message); setGuardando(false) }
  }

  return (
    <>
      <Overlay onClick={close} />
      <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '480px', background: dark ? '#1e1e20' : '#fff', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', borderRadius: '16px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', overflow: 'hidden', animation: anim }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: dark ? 'rgba(255,213,128,0.15)' : 'rgba(183,121,10,0.08)', border: dark ? '1px solid rgba(255,213,128,0.3)' : '1px solid rgba(183,121,10,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="ti ti-arrows-exchange" style={{ fontSize: '18px', color: dark ? '#ffd580' : '#b7790a' }} />
              </div>
              <div>
                <p style={{ fontSize: '15px', fontWeight: 600, color: dark ? '#fff' : '#111' }}>Traspaso de Bien</p>
                <p style={{ fontSize: '12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>{bien.claveinventario}</p>
              </div>
            </div>
            <button onClick={close} style={{ width: '30px', height: '30px', borderRadius: '7px', background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: dark ? '#ccc' : '#555' }}>
              <i className="ti ti-x" style={{ fontSize: '15px' }} />
            </button>
          </div>
          <div style={{ margin: '1rem 1.5rem', padding: '10px 14px', borderRadius: '10px', background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)', border: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)' }}>
            <p style={{ fontSize: '13px', fontWeight: 500, color: dark ? '#f0f0f0' : '#111' }}>{bien.nombrebien}</p>
            <p style={{ fontSize: '12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', marginTop: '2px' }}>Origen: {bien.area} — {bien.resguardatario}</p>
          </div>
          <div style={{ padding: '0 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <MField label="Dependencia destino" dark={dark}>
              <select value={dep} onChange={e => setDep(e.target.value)} style={sStyle(dark)}>
                <option value="">Seleccionar dependencia...</option>
                {allAreas.map(a => (
                  <option key={a.idarea} value={a.idarea}>{a.nombrearea}</option>
                ))}
              </select>
            </MField>
            {dep && (
              <div style={{ padding: '10px 14px', borderRadius: '10px', background: dark ? 'rgba(255,213,128,0.10)' : 'rgba(183,121,10,0.06)', border: dark ? '1px solid rgba(255,213,128,0.25)' : '1px solid rgba(183,121,10,0.2)' }}>
                <p style={{ fontSize: '11px', fontWeight: 600, color: dark ? 'rgba(255,213,128,0.8)' : '#b45309', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Nueva clave de inventario</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'monospace', fontSize: '13px' }}>
                  <span style={{ color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)', textDecoration: 'line-through' }}>{bien.claveinventario || '—'}</span>
                  <i className="ti ti-arrow-right" style={{ fontSize: '14px', color: dark ? '#ffd580' : '#b45309' }} />
                  <span style={{ fontWeight: 700, color: dark ? '#ffd580' : '#b45309' }}>{nuevaClave || 'sin clave para esa área'}</span>
                </div>
              </div>
            )}
            <MField label="Nuevo resguardatario" dark={dark}>
              <input type="text" placeholder="Nombre completo" value={resg} onChange={e => setResg(e.target.value)} style={iStyle(dark)} />
            </MField>
            <MField label="Puesto del nuevo resguardatario" dark={dark}>
              <input type="text" placeholder="Cargo o puesto" value={puesto} onChange={e => setPuesto(e.target.value)} style={iStyle(dark)} />
            </MField>
            <MField label="Motivo del traspaso" dark={dark}>
              <select value={motivo} onChange={e => setMotivo(e.target.value)} style={sStyle(dark)}>
                <option value="">Seleccionar motivo...</option>
                <option>Reasignación de funciones</option>
                <option>Necesidad operativa</option>
                <option>Reestructura organizacional</option>
                <option>Solicitud de dependencia</option>
                <option>Otro</option>
              </select>
            </MField>
            <MField label="Fecha de traspaso" dark={dark}>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={iStyle(dark)} />
            </MField>
            {/* No hay columnas para el motivo ni la fecha: se anotan en observaciones */}
            <p style={{ fontSize: '11px', color: t.text4, marginTop: '-6px' }}>
              El motivo y la fecha se agregan a las observaciones del bien, sin borrar lo que ya tenía.
            </p>
          </div>
          <div style={{ padding: '1rem 1.5rem', marginTop: '1rem', borderTop: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)' }}>
            {err && <p style={{ fontSize: '12px', color: dark ? '#f4a1a1' : '#c0392b', marginBottom: '10px' }}><i className="ti ti-alert-circle" style={{ marginRight: '5px' }} />{err}</p>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={close} style={{ flex: 1, padding: '10px', background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)', border: dark ? '1px solid rgba(255,255,255,0.13)' : '1px solid rgba(0,0,0,0.09)', borderRadius: '9px', fontSize: '14px', fontWeight: 500, color: dark ? '#ccc' : '#444', fontFamily: 'inherit', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={confirmar} disabled={guardando || !dep} style={{ flex: 1, padding: '10px', background: dark ? 'rgba(255,213,128,0.18)' : 'rgba(183,121,10,0.08)', border: dark ? '1px solid rgba(255,213,128,0.35)' : '1px solid rgba(183,121,10,0.35)', borderRadius: '9px', fontSize: '14px', fontWeight: 600, color: dark ? '#ffd580' : '#b45309', fontFamily: 'inherit', cursor: guardando || !dep ? 'not-allowed' : 'pointer', opacity: !dep ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                {guardando
                  ? <><i className="ti ti-loader-2" style={{ fontSize: '15px', animation: 'spin 1s linear infinite' }} />Traspasando…</>
                  : <><i className="ti ti-arrows-exchange" style={{ fontSize: '15px' }} />Confirmar Traspaso</>}
              </button>
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(20px) scale(0.98)}to{opacity:1;transform:translateY(0) scale(1)}} @keyframes fadeDown{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(20px) scale(0.98)}}`}</style>
    </>
  )
}

function MField({ label, dark, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <label style={{ fontSize: '11px', fontWeight: 600, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>
      {children}
    </div>
  )
}

function btnAccion(dark, tipo) {
  const c = {
    consulta:  { color: dark ? '#a8c5f8' : '#2563eb', bg: dark ? 'rgba(168,197,248,0.12)' : 'rgba(37,99,235,0.07)',   border: dark ? 'rgba(168,197,248,0.25)' : 'rgba(37,99,235,0.18)'   },
    editar:    { color: dark ? '#a8e6cf' : '#1e7e4a', bg: dark ? 'rgba(168,230,207,0.12)' : 'rgba(30,126,74,0.07)',   border: dark ? 'rgba(168,230,207,0.25)' : 'rgba(30,126,74,0.18)'   },
    resguardo: { color: dark ? '#c8a8f8' : '#6b21a8', bg: dark ? 'rgba(200,168,248,0.12)' : 'rgba(107,33,168,0.07)', border: dark ? 'rgba(200,168,248,0.25)' : 'rgba(107,33,168,0.18)' },
    traspaso:  { color: dark ? '#ffd580' : '#b7790a', bg: dark ? 'rgba(255,213,128,0.12)' : 'rgba(183,121,10,0.07)', border: dark ? 'rgba(255,213,128,0.25)' : 'rgba(183,121,10,0.18)' },
    baja:      { color: dark ? '#f4a1a1' : '#c0392b', bg: dark ? 'rgba(244,161,161,0.12)' : 'rgba(192,57,43,0.07)',  border: dark ? 'rgba(244,161,161,0.25)' : 'rgba(192,57,43,0.18)'  },
  }[tipo]
  return { width: '30px', height: '30px', borderRadius: '7px', background: c.bg, border: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: c.color }
}

function thBase(dark) {
  return { padding: '9px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', verticalAlign: 'middle', background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }
}
function tdBase() { return { padding: '10px 10px', verticalAlign: 'top' } }

// ── Categorías ────────────────────────────────────────────────────────────────
const CATS_BY_MODO = {
  mobiliario:        ['MOBILIARIO'],
  computo:           ['EQUIPO DE COMPUTO', 'EQUIPO'],
  maquinaria:        ['MAQUINARIA'],
  vehiculos:         ['VEHICULAR', 'VEHICULAR-MAQUINARIA', 'VEHICULAR-REMOLQUES-CARROCERIAS'],
  radiocomunicacion: ['RADIOCOMUNICACION'],
  parquimetros:      ['EQUIPO DE CONTROL TIEMPO PARQUI'],
  senalizaciones:    ['SEÑALIZACIONES'],
  arbolesplantas:    ['ARBOLES Y PLANTAS'],
  defensa:           ['MAQUINARIA Y EQUIPO DE DEFENSA Y SEGURIDAD PUBLICA'],
}

const MODOS = [
  { id: 'mobiliario',        label: 'Mobiliario',          icon: 'ti-armchair' },
  { id: 'computo',           label: 'Cómputo',             icon: 'ti-device-laptop' },
  { id: 'maquinaria',        label: 'Maquinaria',          icon: 'ti-bulldozer' },
  { id: 'vehiculos',         label: 'Vehículos',           icon: 'ti-car' },
  { id: 'radiocomunicacion', label: 'Radiocomunicaciones', icon: 'ti-phone' },
  { id: 'parquimetros',      label: 'Parquímetros',        icon: 'ti-clock' },
  { id: 'senalizaciones',    label: 'Señalizaciones',      icon: 'ti-road-sign' },
  { id: 'arbolesplantas',    label: 'Árboles y Plantas',   icon: 'ti-tree' },
  { id: 'defensa',           label: 'Defensa y Seguridad', icon: 'ti-shield' },
]


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

const OPCIONES_POR_PAGINA = [10, 15, 20]

// Partidas presupuestales usadas en el inventario, tomadas de los bienes ya
// registrados. La primera de cada categoría es la que se propone al dar de alta.
const PARTIDAS = [
  { cod: '51101', nombre: 'Mobiliario' },
  { cod: '51501', nombre: 'Equipo de cómputo' },
  { cod: '51901', nombre: 'Otros mobiliarios y equipos' },
  { cod: '51903', nombre: 'Señalizaciones' },
  { cod: '52101', nombre: 'Equipos audiovisuales' },
  { cod: '52301', nombre: 'Cámaras fotográficas y de video' },
  { cod: '52901', nombre: 'Equipo educacional y recreativo' },
  { cod: '53101', nombre: 'Equipo médico y de laboratorio' },
  { cod: '54101', nombre: 'Vehículos y equipo terrestre' },
  { cod: '54102', nombre: 'Vehículos y equipo terrestre para seguridad pública' },
  { cod: '54103', nombre: 'Vehículos y equipo terrestre para servicios públicos' },
  { cod: '54201', nombre: 'Carrocerías y remolques' },
  { cod: '54901', nombre: 'Otros equipos de transporte' },
  { cod: '55101', nombre: 'Equipo de defensa y seguridad' },
  { cod: '56201', nombre: 'Maquinaria y equipo industrial' },
  { cod: '56301', nombre: 'Maquinaria y equipo de construcción' },
  { cod: '56401', nombre: 'Aire acondicionado y refrigeración' },
  { cod: '56501', nombre: 'Equipo de comunicación' },
  { cod: '56601', nombre: 'Equipos de generación eléctrica y accesorios eléctricos' },
  { cod: '56701', nombre: 'Herramientas y máquinas-herramienta' },
  { cod: '56903', nombre: 'Otros equipos' },
  { cod: '57801', nombre: 'Árboles y plantas' },
  { cod: '59101', nombre: 'Software' },
  { cod: '59701', nombre: 'Licencias informáticas e intelectuales' },
]
// Partida que se propone según la categoría elegida
const PARTIDA_POR_MODO = {
  mobiliario: '51101', computo: '51501', maquinaria: '56201', vehiculos: '54101',
  radiocomunicacion: '56501', parquimetros: '54901', senalizaciones: '51903',
  arbolesplantas: '57801', defensa: '55101',
}

// ── QUERY SUPABASE ────────────────────────────────────────────────────────────
// Los mismos filtros que usa la tabla, menos el texto buscado. Se comparte con
// paginaDeBien para que el conteo salga sobre exactamente la misma lista.
function filtrosDeLista(query, { modo, filtroBien, filtroEstado, filtroAreaIds, papelera, traspasos }) {
  // La papelera y los traspasos son la misma lista, solo cambia el estado
  query = query.in('estadobien', traspasos ? ['TRASPASO'] : papelera ? [ESTADO_PAPELERA] : ['ACTIVO', 'SOLICITUD BAJA'])

  // Los traspasados llevan su propia categoría ('TRASPASOS'), así que filtrar
  // por tipo de bien los dejaría a todos fuera: en esa vista no se aplica.
  if (!traspasos)
    query = query.in('categoriainventario', CATS_BY_MODO[modo] ?? CATS_BY_MODO.mobiliario)

  if (filtroAreaIds && filtroAreaIds.length > 0)
    query = query.in('idarea', filtroAreaIds)

  if (filtroBien)
    query = query.or(`nombrebien.ilike.%${filtroBien}%,tipo.ilike.%${filtroBien}%,marca.ilike.%${filtroBien}%`)

  if (filtroEstado === 'Deteriorado')
    query = query.or('observaciones.ilike.%deteriorado%,observaciones.ilike.%quebrado%')
  else if (filtroEstado === 'No verificado')
    query = query.ilike('observaciones', '%no verificado%')
  else if (filtroEstado === 'Buen estado')
    query = query.not('observaciones', 'ilike', '%deteriorado%')
                 .not('observaciones', 'ilike', '%quebrado%')
                 .not('observaciones', 'ilike', '%no verificado%')

  return query
}

// En qué página de la lista completa cae un bien. Se cuenta cuántos van antes
// que él con los filtros puestos pero SIN el texto buscado, en el mismo orden
// que usa la tabla: consecutivo y luego idbien. Los consecutivos vacíos quedan
// al final, que es como los acomoda la base.
// Orden de la lista de bienes:
//  · sin filtro de dependencia o área, lo más reciente arriba. El alta nueva
//    toma el idbien más alto, así que un bien recién capturado sale primero.
//  · con filtro puesto, por clave de inventario, que ya lleva el consecutivo
//    dentro y es como se revisa el listado de un área.
function vaPorClave(filtroAreaIds) {
  return Array.isArray(filtroAreaIds) && filtroAreaIds.length > 0
}
function ordenDeLista(query, filtroAreaIds) {
  // Se ordena por la columna consecutivo, no por la clave: la clave lleva el año
  // antes del número (DBS12-…-081, DBS13-…-067) y ordenarla como texto agrupa
  // por año y deja los consecutivos salteados.
  // Cada área lleva su propia serie, así que primero se agrupa por área y
  // dentro de ella se numera: si no, con varias áreas salen intercalados
  // todos los 001, luego todos los 002.
  return vaPorClave(filtroAreaIds)
    ? query.order('idarea', { ascending: true })
           .order('consecutivo', { ascending: true, nullsFirst: false })
           .order('idbien', { ascending: true })
    : query.order('idbien', { ascending: false })
}

async function paginaDeBien(bien, filtros) {
  const { porPagina } = filtros
  const { data: fila, error: e0 } = await supabase
    .from('bienes').select('idbien, idarea, consecutivo').eq('idbien', bien.idbien).maybeSingle()
  if (e0) throw e0
  if (!fila) throw new Error('El bien ya no está en la base')

  // Cuenta cuántos van delante de él CON EL MISMO ORDEN que usa la lista, si no
  // el salto cae en otra página.
  let q = filtrosDeLista(supabase.from('bienes').select('idbien', { count: 'exact', head: true }), filtros)
  if (vaPorClave(filtros.filtroAreaIds)) {
    // Delante van las áreas anteriores completas, y dentro de la suya los de
    // consecutivo menor. Debe reflejar el mismo orden que ordenDeLista.
    const dentro = fila.consecutivo == null
      ? `and(idarea.eq.${fila.idarea},consecutivo.is.null,idbien.lt.${fila.idbien})`
      : `and(idarea.eq.${fila.idarea},consecutivo.lt.${fila.consecutivo}),and(idarea.eq.${fila.idarea},consecutivo.eq.${fila.consecutivo},idbien.lt.${fila.idbien})`
    q = q.or(`idarea.lt.${fila.idarea},${dentro}`)
  } else {
    q = q.gt('idbien', fila.idbien)
  }

  const { count, error } = await q
  if (error) throw error
  return Math.floor((count || 0) / porPagina)
}

async function fetchBienes({ modo, pagina, busqueda, filtroBien, filtroEstado, filtroAreaIds, porPagina, papelera, traspasos }) {
  const desde = pagina * porPagina
  const hasta  = desde + porPagina - 1

  let query = supabase
    .from('bienes')
    // idarea e idfactura hacen falta para poder modificar el bien: sin ellos el
    // formulario los recibía vacíos y al guardar mandaba idarea en null.
    .select(`
      idbien, idarea, idfactura, nombrebien, marca, tipo, serie, observaciones,
      claveinventario, categoriainventario, estadobien, anio, partida,
      areas ( nombrearea ),
      resguardos ( nombre, puesto ),
      facturas ( numerofactura, fechafactura, costoinicial, proveedores ( nombreproveedor ) )
    `, { count: 'exact' })
    .range(desde, hasta)

  // Sin filtro de dependencia manda lo más reciente: el alta más nueva toma el
  // idbien más alto, así que un bien recién capturado sale hasta arriba. Al
  // filtrar por dependencia se ordena por número de inventario, que es como se
  // revisa el listado de un área.
  query = ordenDeLista(query, filtroAreaIds)

  query = filtrosDeLista(query, { modo, filtroBien, filtroEstado, filtroAreaIds, papelera, traspasos })

  if (busqueda)
    query = query.or(`nombrebien.ilike.%${busqueda}%,claveinventario.ilike.%${busqueda}%`)

  const { data, error, count } = await query
  if (error) throw error

  return {
    data: data.map(b => ({
      ...b,
      area:           b.areas?.nombrearea                      || '—',
      resguardatario: b.resguardos?.nombre                     || '—',
      puesto:         b.resguardos?.puesto                     || '—',
      numerofactura:  b.facturas?.numerofactura                || 'SIN FACTURA',
      fechafactura:   b.facturas?.fechafactura                 || '—',
      costoinicial:   b.facturas?.costoinicial                 || 0,
      proveedor:      b.facturas?.proveedores?.nombreproveedor || '—',
    })),
    count,
  }
}

// Devuelve el idresguardo que corresponde a ese nombre y puesto. Devuelve null
// si no se capturó nombre.
//
// Busca la combinación EXACTA de nombre + puesto y, si no existe, da de alta un
// registro nuevo. Nunca modifica un registro que ya estaba: así, corregir el
// titular de un bien afecta solo a ese bien y no a los demás de esa persona
// (hay titulares con más de 120 bienes a su cargo). Si no se capturó puesto,
// basta con que coincida el nombre.
async function resolverResguardo(nombre, puesto) {
  const nom = (nombre || '').trim().toUpperCase()
  if (!nom) return null
  const pue = (puesto || '').trim().toUpperCase()
  const { data } = await supabase.from('resguardos').select('idresguardo, puesto').ilike('nombre', nom).limit(50)
  const candidatos = data || []
  const exacto = pue
    ? candidatos.find(r => (r.puesto || '').trim().toUpperCase() === pue)
    : candidatos[0]
  if (exacto) return exacto.idresguardo
  const { data: mr, error } = await supabase.from('resguardos').select('idresguardo').order('idresguardo', { ascending: false }).limit(1)
  if (error) throw error
  const idresguardo = ((mr && mr[0]?.idresguardo) || 0) + 1
  const { error: e2 } = await supabase.from('resguardos').insert({ idresguardo, nombre: nom, puesto: pue || null })
  if (e2) throw e2
  return idresguardo
}

// Lee un importe escrito a mano. Acepta punto o coma como decimal ("733.22" y
// "733,22" valen lo mismo) y tolera separadores de miles ("1,234.56", "1.234,56").
// Antes se borraba todo lo que no fuera dígito o punto, así que "733,22" se
// guardaba como 73,322.
function leerImporte(v) {
  let s = String(v == null ? '' : v).replace(/[^\d.,-]/g, '').trim()
  if (!s) return null
  const neg = s.startsWith('-')
  s = s.replace(/-/g, '')
  const ptos = (s.match(/\./g) || []).length
  const comas = (s.match(/,/g) || []).length

  let dec = ''   // qué carácter separa los decimales
  if (ptos && comas) {
    // Con los dos, el decimal es el que aparece de último: "1.234,56" / "1,234.56"
    dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ','
  } else if (ptos + comas === 1) {
    // Uno solo: es de miles si separa exactamente 3 dígitos ("1,500" = mil quinientos),
    // en cualquier otro caso es decimal ("733,22", "733.2", "733.225")
    const sep = ptos ? '.' : ','
    dec = /^\d{1,3}$/.test(s.slice(s.indexOf(sep) + 1)) && s.length - s.indexOf(sep) - 1 === 3 ? '' : sep
  } else if (ptos + comas > 1) {
    // Repetido: son separadores de miles ("1.234.567")
    dec = ''
  }

  const entero = (dec ? s.slice(0, s.lastIndexOf(dec)) : s).replace(/[.,]/g, '')
  const frac = dec ? s.slice(s.lastIndexOf(dec) + 1).replace(/[.,]/g, '') : ''
  const n = Number((entero || '0') + (frac ? '.' + frac : ''))
  if (!Number.isFinite(n)) return null
  return neg ? -n : n
}

// Importe con signo, separador de miles y dos decimales. Si viene un número de
// la base se usa tal cual; si viene texto escrito a mano se interpreta con
// leerImporte, que sí respeta la coma decimal.
function fmtMoneda(v) {
  const n = typeof v === 'number' ? v : leerImporte(v)
  if (n == null || !Number.isFinite(n)) return ''
  return '$ ' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Guarda los datos de compra del bien. La factura vive en su propia tabla, así
// que si el bien todavía no tiene una se crea y se enlaza. El proveedor se
// reutiliza por nombre para no llenar el catálogo de duplicados.
async function guardarFactura(bien, fact) {
  const num    = fact.numerofactura.trim()
  const fecha  = fact.fechafactura.trim()
  // El campo puede venir con "$", separadores de miles o coma decimal
  const costo  = leerImporte(fact.costoinicial)
  const prov   = fact.proveedor.trim()

  let idproveedor = null
  if (prov) {
    const { data } = await supabase.from('proveedores').select('idproveedor').ilike('nombreproveedor', prov).limit(1)
    if (data && data[0]) idproveedor = data[0].idproveedor
    else {
      const { data: ult } = await supabase.from('proveedores').select('idproveedor').order('idproveedor', { ascending: false }).limit(1)
      idproveedor = ((ult && ult[0]?.idproveedor) || 0) + 1
      const { error } = await supabase.from('proveedores').insert({ idproveedor, nombreproveedor: prov })
      if (error) throw error
    }
  }

  const payload = {
    numerofactura: num || null,
    fechafactura:  /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null,
    costoinicial:  costo == null ? null : Math.round(costo * 100) / 100,
    idproveedor,
  }

  if (bien.idfactura) {
    const { error } = await supabase.from('facturas').update(payload).eq('idfactura', bien.idfactura)
    if (error) throw error
    return
  }
  // Sin factura previa: se crea una y se enlaza al bien
  const { data: ult } = await supabase.from('facturas').select('idfactura').order('idfactura', { ascending: false }).limit(1)
  const idfactura = ((ult && ult[0]?.idfactura) || 0) + 1
  const { error: e1 } = await supabase.from('facturas').insert({ idfactura, ...payload })
  if (e1) throw e1
  const { error: e2 } = await supabase.from('bienes').update({ idfactura }).eq('idbien', bien.idbien)
  if (e2) throw e2
}

// Borra el bien de forma permanente y arrastra lo que quede sin dueño: la
// factura si ningún otro bien la usa, el proveedor si ninguna otra factura lo
// usa y el titular si ningún otro bien lo tiene. Lo que siga en uso no se toca.
// Esto NO es una baja: el registro desaparece y no se puede recuperar.
async function enviarAPapelera(bien) {
  const { error } = await supabase
    .from('bienes')
    .update({ estadobien: ESTADO_PAPELERA })
    .eq('idbien', bien.idbien)
  if (error) throw error
}

// Regresa el bien al inventario en el área que se elija, con una clave nueva:
// mientras estuvo en la papelera su número quedó libre y pudo tomarlo otro bien,
// así que se le da el último consecutivo de esa área.
async function restaurarDePapelera(bien, idarea) {
  const area = idarea ?? bien.idarea
  const cambios = { estadobien: 'ACTIVO', idarea: area }

  const g = await siguienteClave({ idarea: area, tipo: tipoDeCategoria(bien.categoriainventario) })
  if (g) cambios.claveinventario = g.clave

  const { error } = await supabase.from('bienes').update(cambios).eq('idbien', bien.idbien)
  if (error) throw error
  return g?.clave || null
}

async function actualizarBien(idbien, campos) {
  const payload = { ...campos }
  if (payload.anio === '' || payload.anio === undefined) payload.anio = null
  else if (payload.anio !== null) payload.anio = Number(payload.anio) || null
  const { error } = await supabase.from('bienes').update(payload).eq('idbien', idbien)
  if (error) throw error
}

// ── CAMBIO 2: genera HTML del resguardo con factura, proveedor, importe, fecha ─
// Contenido de UNA hoja de resguardo. El documento que la envuelve puede llevar
// una sola o varias, una por bien, cada una en su propia página.
function cuerpoResguardo(bien) {
  const meses  = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  const hoy    = new Date()
  const mesStr = meses[hoy.getMonth()]
  const añoStr = hoy.getFullYear()

  const nombre    = (bien.resguardatario || '—').toUpperCase()
  const area      = (bien.area           || '—').toUpperCase()
  const puesto    = (bien.puesto         || '').toUpperCase()
  const desc      = (bien.nombrebien     || '').toUpperCase()
  const marca     = (bien.marca          || '').toUpperCase()
  const tipo      = (bien.tipo           || '').toUpperCase()
  const serie     = (bien.serie          || '').toUpperCase()
  const obs       = (bien.observaciones  || '')
  const clave     = (bien.claveinventario || '')
  // ── campos nuevos ──
  const factura   = (bien.numerofactura  || '—')
  const proveedor = (bien.proveedor      || '—')
  const costo     = bien.costoinicial ? '$ ' + Number(bien.costoinicial).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'
  const fechaFac  = (bien.fechafactura   || '—')

  // El resguardo se abre en una ventana nueva, así que las imágenes necesitan URL
  // absoluta. Hay que incluir BASE_URL porque la app vive en un subdirectorio
  // (/inventario-nogales/); sin eso las rutas dan 404 y los logos salen rotos.
  const base = window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, '')

  return `<div class="hoja">

<div class="top">
  <div class="left-boxes">
    <div class="box"><div class="lbl">ADSCRIPCION:</div><div class="val">${area}</div></div>
    <div class="box2">
      <div class="lbl">NOMBRE/CARGO:</div>
      <div class="val" style="margin-top:4px">${nombre}</div>
      <div class="val">${puesto}</div>
    </div>
  </div>
  <div class="center-col">
    <img src="${base}/escudo-mexico.png" alt="Escudo México" />
    <div class="ch-inst">H. AYUNTAMIENTO CONSTITUCIONAL<br>NOGALES, SONORA</div>
    <div class="ch-dep">SINDICATURA MUNICIPAL</div>
  </div>
  <div class="right-col">
    <img class="escudo" src="${base}/escudo-nogales.png" alt="H. Nogales Sonora" />
    <img class="logo-ay" src="${base}/logo-ayuntamiento.png" alt="H. Ayuntamiento de Nogales" />
  </div>
</div>

<div class="sec-title">RESGUARDO DE MOBILIARIO Y EQUIPO:</div>

<p class="legal" style="font-size:8.5pt;">HE RECIBIDO DEL H. AYUNTAMIENTO DE NOGALES, EL ART&Iacute;CULO MENCIONADO A CONTINUACI&Oacute;N:<br>PARA USARLO EN LOS TRABAJOS PROPIOS DE MI PUESTO, COMPROMETIENDOME A DEVOLVERLO EN EL MOMENTO QUE SE REQUIERA O BIEN A LIQUIDARLO EN CASO DE P&Eacute;RDIDA POR DESCUIDO IMPUTABLE AL&nbsp;SUSCRITO.</p>
<table><tr><td><div class="tdl">DESCRIPCION:</div><div class="tdv" style="min-height:36px">${desc}</div></td></tr></table>

<table>
  <tr>
    <td style="width:33%"><span class="tdl">MARCA:&nbsp;&nbsp;</span>${marca}</td>
    <td style="width:34%"><span class="tdl">MODELO O TIPO:&nbsp;&nbsp;</span>${tipo}</td>
    <td style="width:33%"><span class="tdl">SERIE:&nbsp;&nbsp;</span>${serie}</td>
  </tr>
</table>

<table>
  <tr>
    <td style="width:60%;min-height:58px">
      <div class="tdl">OBSERVACIONES:</div>
      <div class="tdv" style="min-height:40px">${obs}</div>
    </td>
    <td style="width:40%">
      <div class="tdl">CLAVE DE INVENTARIO:</div>
      <div class="tdv">${clave}</div>
    </td>
  </tr>
</table>

<table>
  <tr>
    <td style="width:22%"><div class="tdl">NO. FACTURA:</div><div class="tdv">${factura}</div></td>
    <td style="width:40%"><div class="tdl">PROVEEDOR:</div><div class="tdv">${proveedor}</div></td>
    <td style="width:16%"><div class="tdl">IMPORTE:</div><div class="tdv">${costo}</div></td>
    <td style="width:22%"><div class="tdl">FECHA FACTURA:</div><div class="tdv" style="white-space:nowrap">${fechaFac}</div></td>
  </tr>
</table>

<div class="date">H. Nogales, Sonora a ${hoy.getDate()} de ${mesStr} de ${añoStr}.</div>

<div class="sigs">
  <div class="sb">
    <div class="sl"></div>
    <div class="sn">${nombre}</div>
    <div class="sr">TITULAR DEL RESGUARDO</div>
  </div>
  <div class="sb">
    <div class="sl"></div>
    <div class="sn">MTRA. EDNA ELINORA SOTO GRACIA</div>
    <div class="sr">SINDICO MUNICIPAL</div>
  </div>
</div>

<div class="elab">
  <div class="sr" style="margin-bottom:50px">ELABOR&Oacute;</div>
  <div class="el"></div>
  <div class="sn">C. ELSA M&Oacute;NICA L&Oacute;PEZ LEYVA</div>
  <div class="sr">ASISTENTE ADMINISTRATIVO</div>
</div>

</div>`
}

// Los márgenes viven en .hoja y no en body, para que cada resguardo del lote
// conserve los suyos y empiece en página nueva.
const ESTILOS_RESGUARDO = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:10.5pt;color:#000}
.hoja{padding:14mm 18mm}
.hoja + .hoja{page-break-before:always;break-before:page}
@media screen{.hoja + .hoja{border-top:1px dashed #bbb;margin-top:8mm}}
.top{display:flex;align-items:stretch;gap:10px;margin-bottom:12px}
.left-boxes{flex:1;display:flex;flex-direction:column;gap:5px}
.box{border:1.5px solid #000;padding:5px 9px}
.box2{border:1.5px solid #000;padding:5px 9px;flex:1;min-height:52px}
.lbl{font-weight:700;font-size:8.5pt;letter-spacing:.02em;text-transform:uppercase}
.val{padding-top:3px;font-size:10pt}
.center-col{flex:0 0 200px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:4px}
.center-col img{width:72px;height:72px;object-fit:contain}
.ch-inst{font-size:8pt;font-weight:700;line-height:1.4;margin-top:2px}
.ch-dep{font-size:12pt;font-weight:700;margin-top:2px}
.right-col{flex:0 0 110px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px}
.right-col img.escudo{width:68px;object-fit:contain}
.right-col img.logo-ay{width:105px;object-fit:contain}
.sec-title{font-size:12.5pt;font-weight:700;text-decoration:underline;margin:12px 0 8px}
.legal{font-size:9pt;font-weight:700;text-align:justify;line-height:1.55;margin-bottom:12px;text-transform:uppercase}
table{width:100%;border-collapse:collapse;margin-bottom:7px}
td{border:1.5px solid #000;padding:6px 10px;vertical-align:top}
.tdl{font-weight:700;font-size:9pt;letter-spacing:.02em}
.tdv{padding-top:4px;min-height:20px}
.date{text-align:center;margin:22px 0 56px;font-size:10.5pt}
.sigs{display:flex;justify-content:space-between;align-items:flex-end;gap:16px}
.sb{text-align:center;flex:1}
.sl{border-top:1.5px solid #000;margin:0 auto 5px;width:90%}
.sn{font-size:9.5pt;font-weight:700;text-transform:uppercase}
.sr{font-size:9pt}
.elab{text-align:center;margin-top:55px}
.el{border-top:1.5px solid #000;width:200px;margin:0 auto 5px}
@page{size:Letter;margin:14mm 18mm}
@media print{.hoja{padding:0}}
`

function envolverResguardos(titulo, cuerpos) {
  return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8">
<title>${titulo}</title>
<style>${ESTILOS_RESGUARDO}</style></head><body>
${cuerpos.join('\n')}
</body></html>`
}

function generarHTMLResguardo(bien) {
  return envolverResguardos(`Resguardo ${bien.claveinventario || ''}`, [cuerpoResguardo(bien)])
}

// Varios resguardos en un solo documento, uno por hoja
function generarHTMLResguardosLote(bienes) {
  return envolverResguardos(`Resguardos (${bienes.length})`, bienes.map(cuerpoResguardo))
}

export async function fetchAreas() {
  const { data, error } = await supabase
    .from('areas_activas')
    .select('idarea, nombrearea, total_bienes, iddependencia, nombredependencia')
    .order('nombredependencia', { ascending: true })
  if (error) throw error
  return data
}

// El total que trae el catálogo (`areas_activas.total_bienes`) cuenta los bienes
// vigentes. En las listas de otro estado —traspasos, bajas, solicitudes— ese
// número engaña: el filtro promete cientos y la tabla luego enseña tres. Estas
// dos funciones rehacen el conteo sobre la lista que se está viendo y dejan
// fuera las áreas que no tienen nada ahí.
export function areasConConteo(areas, filas) {
  const porArea = new Map()
  for (const b of filas || []) porArea.set(b.idarea, (porArea.get(b.idarea) || 0) + 1)
  return (areas || [])
    .map(a => ({ ...a, total_bienes: porArea.get(a.idarea) || 0 }))
    .filter(a => a.total_bienes > 0)
}

// Igual, pero cuando la lista no está cargada en pantalla (la tabla viene
// paginada): se pregunta a la base solo por el área de cada bien.
export async function conteoAreasPorEstado(estados) {
  const BATCH = 1000
  const porArea = new Map()
  let desde = 0
  while (true) {
    const { data, error } = await supabase.from('bienes').select('idarea')
      .in('estadobien', estados)
      .range(desde, desde + BATCH - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    for (const b of data) porArea.set(b.idarea, (porArea.get(b.idarea) || 0) + 1)
    if (data.length < BATCH) break
    desde += BATCH
  }
  return porArea
}

// ── REPORTE (Excel / PDF, réplica de la tabla) ─────────────────────────────────
const GRIS_HEADER = 'BFBFBF'
const NEGRO       = '000000'
const FRANJA      = 'F2F2F2'

// idfactura hace falta para poder editar la factura del bien: sin él la
// pantalla de modificar creaba una factura nueva en vez de actualizar la suya.
const SELECT_BIENES = `idbien, idfactura, nombrebien, marca, tipo, serie, observaciones, claveinventario, categoriainventario, estadobien, anio, partida, idarea, areas ( nombrearea ), resguardos ( nombre, puesto ), facturas ( numerofactura, fechafactura, costoinicial, proveedores ( nombreproveedor ) )`

function mapBien(b) {
  return {
    ...b,
    area:           b.areas?.nombrearea                      || '—',
    resguardatario: b.resguardos?.nombre                     || '—',
    puesto:         b.resguardos?.puesto                     || '—',
    numerofactura:  b.facturas?.numerofactura                || 'SIN FACTURA',
    fechafactura:   b.facturas?.fechafactura                 || '—',
    costoinicial:   b.facturas?.costoinicial                 || 0,
    proveedor:      b.facturas?.proveedores?.nombreproveedor || '—',
  }
}

// Trae bienes cuya FECHA DE FACTURA cae en el rango (para reportes por periodo)
export async function fetchPorFechaFactura({ desde, hasta, areaIds }) {
  const SEL = `idbien, idfactura, nombrebien, marca, tipo, serie, observaciones, claveinventario, categoriainventario, estadobien, anio, partida, idarea, areas ( nombrearea ), resguardos ( nombre, puesto ), facturas!inner ( numerofactura, fechafactura, costoinicial, proveedores ( nombreproveedor ) )`
  const BATCH = 1000
  let todos = [], d = 0
  while (true) {
    let q = supabase.from('bienes').select(SEL).order('consecutivo', { ascending: true }).order('idbien', { ascending: true }).range(d, d + BATCH - 1)
    if (desde) q = q.gte('facturas.fechafactura', desde)
    if (hasta) q = q.lte('facturas.fechafactura', hasta)
    if (areaIds && areaIds.length) q = q.in('idarea', areaIds)
    // Adquisiciones incluye todos los estados (TRASPASO, BAJA, etc.) porque reporta lo que se compró
    const { data, error } = await q
    if (error) throw error
    if (!data || data.length === 0) break
    todos = [...todos, ...data.map(mapBien)]
    if (data.length < BATCH) break
    d += BATCH
  }
  return todos
}

// Trae TODOS los bienes con factura, filtro opcional por anio del bien
export async function fetchAdquisiciones({ anio, areaIds }) {
  const SEL = `idbien, idfactura, nombrebien, marca, tipo, serie, observaciones, claveinventario, categoriainventario, estadobien, anio, partida, idarea, areas ( nombrearea ), resguardos ( nombre, puesto ), facturas ( numerofactura, fechafactura, costoinicial, proveedores ( nombreproveedor ) )`
  const BATCH = 1000
  let todos = [], d = 0
  while (true) {
    let q = supabase.from('bienes').select(SEL).order('consecutivo', { ascending: true }).order('idbien', { ascending: true }).range(d, d + BATCH - 1)
    if (anio)    q = q.eq('anio', anio)
    if (areaIds && areaIds.length) q = q.in('idarea', areaIds)
    const { data, error } = await q
    if (error) throw error
    if (!data || data.length === 0) break
    todos = [...todos, ...data.map(mapBien)]
    if (data.length < BATCH) break
    d += BATCH
  }
  return todos
}

// Cuenta bienes cuya fecha de factura cae en el rango
export async function contarPorFechaFactura({ desde, hasta }) {
  let q = supabase.from('bienes').select('idbien, facturas!inner ( fechafactura )', { count: 'exact', head: true })
    .in('estadobien', ['ACTIVO', 'SOLICITUD BAJA'])
  if (desde) q = q.gte('facturas.fechafactura', desde)
  if (hasta) q = q.lte('facturas.fechafactura', hasta)
  const { count, error } = await q
  if (error) throw error
  return count || 0
}

// Columnas del reporte según el tipo (idénticas a la tabla)
export function colsReporte(modo, traspasos) {
  // El reporte de traspasos lleva las columnas de la tabla de traspasos: el
  // oficio y la fecha con que salió el bien en vez de los datos de compra.
  if (traspasos) return [
    { key: 'claveinventario',  label: 'CLAVE DE INVENTARIO', m: 'Clave de inventario', w: 18, noWrap: true },
    { key: 'nombrebien',       label: 'NOMBRE DEL BIEN',     m: 'Nombre del bien',     w: 34, grupo: 'DESCRIPCIÓN', align: 'left' },
    { key: 'marca',            label: 'MARCA',               m: 'Marca',               w: 14, grupo: 'DESCRIPCIÓN' },
    { key: 'tipo',             label: 'TIPO',                m: 'Tipo',                w: 14, grupo: 'DESCRIPCIÓN' },
    { key: 'serie',            label: 'SERIE',               m: 'Serie',               w: 18, grupo: 'DESCRIPCIÓN' },
    { key: 'area',             label: 'ÁREA DE ORIGEN',      m: 'Área de origen',      w: 28, align: 'left' },
    { key: 'resguardo',        label: 'RESGUARDO A CARGO DE', m: 'Resguardo a cargo de', w: 26, align: 'left' },
    { key: 'oficiotraspaso',   label: 'OFICIO',              m: 'Oficio',              w: 16, noWrap: true },
    { key: 'fechatraspaso',    label: 'FECHA DE TRASPASO',   m: 'Fecha de traspaso',   w: 14, noWrap: true },
    { key: 'notatraspaso',     label: 'MOVIMIENTO',          m: 'Movimiento',          w: 40, align: 'left' },
    { key: 'importe',          label: 'IMPORTE',             m: 'Importe',             w: 14 },
    { key: 'numerofactura',    label: 'FACTURA',             m: 'Factura',             w: 14 },
  ]
  const veh = modo === 'vehiculos' || modo === 'maquinaria'
  const desc = veh
    ? [
        { key: 'nombrebien', label: 'NOMBRE DEL BIEN', m: 'Nombre del bien', w: 34 },
        { key: 'marca',      label: 'MARCA',           m: 'Marca',           w: 16 },
        { key: 'anio',       label: 'AÑO',             m: 'Año',             w: 8 },
        { key: 'tipo',       label: 'MODELO / PLACA',  m: 'Modelo / Placa',  w: 18 },
        { key: 'serie',      label: 'SERIE (VIN)',     m: 'Serie (VIN)',     w: 22 },
      ]
    : [
        { key: 'nombrebien', label: 'NOMBRE DEL BIEN', m: 'Nombre del bien', w: 34 },
        { key: 'marca',      label: 'MARCA',           m: 'Marca',           w: 16 },
        { key: 'tipo',       label: 'TIPO',            m: 'Tipo',            w: 16 },
        { key: 'serie',      label: 'SERIE',           m: 'Serie',           w: 20 },
      ]
  return [
    { key: 'claveinventario', label: 'CLAVE DE INVENTARIO', m: 'Clave de inventario', w: 16, noWrap: true },
    ...desc.map(c => ({ ...c, grupo: 'DESCRIPCIÓN' })),
    { key: 'area',          label: 'ÁREA DE ADSCRIPCIÓN',  m: 'Área de adscripción',  w: 30 },
    { key: 'resguardo',     label: 'RESGUARDO A CARGO DE', m: 'Resguardo a cargo de', w: 26 },
    { key: 'observaciones', label: 'OBSERVACIONES',        m: 'Observaciones',        w: 34, align: 'left' },
    { key: 'importe',       label: 'IMPORTE',              m: 'Importe',              w: 16 },
    { key: 'numerofactura', label: 'FACTURA',              m: 'Factura',              w: 16 },
    { key: 'proveedor',     label: 'PROVEEDOR',            m: 'Proveedor',            w: 24 },
    { key: 'fechafactura',  label: 'FECHA FACTURA',        m: 'Fecha factura',        w: 14 },
    { key: 'partida',       label: 'PARTIDA',              m: 'Partida',              w: 14 },
  ]
}

// Columnas del Reporte de Bienes: numeración corrida, partida, datos del bien,
// fecha de la factura como fecha de alta, área, titular y estado.
export const COLS_BIENES = [
  { key: 'no',              label: 'NO.',           m: 'No.',           w: 6,  noWrap: true },
  { key: 'claveinventario', label: 'INVENTARIO',    m: 'Inventario',    w: 24, noWrap: true },
  // Este encabezado va como CONAC solo aquí, en la columna del reporte
  { key: 'partida',         label: 'CONAC',         m: 'Partida',       w: 11, noWrap: true },
  { key: 'nombrebien',      label: 'DESCRIPCIÓN',   m: 'Descripción',   w: 32, align: 'left' },
  { key: 'marca',           label: 'MARCA',         w: 14, m: 'Marca' },
  { key: 'tipo',            label: 'MODELO',        w: 14, m: 'Modelo' },
  { key: 'serie',           label: 'SERIE',         w: 18, m: 'Serie' },
  { key: 'fechafactura',    label: 'FECHA DE ALTA', w: 12, m: 'Fecha de alta', noWrap: true },
  { key: 'area',            label: 'UBICACIÓN',     w: 26, m: 'Ubicación', align: 'left' },
  { key: 'resguardatario',  label: 'RESGUARDANTE',  w: 26, m: 'Resguardante', align: 'left' },
  { key: 'estado',          label: 'ESTADO',        w: 14, m: 'Estado' },
]

export function valorMueble(col, b) {
  switch (col.key) {
    // Solo el estado, sin las notas libres que lleva observaciones
    case 'estado':
      return estadoInfo(b.observaciones, false).label
    case 'resguardo': {
      const n = b.resguardatario && b.resguardatario !== '—' ? b.resguardatario : ''
      const p = b.puesto && b.puesto !== '—' ? b.puesto : ''
      return n ? (p ? `${n} (${p})` : n) : (p || '')
    }
    case 'oficiotraspaso':
      return oficioDeTraspaso(b.observaciones)
    case 'fechatraspaso':
      return fechaDeTraspaso(b.observaciones)
    case 'notatraspaso':
      return notaDeTraspaso(b.observaciones)
    case 'observaciones': {
      const lbl = estadoInfo(b.observaciones, false).label
      const o = b.observaciones && b.observaciones !== '—' ? b.observaciones : ''
      return o ? `${lbl} — ${o}` : lbl
    }
    case 'importe':
    case 'valorfactura':
      return b.costoinicial ? '$ ' + Number(b.costoinicial).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : ''
    case 'numero_oficio':
      return ''   // se llena a mano en el documento
    default: {
      const v = b[col.key]
      return (v == null || v === '—' || v === 'SIN FACTURA') ? (col.key === 'numerofactura' ? 'SIN FACTURA' : '') : String(v)
    }
  }
}

// ── FECHA DE ALTA ─────────────────────────────────────────────────────────────
// La base no guarda cuándo se dio de alta un bien: no hay columna para eso. El
// dato se escribe dentro de observaciones, con la forma que usa Oficialía:
// "ADQUISICION 2025. ALTA POR OFICIO OM/436/2025 10-JUNIO-2025 DE OFICIALIA".
// De ahí se lee. Se busca a partir de la palabra ALTA para no confundirse con
// otras fechas del mismo texto, como la de una revisión física.
const MESES_ALTA = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']

export function fechaDeAlta(observaciones) {
  const s = String(observaciones || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const i = s.search(/\bALTA\b/)
  if (i < 0) return null
  const resto = s.slice(i)
  const m = resto.match(/(\d{1,2})\s*[-/ ]\s*([A-Z]{3,12})\s*[-/ ]\s*(\d{4})/)
  if (m) {
    const mes = MESES_ALTA.findIndex(x => x.startsWith(m[2].slice(0, 3)))
    if (mes >= 0) {
      const dia = Number(m[1])
      if (dia >= 1 && dia <= 31) return `${m[3]}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
    }
  }
  const d = resto.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)
  if (d && Number(d[1]) <= 31 && Number(d[2]) >= 1 && Number(d[2]) <= 12)
    return `${d[3]}-${String(d[2]).padStart(2, '0')}-${String(d[1]).padStart(2, '0')}`
  return null
}

// ── TRASPASOS ─────────────────────────────────────────────────────────────────
// Un traspaso tampoco tiene columnas propias: el destino, el oficio y la fecha
// quedaron escritos dentro de observaciones, con la forma que usa Oficialía:
// "TRASPASO A MEDICOS CALIFICADORES MEDIANTE OFICIO 614/2025 18-MARZO-2025".
// De ahí se leen para poder mostrarlos en su propia columna.
// Se toma el último tramo que hable de traspaso: observaciones acumula la
// historia del bien separada por "|" y el traspaso siempre se anota al final.
export function notaDeTraspaso(observaciones) {
  const partes = String(observaciones || '').split('|').map(s => s.trim())
  return partes.filter(p => /TRASPAS/i.test(p)).pop() || ''
}

export function oficioDeTraspaso(observaciones) {
  const nota = notaDeTraspaso(observaciones).toUpperCase()
  // OFIC\w* cubre "OFICIO", "OFICIOS" y la errata "OFICOIO" que hay capturada
  const m = nota.match(/OFIC\w*\s+(?:N[O°.]*\s*)?([A-Z0-9][A-Z0-9/.\-]*)/)
  return m ? m[1].replace(/[.,]$/, '') : ''
}

export function fechaDeTraspaso(observaciones) {
  const s = notaDeTraspaso(observaciones).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const m = s.match(/(\d{1,2})\s*[-/ ]\s*([A-Z]{3,12})\s*[-/ ]\s*(\d{4})/)
  if (m) {
    const mes = MESES_ALTA.findIndex(x => x.startsWith(m[2].slice(0, 3)))
    const dia = Number(m[1])
    if (mes >= 0 && dia >= 1 && dia <= 31) return `${m[3]}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  }
  const d = s.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)
  if (d && Number(d[1]) <= 31 && Number(d[2]) >= 1 && Number(d[2]) <= 12)
    return `${d[3]}-${String(d[2]).padStart(2, '0')}-${String(d[1]).padStart(2, '0')}`
  return ''
}

// El número de oficio con el que se dio de alta, para que salga en el reporte
export function oficioDeAlta(observaciones) {
  const s = String(observaciones || '').toUpperCase()
  const i = s.search(/\bALTA\b/)
  if (i < 0) return ''
  const m = s.slice(i).match(/OFICIO\s+([A-Z0-9/.\-]+)/)
  return m ? m[1].replace(/[.,]$/, '') : ''
}

// Trae lo necesario para el reporte de altas.
//
// La fecha de alta puede venir de dos lados:
//   1. la columna `fechaalta`, que la base llena sola al registrar un bien;
//   2. el texto de observaciones, que es donde Oficialía la anotó siempre.
// Los bienes viejos solo tienen (2) y los nuevos solo (1), así que se usan las
// dos: manda la columna y el texto queda de respaldo.
//
// La columna puede no existir todavía (hay que crearla en la base). Si no está,
// la consulta se repite sin ella en vez de dejar el reporte tirado.
export async function fetchBienesConAlta({ areaIds } = {}) {
  const BATCH = 1000
  let conColumna = true

  const traer = (desde, usarColumna) => {
    let q = supabase.from('bienes')
      .select(usarColumna ? `${SELECT_BIENES}, fechaalta` : SELECT_BIENES)
      // Basta con que tenga fecha propia O que su texto mencione un alta
      .or(usarColumna ? 'fechaalta.not.is.null,observaciones.ilike.%ALTA%' : 'observaciones.ilike.%ALTA%')
      .order('consecutivo', { ascending: true }).order('idbien', { ascending: true })
      .range(desde, desde + BATCH - 1)
    if (areaIds && areaIds.length) q = q.in('idarea', areaIds)
    return q
  }

  let todos = [], desde = 0
  while (true) {
    let { data, error } = await traer(desde, conColumna)
    // 42703 = la columna no existe: se reintenta leyendo solo del texto
    if (error && conColumna && /fechaalta/i.test(error.message || '')) {
      conColumna = false
      ;({ data, error } = await traer(desde, false))
    }
    if (error) throw error
    if (!data || data.length === 0) break
    todos = [...todos, ...data.map(b => ({ ...mapBien(b), fechaalta: b.fechaalta || null }))]
    if (data.length < BATCH) break
    desde += BATCH
  }

  return todos.map(b => ({
    ...b,
    fechaalta: b.fechaalta || fechaDeAlta(b.observaciones),
    oficioalta: oficioDeAlta(b.observaciones),
  }))
}

// Columnas del reporte de altas: como las del reporte de bienes, pero la fecha
// que manda es la del alta, no la de la factura, y se agrega el oficio.
export const COLS_ALTAS = [
  { key: 'no',              label: 'NO.',                 m: 'No.',                 w: 6,  noWrap: true },
  { key: 'claveinventario', label: 'INVENTARIO',          m: 'Inventario',          w: 22, noWrap: true },
  { key: 'partida',         label: 'CONAC',               m: 'Partida',             w: 10, noWrap: true },
  { key: 'nombrebien',      label: 'DESCRIPCIÓN',         m: 'Descripción',         w: 30, align: 'left' },
  { key: 'marca',           label: 'MARCA',               m: 'Marca',               w: 13 },
  { key: 'tipo',            label: 'MODELO',              m: 'Modelo',              w: 13 },
  { key: 'serie',           label: 'SERIE',               m: 'Serie',               w: 16 },
  { key: 'fechaalta',       label: 'FECHA DE ALTA',       m: 'Fecha de alta',       w: 12, noWrap: true },
  { key: 'oficioalta',      label: 'OFICIO DE ALTA',      m: 'Oficio de alta',      w: 15, noWrap: true },
  { key: 'numerofactura',   label: 'FACTURA',             m: 'Factura',             w: 14 },
  { key: 'importe',         label: 'IMPORTE',             m: 'Importe',             w: 14 },
  { key: 'area',            label: 'UBICACIÓN',           m: 'Ubicación',           w: 24, align: 'left' },
  { key: 'resguardatario',  label: 'RESGUARDANTE',        m: 'Resguardante',        w: 24, align: 'left' },
]

export async function fetchTodosMuebles({ modo, busqueda, filtroBien, filtroEstado, filtroAreaIds, traspasos }) {
  const BATCH = 1000
  let todos = [], desde = 0
  while (true) {
    let q = supabase.from('bienes').select(SELECT_BIENES).order('consecutivo', { ascending: true }).order('idbien', { ascending: true }).range(desde, desde + BATCH - 1)
    // Los traspasados llevan su propia categoría, por eso ahí no se filtra por tipo
    q = traspasos
      ? q.eq('estadobien', 'TRASPASO')
      : q.in('estadobien', ['ACTIVO', 'SOLICITUD BAJA']).in('categoriainventario', CATS_BY_MODO[modo] ?? CATS_BY_MODO.mobiliario)
    if (filtroAreaIds && filtroAreaIds.length) q = q.in('idarea', filtroAreaIds)
    if (busqueda)   q = q.or(`nombrebien.ilike.%${busqueda}%,claveinventario.ilike.%${busqueda}%`)
    if (filtroBien) q = q.or(`nombrebien.ilike.%${filtroBien}%,tipo.ilike.%${filtroBien}%,marca.ilike.%${filtroBien}%`)
    if (filtroEstado === 'Deteriorado')   q = q.or('observaciones.ilike.%deteriorado%,observaciones.ilike.%quebrado%')
    else if (filtroEstado === 'No verificado') q = q.ilike('observaciones', '%no verificado%')
    else if (filtroEstado === 'Buen estado')   q = q.not('observaciones', 'ilike', '%deteriorado%').not('observaciones', 'ilike', '%quebrado%').not('observaciones', 'ilike', '%no verificado%')
    const { data, error } = await q
    if (error) throw error
    if (!data || data.length === 0) break
    todos = [...todos, ...data.map(mapBien)]
    if (data.length < BATCH) break
    desde += BATCH
  }
  return todos
}

async function fetchPorIdsMuebles(ids) {
  const BATCH = 300
  let todos = []
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH)
    const { data, error } = await supabase.from('bienes').select(SELECT_BIENES).in('idbien', chunk).order('consecutivo', { ascending: true })
    if (error) throw error
    todos = [...todos, ...(data || []).map(mapBien)]
  }
  return todos
}

function nombreArchivoM(ext) {
  return `inventario-muebles-${new Date().toISOString().slice(0, 10)}.${ext}`
}

// Cambia el estadobien de varios bienes ('ACTIVO' | 'SOLICITUD BAJA' | 'BAJA')
export async function actualizarEstadoBienes(ids, nuevoEstado) {
  const BATCH = 300
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH)
    const { error } = await supabase.from('bienes').update({ estadobien: nuevoEstado }).in('idbien', chunk)
    if (error) throw error
  }
}

// Fechas de bajas guardadas localmente (no hay tabla `bajas` aún)
const LS_FECHAS_BAJAS = 'bajas_fechas'
export function getFechasBajas() {
  try { return JSON.parse(localStorage.getItem(LS_FECHAS_BAJAS) || '{}') } catch { return {} }
}
export function setFechaBaja(ids, campo, valor) {
  const m = getFechasBajas()
  for (const id of ids) m[id] = { ...m[id], [campo]: valor }
  localStorage.setItem(LS_FECHAS_BAJAS, JSON.stringify(m))
}
export function hoyISO() { return new Date().toISOString().slice(0, 10) }

// ── Modal: confirmar SOLICITUD de baja (1 o varios bienes) ──────────────────────
export function ModalSolicitarBaja({ bienes, onClose, dark, t, onConfirm }) {
  const [guardando, setGuardando] = useState(false)
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  async function confirmar() {
    setGuardando(true)
    try { await onConfirm(); onClose() } catch (e) { console.error(e); setGuardando(false) }
  }
  const sep = dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)'
  return createPortal(
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,0.4)', backdropFilter:'blur(4px)' }} />
      <div onClick={e => e.stopPropagation()} style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:301, width:'520px', maxWidth:'94vw', maxHeight:'88vh', display:'flex', flexDirection:'column', background: dark ? '#1e1e20' : '#fff', borderRadius:'16px', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', boxShadow:'0 20px 60px rgba(0,0,0,0.4)', animation:'fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)', overflow:'hidden' }}>
        <div style={{ padding:'1.25rem 1.5rem', borderBottom: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <div style={{ width:'34px', height:'34px', borderRadius:'9px', background: dark ? 'rgba(244,161,161,0.15)' : 'rgba(192,57,43,0.08)', border: dark ? '1px solid rgba(244,161,161,0.3)' : '1px solid rgba(192,57,43,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <i className="ti ti-circle-minus" style={{ fontSize:'18px', color: dark ? '#f4a1a1' : '#c0392b' }} />
            </div>
            <div>
              <p style={{ fontSize:'15px', fontWeight:600, color: dark ? '#fff' : '#111' }}>Solicitar Baja</p>
              <p style={{ fontSize:'12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>{bienes.length} bien{bienes.length !== 1 ? 'es' : ''} por solicitar</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width:'30px', height:'30px', borderRadius:'7px', background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color: dark ? '#ccc' : '#555' }}>
            <i className="ti ti-x" style={{ fontSize:'15px' }} />
          </button>
        </div>
        <div style={{ minHeight:0, maxHeight:'62vh', overflowY:'auto', padding:'0.5rem 0' }}>
          {bienes.map((b, i) => (
            <div key={b.idbien} style={{ padding:'11px 1.5rem', borderBottom: i < bienes.length - 1 ? sep : 'none' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'2px' }}>
                <span style={{ fontFamily:'monospace', fontSize:'11px', color: dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)' }}>{b.claveinventario || '—'}</span>
              </div>
              <p style={{ fontSize:'13px', fontWeight:500, color: dark ? '#f0f0f0' : '#111', lineHeight:1.3 }}>{b.nombrebien || '—'}</p>
              <p style={{ fontSize:'12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', marginTop:'2px' }}>{b.area || '—'}</p>
            </div>
          ))}
        </div>
        <div style={{ padding:'1rem 1.5rem', borderTop: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display:'flex', gap:'8px', flexShrink:0 }}>
          <button onClick={onClose} disabled={guardando} style={{ flex:1, padding:'10px', background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)', border: dark ? '1px solid rgba(255,255,255,0.13)' : '1px solid rgba(0,0,0,0.09)', borderRadius:'9px', fontSize:'14px', fontWeight:500, color: dark ? '#ccc' : '#444', fontFamily:'inherit', cursor:'pointer' }}>Cancelar</button>
          <button onClick={confirmar} disabled={guardando} style={{ flex:1, padding:'10px', background: dark ? 'rgba(244,161,161,0.18)' : 'rgba(192,57,43,0.08)', border: dark ? '1px solid rgba(244,161,161,0.35)' : '1px solid rgba(192,57,43,0.35)', borderRadius:'9px', fontSize:'14px', fontWeight:600, color: dark ? '#f4a1a1' : '#c0392b', fontFamily:'inherit', cursor: guardando ? 'wait' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'6px' }}>
            {guardando ? <><i className="ti ti-loader-2" style={{ fontSize:'15px', animation:'spin 1s linear infinite' }} />Procesando…</> : <><i className="ti ti-circle-minus" style={{ fontSize:'15px' }} />Confirmar solicitud</>}
          </button>
        </div>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translate(-50%,-48%) scale(0.98)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}} @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}} @keyframes entraDer{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}} @keyframes entraIzq{from{opacity:0;transform:translateX(-40px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </>,
    document.body
  )
}

// Confirmación de papelera y de restauración. Muestra los datos del bien, con
// la misma forma que el modal de Solicitar Baja.
export function ModalConfirmaBien({ bien, accion, onClose, onConfirm, dark, t, areas = [] }) {
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState(null)
  // Al restaurar se elige el área: de ahí sale el consecutivo de la clave nueva
  const [idarea, setIdarea] = useState(bien.idarea ?? '')
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const esRestaurar = accion === 'restaurar'
  const col = esRestaurar
    ? { txt: dark ? '#a8e6cf' : '#15803d', bg: dark ? 'rgba(168,230,207,0.15)' : 'rgba(30,126,74,0.08)', bd: dark ? 'rgba(168,230,207,0.3)' : 'rgba(30,126,74,0.2)' }
    : { txt: dark ? '#f4a1a1' : '#c0392b', bg: dark ? 'rgba(244,161,161,0.15)' : 'rgba(192,57,43,0.08)', bd: dark ? 'rgba(244,161,161,0.3)' : 'rgba(192,57,43,0.2)' }

  async function confirmar() {
    if (esRestaurar && !idarea) { setErr('Elige el área a la que regresa el bien'); return }
    setGuardando(true); setErr(null)
    try { await onConfirm(esRestaurar ? Number(idarea) : undefined); onClose() }
    catch (e) { setErr(e.message); setGuardando(false) }
  }

  const sep = dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)'
  const dato = (etq, val) => (
    <div style={{ padding: '10px 1.5rem', borderBottom: sep }}>
      <p style={{ fontSize: '10px', color: dark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '3px' }}>{etq}</p>
      <p style={{ fontSize: '13px', color: dark ? '#f0f0f0' : '#111', lineHeight: 1.35 }}>{val || '—'}</p>
    </div>
  )

  return createPortal(
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:400, background:'rgba(0,0,0,0.4)', backdropFilter:'blur(4px)' }} />
      <div onClick={e => e.stopPropagation()} style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:401, width:'520px', maxWidth:'94vw', maxHeight:'88vh', display:'flex', flexDirection:'column', background: dark ? '#1e1e20' : '#fff', borderRadius:'16px', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', boxShadow:'0 20px 60px rgba(0,0,0,0.4)', animation:'fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)', overflow:'hidden' }}>

        <div style={{ padding:'1.25rem 1.5rem', borderBottom: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <div style={{ width:'34px', height:'34px', borderRadius:'9px', background: col.bg, border:`1px solid ${col.bd}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <i className={`ti ${esRestaurar ? 'ti-arrow-back-up' : 'ti-trash'}`} style={{ fontSize:'18px', color: col.txt }} />
            </div>
            <div>
              <p style={{ fontSize:'15px', fontWeight:600, color: dark ? '#fff' : '#111' }}>{esRestaurar ? 'Restaurar al inventario' : 'Mandar a la papelera'}</p>
              <p style={{ fontSize:'12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>{bien.claveinventario || 'Sin clave'}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width:'30px', height:'30px', borderRadius:'7px', background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color: dark ? '#ccc' : '#555' }}>
            <i className="ti ti-x" style={{ fontSize:'15px' }} />
          </button>
        </div>

        <div style={{ minHeight:0, overflowY:'auto' }}>
          <p style={{ padding:'12px 1.5rem', fontSize:'12.5px', lineHeight:1.6, color: dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)', borderBottom: sep }}>
            {esRestaurar
              ? 'El bien vuelve al inventario como activo. Se le asigna una clave nueva con el último consecutivo del área que elijas, porque mientras estuvo en la papelera su número quedó libre.'
              : 'Al eliminar este registro se envía a la papelera, esto no es una baja.'}
          </p>
          {esRestaurar && (
            <div style={{ padding: '12px 1.5rem', borderBottom: sep }}>
              <p style={{ fontSize: '10px', fontWeight: 700, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>Área a la que regresa</p>
              <select value={idarea} onChange={e => setIdarea(e.target.value)} style={{ ...sStyle(dark), width: '100%' }}>
                <option value="">— Elige el área —</option>
                {areas.map(a => <option key={a.idarea} value={a.idarea}>{a.nombredependencia ? `${a.nombredependencia} · ${a.nombrearea}` : a.nombrearea}</option>)}
              </select>
            </div>
          )}
          {dato('Nombre del bien', bien.nombrebien)}
          {dato('Marca', bien.marca)}
          {dato('Tipo / Modelo', bien.tipo)}
          {dato('Serie', bien.serie)}
          {dato('Área de adscripción', bien.area)}
          {dato('Resguardo a cargo de', bien.resguardatario)}
          {dato('Factura', bien.numerofactura)}
          {dato('Importe', bien.costoinicial ? fmtMoneda(bien.costoinicial) : '')}
        </div>

        {err && <p style={{ padding:'10px 1.5rem', fontSize:'12.5px', color: dark ? '#f8a8a8' : '#b91c1c' }}>{err}</p>}

        <div style={{ padding:'1rem 1.5rem', borderTop: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display:'flex', gap:'8px', flexShrink:0 }}>
          <button onClick={onClose} disabled={guardando} style={{ flex:1, padding:'10px', background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)', border: dark ? '1px solid rgba(255,255,255,0.13)' : '1px solid rgba(0,0,0,0.09)', borderRadius:'9px', fontSize:'14px', fontWeight:500, color: dark ? '#ccc' : '#444', fontFamily:'inherit', cursor:'pointer' }}>Cancelar</button>
          <button onClick={confirmar} disabled={guardando} style={{ flex:1, padding:'10px', background: col.bg, border:`1px solid ${col.bd}`, borderRadius:'9px', fontSize:'14px', fontWeight:600, color: col.txt, fontFamily:'inherit', cursor: guardando ? 'wait' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'6px' }}>
            {guardando
              ? <><i className="ti ti-loader-2" style={{ fontSize:'15px', animation:'spin 1s linear infinite' }} />Procesando…</>
              : (esRestaurar ? 'Restaurar al Inventario' : 'Mover a Papelera')}
          </button>
        </div>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translate(-50%,-48%) scale(0.98)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}} @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </>,
    document.body
  )
}

// Trae todos los bienes con cierto estadobien (paginado)
export async function fetchBienesPorEstado(estado) {
  const BATCH = 1000
  let todos = [], desde = 0
  while (true) {
    const { data, error } = await supabase.from('bienes').select(SELECT_BIENES)
      .eq('estadobien', estado)
      .order('consecutivo', { ascending: true }).order('idbien', { ascending: true })
      .range(desde, desde + BATCH - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    todos = [...todos, ...data.map(mapBien)]
    if (data.length < BATCH) break
    desde += BATCH
  }
  return todos
}

const RGB_GRIS = [191, 191, 191]

// Carga una imagen a máxima resolución (dataURL PNG) para los encabezados
function cargarImagen(src) {
  if (src.startsWith('/')) src = import.meta.env.BASE_URL + src.slice(1)
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

// Encabezado con los 3 logos: Ayuntamiento (izq), Escudo Nogales (centro), Escudo México (der)
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

export async function exportarPDFMuebles(rows, cols, titulo = '') {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 18
  let startY = await dibujarLogosPDF(doc, pageW, margin)
  if (titulo) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(0)
    doc.text(titulo, pageW / 2, startY + 6, { align: 'center' })
    const tw = doc.getTextWidth(titulo)
    doc.setLineWidth(1); doc.line(pageW / 2 - tw / 2, startY + 10, pageW / 2 + tw / 2, startY + 10)
    startY += 22
  }

  // Encabezado de dos filas con grupo DESCRIPCIÓN
  const hStyle = { fillColor: RGB_GRIS, textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' }
  const row1 = [], row2 = []
  let i = 0
  while (i < cols.length) {
    const col = cols[i]
    if (col.grupo) {
      let j = i; while (j < cols.length && cols[j].grupo === col.grupo) j++
      row1.push({ content: col.grupo, colSpan: j - i, styles: hStyle })
      for (let k = i; k < j; k++) row2.push({ content: cols[k].label, styles: hStyle })
      i = j
    } else {
      row1.push({ content: col.label, rowSpan: 2, styles: hStyle })
      i++
    }
  }

  const body = rows.map(b => cols.map(c => ({ content: valorMueble(c, b), styles: { halign: c.align || 'center' } })))

  // Fila TOTAL (suma del importe/valor + conteo de registros)
  const impIdx = cols.findIndex(c => c.key === 'importe' || c.key === 'valorfactura')
  let foot
  if (impIdx >= 0 && rows.length > 0) {
    const suma = rows.reduce((s, b) => s + (Number(b.costoinicial) || 0), 0)
    const sumaTxt = '$ ' + suma.toLocaleString('es-MX', { minimumFractionDigits: 2 })
    const fStyle = { fillColor: [242, 242, 242], textColor: [0, 0, 0], fontStyle: 'bold' }
    const footRow = cols.map((c, idx) => {
      let content = ''
      if (idx === 0) content = 'TOTAL'
      else if (c.key === 'nombrebien') content = `${rows.length} bienes`
      else if (idx === impIdx) content = sumaTxt
      return { content, styles: { ...fStyle, halign: idx === impIdx ? 'right' : 'left' } }
    })
    foot = [footRow]
  }

  autoTable(doc, {
    startY,
    head: [row1, row2],
    body,
    foot,
    showFoot: 'lastPage',
    columnStyles: impIdx >= 0 ? { [impIdx]: { halign: 'right', overflow: 'visible', minCellWidth: 46 } } : {},
    styles: { font: 'helvetica', fontSize: 6, cellPadding: 2.5, overflow: 'linebreak', valign: 'middle', halign: 'center', lineColor: [0, 0, 0], lineWidth: 0.4, textColor: [0, 0, 0], fillColor: [255, 255, 255] },
    headStyles: { fillColor: RGB_GRIS, textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 6.5 },
    bodyStyles: { fillColor: [255, 255, 255] },
    footStyles: { fillColor: [242, 242, 242], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 6, cellPadding: 2.5 },
    alternateRowStyles: { fillColor: [242, 242, 242] },
    margin: { left: 18, right: 18 },
  })
  doc.save(nombreArchivoM('pdf'))
}

export async function exportarExcelMuebles(rows, cols, titulo = '') {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('INVENTARIO BIENES MUEBLES')
  const nCols = cols.length
  const FUENTE = 'Arial'
  const borde  = { style: 'thin', color: { argb: 'FF' + NEGRO } }
  const bordes = { top: borde, left: borde, bottom: borde, right: borde }

  function headerCell(cell, val) {
    cell.value = val
    cell.font = { name: FUENTE, family: 2, size: 11, bold: true, color: { argb: 'FF' + NEGRO } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + GRIS_HEADER } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = bordes
  }
  function dataCell(cell, val, align, wrap, fill) {
    cell.value = val
    cell.font = { name: FUENTE, family: 2, size: 11, color: { argb: 'FF' + NEGRO } }
    cell.alignment = { horizontal: align, vertical: 'middle', wrapText: wrap }
    cell.border = bordes
    if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + fill } }
  }

  cols.forEach((c, idx) => { ws.getColumn(idx + 1).width = c.w })

  let fila = 1

  // Banda de logos: Ayuntamiento (izq), Escudo Nogales (centro), Escudo México (der)
  let logos = null
  try {
    const [ay, nog, mex] = await Promise.all([
      cargarImagen('/logo-ayuntamiento.png'),
      cargarImagen('/escudo-nogales.png'),
      cargarImagen('/escudo-mexico.png'),
    ])
    logos = { ay, nog, mex }
  } catch { logos = null }

  if (logos) {
    const colPx = cols.map(c => Math.round(c.w * 7 + 5))
    const totalPx = colPx.reduce((a, b) => a + b, 0)
    const pxToCol = (x) => { let acc = 0; for (let k = 0; k < colPx.length; k++) { if (x < acc + colPx[k]) return k + (x - acc) / colPx[k]; acc += colPx[k] } return cols.length }
    const H = 80
    const Hmex = 112   // escudo de México más grande
    const add = (im, x, h = H) => {
      const w = h * im.w / im.h
      const id = wb.addImage({ base64: im.dataURL, extension: 'png' })
      ws.addImage(id, { tl: { col: pxToCol(x), row: 0.15 }, ext: { width: w, height: h }, editAs: 'oneCell' })
      return w
    }
    add(logos.ay, 6)
    const wNog = H * logos.nog.w / logos.nog.h
    add(logos.nog, (totalPx - wNog) / 2)
    const wMex = Hmex * logos.mex.w / logos.mex.h
    add(logos.mex, totalPx - wMex - 6, Hmex)
    ws.getRow(1).height = 62
    ws.getRow(2).height = 62
    fila = 4   // banda en filas 1-2, fila 3 de respiro
  }

  if (titulo) {
    ws.mergeCells(fila, 1, fila, nCols)
    const c = ws.getCell(fila, 1)
    c.value = titulo
    c.font = { name: FUENTE, family: 2, size: 16, bold: true, underline: true }
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    fila += 2   // título + fila en blanco
  }

  // Encabezado dos filas
  const hr1 = fila, hr2 = fila + 1
  let col = 1, i = 0
  while (i < cols.length) {
    const c = cols[i]
    if (c.grupo) {
      let j = i; while (j < cols.length && cols[j].grupo === c.grupo) j++
      ws.mergeCells(hr1, col, hr1, col + (j - i) - 1)
      headerCell(ws.getCell(hr1, col), c.grupo)
      for (let k = i; k < j; k++) headerCell(ws.getCell(hr2, col + (k - i)), cols[k].label)
      col += (j - i); i = j
    } else {
      ws.mergeCells(hr1, col, hr2, col)
      headerCell(ws.getCell(hr1, col), c.label)
      col++; i++
    }
  }
  // Bordes en toda la región de encabezado
  for (let r = hr1; r <= hr2; r++) for (let cc = 1; cc <= nCols; cc++) ws.getCell(r, cc).border = bordes
  fila = hr2 + 1

  const MONEY_KEYS = ['importe', 'valorfactura']
  const impIdx = cols.findIndex(c => MONEY_KEYS.includes(c.key))   // índice 0-based de la columna de dinero
  const FMT_MONEDA = '"$ "#,##0.00'
  const filaInicioDatos = fila

  rows.forEach((b, idx) => {
    const row = ws.getRow(fila)
    const fill = idx % 2 === 1 ? FRANJA : null
    cols.forEach((c, ci) => {
      const cell = row.getCell(ci + 1)
      if (MONEY_KEYS.includes(c.key)) {
        // Valor como número (para que la fórmula de suma funcione)
        cell.value = Number(b.costoinicial) || 0
        cell.numFmt = FMT_MONEDA
        cell.font = { name: FUENTE, family: 2, size: 11, color: { argb: 'FF' + NEGRO } }
        cell.alignment = { horizontal: 'right', vertical: 'middle' }
        cell.border = bordes
        if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + fill } }
      } else {
        dataCell(cell, valorMueble(c, b), c.align || 'center', !c.noWrap, fill)
      }
    })
    fila++
  })
  const filaFinDatos = fila - 1

  // Ancho automático de la columna de dinero según el contenido
  if (impIdx >= 0) {
    let maxImp = 'VALOR FACTURA'.length
    for (const b of rows) {
      const txt = '$ ' + (Number(b.costoinicial) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })
      if (txt.length > maxImp) maxImp = txt.length
    }
    ws.getColumn(impIdx + 1).width = maxImp + 3
  }

  // Combina celdas repetidas consecutivas en ÁREA DE ADSCRIPCIÓN y NÚMERO DE OFICIO
  const areaIdx = cols.findIndex(c => c.key === 'area')
  const oficioIdx = cols.findIndex(c => c.key === 'numero_oficio')
  if (areaIdx >= 0 && filaFinDatos >= filaInicioDatos) {
    let r = filaInicioDatos
    while (r <= filaFinDatos) {
      const val = ws.getCell(r, areaIdx + 1).value
      let r2 = r
      while (r2 + 1 <= filaFinDatos && ws.getCell(r2 + 1, areaIdx + 1).value === val) r2++
      if (r2 > r) {
        ws.mergeCells(r, areaIdx + 1, r2, areaIdx + 1)
        ws.getCell(r, areaIdx + 1).alignment = { horizontal: cols[areaIdx].align || 'center', vertical: 'middle', wrapText: true }
        if (oficioIdx >= 0) {
          ws.mergeCells(r, oficioIdx + 1, r2, oficioIdx + 1)
          ws.getCell(r, oficioIdx + 1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        }
      }
      r = r2 + 1
    }
  }

  // Fila de TOTAL (suma del importe con fórmula + conteo de bienes)
  if (impIdx >= 0 && rows.length > 0) {
    const letra = ws.getColumn(impIdx + 1).letter
    const nombreIdx = cols.findIndex(c => c.key === 'nombrebien')
    const setTotal = (ci, val, align) => {
      const cell = ws.getCell(fila, ci + 1)
      cell.value = val
      cell.font = { name: FUENTE, family: 2, size: 11, bold: true, color: { argb: 'FF' + NEGRO } }
      cell.alignment = { horizontal: align, vertical: 'middle' }
    }
    setTotal(0, 'TOTAL', 'left')
    if (nombreIdx >= 0) setTotal(nombreIdx, `${rows.length} bienes`, 'left')
    const sumCell = ws.getCell(fila, impIdx + 1)
    // Se guarda tambien el resultado: una formula sin valor en cache se ve
    // vacia hasta que Excel recalcula, y el total parecia no salir.
    const sumaTotal = rows.reduce((s, b) => s + (Number(b.costoinicial) || 0), 0)
    sumCell.value = { formula: `SUM(${letra}${filaInicioDatos}:${letra}${filaFinDatos})`, result: sumaTotal }
    sumCell.numFmt = FMT_MONEDA
    sumCell.font = { name: FUENTE, family: 2, size: 11, bold: true, color: { argb: 'FF' + NEGRO } }
    sumCell.alignment = { horizontal: 'right', vertical: 'middle' }
    // Bordes y relleno striped en toda la fila total
    for (let cc = 1; cc <= nCols; cc++) {
      const cell = ws.getCell(fila, cc)
      cell.border = bordes
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + FRANJA } }
    }
    fila++
  }

  const buf = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nombreArchivoM('xlsx'))
}

// ── ADQUISICIONES: agrupación y exportación ────────────────────────────────────
const NOMBRES_PARTIDA = {
  '51101': 'MUEBLES DE OFICINA Y ESTANTERIA',
  '51201': 'MUEBLES EXCEPTO DE OFICINA Y ESTANTERIA',
  '51501': 'EQUIPO DE COMPUTO Y DE TECNOLOGIAS DE LA INFORMACION',
  '51502': 'BIENES INFORMATICOS',
  '51901': 'OTRO MOBILIARIO Y EQUIPOS DE ADMINISTRACION',
  '51903': 'ADQUISICION DE SEÑALES DE TRANSITO',
  '52101': 'EQUIPOS Y APARATOS AUDIOVISUALES',
  '52201': 'APARATOS DEPORTIVOS',
  '52301': 'CAMARAS FOTOGRAFICAS Y DE VIDEO',
  '52901': 'OTRO MOBILIARIO Y EQUIPO EDUCACIONAL Y RECREATIVO',
  '53101': 'EQUIPO MEDICO Y DE LABORATORIO',
  '54101': 'AUTOMOVILES Y CAMIONES',
  '54102': 'VEHICULOS Y EQUIPOS TERRESTRES DESTINADOS A SERVICIO',
  '54103': 'VEHICULOS DE LIMPIEZA Y RECOLECCION DE BASURA',
  '54201': 'CARROCERIA Y REMOLQUES',
  '54901': 'OTROS EQUIPOS DE TRANSPORTE',
  '55101': 'MAQUINARIA Y EQUIPO DE DEFENSA Y SEGURIDAD PUBLICA',
  '55103': 'SISTEMAS INTEGRALES DE SEGURIDAD PUBLICA',
  '56201': 'MAQUINARIA Y EQUIPO INDUSTRIAL',
  '56301': 'MAQUINARIA Y EQUIPO DE CONSTRUCCION',
  '56401': 'SISTEMAS DE AIRE ACONDICIONADO CALEFACCION',
  '56501': 'EQUIPO DE COMUNICACION Y TELECOMUNICACION',
  '56601': 'EQUIPOS DE GENERACION ELECTRICA Y APARATOS',
  '56701': 'HERRAMIENTAS',
  '56702': 'REFACCIONES Y ACCESORIOS MAYORES',
  '56903': 'OTROS BIENES MUEBLES',
  '51301': 'BIENES ARTISTICOS CULTURALES Y CIENTIFICOS',
  '57801': 'ARBOLES Y PLANTAS',
  '59101': 'SOFTWARE',
  '59701': 'LICENCIAS INFORMATICAS E INTELECTUALES',
}

const COLS_ADQ = [
  { key: 'area',            label: 'DEPENDENCIA',                 w: 42, align: 'left' },
  { key: 'numerofactura',   label: 'FACTURA',                     w: 20 },
  { key: 'proveedor',       label: 'PROVEEDOR',                   w: 36, align: 'left' },
  { key: 'fechafactura',    label: 'FECHA FACTURA',               w: 16 },
  { key: 'importe',         label: 'IMPORTE',                     w: 22 },
  { key: 'cantidad',        label: 'CANTIDAD DE BIENES',          w: 16 },
  { key: 'partida',         label: 'PARTIDA',                     w: 16 },
]

function agruparAdquisiciones(rows) {
  const mapa = new Map()
  for (const b of rows) {
    // Agrupar por factura+fecha+partida: una misma factura que compró bienes de
    // distintas partidas produce una fila por cada partida, en vez de mezclarlas.
    const key = (b.numerofactura || 'SIN FACTURA') + '||' + (b.fechafactura || '') + '||' + (b.partida || '')
    if (!mapa.has(key)) {
      mapa.set(key, {
        areas: new Set(),
        numerofactura: b.numerofactura || 'SIN FACTURA',
        proveedor: b.proveedor || '—',
        fechafactura: b.fechafactura || '—',
        costoinicial: 0,
        partida: b.partida || '',
        count: 0,
        _idfacturas: new Set(),
      })
    }
    const g = mapa.get(key)
    g.count++
    if (b.area) g.areas.add(b.area)
    // Sumar costoinicial solo una vez por idfactura único
    if (b.idfactura != null && !g._idfacturas.has(b.idfactura)) {
      g._idfacturas.add(b.idfactura)
      g.costoinicial += Number(b.costoinicial) || 0
    } else if (b.idfactura == null) {
      g.costoinicial += Number(b.costoinicial) || 0
    }
  }
  return [...mapa.values()].map(g => ({
    area: [...g.areas].join(', ') || '—',
    numerofactura: g.numerofactura,
    proveedor: g.proveedor,
    fechafactura: g.fechafactura,
    costoinicial: g.costoinicial,
    partida: g.partida,
    count: g.count,
  }))
}

function valorAdq(col, g) {
  switch (col.key) {
    case 'importe':  return g.costoinicial ? '$ ' + Number(g.costoinicial).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : ''
    case 'cantidad': return String(g.count)
    case 'partida': {
      const p = g.partida
      if (!p) return ''
      const nombre = NOMBRES_PARTIDA[p]
      return nombre ? `${p} - ${nombre}` : p
    }
    default:         return g[col.key] != null ? String(g[col.key]) : ''
  }
}

async function exportarAdquisicionesPDF(grupos, titulo, anio) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 18
  let startY = await dibujarLogosPDF(doc, pageW, margin)

  // Títulos a la izquierda (idénticos al Excel)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(0)
  doc.text('ALTAS ADMINISTRACION 2024-2027', margin, startY + 4)
  doc.text(`AÑO ${anio}`, margin, startY + 18)
  startY += 30

  const impIdx = COLS_ADQ.findIndex(c => c.key === 'importe')

  // Anchos de columna proporcionales a los del Excel (misma distribución visual)
  const totalW = pageW - margin * 2
  const sumW   = COLS_ADQ.reduce((a, c) => a + c.w, 0)
  const columnStyles = {}
  COLS_ADQ.forEach((c, i) => {
    columnStyles[i] = { cellWidth: totalW * c.w / sumW, halign: c.key === 'importe' ? 'right' : (c.align || 'center') }
  })

  const hStyle = { fillColor: [191, 191, 191], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' }
  const head   = [COLS_ADQ.map(c => ({ content: c.label, styles: hStyle }))]
  const body   = grupos.map(g => COLS_ADQ.map(c => ({ content: valorAdq(c, g), styles: { halign: c.key === 'importe' ? 'right' : (c.align || 'center') } })))
  const suma   = grupos.reduce((s, g) => s + (Number(g.costoinicial) || 0), 0)
  const foot   = [COLS_ADQ.map((c, i) => ({
    content: i === 0 ? 'TOTAL' : i === impIdx ? '$ ' + suma.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '',
    styles: { fillColor: [242, 242, 242], textColor: [0, 0, 0], fontStyle: 'bold', halign: i === impIdx ? 'right' : 'left' },
  }))]

  autoTable(doc, {
    startY, head, body, foot, showFoot: 'lastPage',
    columnStyles,
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 3, overflow: 'linebreak', valign: 'middle', lineColor: [0, 0, 0], lineWidth: 0.5, textColor: [0, 0, 0], fillColor: [255, 255, 255] },
    headStyles: { fillColor: [191, 191, 191], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, halign: 'center', valign: 'middle' },
    alternateRowStyles: { fillColor: [242, 242, 242] },
    margin: { left: margin, right: margin },
  })
  doc.save(`adquisiciones-${anio}.pdf`)
}

async function exportarAdquisicionesExcel(grupos, titulo, anio) {
  const FUENTE = 'Arial'
  const borde  = { style: 'thin', color: { argb: 'FF' + NEGRO } }
  const bordes = { top: borde, left: borde, bottom: borde, right: borde }
  const wb = new ExcelJS.Workbook()

  // ── Geometría espejo del PDF (jsPDF landscape A4) ──
  // El PDF reparte (pageW - 2*margin) según los pesos c.w. Convertimos ese ancho en pt a
  // ancho de columna de Excel: px = pt*4/3 ; ancho_chars = (px - 5) / 7.
  // Se calcula por hoja: las hojas de partida llevan una columna menos y los
  // logos se colocan según el ancho total de esa hoja en particular.
  const PT_A_PX = 4 / 3
  const totalPt = 841.89 - 18 * 2                       // ancho útil del PDF (margin=18)
  function geometria(cols) {
    const sumW = cols.reduce((a, c) => a + c.w, 0)
    const colChar = cols.map(c => (totalPt * c.w / sumW * PT_A_PX - 5) / 7)
    const colPx = colChar.map(w => Math.round(w * 7 + 5))
    const totPx = colPx.reduce((a, b) => a + b, 0)
    const pxToCol = x => { let acc = 0; for (let k = 0; k < colPx.length; k++) { if (x < acc + colPx[k]) return k + (x - acc) / colPx[k]; acc += colPx[k] } return cols.length }
    return { cols, nCols: cols.length, colChar, totPx, pxToCol }
  }

  // Logos cargados una sola vez
  let logos = null
  try {
    const [ay, nog, mex] = await Promise.all([
      cargarImagen('/logo-ayuntamiento.png'),
      cargarImagen('/escudo-nogales.png'),
      cargarImagen('/escudo-mexico.png'),
    ])
    logos = { ay, nog, mex }
  } catch { logos = null }

  function agregarLogos(ws, geo) {
    if (!logos) return 1
    // Mismos tamaños que el PDF (dibujarLogosPDF): H=46, Hmex=66.
    const H = 46, Hmex = 66
    ws.getRow(1).height = 34; ws.getRow(2).height = 34
    const BAND_PX = Math.round((34 + 34) * PT_A_PX)
    const add = (im, centroX, h) => {
      const w = h * im.w / im.h
      const id = wb.addImage({ base64: im.dataURL, extension: 'png' })
      ws.addImage(id, {
        tl: { col: geo.pxToCol(centroX - w / 2), row: (BAND_PX - h) / 2 / BAND_PX * 2 },
        ext: { width: w, height: h },
        editAs: 'oneCell',
      })
    }
    const wAy = H * logos.ay.w / logos.ay.h; add(logos.ay, 6 + wAy / 2, H)
    add(logos.nog, geo.totPx / 2, H)
    const wMex = Hmex * logos.mex.w / logos.mex.h; add(logos.mex, geo.totPx - 6 - wMex / 2, Hmex)
    return 4
  }

  // opciones: { cols } columnas propias de la hoja, { titulo } línea extra bajo el año
  function llenarHoja(ws, filas, opciones = {}) {
    const cols  = opciones.cols || COLS_ADQ
    const geo   = geometria(cols)
    const nCols = geo.nCols
    geo.colChar.forEach((w, idx) => { ws.getColumn(idx + 1).width = w })
    let fila = agregarLogos(ws, geo)

    // Encabezados fijos
    const setTxt = (f, val, bold = false, size = 11) => {
      ws.mergeCells(f, 1, f, nCols)
      const c = ws.getCell(f, 1)
      c.value = val
      c.font = { name: FUENTE, size, bold }
      c.alignment = { horizontal: 'left', vertical: 'middle' }
    }
    setTxt(fila,     'ALTAS ADMINISTRACION 2024-2027', true); fila++
    setTxt(fila,     `AÑO ${anio}`,                    true); fila++
    // En las hojas de partida el capítulo va como título, y por eso se quita la
    // columna PARTIDA: repetiría el mismo dato en todos los renglones.
    if (opciones.titulo) { setTxt(fila, opciones.titulo, true, 12); fila++ }
    fila++ // fila en blanco

    // Cabecera de columnas
    cols.forEach((c, ci) => {
      const cell = ws.getCell(fila, ci + 1)
      cell.value = c.label
      cell.font = { name: FUENTE, size: 8, bold: true }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + GRIS_HEADER } }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = bordes
    })
    ws.getRow(fila).height = 26
    fila++

    const FMT_MONEDA = '"$ "#,##0.00'
    const impIdx = cols.findIndex(c => c.key === 'importe')
    const filaInicio = fila

    filas.forEach((g, idx) => {
      const fill = idx % 2 === 1 ? FRANJA : null
      cols.forEach((c, ci) => {
        const cell = ws.getCell(fila, ci + 1)
        cell.font = { name: FUENTE, size: 8 }
        cell.border = bordes
        cell.alignment = { horizontal: c.key === 'importe' ? 'right' : (c.align || 'center'), vertical: 'middle', wrapText: true, indent: (c.align === 'left') ? 1 : 0 }
        if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + fill } }
        if (c.key === 'importe') {
          cell.value = Number(g.costoinicial) || 0
          cell.numFmt = FMT_MONEDA
        } else if (c.key === 'cantidad') {
          cell.value = g.count
        } else {
          cell.value = valorAdq(c, g)
        }
      })
      // No se fija la altura: con wrapText activo, Excel autoajusta la altura de la fila
      // al texto envuelto (DEPENDENCIA/PROVEEDOR largos) y así los renglones no se enciman.
      fila++
    })
    const filaFin = fila - 1

    // Fila TOTAL
    if (filas.length > 0) {
      const letra = ws.getColumn(impIdx + 1).letter
      cols.forEach((c, ci) => {
        const cell = ws.getCell(fila, ci + 1)
        cell.font = { name: FUENTE, size: 8, bold: true }
        cell.border = bordes
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + FRANJA } }
        cell.alignment = { horizontal: ci === impIdx ? 'right' : 'left', vertical: 'middle' }
        if (ci === 0) cell.value = 'TOTAL'
      })
      const sumCell = ws.getCell(fila, impIdx + 1)
      const sumaTotal = filas.reduce((s, g) => s + (Number(g.costoinicial) || 0), 0)
      sumCell.value = { formula: `SUM(${letra}${filaInicio}:${letra}${filaFin})`, result: sumaTotal }
      sumCell.numFmt = FMT_MONEDA
      sumCell.font = { name: FUENTE, size: 8, bold: true }
      sumCell.alignment = { horizontal: 'right', vertical: 'middle' }
    }
  }

  // ── Hoja resumen (primera hoja) ──────────────────────────────────────────
  const COLS_RES = [
    { label: 'PARTIDA',     w: 10 },
    { label: 'CAPÍTULO',    w: 52 },
    { label: 'SINDICATURA', w: 22 },
    { label: 'TESORERÍA',   w: 22 },
  ]
  const resPxArr = COLS_RES.map(c => Math.round(c.w * 7 + 5))
  const resTotPx = resPxArr.reduce((a, b) => a + b, 0)
  const wsResumen = wb.addWorksheet(`RESUMEN ${anio}`)
  COLS_RES.forEach((c, i) => { wsResumen.getColumn(i + 1).width = c.w })
  const FMT_MONEDA = '"$ "#,##0.00'

  let filaRes = 1
  if (logos) {
    const H = 80, Hmex = 112, ROW_H = 62, EMU_PX = 9525
    wsResumen.getRow(1).height = ROW_H; wsResumen.getRow(2).height = ROW_H
    const rowPx = ROW_H * 96 / 72, bandPx = rowPx * 2
    const colNR = px => { let acc = 0; for (let k = 0; k < resPxArr.length; k++) { if (px <= acc + resPxArr[k]) return { nativeCol: k, nativeColOff: Math.round((px - acc) * EMU_PX) }; acc += resPxArr[k] } return { nativeCol: resPxArr.length - 1, nativeColOff: 0 } }
    const rowNR = px => { const idx = Math.floor(px / rowPx); return { nativeRow: idx, nativeRowOff: Math.round((px - idx * rowPx) * EMU_PX) } }
    const plR = (im, lx, h) => { const w = h * im.w / im.h; const top = (bandPx - h) / 2; const { nativeCol, nativeColOff } = colNR(lx); const { nativeRow, nativeRowOff } = rowNR(top); const id = wb.addImage({ base64: im.dataURL, extension: 'png' }); wsResumen.addImage(id, { tl: { nativeCol, nativeColOff, nativeRow, nativeRowOff }, ext: { width: w, height: h }, editAs: 'oneCell' }) }
    const wNog = H * logos.nog.w / logos.nog.h, wMex = Hmex * logos.mex.w / logos.mex.h
    plR(logos.ay,  6, H)
    plR(logos.nog, resTotPx / 2 - wNog / 2, H)
    plR(logos.mex, resTotPx - 6 - wMex, Hmex)
    wsResumen.getRow(3).height = 8
    filaRes = 4
  }

  // Año
  wsResumen.mergeCells(filaRes, 1, filaRes, COLS_RES.length)
  Object.assign(wsResumen.getCell(filaRes, 1), { value: String(anio), font: { name: FUENTE, size: 12, bold: true }, alignment: { horizontal: 'left', vertical: 'middle' } })
  wsResumen.getRow(filaRes).height = 20; filaRes++

  // Encabezado
  COLS_RES.forEach((c, ci) => {
    const cell = wsResumen.getCell(filaRes, ci + 1)
    cell.value = c.label
    cell.font = { name: FUENTE, size: 10, bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + GRIS_HEADER } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = bordes
  })
  wsResumen.getRow(filaRes).height = 20; filaRes++

  // Fila capítulo 5000
  const setC = (ci, val, fmt, align, bold) => {
    const cell = wsResumen.getCell(filaRes, ci)
    cell.value = val; cell.border = bordes
    cell.font = { name: FUENTE, size: 10, bold: !!bold }
    cell.alignment = { horizontal: align || 'center', vertical: 'middle' }
    if (fmt) cell.numFmt = fmt
  }
  setC(1, '5000', null, 'center', true)
  ;[2, 3, 4].forEach(ci => { wsResumen.getCell(filaRes, ci).border = bordes })
  filaRes++

  // Suma por partida
  const partidasMap = new Map()
  for (const g of grupos) {
    const p = g.partida || '—'
    partidasMap.set(p, (partidasMap.get(p) || 0) + (Number(g.costoinicial) || 0))
  }
  const partidasSorted = [...partidasMap.entries()].sort(([a], [b]) => String(a).localeCompare(String(b)))
  const filaResInicio = filaRes - 1  // incluye fila 5000 para el SUM
  for (const [partida, total] of partidasSorted) {
    const nombreP = NOMBRES_PARTIDA[partida] || ''
    const capitulo = nombreP ? `${partida} - ${nombreP}` : partida
    setC(1, null); setC(2, capitulo, null, 'left'); setC(3, total, FMT_MONEDA, 'right'); setC(4, null, null, 'right')
    wsResumen.getCell(filaRes, 1).border = bordes
    filaRes++
  }

  // Fila TOTAL
  const filaResFin = filaRes - 1
  ;[1, 2, 3, 4].forEach(ci => {
    const cell = wsResumen.getCell(filaRes, ci)
    cell.font = { name: FUENTE, size: 10, bold: true }
    cell.border = bordes
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + FRANJA } }
    cell.alignment = { horizontal: ci >= 3 ? 'right' : 'left', vertical: 'middle' }
  })
  wsResumen.getCell(filaRes, 1).value = 'TOTAL'
  const letraSind = wsResumen.getColumn(3).letter
  const totCell = wsResumen.getCell(filaRes, 3)
  const sumaPartidas = partidasSorted.reduce((s, [, t]) => s + (Number(t) || 0), 0)
  totCell.value = { formula: `SUM(${letraSind}${filaResInicio}:${letraSind}${filaResFin})`, result: sumaPartidas }
  totCell.numFmt = FMT_MONEDA
  totCell.font = { name: FUENTE, size: 10, bold: true }
  totCell.alignment = { horizontal: 'right', vertical: 'middle' }

  // ── Hoja principal — todos los grupos ────────────────────────────────────
  // Ordenadas por fecha de factura, de enero a diciembre. Las fechas vienen como
  // 'AAAA-MM-DD', así que comparar el texto ya las ordena bien; las que no traen
  // fecha se van al final para no cortar la secuencia.
  const porFecha = [...grupos].sort((a, b) => {
    const fa = /^\d{4}-\d{2}-\d{2}$/.test(a.fechafactura || '') ? a.fechafactura : '9999'
    const fb = /^\d{4}-\d{2}-\d{2}$/.test(b.fechafactura || '') ? b.fechafactura : '9999'
    return fa < fb ? -1 : fa > fb ? 1 : 0
  })
  const wsMain = wb.addWorksheet(`ADQUISICIONES ${anio}`)
  llenarHoja(wsMain, porFecha)

  // Hojas por capítulo (partida): sin la columna PARTIDA, que va como título
  const COLS_PARTIDA = COLS_ADQ.filter(c => c.key !== 'partida')
  const partidas = [...new Set(porFecha.map(g => g.partida).filter(Boolean))].sort()
  for (const partida of partidas) {
    const wsP = wb.addWorksheet(`${partida}-${anio}`)
    const nombreP = NOMBRES_PARTIDA[partida]
    llenarHoja(wsP, porFecha.filter(g => g.partida === partida), {
      cols: COLS_PARTIDA,
      titulo: nombreP ? `${partida} - ${nombreP}` : String(partida),
    })
  }

  const buf = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `adquisiciones-${anio}.xlsx`)
}

// ── Modal Adquisiciones ──────────────────────────────────────────────────────────
export function ModalAdquisicionesMuebles({ onClose, dark, t, filtros }) {
  const hoy = new Date()
  const [desde, setDesde]   = useState(`${hoy.getFullYear()}-01-01`)
  const [hasta, setHasta]   = useState(`${hoy.getFullYear()}-12-31`)
  const [titulo, setTitulo] = useState(`ADQUISICIONES ${hoy.getFullYear()}`)
  const [generando, setGenerando] = useState(null)
  const [err, setErr] = useState(null)

  const anio = desde ? desde.slice(0, 4) : String(new Date().getFullYear())

  async function generar(formato) {
    setGenerando(formato); setErr(null)
    try {
      const rows = await fetchPorFechaFactura({ desde: desde || null, hasta: hasta || null, areaIds: filtros.filtroAreaIds })
      if (!rows.length) { setErr('No hay registros en ese periodo'); setGenerando(null); return }
      const grupos = agruparAdquisiciones(rows)
      if (formato === 'excel') await exportarAdquisicionesExcel(grupos, titulo.trim(), anio)
      else                     await exportarAdquisicionesPDF(grupos, titulo.trim(), anio)
      onClose()
    } catch (e) { setErr(e.message) } finally { setGenerando(null) }
  }

  return createPortal(
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,0.4)', backdropFilter:'blur(4px)' }} />
      <div onClick={e => e.stopPropagation()} style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:301, width:'480px', maxWidth:'94vw', background: dark ? '#1e1e20' : '#fff', borderRadius:'16px', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', boxShadow:'0 20px 60px rgba(0,0,0,0.4)', animation:'fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ padding:'1.25rem 1.5rem', borderBottom: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <div style={{ width:'34px', height:'34px', borderRadius:'9px', background: dark ? 'rgba(168,200,255,0.15)' : 'rgba(30,80,200,0.08)', border: dark ? '1px solid rgba(168,200,255,0.3)' : '1px solid rgba(30,80,200,0.2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <i className="ti ti-file-invoice" style={{ fontSize:'18px', color: dark ? '#a8c8ff' : '#1e4dcc' }} />
            </div>
            <div>
              <p style={{ fontSize:'15px', fontWeight:600, color: dark ? '#fff' : '#111' }}>Reporte de Adquisiciones</p>
              <p style={{ fontSize:'12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>Agrupado por factura</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width:'30px', height:'30px', borderRadius:'7px', background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color: dark ? '#ccc' : '#555' }}>
            <i className="ti ti-x" style={{ fontSize:'15px' }} />
          </button>
        </div>

        {/* Cuerpo */}
        <div style={{ padding:'1.25rem 1.5rem', display:'flex', flexDirection:'column', gap:'1rem' }}>
          <div>
            <p style={{ fontSize:'10px', fontWeight:700, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'6px' }}>Título del reporte</p>
            <input value={titulo} onChange={e => setTitulo(e.target.value)} style={iStyle(dark)} />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
            <div>
              <p style={{ fontSize:'10px', fontWeight:700, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'6px' }}>Fecha desde</p>
              <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={iStyle(dark)} />
            </div>
            <div>
              <p style={{ fontSize:'10px', fontWeight:700, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'6px' }}>Fecha hasta</p>
              <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={iStyle(dark)} />
            </div>
          </div>
          <p style={{ fontSize:'11px', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)' }}>
            Incluye todos los bienes cuya fecha de factura esté en el rango seleccionado, agrupados por número de factura.
          </p>
        </div>

        {/* Footer */}
        <div style={{ padding:'1rem 1.5rem', borderTop: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)' }}>
          {err && <p style={{ fontSize:'12px', color: dark ? '#f4a1a1' : '#c0392b', marginBottom:'10px' }}><i className="ti ti-alert-circle" style={{ marginRight:'5px' }} />{err}</p>}
          <div style={{ display:'flex', gap:'8px' }}>
            <button onClick={() => generar('excel')} disabled={!!generando}
              style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'7px', padding:'11px', borderRadius:'9px', fontSize:'14px', fontWeight:600, fontFamily:'inherit', cursor: generando ? 'not-allowed' : 'pointer', background: dark ? 'rgba(168,230,207,0.18)' : 'rgba(30,126,74,0.08)', border: dark ? '1px solid rgba(168,230,207,0.35)' : '1px solid rgba(30,126,74,0.35)', color: dark ? '#a8e6cf' : '#15803d' }}>
              {generando === 'excel' ? <><i className="ti ti-loader-2" style={{ fontSize:'15px', animation:'spin 1s linear infinite' }} />Generando…</> : <><i className="ti ti-file-spreadsheet" style={{ fontSize:'16px' }} />Excel</>}
            </button>
            <button onClick={() => generar('pdf')} disabled={!!generando}
              style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'7px', padding:'11px', borderRadius:'9px', fontSize:'14px', fontWeight:600, fontFamily:'inherit', cursor: generando ? 'not-allowed' : 'pointer', background: dark ? 'rgba(244,161,161,0.15)' : 'rgba(192,57,43,0.07)', border: dark ? '1px solid rgba(244,161,161,0.35)' : '1px solid rgba(192,57,43,0.3)', color: dark ? '#f4a1a1' : '#c0392b' }}>
              {generando === 'pdf' ? <><i className="ti ti-loader-2" style={{ fontSize:'15px', animation:'spin 1s linear infinite' }} />Generando…</> : <><i className="ti ti-file-type-pdf" style={{ fontSize:'16px' }} />PDF</>}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translate(-50%,-48%) scale(0.98)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}} @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}} @keyframes entraDer{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}} @keyframes entraIzq{from{opacity:0;transform:translateX(-40px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </>,
    document.body
  )
}

// ── Modal Reporte ───────────────────────────────────────────────────────────────
function ModalReporteMuebles({ onClose, dark, t, modo, seleccionados, filtros, totalFiltrados, traspasos }) {
  const COLS = colsReporte(modo, traspasos)
  const haySel = seleccionados.length > 0
  const [colsSel, setColsSel] = useState(() => new Set(COLS.map(c => c.key)))
  const [titulo, setTitulo]   = useState('')
  const [alcance, setAlcance] = useState(haySel ? 'seleccion' : 'todos')
  const [generando, setGenerando] = useState(null)
  const [err, setErr] = useState(null)

  function toggleCol(key) {
    setColsSel(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  const todasCols = colsSel.size === COLS.length
  function toggleTodas() { setColsSel(todasCols ? new Set() : new Set(COLS.map(c => c.key))) }

  async function generar(formato) {
    if (colsSel.size === 0) { setErr('Selecciona al menos una columna'); return }
    setGenerando(formato); setErr(null)
    try {
      const rows = alcance === 'seleccion' ? await fetchPorIdsMuebles(seleccionados) : await fetchTodosMuebles(filtros)
      if (!rows.length) { setErr('No hay registros para el reporte'); setGenerando(null); return }
      const cols = COLS.filter(c => colsSel.has(c.key))
      const tit = titulo.trim()
      if (formato === 'excel') await exportarExcelMuebles(rows, cols, tit)
      else                     await exportarPDFMuebles(rows, cols, tit)
      onClose()
    } catch (e) { setErr(e.message) } finally { setGenerando(null) }
  }

  const sepBorder = dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)'
  const conteoAlcance = alcance === 'seleccion' ? seleccionados.length : totalFiltrados

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

        {/* Cuerpo desplazable */}
        <div style={{ minHeight:0, maxHeight:'62vh', overflowY:'auto', padding:'1.25rem 1.5rem', display:'flex', flexDirection:'column', gap:'1.25rem' }}>
          {/* Registros */}
          <div>
            <p style={{ fontSize:'10px', fontWeight:700, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'8px' }}>Registros a incluir</p>
            <div style={{ display:'flex', gap:'5px', background: t.cardBg, border:`1px solid ${t.cardBorder}`, borderRadius:'12px', padding:'5px', backdropFilter:'blur(10px)' }}>
              <button onClick={() => haySel && setAlcance('seleccion')} disabled={!haySel}
                style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'8px', padding:'8px 12px', borderRadius:'9px', fontSize:'13px', fontWeight:500, fontFamily:'inherit', cursor: haySel ? 'pointer' : 'not-allowed', opacity: haySel ? 1 : 0.4, transition:'all 0.15s', background: alcance === 'seleccion' ? (dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)') : 'transparent', border: alcance === 'seleccion' ? `1px solid ${t.cardBorder}` : '1px solid transparent', color: alcance === 'seleccion' ? t.text1 : t.text3 }}>
                <i className="ti ti-square-check" style={{ fontSize:'16px' }} />{seleccionados.length} seleccionado{seleccionados.length !== 1 ? 's' : ''}
              </button>
              <button onClick={() => setAlcance('todos')}
                style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'8px', padding:'8px 12px', borderRadius:'9px', fontSize:'13px', fontWeight:500, fontFamily:'inherit', cursor:'pointer', transition:'all 0.15s', background: alcance === 'todos' ? (dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)') : 'transparent', border: alcance === 'todos' ? `1px solid ${t.cardBorder}` : '1px solid transparent', color: alcance === 'todos' ? t.text1 : t.text3 }}>
                <i className="ti ti-list" style={{ fontSize:'16px' }} />Todos ({totalFiltrados.toLocaleString()})
              </button>
            </div>
            <p style={{ fontSize:'11px', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)', marginTop:'7px' }}>
              {alcance === 'seleccion' ? 'Solo los registros que marcaste con checkbox.' : 'Todos los registros que cumplen los filtros actuales.'}
            </p>
          </div>

          {/* Columnas */}
          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
              <p style={{ fontSize:'10px', fontWeight:700, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Columnas ({colsSel.size}/{COLS.length})</p>
              <button onClick={toggleTodas} style={{ background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:'12px', color: dark ? '#f0f0f0' : '#000', fontWeight:500 }}>{todasCols ? 'Quitar todas' : 'Todas'}</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px' }}>
              {COLS.map(c => {
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

        {/* Footer fijo con botones */}
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
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translate(-50%,-48%) scale(0.98)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}} @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}} @keyframes entraDer{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}} @keyframes entraIzq{from{opacity:0;transform:translateX(-40px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </>,
    document.body
  )
}

// ── Modal Categoría ───────────────────────────────────────────────────────────
function ModalTipoFilter({ modo, onSelect, onClose, dark, t }) {
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = '' } }, [])

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} />
      <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 301, width: '440px', maxWidth: '92vw', maxHeight: '82vh', display: 'flex', flexDirection: 'column', background: dark ? '#1e1e20' : '#fff', borderRadius: '16px', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', animation: 'fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '1.1rem 1.4rem', borderBottom: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: t.iconBox, border: `1px solid ${t.iconBoxBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="ti ti-category" style={{ fontSize: '18px', color: t.text2 }} />
            </div>
            <div>
              <p style={{ fontSize: '15px', fontWeight: 600, color: dark ? '#fff' : '#111' }}>Categoría</p>
              <p style={{ fontSize: '12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>Elige la categoría de bienes que quieres ver</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width: '30px', height: '30px', borderRadius: '7px', background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: dark ? '#ccc' : '#555' }}>
            <i className="ti ti-x" style={{ fontSize: '15px' }} />
          </button>
        </div>

        {/* Lista de categorías */}
        <div style={{ minHeight: 0, maxHeight: '62vh', overflowY: 'auto', padding: '1rem 1.4rem' }}>
          {MODOS.map(m => {
            const sel = m.id === modo
            return (
              <button key={m.id} onClick={() => onSelect(m.id)}
                style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 13px', borderRadius: '9px', marginBottom: '4px', cursor: 'pointer', fontFamily: 'inherit', background: sel ? (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)') : 'transparent', border: `1px solid ${sel ? t.cardBorder : 'transparent'}`, color: t.text1, transition: 'background 0.12s' }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent' }}>
                <i className={`ti ${m.icon}`} style={{ fontSize: '18px', color: sel ? t.text1 : t.text3 }} />
                <span style={{ fontSize: '14px', fontWeight: sel ? 600 : 400 }}>{m.label}</span>
                {sel && <i className="ti ti-check" style={{ fontSize: '15px', color: t.text2, marginLeft: 'auto' }} />}
              </button>
            )
          })}
        </div>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translate(-50%,-48%) scale(0.98)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}`}</style>
    </>,
    document.body
  )
}

// ── Modal Nuevo Bien ──────────────────────────────────────────────────────────
// ── Página 2 del modal: números de serie ──────────────────────────────────────
// Ocupa el modal completo; muestra la clave de inventario y el nombre de cada
// bien para capturar su serie sin tener que buscar a cuál corresponde.
function PaginaSeries({ onVolver, claves, nombre, marca, tipo, area, partida, series, setSeries, dark, t, onRegistrar, guardando, n }) {
  const filas = claves && claves.length ? claves : []
  const set = (i, v) => setSeries(prev => { const a = [...prev]; a[i] = v; return a })
  const capturadas = series.filter(s => (s || '').trim()).length
  const sep = dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)'

  return (
    <>
      <div style={{ padding:'1.25rem 1.5rem', borderBottom: sep, display:'flex', alignItems:'center', gap:'11px', flexShrink:0 }}>
        <button onClick={onVolver} title="Volver"
          style={{ width:'34px', height:'34px', borderRadius:'9px', flexShrink:0, background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', border:`1px solid ${t.cardBorder}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color: t.text2 }}>
          <i className="ti ti-arrow-left" style={{ fontSize:'17px' }} />
        </button>
        <div style={{ minWidth:0 }}>
          <p style={{ fontSize:'15px', fontWeight:600, color: dark ? '#fff' : '#111' }}>Números de serie</p>
          <p style={{ fontSize:'12px', color: t.text4 }}>{capturadas} de {filas.length} capturada{filas.length === 1 ? '' : 's'}</p>
        </div>
      </div>

      {/* Se captura sobre la propia tabla, como si se llenara a mano */}
      <div style={{ minHeight:0, maxHeight:'62vh', overflowY:'auto' }}>
        {filas.length === 0
          ? <p style={{ fontSize:'13px', color: t.text4, textAlign:'center', padding:'3rem 0' }}>Elige el área para generar las claves.</p>
          : <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
              <thead>
                <tr>
                  <th style={{ ...thBase(dark), width:'46px' }}>NO.</th>
                  <th style={{ ...thBase(dark), width:'170px' }}>CLAVE DE INVENTARIO</th>
                  <th style={{ ...thBase(dark) }}>NOMBRE DEL BIEN</th>
                  <th style={{ ...thBase(dark), width:'120px' }}>MARCA</th>
                  <th style={{ ...thBase(dark), width:'130px' }}>TIPO / MODELO</th>
                  <th style={{ ...thBase(dark), width:'150px' }}>ÁREA</th>
                  <th style={{ ...thBase(dark), width:'85px' }}>PARTIDA</th>
                  <th style={{ ...thBase(dark), width:'210px' }}>NO. DE SERIE</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((c, i) => (
                  <tr key={c.clave} style={{ borderBottom: sep }}>
                    <td style={{ ...tdBase(), verticalAlign:'middle', color: t.text4 }}>{i + 1}</td>
                    <td style={{ ...tdBase(), verticalAlign:'middle' }}>
                      <span style={{ fontFamily:'monospace', fontSize:'12px', color: t.text1 }}>{c.clave}</span>
                    </td>
                    <td style={{ ...tdBase(), verticalAlign:'middle' }}>
                      <span style={{ fontSize:'12px', color: t.text1, fontWeight:500 }}>{nombre || '—'}</span>
                    </td>
                    <td style={{ ...tdBase(), verticalAlign:'middle' }}><span style={{ fontSize:'12px', color: t.text2 }}>{marca || '—'}</span></td>
                    <td style={{ ...tdBase(), verticalAlign:'middle' }}><span style={{ fontSize:'12px', color: t.text2 }}>{tipo || '—'}</span></td>
                    <td style={{ ...tdBase(), verticalAlign:'middle' }}><span style={{ fontSize:'11px', color: t.text3 }}>{area || '—'}</span></td>
                    <td style={{ ...tdBase(), verticalAlign:'middle' }}><span style={{ fontFamily:'monospace', fontSize:'11px', color: t.text3 }}>{partida || '—'}</span></td>
                    <td style={{ ...tdBase(), verticalAlign:'middle', padding:'6px 10px' }}>
                      <input value={series[i] || ''} onChange={e => set(i, e.target.value)}
                        placeholder="Capturar serie" autoComplete="off" spellCheck={false}
                        style={{ ...iStyle(dark), fontSize:'13px', padding:'7px 10px' }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>}
      </div>

      <div style={{ flexShrink:0, padding:'1rem 1.5rem', borderTop: sep, display:'flex', gap:'8px' }}>
        <button onClick={onVolver}
          style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'7px', padding:'11px 18px', borderRadius:'9px', fontSize:'14px', fontWeight:600, fontFamily:'inherit', cursor:'pointer', background:'transparent', border:`1px solid ${t.cardBorder}`, color: t.text2 }}>
          <i className="ti ti-arrow-left" style={{ fontSize:'15px' }} />Volver
        </button>
        <button onClick={onRegistrar} disabled={guardando}
          style={{ marginLeft:'auto', display:'flex', alignItems:'center', justifyContent:'center', gap:'7px', padding:'11px 22px', borderRadius:'9px', fontSize:'14px', fontWeight:600, fontFamily:'inherit', cursor: guardando ? 'wait' : 'pointer', background: dark ? 'rgba(168,230,207,0.18)' : 'rgba(30,126,74,0.08)', border: dark ? '1px solid rgba(168,230,207,0.35)' : '1px solid rgba(30,126,74,0.35)', color: dark ? '#a8e6cf' : '#15803d' }}>
          {guardando
            ? <><i className="ti ti-loader-2" style={{ fontSize:'15px', animation:'spin 1s linear infinite' }} />Guardando…</>
            : <><i className="ti ti-device-floppy" style={{ fontSize:'16px' }} />{n === 1 ? 'Registrar' : `Registrar ${n}`}</>}
        </button>
      </div>
    </>
  )
}

// Para comparar nombres sin que estorben acentos ni mayúsculas
const normSug = s => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

// Caja de texto que va proponiendo lo que ya existe en el catálogo mientras se
// escribe. Sigue siendo texto libre: si el proveedor es nuevo se teclea y ya;
// las propuestas solo evitan volver a dar de alta uno que ya está.
function CampoSugerido({ value, onChange, opciones, dark, placeholder }) {
  const [abierto, setAbierto] = useState(false)
  const [indice, setIndice]   = useState(-1)

  const sugerencias = useMemo(() => {
    const q = normSug(value)
    if (!q) return []
    // Primero los que empiezan igual, luego los que lo traen en medio. Se
    // descartan los repetidos: el catálogo tiene el mismo nombre varias veces.
    const vistos = new Set(), empiezan = [], contienen = []
    for (const o of opciones) {
      const n = normSug(o)
      if (!n.includes(q) || vistos.has(n)) continue
      vistos.add(n)
      ;(n.startsWith(q) ? empiezan : contienen).push(o)
    }
    const lista = [...empiezan, ...contienen].slice(0, 8)
    // Si ya está escrito completo no hay nada que proponer
    return (lista.length === 1 && normSug(lista[0]) === q) ? [] : lista
  }, [value, opciones])

  const ver = abierto && sugerencias.length > 0

  function elegir(v) { onChange(v); setAbierto(false); setIndice(-1) }

  function teclas(e) {
    if (!ver) return
    if (e.key === 'ArrowDown')      { e.preventDefault(); setIndice(i => (i + 1) % sugerencias.length) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setIndice(i => (i <= 0 ? sugerencias.length : i) - 1) }
    // La lista cambia al teclear: se comprueba que el señalado siga existiendo
    else if (e.key === 'Enter' && indice >= 0 && indice < sugerencias.length) { e.preventDefault(); elegir(sugerencias[indice]) }
    else if (e.key === 'Escape')    { setAbierto(false) }
  }

  // Resalta el pedazo que coincide con lo tecleado
  function partir(nombre) {
    const i = normSug(nombre).indexOf(normSug(value))
    if (i < 0) return [nombre, '', '']
    return [nombre.slice(0, i), nombre.slice(i, i + value.trim().length), nombre.slice(i + value.trim().length)]
  }

  return (
    <div style={{ position:'relative' }}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setAbierto(true); setIndice(-1) }}
        onFocus={() => setAbierto(true)}
        // El clic en una propuesta se atiende en onMouseDown, antes de este blur
        onBlur={() => setAbierto(false)}
        onKeyDown={teclas}
        placeholder={placeholder}
        autoComplete="off" autoCorrect="off" spellCheck={false}
        style={iStyle(dark)} />
      {ver && (
        <div style={{ position:'absolute', top:'calc(100% + 3px)', left:0, right:0, zIndex:40,
          maxHeight:'196px', overflowY:'auto', borderRadius:'9px',
          background: dark ? '#2a2a2c' : '#ffffff',
          border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.15)',
          boxShadow:'0 10px 28px rgba(0,0,0,0.28)' }}>
          {sugerencias.map((s, i) => {
            const [antes, medio, despues] = partir(s)
            return (
              <div key={s + i}
                onMouseDown={e => { e.preventDefault(); elegir(s) }}
                onMouseEnter={() => setIndice(i)}
                style={{ padding:'7px 11px', fontSize:'13px', cursor:'pointer', lineHeight:1.4,
                  color: dark ? '#e8e8e8' : '#111',
                  background: i === indice ? (dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.05)') : 'transparent' }}>
                {antes}<b style={{ color: dark ? '#a8e6cf' : '#15803d' }}>{medio}</b>{despues}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Titular de un área ────────────────────────────────────────────────────────
// Cambia el resguardante de un área completa, pero SOLO los bienes que hoy
// tiene la persona que sale. Los demás resguardantes del área no se tocan, y
// las bajas y traspasos tampoco: reescribirlos falsearía el histórico.
//
// Una misma persona puede resguardar en varias áreas a la vez. Como el titular
// vive en cada bien y cada bien sabe su área, moverla de una no la mueve de las
// otras. Por eso el filtro lleva SIEMPRE el área además de la persona.

// Los titulares de un área, agrupados por persona. Una persona puede tener
// varios renglones en el catálogo (uno por puesto), y aquí se juntan todos.
async function titularesDeArea(idarea) {
  const { data, error } = await supabase
    .from('bienes')
    .select('idbien, idresguardo, resguardos ( nombre, puesto )')
    .eq('idarea', idarea)
    .in('estadobien', ['ACTIVO', 'SOLICITUD BAJA'])
    .limit(5000)
  if (error) throw error

  const porPersona = new Map()
  let sinTitular = 0
  for (const b of (data || [])) {
    const nombre = (b.resguardos?.nombre || '').trim()
    if (!nombre) { sinTitular++; continue }
    const clave = nombre.toUpperCase()
    if (!porPersona.has(clave)) porPersona.set(clave, { nombre, puestos: new Set(), filas: new Set(), bienes: 0 })
    const p = porPersona.get(clave)
    p.bienes++
    p.filas.add(b.idresguardo)
    if (b.resguardos?.puesto) p.puestos.add(b.resguardos.puesto.trim())
  }
  return {
    sinTitular,
    total: (data || []).length,
    lista: [...porPersona.values()]
      .map(p => ({ ...p, filas: [...p.filas], puestos: [...p.puestos] }))
      .sort((a, b) => b.bienes - a.bienes),
  }
}

// Mueve los bienes VIGENTES de un área que pertenecen a esas filas de resguardo
async function reasignarTitularArea({ idarea, filasOrigen, idresguardoDestino }) {
  const { data, error } = await supabase
    .from('bienes')
    .update({ idresguardo: idresguardoDestino })
    .eq('idarea', idarea)
    .in('idresguardo', filasOrigen)
    .in('estadobien', ['ACTIVO', 'SOLICITUD BAJA'])
    .select('idbien')
  if (error) throw error
  return (data || []).length
}

// Confirmación del cambio de titular. El movimiento alcanza a todos los bienes
// que esa persona tiene en el área, así que antes de tocarlos se repite lo que
// va a pasar y se pide el sí.
function ModalConfirmaTitular({ resumen, onClose, onConfirm, dark, t, guardando }) {
  const sep = dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)'
  const dato = (etq, val) => (
    <div style={{ padding: '10px 1.5rem', borderBottom: sep }}>
      <p style={{ fontSize: '10px', color: dark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '3px' }}>{etq}</p>
      <p style={{ fontSize: '13px', color: dark ? '#f0f0f0' : '#111', lineHeight: 1.35 }}>{val || '—'}</p>
    </div>
  )

  return createPortal(
    <>
      <div onClick={guardando ? undefined : onClose} style={{ position:'fixed', inset:0, zIndex:400, background:'rgba(0,0,0,0.4)', backdropFilter:'blur(4px)' }} />
      <div onClick={e => e.stopPropagation()} style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:401, width:'520px', maxWidth:'94vw', maxHeight:'88vh', display:'flex', flexDirection:'column', background: dark ? '#1e1e20' : '#fff', borderRadius:'16px', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', boxShadow:'0 20px 60px rgba(0,0,0,0.4)', animation:'fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)', overflow:'hidden' }}>

        <div style={{ padding:'1.25rem 1.5rem', borderBottom: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <div style={{ width:'34px', height:'34px', borderRadius:'9px', background:t.iconBox, border:`1px solid ${t.iconBoxBorder}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <i className="ti ti-users-group" style={{ fontSize:'18px', color:t.text1 }} />
            </div>
            <div>
              <p style={{ fontSize:'15px', fontWeight:600, color: dark ? '#fff' : '#111' }}>Confirmar Cambio de Titular</p>
              <p style={{ fontSize:'12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>{resumen.area}</p>
            </div>
          </div>
          <button onClick={onClose} disabled={guardando} style={{ width:'30px', height:'30px', borderRadius:'7px', background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', cursor: guardando ? 'not-allowed' : 'pointer', color: dark ? '#ccc' : '#555' }}>
            <i className="ti ti-x" style={{ fontSize:'15px' }} />
          </button>
        </div>

        <div style={{ minHeight:0, overflowY:'auto' }}>
          <div style={{ padding:'12px 1.5rem', borderBottom: sep, fontSize:'12.5px', lineHeight:1.6 }}>
            <p style={{ color: dark ? '#f0f0f0' : '#111', fontWeight:600 }}>Se Actualizarán {resumen.bienes} {resumen.bienes === 1 ? 'Bien' : 'Bienes'}</p>
            <p style={{ color: dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)' }}>
              Del Titular {resumen.sale} a {resumen.nombre} en {resumen.area}.
            </p>
            {resumen.otros > 0 && <p style={{ color: dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)' }}>
              Los {resumen.otros} de los demás resguardantes de esta área no se tocan.
            </p>}
            <p style={{ color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.45)', marginTop:'6px' }}>
              Tampoco se tocan las bajas ni los traspasos, ni los bienes que esta persona tenga en otras áreas.
            </p>
          </div>
          {dato('Área', resumen.area)}
          {dato('Titular que deja el área', resumen.sale)}
          {dato('Titular nuevo', resumen.nombre)}
          {dato('Puesto', resumen.puesto)}
          {dato('Bienes que cambian de titular', String(resumen.bienes))}
        </div>

        <div style={{ flexShrink:0, padding:'1rem 1.5rem', borderTop: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display:'flex', gap:'8px' }}>
          <button onClick={onClose} disabled={guardando}
            style={{ flex:1, padding:'10px', background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)', border: dark ? '1px solid rgba(255,255,255,0.13)' : '1px solid rgba(0,0,0,0.09)', borderRadius:'9px', fontSize:'14px', fontWeight:500, color: dark ? '#ccc' : '#444', fontFamily:'inherit', cursor: guardando ? 'not-allowed' : 'pointer' }}>Cancelar</button>
          <button onClick={onConfirm} disabled={guardando}
            style={{ flex:1, padding:'10px', borderRadius:'9px', fontSize:'14px', fontWeight:600, fontFamily:'inherit', cursor: guardando ? 'wait' : 'pointer',
              background: dark ? 'rgba(168,230,207,0.18)' : 'rgba(30,126,74,0.08)',
              border: dark ? '1px solid rgba(168,230,207,0.35)' : '1px solid rgba(30,126,74,0.35)',
              color: dark ? '#a8e6cf' : '#15803d', display:'flex', alignItems:'center', justifyContent:'center', gap:'6px' }}>
            {guardando ? <><i className="ti ti-loader-2" style={{ fontSize:'15px', animation:'spin 1s linear infinite' }} />Aplicando…</> : 'Sí, actualizar'}
          </button>
        </div>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translate(-50%,-48%) scale(0.98)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}} @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </>,
    document.body
  )
}

function ModalTitularArea({ allAreas, onClose, onHecho, dark, t }) {
  // Entra como los demás modales del programa, no de lado
  const close = onClose
  const anim = 'fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)'
  const [idarea, setIdarea]   = useState('')
  const [datos, setDatos]     = useState(null)      // { lista, total, sinTitular }
  const [cargando, setCargando] = useState(false)
  const [sale, setSale]       = useState(null)      // la persona que deja el área
  const [nombre, setNombre]   = useState('')
  const [puesto, setPuesto]   = useState('')
  const [confirma, setConfirma] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [hecho, setHecho]     = useState(null)
  const [err, setErr]         = useState(null)

  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = '' } }, [])


  // Al elegir área se leen sus titulares
  useEffect(() => {
    // Al cambiar de área se empieza de cero
    setPuesto('')
    if (!idarea) { setDatos(null); setSale(null); return }
    let vivo = true
    setCargando(true); setErr(null); setSale(null); setConfirma(false)
    titularesDeArea(Number(idarea))
      .then(d => { if (vivo) setDatos(d) })
      .catch(e => { if (vivo) setErr(e.message) })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [idarea])

  // El puesto se captura a mano: se deja vacío con su placeholder en vez de
  // proponer el de la persona que sale.
  function elegirSale(p) {
    setSale(p)
    setConfirma(false)
  }

  const areaNom = allAreas.find(a => String(a.idarea) === String(idarea))?.nombrearea || ''
  const listo = sale && nombre.trim() && !guardando

  async function aplicar() {
    setGuardando(true); setErr(null)
    try {
      const destino = await resolverResguardo(nombre, puesto)
      if (!destino) throw new Error('No se pudo resolver el titular nuevo')
      const n = await reasignarTitularArea({ idarea: Number(idarea), filasOrigen: sale.filas, idresguardoDestino: destino })
      setHecho({ n, nombre: nombre.trim().toUpperCase() })
      setTimeout(() => { onHecho?.(); close() }, 1900)
    } catch (e) {
      setErr(e.message); setGuardando(false); setConfirma(false)
    }
  }

  const lbl = txt => <p style={{ fontSize:'10px', fontWeight:700, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'6px' }}>{txt}</p>

  // Las áreas agrupadas por dependencia, para encontrarlas rápido
  const grupos = {}
  allAreas.forEach(a => (grupos[a.nombredependencia || '—'] = grupos[a.nombredependencia || '—'] || []).push(a))

  return createPortal(
    <>
      <div onClick={close} style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,0.4)', backdropFilter:'blur(4px)' }} />
      <div onClick={e => e.stopPropagation()} style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:301, width:'620px', maxWidth:'95vw', maxHeight:'92vh', display:'flex', flexDirection:'column', background: dark ? '#1e1e20' : '#fff', borderRadius:'16px', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', boxShadow:'0 20px 60px rgba(0,0,0,0.4)', animation: anim, overflow:'hidden' }}>

        <div style={{ padding:'1.25rem 1.5rem', borderBottom: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <div style={{ width:'34px', height:'34px', borderRadius:'9px', background:t.iconBox, border:`1px solid ${t.iconBoxBorder}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <i className="ti ti-users-group" style={{ fontSize:'18px', color:t.text1 }} />
            </div>
            <div>
              <p style={{ fontSize:'15px', fontWeight:600, color: dark ? '#fff' : '#111' }}>Titular del Área</p>
              <p style={{ fontSize:'12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>Cambia el resguardante de todos sus bienes</p>
            </div>
          </div>
          <button onClick={close} style={{ width:'30px', height:'30px', borderRadius:'7px', background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color: dark ? '#ccc' : '#555' }}>
            <i className="ti ti-x" style={{ fontSize:'15px' }} />
          </button>
        </div>

        <div style={{ padding:'1.25rem 1.5rem', display:'flex', flexDirection:'column', gap:'1rem', minHeight:0, overflowY:'auto' }}>
          {hecho ? (
            <div style={{ padding:'14px', borderRadius:'10px', fontSize:'13px', lineHeight:1.6,
              background: dark ? 'rgba(168,230,207,0.12)' : 'rgba(30,126,74,0.07)',
              border: dark ? '1px solid rgba(168,230,207,0.3)' : '1px solid rgba(30,126,74,0.2)',
              color: dark ? '#a8e6cf' : '#15803d' }}>
              <p style={{ fontWeight:600 }}><i className="ti ti-check" style={{ marginRight:'6px' }} />Titular actualizado</p>
              <p>{hecho.n} {hecho.n === 1 ? 'bien pasó' : 'bienes pasaron'} a {hecho.nombre} en {areaNom}.</p>
            </div>
          ) : (
            <>
              <div>{lbl('Área')}
                <select value={idarea} onChange={e => setIdarea(e.target.value)} style={sStyle(dark)}>
                  <option value="">— Elige un área —</option>
                  {Object.entries(grupos).sort().map(([dep, as]) => (
                    <optgroup key={dep} label={dep}>
                      {as.map(a => <option key={a.idarea} value={a.idarea}>{a.nombrearea}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>

              {cargando && <p style={{ fontSize:'13px', color:t.text3 }}><i className="ti ti-loader-2" style={{ marginRight:'7px', animation:'spin 1s linear infinite' }} />Leyendo los titulares del área…</p>}

              {datos && !cargando && (
                <div>
                  {lbl('¿Quién deja el área?')}
                  {datos.lista.length === 0
                    ? <p style={{ fontSize:'13px', color:t.text3 }}>Esta área no tiene bienes vigentes con titular.</p>
                    : <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                        {datos.lista.map(p => {
                          const sel = sale && sale.nombre === p.nombre
                          // Marcado solo con sombreado, sin color: el mismo gris
                          // que usan las demás listas del programa
                          return (
                            <button key={p.nombre} onClick={() => elegirSale(p)}
                              style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', borderRadius:'9px', textAlign:'left', fontFamily:'inherit', cursor:'pointer',
                                background: sel ? (dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.05)') : 'transparent',
                                border: sel ? (dark ? '1px solid rgba(255,255,255,0.22)' : '1px solid rgba(0,0,0,0.18)') : `1px solid ${t.cardBorder}` }}>
                              <div style={{ width:'16px', height:'16px', borderRadius:'50%', flexShrink:0, border: `2px solid ${sel ? (dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.7)') : t.text4}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                                {sel && <div style={{ width:'8px', height:'8px', borderRadius:'50%', background: dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.7)' }} />}
                              </div>
                              <div style={{ flex:1, minWidth:0 }}>
                                <p style={{ fontSize:'13px', fontWeight:500, color:t.text1 }}>{p.nombre}</p>
                                {p.puestos.length > 0 && <p style={{ fontSize:'11.5px', color:t.text4 }}>
                                  {p.puestos.join(' · ')}
                                  {p.puestos.length > 1 && <span style={{ color: dark ? '#f5b759' : '#b45309' }}> — {p.puestos.length} puestos distintos</span>}
                                </p>}
                              </div>
                              <span style={{ fontSize:'13px', fontWeight:600, color:t.text2, flexShrink:0 }}>{p.bienes}</span>
                            </button>
                          )
                        })}
                      </div>}
                </div>
              )}

              {sale && (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                    {/* Sin sugerencias: el catálogo todavía trae renglones que
                        no son personas y se proponían aquí como titulares */}
                    <div>{lbl('Titular nuevo')}
                      <input value={nombre} onChange={e => setNombre(e.target.value)}
                        placeholder="Nombre del Titular" autoComplete="off" autoCorrect="off" spellCheck={false}
                        style={iStyle(dark)} />
                    </div>
                    <div>{lbl('Puesto')}
                      <input value={puesto} onChange={e => setPuesto(e.target.value)}
                        placeholder="Puesto del Titular" autoComplete="off" spellCheck={false} style={iStyle(dark)} />
                    </div>
                  </div>

                  {/* El aviso sale hasta que hay nombre nuevo: antes de eso no
                      hay nada que anunciar. Va como texto, sin recuadro. */}
                  {nombre.trim() && (
                    <div style={{ fontSize:'12.5px', lineHeight:1.6 }}>
                      <p style={{ color:t.text1, fontWeight:600 }}>Se Actualizarán {sale.bienes} {sale.bienes === 1 ? 'Bien' : 'Bienes'}</p>
                      <p style={{ color:t.text3 }}>Del Titular {sale.nombre} a {nombre.trim().toUpperCase()} en {areaNom}.</p>
                      {datos.lista.length > 1 && <p style={{ color:t.text3 }}>
                        Los {datos.total - sale.bienes - datos.sinTitular} de los demás resguardantes de esta área no se tocan.
                      </p>}
                      <p style={{ color:t.text4, marginTop:'6px' }}>
                        Tampoco se tocan las bajas ni los traspasos, ni los bienes que esta persona tenga en otras áreas.
                      </p>
                    </div>
                  )}
                </>
              )}

              {err && <p style={{ fontSize:'12px', color: dark ? '#f4a1a1' : '#c0392b' }}><i className="ti ti-alert-circle" style={{ marginRight:'5px' }} />{err}</p>}
            </>
          )}
        </div>

        {!hecho && (
          <div style={{ flexShrink:0, padding:'1rem 1.5rem', borderTop: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display:'flex', gap:'8px' }}>
            <button onClick={close} disabled={guardando}
              style={{ flex:1, padding:'10px', background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)', border: dark ? '1px solid rgba(255,255,255,0.13)' : '1px solid rgba(0,0,0,0.09)', borderRadius:'9px', fontSize:'14px', fontWeight:500, color: dark ? '#ccc' : '#444', fontFamily:'inherit', cursor: guardando ? 'not-allowed' : 'pointer' }}>Cancelar</button>
            {/* La confirmación va en su propio modal, no en el mismo botón */}
            <button onClick={() => setConfirma(true)} disabled={!listo}
              style={{ flex:1, padding:'10px', borderRadius:'9px', fontSize:'14px', fontWeight:600, fontFamily:'inherit', cursor: listo ? 'pointer' : 'not-allowed', opacity: listo ? 1 : 0.5,
                background: dark ? 'rgba(168,230,207,0.18)' : 'rgba(30,126,74,0.08)',
                border: dark ? '1px solid rgba(168,230,207,0.35)' : '1px solid rgba(30,126,74,0.35)',
                color: dark ? '#a8e6cf' : '#15803d', display:'flex', alignItems:'center', justifyContent:'center', gap:'6px' }}>
              {guardando ? <><i className="ti ti-loader-2" style={{ fontSize:'15px', animation:'spin 1s linear infinite' }} />Aplicando…</> : 'Cambiar titular'}
            </button>
          </div>
        )}
      </div>
      {confirma && sale && (
        <ModalConfirmaTitular dark={dark} t={t} guardando={guardando}
          resumen={{
            area: areaNom,
            sale: sale.nombre,
            nombre: nombre.trim().toUpperCase(),
            puesto: puesto.trim(),
            bienes: sale.bienes,
            otros: datos.lista.length > 1 ? datos.total - sale.bienes - datos.sinTitular : 0,
          }}
          onClose={() => { if (!guardando) setConfirma(false) }}
          onConfirm={aplicar} />
      )}
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translate(-50%,-48%) scale(0.98)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}} @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}} @keyframes entraDer{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}} @keyframes entraIzq{from{opacity:0;transform:translateX(-40px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </>,
    document.body
  )
}

function ModalNuevoBien({ onClose, onCreated, dark, t, modo, allAreas }) {
  const [clave, setClave]     = useState('')
  const [nombre, setNombre]   = useState('')
  const [tipo, setTipo]       = useState('')
  const [marca, setMarca]     = useState('')
  const [serie, setSerie]     = useState('')
  const [idarea, setIdarea]   = useState('')
  const [modoSel, setModoSel] = useState(modo)
  const [obs, setObs]         = useState('')
  const [estadoObs, setEstadoObs] = useState('BUEN ESTADO')
  const [anioClave, setAnioClave] = useState(new Date().getFullYear())
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState(null)
  // Series: se capturan en un panel aparte, una por cada clave generada
  const [clavesLote, setClavesLote] = useState([])
  const [series, setSeries] = useState([])
  const [pagina, setPagina] = useState(0)   // 0 = formulario, 1 = series

  // Datos de la compra: se capturan una vez y se aplican a todos los bienes del lote
  const [cantidad, setCantidad]   = useState(1)
  const [numFactura, setNumFactura] = useState('')
  const [fechaFactura, setFechaFactura] = useState('')
  const [importe, setImporte]     = useState('')
  const [partida, setPartida]     = useState(PARTIDA_POR_MODO[modo] || '')
  const [proveedor, setProveedor] = useState('')
  // Catálogo de proveedores para ir proponiendo mientras se escribe. Son unos
  // cientos de nombres, así que se traen de una vez y se filtran sin ir y venir
  // a la base en cada tecla.
  const [provs, setProvs] = useState([])
  useEffect(() => {
    let vivo = true
    supabase.from('proveedores').select('nombreproveedor').order('nombreproveedor').limit(5000)
      .then(({ data }) => { if (vivo) setProvs((data || []).map(p => p.nombreproveedor).filter(Boolean)) })
    return () => { vivo = false }
  }, [])
  const [resgNombre, setResgNombre] = useState('')
  const [resgPuesto, setResgPuesto] = useState('')

  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = '' } }, [])

  const n = Math.max(1, Math.min(500, Number(cantidad) || 1))
  const [refsPag, altoPag] = useAlturaPagina(pagina, [n, clavesLote, err])

  // El importe es el de UN bien: si se registran varios, cada uno se guarda con
  // ese mismo costo y el total de la compra es el importe por la cantidad.
  const costoUnit = useMemo(() => {
    const v = leerImporte(importe)
    // Se redondea a centavos para no arrastrar decimales de más
    return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null
  }, [importe])
  const totalLote = costoUnit ? costoUnit * n : 0
  const hayCompra = !!(numFactura.trim() || fechaFactura || costoUnit || proveedor.trim())

  // La clave lleva el año de la factura: si se captura la fecha, se toma de ahí
  useEffect(() => {
    const a = Number(String(fechaFactura).slice(0, 4))
    if (a >= 2000 && a <= 2100) setAnioClave(a)
  }, [fechaFactura])

  // Al elegir el área se propone quién resguarda ahí: la persona con más bienes
  // ACTIVOS de esa área. Es solo una propuesta —los campos se pueden editar— y
  // se cuentan los activos para no proponer a alguien que salga solo en bajas.
  useEffect(() => {
    if (!idarea) { setResgNombre(''); setResgPuesto(''); return }
    let vivo = true
    const limpiar = () => { if (vivo) { setResgNombre(''); setResgPuesto('') } }
    supabase.from('bienes').select('idresguardo, estadobien')
      .eq('idarea', Number(idarea)).not('idresguardo', 'is', null).limit(5000)
      .then(({ data }) => {
        if (!vivo) return
        if (!data || !data.length) { limpiar(); return }
        const activos = new Map(), todos = new Map()
        for (const b of data) {
          todos.set(b.idresguardo, (todos.get(b.idresguardo) || 0) + 1)
          if (b.estadobien === 'ACTIVO') activos.set(b.idresguardo, (activos.get(b.idresguardo) || 0) + 1)
        }
        const cuenta = activos.size ? activos : todos
        const top = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0][0]
        return supabase.from('resguardos').select('nombre, puesto').eq('idresguardo', top).limit(1)
          .then(({ data: r }) => {
            if (!vivo) return
            setResgNombre(r?.[0]?.nombre || '')
            setResgPuesto(r?.[0]?.puesto || '')
          })
      })
      .catch(limpiar)
    return () => { vivo = false }
  }, [idarea])

  // Áreas agrupadas por dependencia para el <select>
  const grupos = useMemo(() => {
    const m = new Map()
    for (const a of allAreas) {
      const dep = a.nombredependencia || 'Sin dependencia'
      if (!m.has(dep)) m.set(dep, [])
      m.get(dep).push(a)
    }
    return [...m.entries()]
  }, [allAreas])

  // Genera la clave en cuanto hay área + categoría: {PREFIJO}{AA}-{CLAVE}-{TIPO}-{CONSEC}
  useEffect(() => {
    if (!idarea) { setClave(''); return }
    let vivo = true
    setClave('Generando…')
    siguienteClaveLote({ idarea, tipo: tipoDeModo(modoSel), anio: anioClave, cantidad: n })
      .then(r => {
        if (!vivo) return
        if (!r) { setClave(''); setClavesLote([]); return }
        setClavesLote(r)
        setClave(r.length === 1 ? r[0].clave : `${r[0].clave}  →  ${r[r.length - 1].clave}`)
      })
      .catch(() => { if (vivo) { setClave(''); setClavesLote([]) } })
    return () => { vivo = false }
  }, [idarea, modoSel, anioClave, n])

  // La lista de series sigue a la cantidad, conservando lo ya capturado
  useEffect(() => { setSeries(prev => Array.from({ length: n }, (_, i) => prev[i] || '')) }, [n])

  // Al cambiar de categoría se propone la partida que le corresponde
  useEffect(() => { setPartida(PARTIDA_POR_MODO[modoSel] || '') }, [modoSel])
  const seriesCargadas = series.filter(s => (s || '').trim()).length

  async function guardar() {
    if (!nombre.trim()) { setErr('El nombre del bien es obligatorio'); return }
    if (!idarea)        { setErr('Selecciona el área a la que pertenece'); return }
    if (importe.trim() && !costoUnit) { setErr('El importe no es un número válido'); return }
    setGuardando(true); setErr(null)

    let facturasCreadas = []
    try {
      // Proveedor: se escribe a mano. Si el nombre ya está en el catálogo se
      // reutiliza ese registro; si no, se da de alta uno nuevo.
      let idproveedor = null
      if (proveedor.trim()) {
        const nom = proveedor.trim().toUpperCase()
        const { data: ya } = await supabase.from('proveedores').select('idproveedor').ilike('nombreproveedor', nom).limit(1)
        if (ya && ya[0]) idproveedor = ya[0].idproveedor
        else {
          const { data: mp, error: ep } = await supabase.from('proveedores').select('idproveedor').order('idproveedor', { ascending: false }).limit(1)
          if (ep) throw ep
          idproveedor = ((mp && mp[0]?.idproveedor) || 0) + 1
          const { error: ep2 } = await supabase.from('proveedores').insert({ idproveedor, nombreproveedor: nom })
          if (ep2) throw ep2
        }
      }

      // Resguardatario: se reutiliza la persona si ya está en el catálogo (y
      // conserva su puesto actual); si no, se da de alta con el capturado.
      const idresguardo = await resolverResguardo(resgNombre, resgPuesto)

      // Ni idbien ni idfactura son autoincrementales: se toman del máximo actual
      const { data: maxB, error: e1 } = await supabase.from('bienes').select('idbien').order('idbien', { ascending: false }).limit(1)
      if (e1) throw e1
      const baseBien = ((maxB && maxB[0]?.idbien) || 0) + 1

      // Se recalculan las claves justo antes de insertar, por si otro usuario
      // tomó el consecutivo mientras el formulario estaba abierto
      const gen = await siguienteClaveLote({ idarea, tipo: tipoDeModo(modoSel), anio: anioClave, cantidad: n })

      // Una factura por bien con su costo unitario, como el resto del inventario.
      // Así el costo de cada bien es el suyo y el reporte de adquisiciones agrupa
      // por número de factura y vuelve a sumar el total de la compra.
      let baseFact = null
      if (hayCompra) {
        const { data: maxF, error: e2 } = await supabase.from('facturas').select('idfactura').order('idfactura', { ascending: false }).limit(1)
        if (e2) throw e2
        baseFact = ((maxF && maxF[0]?.idfactura) || 0) + 1
        const filas = Array.from({ length: n }, (_, i) => ({
          idfactura: baseFact + i,
          numerofactura: numFactura.trim() || null,
          fechafactura: fechaFactura || null,
          costoinicial: costoUnit,
          idproveedor,
        }))
        const { error: e3 } = await supabase.from('facturas').insert(filas)
        if (e3) throw e3
        facturasCreadas = filas.map(f => f.idfactura)
      }

      const bienes = Array.from({ length: n }, (_, i) => ({
        idbien: baseBien + i,
        claveinventario: gen ? gen[i].clave : (n === 1 ? (clave.trim() || null) : null),
        consecutivo: gen ? gen[i].consecutivo : null,
        nombrebien: nombre.trim().toUpperCase(),
        tipo: tipo.trim() || null,
        marca: marca.trim() || null,
        serie: (series[i] || '').trim() || null,
        observaciones: unirObs(estadoObs, obs),
        idarea: Number(idarea),
        idresguardo,
        idfactura: baseFact != null ? baseFact + i : null,
        partida: partida || null,
        categoriainventario: (CATS_BY_MODO[modoSel] || CATS_BY_MODO.mobiliario)[0],
        estadobien: 'ACTIVO',
      }))
      const { error: e4 } = await supabase.from('bienes').insert(bienes)
      if (e4) throw e4

      onCreated(modoSel)
      onClose()
    } catch (e) {
      // Si los bienes fallaron después de crear las facturas, se borran para no
      // dejar facturas sueltas que el reporte contaría sin ningún bien detrás
      if (facturasCreadas.length) await supabase.from('facturas').delete().in('idfactura', facturasCreadas)
      setErr(e.message); setGuardando(false)
    }
  }

  const lbl = (txt) => <p style={{ fontSize: '10px', fontWeight: 700, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>{txt}</p>

  return createPortal(
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,0.4)', backdropFilter:'blur(4px)' }} />
      <div onClick={e => e.stopPropagation()} style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:301, width:'980px', maxWidth:'96vw', maxHeight:'92vh', display:'flex', flexDirection:'column', background: dark ? '#1e1e20' : '#fff', borderRadius:'16px', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', boxShadow:'0 20px 60px rgba(0,0,0,0.4)', animation:'fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)', overflow:'hidden' }}>

        {/* Dos páginas dentro del mismo modal: se desliza el contenido completo */}
        <div style={{ display:'flex', flexDirection:'column', minHeight:0, overflow:'hidden' }}>

        {/* ── Página 1: formulario ── */}
        <div ref={refsPag[0]} style={{ display: pagina === 0 ? 'flex' : 'none', flexDirection:'column', maxHeight:'92vh', animation: pagina === 0 ? 'entraIzq 0.22s cubic-bezier(0.32,0.72,0,1)' : undefined }}>

        {/* Header */}
        <div style={{ padding:'1.25rem 1.5rem', borderBottom: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <div style={{ width:'34px', height:'34px', borderRadius:'9px', background: t.iconBox, border:`1px solid ${t.iconBoxBorder}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <i className="ti ti-circle-plus" style={{ fontSize:'18px', color: t.text2 }} />
            </div>
            <div>
              <p style={{ fontSize:'15px', fontWeight:600, color: dark ? '#fff' : '#111' }}>{n === 1 ? 'Nuevo bien' : `${n} bienes nuevos`}</p>
              <p style={{ fontSize:'12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>{n === 1 ? 'Registrar un bien mueble en el inventario' : 'Registrar varios bienes de una misma compra'}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width:'30px', height:'30px', borderRadius:'7px', background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color: dark ? '#ccc' : '#555' }}>
            <i className="ti ti-x" style={{ fontSize:'15px' }} />
          </button>
        </div>

        {/* Cuerpo: dos columnas equilibradas, dimensionadas para caber sin scroll */}
        <div style={{ minHeight:0, maxHeight:'62vh', overflowY:'auto', padding:'0.8rem 1.1rem', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.85rem', alignItems:'start' }}>

          {/* ── Columna 1: el bien ── */}
          <section style={panelStyle(dark)}>
            <p style={tituloSec(t)}><i className="ti ti-box" style={{ marginRight:'7px' }} />Datos del bien</p>
            <div style={{ display:'flex', flexDirection:'column', gap:'0.6rem' }}>

              <div>{lbl('Área / Dependencia *')}
                <select value={idarea} onChange={e => setIdarea(e.target.value)} style={sStyle(dark)}>
                  <option value="">Selecciona un área…</option>
                  {grupos.map(([dep, areas]) => (
                    <optgroup key={dep} label={dep}>
                      {areas.map(a => <option key={a.idarea} value={a.idarea}>{a.nombrearea}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1.5fr 0.75fr 0.85fr', gap:'8px' }}>
                <div>{lbl('Categoría')}
                  <select value={modoSel} onChange={e => setModoSel(e.target.value)} style={sStyle(dark)}>
                    {MODOS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </div>
                <div>{lbl('Cantidad')}
                  <input type="number" value={cantidad} onChange={e => setCantidad(e.target.value)} min="1" max="500" style={iStyle(dark)} />
                </div>
                <div>{lbl('Año fact.')}
                  <input type="number" value={anioClave} onChange={e => setAnioClave(e.target.value)} min="2000" max="2100" style={iStyle(dark)} />
                </div>
              </div>

              <div>{lbl(n === 1 ? 'Clave de inventario (automática)' : `Claves de inventario (${n} consecutivas)`)}
                <div style={{ ...iStyle(dark), display:'flex', alignItems:'center', gap:'8px', background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }}>
                  <i className="ti ti-hash" style={{ fontSize:'15px', color: t.text4, flexShrink:0 }} />
                  <span style={{ flex:1, fontFamily:'monospace', fontSize:'13px', color: clave ? t.text1 : t.text4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {clave || (idarea ? 'Sin clave para esta área' : 'Selecciona un área…')}
                  </span>
                </div>
              </div>

              <div>{lbl('Nombre del bien *')}<input value={nombre} onChange={e => setNombre(e.target.value)} style={iStyle(dark)} /></div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px' }}>
                <div>{lbl('Marca')}<input value={marca} onChange={e => setMarca(e.target.value)} style={iStyle(dark)} /></div>
                <div>{lbl('Tipo / Modelo')}<input value={tipo} onChange={e => setTipo(e.target.value)} style={iStyle(dark)} /></div>
                {/* La serie se captura aparte, junto a la clave de cada bien */}
                <div>{lbl(n === 1 ? 'No. de serie' : `Series (${n})`)}
                  <button onClick={() => setPagina(1)} disabled={!idarea}
                    title={!idarea ? 'Elige primero el área' : 'Capturar números de serie'}
                    style={{ ...iStyle(dark), display:'flex', alignItems:'center', gap:'6px', cursor: idarea ? 'pointer' : 'not-allowed', opacity: idarea ? 1 : 0.55, textAlign:'left', fontFamily:'inherit' }}>
                    <i className="ti ti-barcode" style={{ fontSize:'15px', color: t.text4, flexShrink:0 }} />
                    <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:'13px', color: seriesCargadas ? t.text1 : t.text4 }}>
                      {seriesCargadas ? `${seriesCargadas}/${n}` : 'Capturar'}
                    </span>
                    <i className="ti ti-chevron-right" style={{ fontSize:'14px', color: t.text4, flexShrink:0 }} />
                  </button>
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'0.85fr 1.5fr', gap:'8px' }}>
                <div>{lbl('Estado')}
                  <select value={estadoObs} onChange={e => setEstadoObs(e.target.value)} style={sStyle(dark)}>
                    {ESTADOS_ALTA.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div>{lbl('Observaciones')}
                  <input value={obs} onChange={e => setObs(e.target.value)} style={iStyle(dark)} />
                </div>
              </div>
            </div>
          </section>

          {/* ── Columna 2: resguardo y compra ── */}
          <div style={{ display:'flex', flexDirection:'column', gap:'0.9rem' }}>

            <section style={panelStyle(dark)}>
              <p style={tituloSec(t)}><i className="ti ti-user" style={{ marginRight:'7px' }} />Resguardo<span style={{ fontWeight:400, color:t.text4 }}> — opcional</span></p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                <div>{lbl('A cargo de')}
                  <input value={resgNombre} onChange={e => setResgNombre(e.target.value)} autoComplete="off" spellCheck={false} style={iStyle(dark)} />
                </div>
                <div>{lbl('Puesto')}
                  <input value={resgPuesto} onChange={e => setResgPuesto(e.target.value)} autoComplete="off" spellCheck={false} style={iStyle(dark)} />
                </div>
              </div>
            </section>

            <section style={panelStyle(dark)}>
              <p style={tituloSec(t)}><i className="ti ti-receipt" style={{ marginRight:'7px' }} />Datos de la compra<span style={{ fontWeight:400, color:t.text4 }}> — opcional</span></p>
              <div style={{ display:'flex', flexDirection:'column', gap:'0.6rem' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                  <div>{lbl('No. de factura')}<input value={numFactura} onChange={e => setNumFactura(e.target.value)} style={iStyle(dark)} /></div>
                  <div>{lbl('Fecha')}<input type="date" value={fechaFactura} onChange={e => setFechaFactura(e.target.value)} style={iStyle(dark)} /></div>
                </div>
                <div>{lbl('Proveedor')}
                  <CampoSugerido value={proveedor} onChange={setProveedor} opciones={provs} dark={dark} />
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                  <div>{lbl('Importe c/u')}
                    <input value={importe} onChange={e => setImporte(e.target.value)} placeholder="0.00" inputMode="decimal" autoComplete="off" style={iStyle(dark)} />
                  </div>
                  <div>{lbl('Partida')}
                    <select value={partida} onChange={e => setPartida(e.target.value)} style={sStyle(dark)}>
                      <option value="">Sin partida</option>
                      {PARTIDAS.map(p => <option key={p.cod} value={p.cod}>{p.nombre} — {p.cod}</option>)}
                    </select>
                  </div>
                </div>
                {/* Se muestra siempre el monto leído para que se note al momento
                    si se escribió mal, no solo cuando son varios bienes */}
                {costoUnit && <p style={{ fontSize:'11px', color: t.text3 }}>
                  {n > 1
                    ? `${n} × $${costoUnit.toLocaleString('es-MX', { minimumFractionDigits: 2 })} · total $${totalLote.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
                    : `Se guardará $${costoUnit.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}
                </p>}
              </div>
            </section>
          </div>
        </div>

        {/* Footer */}
        <div style={{ flexShrink:0, padding:'1rem 1.5rem', borderTop: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)' }}>
          {err && <p style={{ fontSize:'12px', color: dark ? '#f4a1a1' : '#c0392b', marginBottom:'10px' }}><i className="ti ti-alert-circle" style={{ marginRight:'5px' }} />{err}</p>}
          <div style={{ display:'flex', gap:'8px' }}>
            <button onClick={onClose} style={{ flex:1, padding:'11px', borderRadius:'9px', fontSize:'14px', fontWeight:600, fontFamily:'inherit', cursor:'pointer', background:'transparent', border:`1px solid ${t.cardBorder}`, color: t.text2 }}>Cancelar</button>
            <button onClick={guardar} disabled={guardando}
              style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'7px', padding:'11px', borderRadius:'9px', fontSize:'14px', fontWeight:600, fontFamily:'inherit', cursor: guardando ? 'wait' : 'pointer', background: dark ? 'rgba(168,230,207,0.18)' : 'rgba(30,126,74,0.08)', border: dark ? '1px solid rgba(168,230,207,0.35)' : '1px solid rgba(30,126,74,0.35)', color: dark ? '#a8e6cf' : '#15803d' }}>
              {guardando ? <><i className="ti ti-loader-2" style={{ fontSize:'15px', animation:'spin 1s linear infinite' }} />Guardando…</> : <><i className="ti ti-device-floppy" style={{ fontSize:'16px' }} />{n === 1 ? 'Registrar' : `Registrar ${n}`}</>}
            </button>
          </div>
        </div>
        </div>

        {/* ── Página 2: números de serie ── */}
        <div ref={refsPag[1]} style={{ display: pagina === 1 ? 'flex' : 'none', flexDirection:'column', maxHeight:'92vh', animation: pagina === 1 ? 'entraDer 0.22s cubic-bezier(0.32,0.72,0,1)' : undefined }}>
          <PaginaSeries onVolver={() => setPagina(0)}
            claves={clavesLote} nombre={nombre} marca={marca} tipo={tipo}
            area={allAreas.find(a => String(a.idarea) === String(idarea))?.nombrearea} partida={partida}
            series={series} setSeries={setSeries} dark={dark} t={t}
            onRegistrar={guardar} guardando={guardando} n={n} />
        </div>

        </div>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translate(-50%,-48%) scale(0.98)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}} @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}} @keyframes entraDer{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}} @keyframes entraIzq{from{opacity:0;transform:translateX(-40px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </>,
    document.body
  )
}

// ── ModalResguardosLote ───────────────────────────────────────────────────────
// Imprime o descarga en un solo documento los resguardos de los bienes marcados,
// uno por hoja. Se apoya en las mismas funciones que el resguardo individual.
function ModalResguardosLote({ bienes, onClose, dark, t }) {
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = '' } }, [])

  function imprimir() {
    const w = window.open('', '_blank', 'width=880,height=1120')
    if (!w) { alert('Permite ventanas emergentes para imprimir.'); return }
    w.document.write(generarHTMLResguardosLote(bienes))
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 600)
  }

  function descargar() {
    const blob = new Blob([generarHTMLResguardosLote(bienes)], { type: 'text/html;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `resguardos-${bienes.length}-bienes.html`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const btn = (extra) => ({ display:'flex', alignItems:'center', justifyContent:'center', gap:'7px', padding:'11px', borderRadius:'9px', fontSize:'14px', fontWeight:600, fontFamily:'inherit', cursor:'pointer', ...extra })

  return createPortal(
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,0.4)', backdropFilter:'blur(4px)' }} />
      <div onClick={e => e.stopPropagation()} style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:301, width:'480px', maxWidth:'94vw', maxHeight:'88vh', display:'flex', flexDirection:'column', background: dark ? '#1e1e20' : '#fff', borderRadius:'16px', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', boxShadow:'0 20px 60px rgba(0,0,0,0.4)', animation:'fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)', overflow:'hidden' }}>

        <div style={{ padding:'1.25rem 1.5rem', borderBottom: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display:'flex', alignItems:'center', gap:'10px', flexShrink:0 }}>
          <div style={{ width:'34px', height:'34px', borderRadius:'9px', background: t.iconBox, border:`1px solid ${t.iconBoxBorder}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <i className="ti ti-file-text" style={{ fontSize:'18px', color: t.text2 }} />
          </div>
          <div style={{ flex:1 }}>
            <p style={{ fontSize:'15px', fontWeight:600, color: dark ? '#fff' : '#111' }}>
              {bienes.length === 1 ? 'Resguardo' : `${bienes.length} resguardos`}
            </p>
            <p style={{ fontSize:'12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>Un bien por hoja, en un solo documento</p>
          </div>
          <button onClick={onClose} style={{ width:'30px', height:'30px', borderRadius:'7px', background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color: dark ? '#ccc' : '#555' }}>
            <i className="ti ti-x" style={{ fontSize:'15px' }} />
          </button>
        </div>

        <div style={{ minHeight:0, maxHeight:'62vh', overflowY:'auto', padding:'1rem 1.5rem' }}>
          {bienes.map((b, i) => (
            <div key={b.idbien} style={{ display:'flex', gap:'10px', alignItems:'baseline', padding:'7px 0', borderBottom: i < bienes.length - 1 ? (dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.05)') : 'none' }}>
              <span style={{ fontSize:'11px', color:t.text4, width:'22px', flexShrink:0 }}>{i + 1}.</span>
              <span style={{ fontFamily:'monospace', fontSize:'12.5px', color:t.text1, flexShrink:0 }}>{b.claveinventario || '—'}</span>
              <span style={{ fontSize:'12.5px', color:t.text3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{b.nombrebien}</span>
            </div>
          ))}
        </div>

        <div style={{ flexShrink:0, padding:'1rem 1.5rem', borderTop: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display:'flex', gap:'8px' }}>
          <button onClick={descargar} style={btn({ flex:1, background:'transparent', border:`1px solid ${t.cardBorder}`, color:t.text2 })}>
            <i className="ti ti-download" style={{ fontSize:'16px' }} />Descargar
          </button>
          <button onClick={imprimir} style={btn({ flex:1, background: dark ? 'rgba(168,230,207,0.18)' : 'rgba(30,126,74,0.08)', border: dark ? '1px solid rgba(168,230,207,0.35)' : '1px solid rgba(30,126,74,0.35)', color: dark ? '#a8e6cf' : '#15803d' })}>
            <i className="ti ti-printer" style={{ fontSize:'16px' }} />Imprimir
          </button>
        </div>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translate(-50%,-48%) scale(0.98)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}`}</style>
    </>,
    document.body
  )
}

// ── PÁGINA ────────────────────────────────────────────────────────────────────
// ── Menú de clic derecho sobre un renglón ─────────────────────────────────────
// Se ancla al puntero y se corrige solo si no cabe hacia abajo o a la derecha.
export function MenuFila({ menu, onClose, dark, t, acciones = [] }) {
  const ref = useRef(null)
  const [pos, setPos] = useState({ x: menu.x, y: menu.y })
  // onClose llega como función nueva en cada render del padre; con la ref el
  // efecto de abajo se monta una sola vez.
  const cerrarRef = useRef(onClose)
  cerrarRef.current = onClose

  useLayoutEffect(() => {
    const el = ref.current; if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPos({
      x: Math.min(menu.x, window.innerWidth  - width  - 8),
      y: Math.min(menu.y, window.innerHeight - height - 8),
    })
  }, [menu.x, menu.y])

  // Los listeners para cerrar se registran un tick después: el mismo clic
  // derecho que abre el menú sigue subiendo hasta window, y si ya estuvieran
  // puestos lo cerrarían de inmediato —el menú ni se alcanzaba a ver—.
  useEffect(() => {
    const fuera = () => cerrarRef.current()
    const tecla = e => { if (e.key === 'Escape') cerrarRef.current() }
    let puestos = false
    const poner = () => {
      puestos = true
      window.addEventListener('click', fuera)
      window.addEventListener('contextmenu', fuera)
      window.addEventListener('scroll', fuera, true)
      window.addEventListener('keydown', tecla)
    }
    const id = setTimeout(poner, 0)
    return () => {
      clearTimeout(id)
      if (!puestos) return
      window.removeEventListener('click', fuera)
      window.removeEventListener('contextmenu', fuera)
      window.removeEventListener('scroll', fuera, true)
      window.removeEventListener('keydown', tecla)
    }
  }, [])

  // Cada pantalla decide qué acciones ofrece sobre el renglón
  const opciones = acciones.filter(o => o && (o.visible === undefined || o.visible))

  return createPortal(
    <div ref={ref} onClick={e => e.stopPropagation()} onContextMenu={e => { e.preventDefault(); e.stopPropagation() }}
      style={{ position: 'fixed', top: pos.y, left: pos.x, zIndex: 400, minWidth: '188px', padding: '5px',
        borderRadius: '11px', background: dark ? '#232325' : '#ffffff',
        border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)',
        boxShadow: dark ? '0 12px 34px rgba(0,0,0,0.5)' : '0 12px 34px rgba(0,0,0,0.16)',
        transformOrigin: 'top left', animation: 'menuFila 0.14s cubic-bezier(0.4,0,0.2,1)' }}>
      <style>{`@keyframes menuFila{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}`}</style>
      <p style={{ fontSize: '10px', fontWeight: 700, color: t.text4, textTransform: 'uppercase', letterSpacing: '0.07em', padding: '6px 9px 5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {menu.bien.claveinventario || 'Bien'}
      </p>
      {opciones.map(o => (
        <button key={o.label} onClick={() => { onClose(); o.accion() }}
          style={{ display: 'flex', alignItems: 'center', gap: '9px', width: '100%', padding: '8px 9px', borderRadius: '8px',
            background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '13px', color: o.color || t.text1, textAlign: 'left',
            borderTop: o.separador ? (dark ? '1px solid rgba(255,255,255,0.09)' : '1px solid rgba(0,0,0,0.07)') : 'none',
            marginTop: o.separador ? '4px' : 0, paddingTop: o.separador ? '10px' : '8px' }}
          onMouseEnter={e => e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <i className={`ti ${o.icon}`} style={{ fontSize: '15px', color: o.color || t.text3 }} />{o.label}
        </button>
      ))}
    </div>,
    document.body,
  )
}

export default function BienesMuebles({ user, onNavigate, initialModo = 'mobiliario', initialAreaFilter = [], initialEstado = 'Todos', papelera = false, traspasos = false }) {
  const { dark, t, sidebarOpen } = useTheme()

  const [modo, setModo]                     = useState(initialModo)
  const [datos, setDatos]                   = useState([])
  const [allAreas, setAllAreas]             = useState([])
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState(null)
  const [pagina, setPagina]                 = useState(0)
  const [totalRegistros, setTotalRegistros] = useState(0)
  const [porPagina, setPorPagina]           = useState(20)
  // Lo que se ve escrito en la caja de página, aparte de la página real: así se
  // puede borrar y teclear otro número sin que la tabla salte en cada tecla.
  const [paginaTexto, setPaginaTexto]       = useState('1')

  const [busqueda, setBusqueda]             = useState('')
  // Al usar "Ir a su página" se quita la búsqueda y se marca el bien un momento
  // para no perderlo de vista entre los demás renglones.
  const [resaltado, setResaltado]           = useState(null)
  const [ubicando, setUbicando]             = useState(false)
  // Menú de clic derecho sobre un renglón: { x, y, bien }
  const [menuFila, setMenuFila]             = useState(null)
  const [confirmaRestaurar, setConfirmaRestaurar] = useState(null)
  const refTabla = useRef(null)
  const filaResaltada = useRef(null)
  const [filtroBien, setFiltroBien]         = useState('')
  const [modalTipo, setModalTipo]           = useState(false)
  const [areasSelec, setAreasSelec]         = useState(initialAreaFilter)
  const [filtroEstado, setFiltroEstado]     = useState(initialEstado)

  const [modoSeleccion, setModoSeleccion]   = useState(false)
  const [seleccionados, setSeleccionados]   = useState(() => new Map())   // idbien → bien
  const [modalReporte, setModalReporte]     = useState(false)
  const [modalSolicitar, setModalSolicitar] = useState(null)              // array de bienes | null

  const [panelBien, setPanelBien]           = useState(null)
  const [modalEditar, setModalEditar]       = useState(null)
  const [modalResguardo, setModalResguardo] = useState(null)
  const [modalResguardosLote, setModalResguardosLote] = useState(null)   // array de bienes | null
  const [modalBaja, setModalBaja]           = useState(null)
  const [modalTrasp, setModalTrasp]         = useState(null)
  const [modalTitularArea, setModalTitularArea] = useState(false)
  const [modalNuevo, setModalNuevo]         = useState(false)

  const skipDebounce = useRef(true)

  useEffect(() => {
    let vivo = true
    fetchAreas()
      .then(async areas => {
        // En traspasos el filtro debe traer los números de esa lista, no los
        // del inventario vigente. La papelera conserva el catálogo completo
        // porque de ahí se elige el área a la que regresa un bien.
        if (!traspasos) { if (vivo) setAllAreas(areas); return }
        const conteo = await conteoAreasPorEstado(['TRASPASO'])
        if (vivo) setAllAreas(areas.map(a => ({ ...a, total_bienes: conteo.get(a.idarea) || 0 })).filter(a => a.total_bienes > 0))
      })
      .catch(console.error)
    return () => { vivo = false }
  }, [traspasos])

  const cargar = useCallback((pag, params = {}) => {
    setLoading(true)
    setError(null)
    fetchBienes({
      modo:          params.modo          ?? modo,
      pagina:        pag,
      busqueda:      params.busqueda      ?? busqueda,
      filtroBien:    params.filtroBien    ?? filtroBien,
      filtroEstado:  params.filtroEstado  ?? filtroEstado,
      filtroAreaIds: params.filtroAreaIds ?? areasSelec,
      porPagina:     params.porPagina     ?? porPagina,
      papelera,
      traspasos,
    })
      .then(({ data, count }) => { setDatos(data); setTotalRegistros(count); setPagina(pag) })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [modo, busqueda, filtroBien, filtroEstado, areasSelec, porPagina])

  const totalPaginas = Math.max(1, Math.ceil(totalRegistros / porPagina))

  // La caja sigue a la página real: al filtrar, al cambiar de categoría o al usar
  // las flechas, el número que se ve se actualiza solo.
  useEffect(() => { setPaginaTexto(String(pagina + 1)) }, [pagina])

  // Se salta al escribir Enter o al salir de la caja, no en cada tecla. Un número
  // fuera de rango se ajusta al extremo más cercano en vez de dejar la tabla vacía.
  function irAPagina() {
    const n = Math.min(totalPaginas, Math.max(1, Number(paginaTexto) || 1))
    setPaginaTexto(String(n))
    if (n - 1 !== pagina) cargar(n - 1)
  }

  // Quita la búsqueda y carga la página donde ese bien vive en la lista completa
  async function irAlBien(b) {
    if (!b) return
    setUbicando(true); setError(null)
    try {
      // Se deja puesto el filtro con SU área, no con toda la dependencia: la
      // lista queda acotada a esa área y el consecutivo que se ve es el que le
      // corresponde ahí, no el de todo el inventario.
      const suArea = b.idarea != null ? [b.idarea] : areasSelec

      const pag = await paginaDeBien(b, { modo, filtroBien, filtroEstado, filtroAreaIds: suArea, porPagina, papelera, traspasos })
      // Cambiar búsqueda y filtro dispararía otra carga en página 0; se salta
      skipDebounce.current = true
      setBusqueda('')
      setAreasSelec(suArea)
      setResaltado(b.idbien)
      cargar(pag, { busqueda: '', filtroAreaIds: suArea })
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
    setLoading(true)
    setError(null)
    fetchBienes({ modo, pagina: 0, busqueda, filtroBien, filtroEstado, filtroAreaIds: areasSelec, porPagina, papelera, traspasos })
      .then(({ data, count }) => { setDatos(data); setTotalRegistros(count); setPagina(0) })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [modo, papelera, traspasos])

  useEffect(() => {
    if (skipDebounce.current) { skipDebounce.current = false; return }
    const timer = setTimeout(() => cargar(0), 400)
    return () => clearTimeout(timer)
  }, [busqueda, filtroBien, filtroEstado, areasSelec, porPagina])

  // Clic derecho sobre un renglón. Va como listener nativo en fase de captura
  // sobre la tabla: así se atiende antes que cualquier otro manejador y no
  // depende de la delegación de eventos de React.
  useEffect(() => {
    const tabla = refTabla.current
    if (!tabla) return
    const abrir = (e) => {
      const fila = e.target.closest?.('tr[data-idbien]')
      if (!fila || !tabla.contains(fila)) return
      const bien = datos.find(d => String(d.idbien) === fila.dataset.idbien)
      if (!bien) return
      e.preventDefault()
      setMenuFila({ x: e.clientX, y: e.clientY, bien })
    }
    tabla.addEventListener('contextmenu', abrir, true)
    return () => tabla.removeEventListener('contextmenu', abrir, true)
  }, [datos])

  const hayFiltros = busqueda || filtroBien || areasSelec.length > 0 || filtroEstado !== 'Todos'
  const esVehiculo = modo === 'vehiculos' || modo === 'maquinaria'
  const datosFiltrados = datos

  function toggleSeleccion(b) {
    setSeleccionados(prev => { const n = new Map(prev); n.has(b.idbien) ? n.delete(b.idbien) : n.set(b.idbien, b); return n })
  }
  function toggleModoSeleccion() {
    setModoSeleccion(m => { if (m) setSeleccionados(new Map()); return !m })
  }
  const idsPagina  = datosFiltrados.map(d => d.idbien)
  const todosEnPag = idsPagina.length > 0 && idsPagina.every(id => seleccionados.has(id))
  const algunoEnPag = idsPagina.some(id => seleccionados.has(id))
  function toggleTodosPagina() {
    setSeleccionados(prev => {
      const n = new Map(prev)
      if (todosEnPag) datosFiltrados.forEach(b => n.delete(b.idbien))
      else            datosFiltrados.forEach(b => n.set(b.idbien, b))
      return n
    })
  }

  // Confirma la solicitud de baja (1 o varios) y guarda la fecha de solicitud
  async function confirmarSolicitud(bienes) {
    const ids = bienes.map(b => b.idbien)
    await actualizarEstadoBienes(ids, 'SOLICITUD BAJA')
    setFechaBaja(ids, 'solicitud', hoyISO())
    setSeleccionados(new Map())
    setModoSeleccion(false)
    cargar(pagina)
  }

  function solicitarBaja()      { if (seleccionados.size > 0) setModalSolicitar([...seleccionados.values()]) }
  function solicitarBajaUno(b)  { setModalSolicitar([b]) }

  const bg   = dark ? 'linear-gradient(145deg,#111113 0%,#1c1c1e 50%,#222224 100%)' : 'linear-gradient(145deg,#e0e0e2 0%,#ebebed 50%,#e4e4e6 100%)'
  const card = { background: t.cardBg, border: `1px solid ${t.cardBorder}`, backdropFilter: t.cardBlur, WebkitBackdropFilter: t.cardBlur, borderRadius: '14px' }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: bg }}>
      <Sidebar user={user} active={papelera ? 'papelera' : traspasos ? 'traspasos' : 'bienes'} onNavigate={onNavigate} />

      <main style={{ flex: 1, marginLeft: sidebarOpen ? '230px' : '72px', padding: '2rem 1.25rem', overflowY: 'auto', overflowX: 'hidden', minWidth: 0, transition: 'margin-left 0.25s cubic-bezier(0.4,0,0.2,1)' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 600, color: t.text1, marginBottom: '4px' }}>{papelera ? 'Papelera' : traspasos ? 'Traspasos' : 'Bienes Muebles'}</h1>
            <p style={{ fontSize: '14px', color: t.text3 }}>
              {papelera ? 'Bienes capturados por error · ' : traspasos ? 'Bienes traspasados · ' : 'Inventario Municipal · '}{loading ? 'Cargando…' : `${totalRegistros.toLocaleString()} registros`}
            </p>
          </div>
          {!papelera && !traspasos && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {/* Actúa sobre un área completa, por eso va aquí y no en la barra
                  de acciones, que trabaja sobre los registros seleccionados. */}
              <button onClick={() => setModalTitularArea(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: '10px', background: t.cardBg, border: `1px solid ${t.cardBorder}`, backdropFilter: 'blur(10px)', fontSize: '14px', fontWeight: 500, color: t.text1, fontFamily: 'inherit', cursor: 'pointer' }}>
                <i className="ti ti-users-group" style={{ fontSize: '18px' }} />Titular del área
              </button>
              <button onClick={() => setModalNuevo(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: '10px', background: t.cardBg, border: `1px solid ${t.cardBorder}`, backdropFilter: 'blur(10px)', fontSize: '14px', fontWeight: 500, color: t.text1, fontFamily: 'inherit', cursor: 'pointer' }}>
                <i className="ti ti-circle-plus" style={{ fontSize: '18px' }} />Nuevo bien
              </button>
            </div>
          )}
        </div>

        {/* Filtros */}
        <div className="barra-fit" style={{ ...card, padding: '1rem 1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap', overflow: 'visible', position: 'relative', zIndex: 100 }}>
          <div style={{ ...searchBoxStyle(dark), flex: 1, minWidth: '180px' }}>
            <i className="ti ti-search" style={{ fontSize: '16px', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)', flexShrink: 0 }} />
            <input type="text" placeholder="Buscar por nombre o clave..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', color: dark ? '#f0f0f0' : '#111', fontFamily: 'inherit' }} />
            {/* Para ir a la página de un bien se usa el clic derecho sobre su
                renglón: así se elige exactamente cuál, no la primera coincidencia. */}
            {ubicando && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0, fontSize: '12.5px',
                color: dark ? '#a8c5f8' : '#2563eb', whiteSpace: 'nowrap' }}>
                <i className="ti ti-loader-2" style={{ fontSize: '14px', animation: 'spin 1s linear infinite' }} />Buscando…
              </span>
            )}
            {busqueda && <button onClick={() => setBusqueda('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)', padding: 0, display: 'flex' }}><i className="ti ti-x" style={{ fontSize: '14px' }} /></button>}
          </div>

          {/* En traspasos no aplica el tipo de bien: todos llevan la categoría
              TRASPASOS. Quedan la búsqueda y el filtro de dependencia y área. */}
          {!traspasos && (
            <button onClick={() => setModalTipo(true)}
              style={{ ...searchBoxStyle(dark), minWidth: '200px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
              <i className={`ti ${MODOS.find(m => m.id === modo)?.icon || 'ti-category'}`} style={{ fontSize: '16px', color: dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: dark ? '#f0f0f0' : '#111' }}>
                {MODOS.find(m => m.id === modo)?.label || 'Categoría'}
              </span>
              <i className="ti ti-chevron-down" style={{ fontSize: '14px', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)', flexShrink: 0 }} />
            </button>
          )}

          <GroupedAreaSelector areas={allAreas} selected={areasSelec} onChange={setAreasSelec} dark={dark} />

          {!traspasos && (
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ ...sStyle(dark), width: 'auto' }}>
              {['Todos', 'Buen estado', 'Deteriorado', 'No verificado'].map(e => <option key={e}>{e}</option>)}
            </select>
          )}

        </div>

        {/* Barra de selección */}
        {/* Barra pegajosa: las acciones siguen visibles al bajar en la tabla.
            En la papelera no hay nada que operar en lote, así que no se muestra. */}
        {!papelera && (
        <div className="barra-fit" style={barraSticky(dark, t)} data-barra="acciones">
          <div onClick={toggleModoSeleccion}
            style={{ display:'flex', alignItems:'center', gap:'9px', padding:'9px 16px', borderRadius:'9px', fontSize:'14px', fontWeight:500, fontFamily:'inherit', cursor:'pointer', background: t.cardBg, border:`1px solid ${t.cardBorder}`, color:t.text1, backdropFilter:'blur(10px)', userSelect:'none', whiteSpace:'nowrap' }}>
            <div style={{ width:'17px', height:'17px', borderRadius:'5px', flexShrink:0, background: modoSeleccion ? (dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.78)') : 'transparent', border: dark ? '1.5px solid rgba(255,255,255,0.4)' : '1.5px solid rgba(0,0,0,0.3)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              {modoSeleccion && <i className="ti ti-check" style={{ fontSize:'11px', color: dark ? '#1c1c1e' : '#fff' }} />}
            </div>
            Seleccionar Registros
          </div>

          {modoSeleccion && (
            <span style={{ fontSize:'13px', color:t.text3 }}>
              {seleccionados.size === 0 ? 'Ningún registro seleccionado' : `${seleccionados.size} registro${seleccionados.size !== 1 ? 's' : ''} seleccionado${seleccionados.size !== 1 ? 's' : ''}`}
            </span>
          )}
          {modoSeleccion && seleccionados.size > 0 && (
            <button onClick={() => setSeleccionados(new Map())}
              style={{ display:'flex', alignItems:'center', gap:'6px', padding:'7px 12px', borderRadius:'8px', fontSize:'13px', fontFamily:'inherit', cursor:'pointer', background:'transparent', border:`1px solid ${t.cardBorder}`, color:t.text3 }}>
              <i className="ti ti-x" style={{ fontSize:'14px' }} />Limpiar
            </button>
          )}

          {/* Siempre visibles; se atenúan mientras no haya registros marcados.
              En traspasos solo se consulta y se reporta: resguardos y bajas
              trabajan sobre bienes vigentes. */}
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap', justifyContent:'flex-end' }}>
            {!traspasos && <>
              <button onClick={() => seleccionados.size > 0 && setModalResguardosLote([...seleccionados.values()])} disabled={seleccionados.size === 0}
                style={btnBarra(dark, t, seleccionados.size > 0)}>
                <i className="ti ti-file-text" style={{ fontSize:'17px' }} />
                {seleccionados.size > 1 ? `Resguardos (${seleccionados.size})` : 'Resguardo'}
              </button>
              <button onClick={solicitarBaja} disabled={seleccionados.size === 0}
                style={btnBarra(dark, t, seleccionados.size > 0)}>
                <i className="ti ti-circle-minus" style={{ fontSize:'17px' }} />Solicitar Baja
              </button>
            </>}
            <button onClick={() => setModalReporte(true)} style={btnBarra(dark, t, true)}>
              <i className="ti ti-file-export" style={{ fontSize:'17px' }} />Generar Reporte
            </button>
          </div>
        </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ ...card, padding: '1rem 1.25rem', marginBottom: '1rem', color: dark ? '#f4a1a1' : '#c0392b', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="ti ti-alert-circle" style={{ fontSize: '18px' }} />
            Error al cargar datos: {error}
          </div>
        )}

        {/* Tabla */}
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table ref={refTabla} style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}` }}>
                  {modoSeleccion && (
                    <th rowSpan={2} style={{ ...thBase(dark), width:'40px', minWidth:'40px', textAlign:'center' }}>
                      <div onClick={toggleTodosPagina} title={todosEnPag ? 'Deseleccionar página' : 'Seleccionar página'}
                        style={{ width:'17px', height:'17px', borderRadius:'5px', margin:'0 auto', cursor:'pointer', background: todosEnPag ? (dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.78)') : 'transparent', border: dark ? '1.5px solid rgba(255,255,255,0.4)' : '1.5px solid rgba(0,0,0,0.3)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        {todosEnPag && <i className="ti ti-check" style={{ fontSize:'11px', color: dark ? '#1c1c1e' : '#fff' }} />}
                        {!todosEnPag && algunoEnPag && <i className="ti ti-minus" style={{ fontSize:'11px', color: dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)' }} />}
                      </div>
                    </th>
                  )}
                  {/* En la papelera la clave ya no aplica: al restaurar se asigna una nueva */}
                  {!papelera && <th rowSpan={2} style={thBase(dark)}>CLAVE DE INVENTARIO</th>}
                  <th colSpan={esVehiculo ? 5 : 4} style={{ ...thBase(dark), textAlign: 'center', borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)', borderRight: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)', letterSpacing: '0.2em' }}>
                    D &nbsp; E &nbsp; S &nbsp; C &nbsp; R &nbsp; I &nbsp; P &nbsp; C &nbsp; I &nbsp; Ó &nbsp; N
                  </th>
                  <th rowSpan={2} style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>{traspasos ? 'ÁREA DE ORIGEN' : 'ÁREA DE ADSCRIPCIÓN'}</th>
                  <th rowSpan={2} style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>RESGUARDO A CARGO DE</th>
                  {/* En traspasos manda el movimiento: con qué oficio salió el
                      bien, cuándo y a dónde. Eso vive dentro de observaciones. */}
                  {traspasos && <>
                    <th rowSpan={2} style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>OFICIO</th>
                    <th rowSpan={2} style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>FECHA DE TRASPASO</th>
                    <th rowSpan={2} style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>MOVIMIENTO</th>
                  </>}
                  {!traspasos && <th rowSpan={2} style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>OBSERVACIONES</th>}
                  <th rowSpan={2} style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>IMPORTE</th>
                  <th rowSpan={2} style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>FACTURA</th>
                  {!traspasos && <>
                    <th rowSpan={2} style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>PROVEEDOR</th>
                    <th rowSpan={2} style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>FECHA FACTURA</th>
                    <th rowSpan={2} style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>PARTIDA</th>
                  </>}
                  <th rowSpan={2} style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>ACCIONES</th>
                </tr>
                <tr style={{ borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}` }}>
                  <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>NOMBRE DEL BIEN</th>
                  <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>MARCA</th>
                  {esVehiculo
                    ? <>
                        <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>AÑO</th>
                        <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>MODELO / PLACA</th>
                        <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>SERIE (VIN)</th>
                      </>
                    : <>
                        <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>TIPO</th>
                        <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>SERIE</th>
                      </>
                  }
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}` }}>
                        {Array.from({ length: (esVehiculo ? 14 : 13) + (modoSeleccion ? 1 : 0) }).map((_, j) => (
                          <td key={j} style={tdBase()}>
                            <div style={{ height: '14px', borderRadius: '6px', background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', animation: 'pulse 1.5s ease-in-out infinite', width: j === 1 ? '80%' : '60%' }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  : datosFiltrados.length === 0
                    ? <tr><td colSpan={15 + (modoSeleccion ? 1 : 0)} style={{ padding: '3rem', textAlign: 'center', color: t.text4 }}>
                        <i className="ti ti-search-off" style={{ fontSize: '28px', display: 'block', marginBottom: '8px' }} />
                        Sin resultados
                      </td></tr>
                    : datosFiltrados.map((b, i) => {
                        const sel = seleccionados.has(b.idbien)
                        // El que se acaba de ubicar va marcado en ámbar unos segundos
                        const marcado = b.idbien === resaltado
                        const bgFila = marcado
                          ? (dark ? 'rgba(168,197,248,0.18)' : 'rgba(37,99,235,0.10)')
                          : sel
                          ? (dark ? 'rgba(168,197,248,0.10)' : 'rgba(37,99,235,0.06)')
                          : (i % 2 === 0 ? 'transparent' : (dark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.015)'))
                        return (
                        <tr key={b.idbien}
                          data-idbien={b.idbien}
                          ref={marcado ? filaResaltada : null}
                          onClick={() => modoSeleccion && toggleSeleccion(b)}
                          style={{ borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`, background: bgFila, transition: 'background 0.35s', cursor: modoSeleccion ? 'pointer' : 'default',
                            boxShadow: marcado ? `inset 3px 0 0 ${dark ? '#a8c5f8' : '#2563eb'}` : 'none' }}
                          onMouseEnter={e => e.currentTarget.style.background = marcado ? bgFila : sel ? (dark ? 'rgba(168,197,248,0.16)' : 'rgba(37,99,235,0.1)') : (dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)')}
                          onMouseLeave={e => e.currentTarget.style.background = bgFila}
                        >
                          {modoSeleccion && (
                            <td style={{ ...tdBase(), textAlign:'center', verticalAlign:'middle' }}>
                              <div style={{ width:'17px', height:'17px', borderRadius:'5px', margin:'0 auto', background: sel ? (dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.78)') : 'transparent', border: dark ? '1.5px solid rgba(255,255,255,0.4)' : '1.5px solid rgba(0,0,0,0.3)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                {sel && <i className="ti ti-check" style={{ fontSize:'11px', color: dark ? '#1c1c1e' : '#fff' }} />}
                              </div>
                            </td>
                          )}
                          {!papelera && <td style={tdBase()}><span style={{ fontFamily: 'monospace', fontSize: '11px', color: t.text3 }}>{b.claveinventario || '—'}</span></td>}
                          <td style={{ ...tdBase(), width: '200px', maxWidth: '200px', overflowWrap: 'anywhere', wordBreak: 'break-word' }}><p style={{ color: t.text1, fontWeight: 500, lineHeight: 1.3 }}>{b.nombrebien}</p></td>
                          <td style={tdBase()}><span style={{ color: t.text2 }}>{b.marca || '—'}</span></td>
                          {esVehiculo
                            ? <>
                                <td style={tdBase()}><span style={{ color: t.text2 }}>{b.anio || '—'}</span></td>
                                <td style={tdBase()}><span style={{ color: t.text2 }}>{b.tipo || '—'}</span></td>
                                <td style={tdBase()}><span style={{ fontFamily: 'monospace', fontSize: '11px', color: t.text3 }}>{b.serie || '—'}</span></td>
                              </>
                            : <>
                                <td style={tdBase()}><span style={{ color: t.text2 }}>{b.tipo || '—'}</span></td>
                                <td style={tdBase()}><span style={{ fontFamily: 'monospace', fontSize: '11px', color: t.text3 }}>{b.serie || '—'}</span></td>
                              </>
                          }
                          <td style={{ ...tdBase(), width: '160px', maxWidth: '160px', overflowWrap: 'anywhere', wordBreak: 'break-word' }}><span style={{ color: t.text2, lineHeight: 1.3, display: 'block' }}>{b.area}</span></td>
                          <td style={{ ...tdBase(), width: '160px', maxWidth: '160px', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                            <p style={{ color: t.text2 }}>{b.resguardatario}</p>
                            <p style={{ color: t.text4, fontSize: '11px', marginTop: '2px' }}>{b.puesto}</p>
                          </td>
                          {traspasos && <>
                            <td style={{ ...tdBase(), whiteSpace: 'nowrap' }}><span style={{ fontFamily: 'monospace', fontSize: '11px', color: t.text2 }}>{oficioDeTraspaso(b.observaciones) || '—'}</span></td>
                            <td style={{ ...tdBase(), whiteSpace: 'nowrap' }}><span style={{ color: t.text3 }}>{fechaDeTraspaso(b.observaciones) || '—'}</span></td>
                            <td style={{ ...tdBase(), width: '230px', maxWidth: '230px', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                              <p title={b.observaciones} style={{ fontSize: '11px', color: t.text3, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{notaDeTraspaso(b.observaciones) || '—'}</p>
                            </td>
                          </>}
                          {!traspasos && (
                          <td style={{ ...tdBase(), width: '170px', maxWidth: '170px', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                            {(() => { const e = estadoInfo(b.observaciones, dark); return (
                              <span style={{ fontSize: '11px', fontWeight: 500, padding: '3px 8px', borderRadius: '20px', display: 'inline-block', marginBottom: '4px', background: e.bg, color: e.color, border: `1px solid ${e.color}44` }}>
                                {e.label}
                              </span>
                            ) })()}
                            <p title={b.observaciones} style={{ fontSize: '11px', color: t.text4, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{b.observaciones || '—'}</p>
                          </td>
                          )}
                          <td style={{ ...tdBase(), whiteSpace: 'nowrap' }}><span style={{ color: t.text2, fontWeight: 500 }}>{fmt(b.costoinicial)}</span></td>
                          <td style={tdBase()}><span style={{ color: t.text3, fontSize: '11px' }}>{b.numerofactura}</span></td>
                          {!traspasos && <>
                            <td style={tdBase()}><span style={{ color: t.text2 }}>{b.proveedor}</span></td>
                            <td style={{ ...tdBase(), whiteSpace: 'nowrap' }}><span style={{ color: t.text3 }}>{b.fechafactura}</span></td>
                            <td style={{ ...tdBase(), whiteSpace: 'nowrap' }}><span style={{ color: t.text3, fontSize: '11px' }}>{b.partida || '—'}</span></td>
                          </>}
                          <td style={tdBase()}>
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'nowrap' }}>
                              <button onClick={(e) => { e.stopPropagation(); setPanelBien(b) }}      title="Consultar"    style={btnAccion(dark, 'consulta')}  onMouseEnter={e => e.currentTarget.style.opacity='0.7'} onMouseLeave={e => e.currentTarget.style.opacity='1'}><i className="ti ti-eye"             style={{ fontSize: '14px' }} /></button>
                              {/* En la papelera solo se consulta y se restaura */}
                              {papelera && (
                                <button onClick={(e) => { e.stopPropagation(); setConfirmaRestaurar(b) }} title="Restaurar al inventario"
                                  style={btnAccion(dark, 'editar')} onMouseEnter={e => e.currentTarget.style.opacity='0.7'} onMouseLeave={e => e.currentTarget.style.opacity='1'}>
                                  <i className="ti ti-arrow-back-up" style={{ fontSize: '14px' }} />
                                </button>
                              )}
                              {!papelera && !traspasos && <>
                              <button onClick={(e) => { e.stopPropagation(); setModalEditar(b) }}    title="Modificar"    style={btnAccion(dark, 'editar')}    onMouseEnter={e => e.currentTarget.style.opacity='0.7'} onMouseLeave={e => e.currentTarget.style.opacity='1'}><i className="ti ti-pencil"          style={{ fontSize: '14px' }} /></button>
                              {/* Con varios bienes marcados abre el resguardo del lote,
                                  igual que el botón de arriba de la tabla. */}
                              <button onClick={(e) => { e.stopPropagation(); seleccionados.size > 1 ? setModalResguardosLote([...seleccionados.values()]) : setModalResguardo(b) }}
                                title={seleccionados.size > 1 ? `Resguardo de ${seleccionados.size} bienes` : 'Ver Resguardo'}
                                style={btnAccion(dark, 'resguardo')} onMouseEnter={e => e.currentTarget.style.opacity='0.7'} onMouseLeave={e => e.currentTarget.style.opacity='1'}><i className="ti ti-file-text"      style={{ fontSize: '14px' }} /></button>
                              <button onClick={(e) => { e.stopPropagation(); setModalTrasp(b) }}     title="Traspaso"     style={btnAccion(dark, 'traspaso')}  onMouseEnter={e => e.currentTarget.style.opacity='0.7'} onMouseLeave={e => e.currentTarget.style.opacity='1'}><i className="ti ti-arrows-exchange" style={{ fontSize: '14px' }} /></button>
                              <button onClick={(e) => { e.stopPropagation(); solicitarBajaUno(b) }}  title="Solicitar baja"  style={btnAccion(dark, 'baja')}     onMouseEnter={e => e.currentTarget.style.opacity='0.7'} onMouseLeave={e => e.currentTarget.style.opacity='1'}><i className="ti ti-circle-minus"    style={{ fontSize: '14px' }} /></button>
                              </>}
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
          <div className="pie-tabla" style={{ padding: '10px 14px', borderTop: `1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <p style={{ fontSize: '12px', color: t.text4 }}>
                {loading ? 'Cargando…' : `Mostrando ${totalRegistros === 0 ? 0 : pagina * porPagina + 1}–${Math.min((pagina + 1) * porPagina, totalRegistros)} de ${totalRegistros.toLocaleString()}`}
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
              <button onClick={() => cargar(pagina - 1)} disabled={pagina === 0 || loading}
                style={{ width: '30px', height: '30px', borderRadius: '7px', background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.12)', cursor: pagina === 0 ? 'not-allowed' : 'pointer', opacity: pagina === 0 ? 0.4 : 1, color: t.text1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="ti ti-chevron-left" style={{ fontSize: '14px' }} />
              </button>
              <span style={{ fontSize: '13px', color: t.text2, display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                Pág.
                {/* Selector de página: evita teclear y saber de memoria cuántas hay */}
                <select value={pagina} disabled={loading} aria-label="Ir a la página"
                  onChange={e => cargar(Number(e.target.value))}
                  style={{ ...sStyle(dark), width: 'auto', height: '28px', padding: '0 30px 0 9px', fontSize: '13px', backgroundPosition: 'right 8px center', backgroundSize: '13px 13px' }}>
                  {Array.from({ length: totalPaginas }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}
                </select>
                / {totalPaginas}
              </span>
              <button onClick={() => cargar(pagina + 1)} disabled={(pagina + 1) * porPagina >= totalRegistros || loading}
                style={{ width: '30px', height: '30px', borderRadius: '7px', background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.12)', cursor: (pagina + 1) * porPagina >= totalRegistros ? 'not-allowed' : 'pointer', opacity: (pagina + 1) * porPagina >= totalRegistros ? 0.4 : 1, color: t.text1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="ti ti-chevron-right" style={{ fontSize: '14px' }} />
              </button>
            </div>
          </div>
        </div>
      </main>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} } @keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} } input::placeholder { color: ${dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)'}; }`}</style>

      {menuFila && (
        <MenuFila menu={menuFila} onClose={() => setMenuFila(null)} dark={dark} t={t}
          acciones={[
            { icon: 'ti-map-pin', label: 'Ir a página',   accion: () => irAlBien(menuFila.bien) },
            { icon: 'ti-eye',     label: 'Consultar',     accion: () => setPanelBien(menuFila.bien) },
            { icon: 'ti-pencil',  label: 'Modificar',     accion: () => setModalEditar(menuFila.bien), visible: !papelera && !traspasos },
            { icon: 'ti-file-text', label: 'Ver resguardo', accion: () => setModalResguardo(menuFila.bien), visible: !papelera && !traspasos },
            { icon: 'ti-arrows-exchange', label: 'Traspaso', accion: () => setModalTrasp(menuFila.bien), visible: !papelera && !traspasos },
            { icon: 'ti-circle-minus', label: 'Solicitar baja', accion: () => solicitarBajaUno(menuFila.bien), visible: !papelera && !traspasos, separador: true },
            { icon: 'ti-arrow-back-up', label: 'Restaurar al inventario', accion: () => setConfirmaRestaurar(menuFila.bien), visible: papelera, separador: true },
          ]} />
      )}
      {confirmaRestaurar && (
        <ModalConfirmaBien bien={confirmaRestaurar} accion="restaurar" dark={dark} t={t}
          onClose={() => setConfirmaRestaurar(null)}
          areas={allAreas}
          onConfirm={async (idarea) => { await restaurarDePapelera(confirmaRestaurar, idarea); cargar(pagina) }} />
      )}
      {panelBien      && <PanelConsulta  bien={panelBien}      onClose={() => setPanelBien(null)}      t={t} dark={dark} />}
      {modalEditar    && <ModalEditar    bien={modalEditar}    onClose={() => setModalEditar(null)}    t={t} dark={dark} onSaved={() => cargar(pagina)} />}
      {modalResguardo && <ModalResguardo bien={modalResguardo} onClose={() => setModalResguardo(null)} t={t} dark={dark} />}
      {modalResguardosLote && <ModalResguardosLote bienes={modalResguardosLote} onClose={() => setModalResguardosLote(null)} t={t} dark={dark} />}
      {modalTrasp     && <ModalTraspaso  bien={modalTrasp}     onClose={() => setModalTrasp(null)}     onDone={() => cargar(pagina)} dark={dark} t={t} allAreas={allAreas} />}
      {modalReporte   && <ModalReporteMuebles
        onClose={() => setModalReporte(false)}
        dark={dark} t={t}
        modo={modo}
        traspasos={traspasos}
        seleccionados={[...seleccionados.keys()]}
        filtros={{ modo, busqueda, filtroBien, filtroEstado, filtroAreaIds: areasSelec, traspasos }}
        totalFiltrados={totalRegistros}
      />}
      {modalSolicitar && <ModalSolicitarBaja
        bienes={modalSolicitar}
        onClose={() => setModalSolicitar(null)}
        dark={dark} t={t}
        onConfirm={() => confirmarSolicitud(modalSolicitar)}
      />}
      {modalTipo && <ModalTipoFilter
        modo={modo}
        onSelect={(id) => { setModo(id); setModalTipo(false) }}
        onClose={() => setModalTipo(false)} dark={dark} t={t}
      />}
      {modalTitularArea && <ModalTitularArea
        allAreas={allAreas} dark={dark} t={t}
        onHecho={() => cargar(pagina)}
        onClose={() => setModalTitularArea(false)}
      />}
      {modalNuevo && <ModalNuevoBien
        modo={modo} allAreas={allAreas} dark={dark} t={t}
        onCreated={(modoNuevo) => { if (modoNuevo !== modo) setModo(modoNuevo); else cargar(0) }}
        onClose={() => setModalNuevo(false)}
      />}
    </div>
  )
}