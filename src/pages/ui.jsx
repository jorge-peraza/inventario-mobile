import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

// ── Estilos y piezas compartidas del escritorio ─────────────────────────────
// Campos, barras, botones de acción, encabezados de tabla y el menú del clic
// derecho: los usan muebles, inmuebles, reportes, reconteo y usuarios.
// Vivían dentro de BienesMuebles.jsx, así que cualquier pantalla que solo
// quería el estilo de una tabla descargaba también las 5,000 líneas de
// muebles —y el administrador de inmuebles, que nunca entra a muebles, las
// bajaba igual—. Aquí cuestan unos pocos kilobytes.

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

export function searchBoxStyle(dark) {
  return {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '9px 13px', borderRadius: '9px',
    background: dark ? '#2a2a2c' : '#ffffff',
    border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.18)',
  }
}

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

export function btnAccion(dark, tipo) {
  const c = {
    consulta:  { color: dark ? '#a8c5f8' : '#2563eb', bg: dark ? 'rgba(168,197,248,0.12)' : 'rgba(37,99,235,0.07)',   border: dark ? 'rgba(168,197,248,0.25)' : 'rgba(37,99,235,0.18)'   },
    editar:    { color: dark ? '#a8e6cf' : '#1e7e4a', bg: dark ? 'rgba(168,230,207,0.12)' : 'rgba(30,126,74,0.07)',   border: dark ? 'rgba(168,230,207,0.25)' : 'rgba(30,126,74,0.18)'   },
    resguardo: { color: dark ? '#c8a8f8' : '#6b21a8', bg: dark ? 'rgba(200,168,248,0.12)' : 'rgba(107,33,168,0.07)', border: dark ? 'rgba(200,168,248,0.25)' : 'rgba(107,33,168,0.18)' },
    traspaso:  { color: dark ? '#ffd580' : '#b7790a', bg: dark ? 'rgba(255,213,128,0.12)' : 'rgba(183,121,10,0.07)', border: dark ? 'rgba(255,213,128,0.25)' : 'rgba(183,121,10,0.18)' },
    baja:      { color: dark ? '#f4a1a1' : '#c0392b', bg: dark ? 'rgba(244,161,161,0.12)' : 'rgba(192,57,43,0.07)',  border: dark ? 'rgba(244,161,161,0.25)' : 'rgba(192,57,43,0.18)'  },
  }[tipo]
  return { width: '30px', height: '30px', borderRadius: '7px', background: c.bg, border: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: c.color }
}

export function thBase(dark) {
  return { padding: '9px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', verticalAlign: 'middle', background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }
}

export function tdBase() { return { padding: '10px 10px', verticalAlign: 'top' } }

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

// ── Control deslizable ──────────────────────────────────────────────────────
// Dos o más opciones en una sola pieza; el fondo de la elegida se desliza a la
// nueva. Se mueve con transform, que no vuelve a acomodar la página.
//   opciones: [{ id, label, icon?, total?, disabled? }]
// Con `total` cada opción enseña su número arriba del nombre.
export function Deslizable({ opciones, valor, onCambio, dark, t, style }) {
  const n = opciones.length
  const i = Math.max(0, opciones.findIndex(o => o.id === valor))
  const conTotal = opciones.some(o => o.total !== undefined)
  return (
    <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0,1fr))`, gap: '4px', padding: '4px',
      borderRadius: '12px', background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.035)', border: `1px solid ${t.cardBorder}`, ...style }}>
      <div aria-hidden style={{
        position: 'absolute', top: '4px', bottom: '4px', left: '4px',
        width: `calc((100% - 8px - ${(n - 1) * 4}px) / ${n})`,
        transform: `translateX(calc(${i} * (100% + 4px)))`,
        borderRadius: '9px', background: dark ? 'rgba(255,255,255,0.12)' : '#fff',
        border: `1px solid ${dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.08)'}`,
        boxShadow: dark ? 'none' : '0 1px 3px rgba(0,0,0,0.08)',
        // Misma duración y curva que el deslizamiento de Agregar imágenes: cuando el
        // deslizable cambia de página un modal, los dos se mueven juntos
        transition: 'transform 0.35s cubic-bezier(0.4,0,0.2,1)', willChange: 'transform',
      }} />
      {opciones.map(o => {
        const activo = o.id === valor
        return (
          <button key={o.id} type="button" className="opcion-deslizable" onClick={() => !o.disabled && onCambio(o.id)} disabled={o.disabled}
            style={{ position: 'relative', zIndex: 1, padding: conTotal ? '7px 6px' : '8px 10px', borderRadius: '9px', background: 'none', border: 'none',
              cursor: o.disabled ? 'not-allowed' : 'pointer', opacity: o.disabled ? 0.4 : 1, fontFamily: 'inherit',
              display: 'flex', flexDirection: conTotal ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: conTotal ? '1px' : '7px',
              fontSize: '13px', fontWeight: 500, whiteSpace: 'nowrap', color: activo ? t.text1 : t.text3, transition: 'color 0.2s' }}>
            {conTotal && <b style={{ fontSize: '16px', fontWeight: 600 }}>{o.total == null ? '—' : o.total.toLocaleString()}</b>}
            {!conTotal && o.icon && <i className={`ti ${o.icon}`} style={{ fontSize: '16px' }} />}
            <span style={conTotal ? { fontSize: '11.5px' } : undefined}>{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Título que sigue a las fechas ───────────────────────────────────────────
// Mientras nadie lo toca, el título se arma solo con el periodo elegido; en
// cuanto se escribe en él, se respeta lo escrito (aunque quede vacío).
export function useTituloAuto(auto) {
  const [propio, setPropio] = useState(null)
  return [propio ?? auto, setPropio]
}
