import { useEffect, useMemo, useRef, useState } from 'react'
import { Cabecera } from './AppMovil'
import { useTheme } from '../context/ThemeContext'
import { irA, volver } from '../rutas'
import { useBloquearScroll } from './useBloquearScroll'
import { areasConDependencia, bienesDeArea, bienPorClave, buscarBienes, actualizarBien, anotarObservacionEnBien, resumenInventario, TIPOS } from './datos'
import {
  abrirReconteo, reconteoAbierto, reconteo, listaReconteos, marcar, desmarcar,
  cerrarReconteo, borrarReconteo, resumen, fechaCorta, pendientes, marcarSubida,
} from './reconteo'
import { subirReconteo, subirAvance, subirPendientes, hayTablas, historialRemoto, detalleRemoto, ajenosRemotos, borrarRemoto } from './sincronizar'

const fmtDinero = n => (n ? '$ ' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—')

function Cargando({ texto = 'Cargando…' }) {
  return <div className="cargando"><i className="ti ti-loader-2 gira" />{texto}</div>
}

function Vacio({ icono = 'ti-search-off', texto }) {
  return <div className="vacio"><i className={`ti ${icono}`} />{texto}</div>
}

// Pregunta antes de algo que no se puede deshacer. Es la misma idea de los
// modales de confirmación del escritorio, en hoja.
function Confirmar({ titulo, detalle, textoOk, peligro, onOk, onCerrar }) {
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

// ── Dona de bienes por tipo ──────────────────────────────────────────────────
// La misma de la computadora, en el tamaño que cabe en un celular. Se dibuja
// con arcos SVG y no con una gráfica de librería: son nueve valores.
function arcoDona(cx, cy, rOut, rIn, a0, a1) {
  const p = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  const grande = (a1 - a0) > Math.PI ? 1 : 0
  const [x0, y0] = p(rOut, a0)
  const [x1, y1] = p(rOut, a1)
  const [x2, y2] = p(rIn, a1)
  const [x3, y3] = p(rIn, a0)
  return `M${x0} ${y0} A${rOut} ${rOut} 0 ${grande} 1 ${x1} ${y1} L${x2} ${y2} A${rIn} ${rIn} 0 ${grande} 0 ${x3} ${y3} Z`
}

const TONOS = {
  claro: ['#3a3a3c', '#5c5c5f', '#7c7c80', '#9a9a9d', '#b4b4b7', '#c6c6c9', '#d4d4d7', '#dedee1', '#e6e6e9'],
  oscuro: ['#f0f0f0', '#d2d2d4', '#bcbcbe', '#a2a2a4', '#88888a', '#727274', '#5a5a5c', '#4a4a4c', '#3c3c3e'],
}

function Dona({ tipos, total, oscuro }) {
  const paleta = oscuro ? TONOS.oscuro : TONOS.claro
  const suma = tipos.reduce((s, t) => s + t.total, 0) || 1
  let angulo = -Math.PI / 2

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
      <svg viewBox="0 0 120 120" style={{ width: '124px', height: '124px', flexShrink: 0 }}>
        {tipos.map((t, i) => {
          if (!t.total) return null
          const a0 = angulo
          const a1 = angulo + (t.total / suma) * Math.PI * 2
          angulo = a1
          return <path key={t.id} d={arcoDona(60, 60, 56, 36, a0, a1 - 0.012)} fill={paleta[i % paleta.length]} />
        })}
        <text x="60" y="57" textAnchor="middle" style={{ fontSize: '19px', fontWeight: 600, fill: 'var(--texto-1)' }}>
          {total.toLocaleString()}
        </text>
        <text x="60" y="72" textAnchor="middle" style={{ fontSize: '9px', fill: 'var(--texto-3)' }}>BIENES</text>
      </svg>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {tipos.filter(t => t.total > 0).slice(0, 6).map((t, i) => (
          <button key={t.id} onClick={() => irA('m', 'bienes', t.id)}
            style={{ display: 'flex', alignItems: 'center', gap: '7px', width: '100%', textAlign: 'left', padding: 0 }}>
            <span style={{ width: '9px', height: '9px', borderRadius: '3px', flexShrink: 0, background: paleta[i % paleta.length] }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--texto-2)' }}>{t.total.toLocaleString()}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Inicio ───────────────────────────────────────────────────────────────────
export function InicioMuebles({ user }) {
  const [abiertos, setAbiertos] = useState(() => listaReconteos().filter(r => !r.fin))
  const [resumenInv, setResumenInv] = useState(null)
  const { dark: oscuro } = useTheme()

  useEffect(() => {
    const alCambiar = () => setAbiertos(listaReconteos().filter(r => !r.fin))
    window.addEventListener('reconteo-cambiado', alCambiar)
    return () => window.removeEventListener('reconteo-cambiado', alCambiar)
  }, [])

  useEffect(() => { resumenInventario().then(setResumenInv).catch(console.error) }, [])

  const kpis = resumenInv ? [
    { label: 'Buen estado',   valor: resumenInv.bueno,        color: 'var(--ok)',     icono: 'ti-circle-check' },
    { label: 'Deteriorados',  valor: resumenInv.deteriorado,  color: 'var(--alerta)', icono: 'ti-alert-triangle' },
    { label: 'No verificados', valor: resumenInv.noVerificado, color: 'var(--falta)',  icono: 'ti-help-circle' },
  ] : []

  return (
    <>
      <Cabecera titulo="Bienes Muebles" sub={`Inventario Municipal · ${user?.nombre || ''}`} />
      <div className="contenido">
        {/* Resumen: el mismo que abre la computadora, en tarjetas */}
        <div className="tarjeta">
          {!resumenInv
            ? <Cargando texto="Leyendo el inventario…" />
            : <Dona tipos={resumenInv.porTipo} total={resumenInv.total} oscuro={oscuro} />}
        </div>

        {/* minmax(0,1fr) y no 1fr: con 1fr la columna no baja del ancho de su
            texto —"No verificados"— y las tarjetas se salían de la pantalla */}
        {resumenInv && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
            {kpis.map(k => (
              <div key={k.label} className="tarjeta" style={{ padding: '11px' }}>
                <i className={`ti ${k.icono}`} style={{ fontSize: '17px', color: k.color }} />
                <p style={{ fontSize: '18px', fontWeight: 600, lineHeight: 1.2, marginTop: '4px' }}>{k.valor.toLocaleString()}</p>
                <p style={{ fontSize: '10.5px', color: 'var(--texto-3)', lineHeight: 1.25 }}>{k.label}</p>
              </div>
            ))}
          </div>
        )}

        {abiertos.length > 0 && (
          <>
            <p className="etiqueta">Reconteo en curso</p>
            <div className="tarjeta plana">
              {abiertos.map(r => {
                const s = resumen(r)
                return (
                  <button key={r.id} className="fila" onClick={() => irA('m', 'reconteo', r.idarea)}>
                    <div className="crece">
                      <p className="nombre">{r.nombrearea}</p>
                      <p className="detalle">{s.encontrados} de {s.total} verificados · desde {fechaCorta(r.inicio)}</p>
                    </div>
                    <i className="ti ti-chevron-right flecha" />
                  </button>
                )
              })}
            </div>
          </>
        )}

        <p className="etiqueta">Qué quieres hacer</p>
        <div className="tarjeta plana">
          <button className="fila" onClick={() => irA('m', 'reconteo')}>
            <i className="ti ti-scan" style={{ fontSize: '22px', color: 'var(--texto-2)' }} />
            <div className="crece">
              <p className="nombre">Reconteo por área</p>
              <p className="detalle">Verificar bienes con la cámara</p>
            </div>
            <i className="ti ti-chevron-right flecha" />
          </button>
          <button className="fila" onClick={() => irA('m', 'bienes')}>
            <i className="ti ti-armchair" style={{ fontSize: '22px', color: 'var(--texto-2)' }} />
            <div className="crece">
              <p className="nombre">Bienes muebles</p>
              <p className="detalle">Buscar por nombre, clave o serie</p>
            </div>
            <i className="ti ti-chevron-right flecha" />
          </button>
          <button className="fila" onClick={() => irA('m', 'traspasos')}>
            <i className="ti ti-arrows-exchange" style={{ fontSize: '22px', color: 'var(--texto-2)' }} />
            <div className="crece">
              <p className="nombre">Traspasos</p>
              <p className="detalle">Bienes traspasados</p>
            </div>
            <i className="ti ti-chevron-right flecha" />
          </button>
          <button className="fila" onClick={() => irA('m', 'historial')}>
            <i className="ti ti-history" style={{ fontSize: '22px', color: 'var(--texto-2)' }} />
            <div className="crece">
              <p className="nombre">Historial de reconteos</p>
              <p className="detalle">Qué se contó y qué faltó</p>
            </div>
            <i className="ti ti-chevron-right flecha" />
          </button>
        </div>
      </div>
    </>
  )
}

// ── Listas de bienes: inventario, traspasos y papelera ───────────────────────
const TITULOS = {
  inventario: { titulo: 'Bienes Muebles', sub: 'Inventario Municipal' },
  traspasos:  { titulo: 'Traspasos',      sub: 'Bienes traspasados' },
  papelera:   { titulo: 'Papelera',       sub: 'Bienes capturados por error' },
}

// Los filtros se recuerdan: antes vivían en el estado de la pantalla y al
// entrar a un bien y regresar había que volver a ponerlos.
function filtroGuardado(lista) {
  try { return JSON.parse(localStorage.getItem('filtro-' + lista) || '{}') } catch { return {} }
}
function guardarFiltro(lista, filtro) {
  try { localStorage.setItem('filtro-' + lista, JSON.stringify(filtro)) } catch { /* modo privado */ }
}

export function BuscarBienes({ lista = 'inventario', tipoInicial = '' }) {
  const guardado = filtroGuardado(lista)
  const [texto, setTexto] = useState(guardado.texto || '')
  const [areas, setAreas] = useState([])
  const [areaSel, setAreaSel] = useState(guardado.areaSel || [])   // idarea marcadas
  const [tipo, setTipo] = useState(tipoInicial || guardado.tipo || '')
  const [hojaAreas, setHojaAreas] = useState(false)
  const [hojaTipos, setHojaTipos] = useState(false)
  const [datos, setDatos] = useState([])
  const [cargando, setCargando] = useState(false)

  useEffect(() => { areasConDependencia().then(setAreas).catch(console.error) }, [])
  useEffect(() => { guardarFiltro(lista, { texto, areaSel, tipo }) }, [lista, texto, areaSel, tipo])
  useEffect(() => { if (tipoInicial) setTipo(tipoInicial) }, [tipoInicial])

  useEffect(() => {
    if (!texto.trim() && areaSel.length === 0 && !tipo) { setDatos([]); return }
    setCargando(true)
    const tm = setTimeout(() => {
      buscarBienes(texto, { lista, areaIds: areaSel, tipo })
        .then(setDatos).catch(console.error).finally(() => setCargando(false))
    }, 400)
    return () => clearTimeout(tm)
  }, [texto, areaSel, tipo, lista])

  const cab = TITULOS[lista] || TITULOS.inventario
  const nombreArea = areaSel.length === 1
    ? areas.flatMap(d => d.areas).find(a => a.idarea === areaSel[0])?.nombrearea
    : `${areaSel.length} áreas`

  return (
    <>
      <Cabecera titulo={cab.titulo} sub={cab.sub} atras={lista !== 'inventario'} />
      <div className="contenido">
        <div className="buscador">
          <i className="ti ti-search" />
          <input value={texto} onChange={e => setTexto(e.target.value)}
            placeholder="Nombre, clave, marca o serie…" autoCorrect="off" />
          {texto && <button onClick={() => setTexto('')}><i className="ti ti-x" style={{ color: 'var(--texto-4)' }} /></button>}
        </div>

        {/* Los mismos filtros de la computadora: tipo de bien y dependencia */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '8px' }}>
          <button className="buscador" onClick={() => setHojaTipos(true)} style={{ textAlign: 'left', minWidth: 0 }}>
            <i className={`ti ${TIPOS.find(x => x.id === tipo)?.icon || 'ti-category'}`} />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              color: tipo ? 'var(--texto-1)' : 'var(--texto-4)' }}>
              {TIPOS.find(x => x.id === tipo)?.label || 'Todo tipo'}
            </span>
            {tipo
              ? <i className="ti ti-x" onClick={e => { e.stopPropagation(); setTipo('') }} style={{ color: 'var(--texto-4)' }} />
              : <i className="ti ti-chevron-down" style={{ color: 'var(--texto-4)' }} />}
          </button>

          <button className="buscador" onClick={() => setHojaAreas(true)} style={{ textAlign: 'left', minWidth: 0 }}>
            <i className="ti ti-building" />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              color: areaSel.length ? 'var(--texto-1)' : 'var(--texto-4)' }}>
              {areaSel.length === 0 ? 'Dependencia' : nombreArea}
            </span>
            {areaSel.length > 0
              ? <i className="ti ti-x" onClick={e => { e.stopPropagation(); setAreaSel([]) }} style={{ color: 'var(--texto-4)' }} />
              : <i className="ti ti-chevron-down" style={{ color: 'var(--texto-4)' }} />}
          </button>
        </div>

        {cargando && <Cargando texto="Buscando…" />}
        {!cargando && !texto.trim() && areaSel.length === 0 && !tipo && (
          <Vacio icono="ti-search" texto="Busca por texto, tipo o dependencia" />
        )}
        {!cargando && (texto.trim() || areaSel.length > 0 || tipo) && datos.length === 0 && <Vacio texto="Sin resultados" />}

        {datos.length > 0 && (
          <div className="tarjeta plana">
            {datos.map(b => (
              <button key={b.idbien} className="fila" onClick={() => irA('b', b.clave)}>
                <div className="crece">
                  <p className="clave">{b.clave}</p>
                  <p className="nombre">{b.nombre}</p>
                  <p className="detalle">{[b.marca, b.modelo].filter(Boolean).join(' · ') || 'Sin marca'}</p>
                  <p className="detalle">{b.area}</p>
                </div>
                <i className="ti ti-chevron-right flecha" />
              </button>
            ))}
          </div>
        )}
      </div>

      {hojaAreas && (
        <HojaAreas areas={areas} seleccion={areaSel}
          onElegir={ids => { setAreaSel(ids); setHojaAreas(false) }}
          onCerrar={() => setHojaAreas(false)} />
      )}

      {hojaTipos && (
        <HojaTipos tipo={tipo} onElegir={id => { setTipo(id); setHojaTipos(false) }}
          onCerrar={() => setHojaTipos(false)} />
      )}
    </>
  )
}

// Elegir el tipo de bien (mobiliario, cómputo, vehículos…)
function HojaTipos({ tipo, onElegir, onCerrar }) {
  useBloquearScroll()
  return (
    <>
      <div className="movil-telon" onClick={onCerrar} />
      <div className="movil-hoja">
        <div className="asa" />
        <div style={{ padding: '0 16px 8px' }}>
          <p style={{ fontSize: '16px', fontWeight: 600 }}>Tipo de bien</p>
        </div>
        <button className="fila" onClick={() => onElegir('')}>
          <i className="ti ti-category" style={{ fontSize: '20px', color: 'var(--texto-3)' }} />
          <span className="crece nombre">Todo tipo</span>
          {!tipo && <i className="ti ti-check" style={{ color: 'var(--texto-1)' }} />}
        </button>
        {TIPOS.map(x => (
          <button key={x.id} className="fila" onClick={() => onElegir(x.id)}>
            <i className={`ti ${x.icon}`} style={{ fontSize: '20px', color: 'var(--texto-3)' }} />
            <span className="crece nombre">{x.label}</span>
            {tipo === x.id && <i className="ti ti-check" style={{ color: 'var(--texto-1)' }} />}
          </button>
        ))}
      </div>
    </>
  )
}

// El selector de dependencias del escritorio, en hoja
function HojaAreas({ areas, seleccion, onElegir, onCerrar }) {
  useBloquearScroll()
  const [texto, setTexto] = useState('')
  const [abierta, setAbierta] = useState('')

  const filtradas = useMemo(() => {
    const q = texto.trim().toLowerCase()
    if (!q) return areas
    return areas
      .map(d => ({ ...d, areas: d.areas.filter(a => a.nombrearea.toLowerCase().includes(q) || d.nombre.toLowerCase().includes(q)) }))
      .filter(d => d.areas.length > 0)
  }, [areas, texto])

  return (
    <>
      <div className="movil-telon" onClick={onCerrar} />
      <div className="movil-hoja">
        <div className="asa" />
        <div style={{ padding: '0 16px 10px' }}>
          <p style={{ fontSize: '16px', fontWeight: 600, marginBottom: '10px' }}>Dependencias</p>
          <div className="buscador">
            <i className="ti ti-search" />
            <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar dependencia o área…" />
          </div>
        </div>
        <button className="fila" onClick={() => onElegir([])}>
          <span className="crece nombre">Todas las dependencias</span>
          {seleccion.length === 0 && <i className="ti ti-check" style={{ color: 'var(--texto-1)' }} />}
        </button>
        {filtradas.map(d => (
          <div key={d.nombre}>
            <button className="fila" onClick={() => setAbierta(abierta === d.nombre ? '' : d.nombre)}>
              <div className="crece">
                <p className="nombre">{d.nombre}</p>
                <p className="detalle">{d.areas.length} área{d.areas.length !== 1 ? 's' : ''} · {d.total.toLocaleString()} bienes</p>
              </div>
              <i className={`ti ti-chevron-${abierta === d.nombre || texto.trim() ? 'up' : 'down'} flecha`} />
            </button>
            {(abierta === d.nombre || texto.trim()) && d.areas.map(a => (
              <button key={a.idarea} className="fila" style={{ paddingLeft: '28px' }} onClick={() => onElegir([a.idarea])}>
                <div className="crece">
                  <p className="nombre" style={{ fontWeight: 400 }}>{a.nombrearea}</p>
                  <p className="detalle">{(a.total_bienes || 0).toLocaleString()} bienes</p>
                </div>
                {seleccion.includes(a.idarea) && <i className="ti ti-check" style={{ color: 'var(--texto-1)' }} />}
              </button>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

// ── Ficha de un bien (a donde lleva el QR) ───────────────────────────────────
// Los mismos campos que el panel de consulta de la computadora.
export function FichaBien({ clave }) {
  const [bien, setBien] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    setCargando(true)
    bienPorClave(clave).then(setBien).catch(console.error).finally(() => setCargando(false))
  }, [clave])

  const dato = (etq, valor) => (
    <div className="fila" key={etq}>
      <div className="crece">
        <p className="etiqueta">{etq}</p>
        <p className="nombre" style={{ fontWeight: 400 }}>{valor || '—'}</p>
      </div>
    </div>
  )

  return (
    <>
      <Cabecera titulo="Bien" sub={clave} atras
        accion={bien && (
          <button className="icono-btn" onClick={() => irA('m', 'editar', clave)} aria-label="Modificar">
            <i className="ti ti-pencil" />
          </button>
        )} />
      <div className="contenido">
        {cargando && <Cargando />}
        {!cargando && !bien && (
          <Vacio icono="ti-qrcode" texto={`No hay ningún bien con la clave ${clave}`} />
        )}
        {bien && (
          <>
            <div className="tarjeta">
              <p className="clave">{bien.clave}</p>
              <p style={{ fontSize: '17px', fontWeight: 600, lineHeight: 1.3, marginTop: '3px' }}>{bien.nombre}</p>
              <p style={{ fontSize: '13px', color: 'var(--texto-3)', marginTop: '4px' }}>{bien.area}</p>
            </div>
            <div className="tarjeta plana">
              {dato('Marca', bien.marca)}
              {dato('Tipo / Modelo', bien.modelo)}
              {dato('Serie', bien.serie)}
              {dato('Categoría', bien.categoria)}
              {dato('Área de adscripción', bien.area)}
              {dato('Resguardo a cargo de', bien.resguardante)}
              {dato('Puesto', bien.puesto)}
              {dato('Estado', bien.estado)}
              {dato('Factura', bien.factura)}
              {dato('Fecha de factura', bien.fechafactura)}
              {dato('Importe', fmtDinero(bien.importe))}
              {dato('Observaciones', bien.observaciones)}
            </div>
          </>
        )}
      </div>
    </>
  )
}

// ── Modificar un bien desde el celular ───────────────────────────────────────
// Solo los datos que se corrigen viendo el mueble enfrente. La factura, el área
// y el resguardo se quedan en la computadora: mueven claves y catálogos, y eso
// no se hace de paso en un pasillo.
export function EditarBien({ clave }) {
  const [bien, setBien] = useState(null)
  const [campos, setCampos] = useState({ nombre: '', marca: '', modelo: '', serie: '', observaciones: '' })
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setCargando(true)
    bienPorClave(clave)
      .then(b => {
        setBien(b)
        if (b) setCampos({
          nombre: b.nombre || '', marca: b.marca || '', modelo: b.modelo || '',
          serie: b.serie || '', observaciones: b.observaciones || '',
        })
      })
      .catch(e => setError(e.message))
      .finally(() => setCargando(false))
  }, [clave])

  async function guardar() {
    if (!bien) return
    setGuardando(true); setError(null)
    try {
      await actualizarBien(bien.idbien, campos)
      volver()
    } catch (e) { setError(e.message); setGuardando(false) }
  }

  const campo = (etq, llave, opciones = {}) => (
    <div key={llave}>
      <p className="etiqueta" style={{ marginBottom: '6px' }}>{etq}</p>
      {opciones.largo
        ? <textarea value={campos[llave]} onChange={e => setCampos(c => ({ ...c, [llave]: e.target.value }))}
            rows={4} placeholder={opciones.placeholder}
            style={{ width: '100%', padding: '11px 13px', borderRadius: '12px', background: 'var(--campo)',
              border: '1px solid var(--borde-fuerte)', color: 'var(--texto-1)', fontSize: '15px', outline: 'none', resize: 'vertical' }} />
        : <input value={campos[llave]} onChange={e => setCampos(c => ({ ...c, [llave]: e.target.value }))}
            placeholder={opciones.placeholder} autoCapitalize="characters" autoCorrect="off"
            style={{ width: '100%', padding: '11px 13px', borderRadius: '12px', background: 'var(--campo)',
              border: '1px solid var(--borde-fuerte)', color: 'var(--texto-1)', fontSize: '16px', outline: 'none' }} />}
    </div>
  )

  return (
    <>
      <Cabecera titulo="Modificar bien" sub={clave} atras />
      <div className="contenido">
        {cargando && <Cargando />}
        {!cargando && !bien && <Vacio icono="ti-qrcode" texto={`No hay ningún bien con la clave ${clave}`} />}
        {bien && (
          <>
            {campo('Nombre del bien', 'nombre')}
            {campo('Marca', 'marca')}
            {campo('Tipo / Modelo', 'modelo')}
            {campo('Serie', 'serie')}
            {campo('Observaciones', 'observaciones', { largo: true, placeholder: 'Agregar Comentarios.' })}

            <p className="detalle">
              El área, el resguardo y la factura se cambian desde la computadora.
            </p>

            {error && <div className="tarjeta" style={{ borderColor: 'var(--alerta)', color: 'var(--alerta)' }}>{error}</div>}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="boton suave" onClick={volver} disabled={guardando}>Cancelar</button>
              <button className="boton" onClick={guardar} disabled={guardando}>
                {guardando
                  ? <><i className="ti ti-loader-2 gira" style={{ fontSize: '17px' }} />Guardando…</>
                  : <><i className="ti ti-device-floppy" style={{ fontSize: '17px' }} />Guardar</>}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

// ── Elegir el área a recontar ────────────────────────────────────────────────
export function ElegirArea() {
  const [deps, setDeps] = useState([])
  const [cargando, setCargando] = useState(true)
  const [abierta, setAbierta] = useState('')
  const [texto, setTexto] = useState('')

  useEffect(() => {
    areasConDependencia().then(setDeps).catch(console.error).finally(() => setCargando(false))
  }, [])

  const filtradas = useMemo(() => {
    const q = texto.trim().toLowerCase()
    if (!q) return deps
    return deps
      .map(d => ({ ...d, areas: d.areas.filter(a => a.nombrearea.toLowerCase().includes(q) || d.nombre.toLowerCase().includes(q)) }))
      .filter(d => d.areas.length > 0)
  }, [deps, texto])

  return (
    <>
      <Cabecera titulo="Reconteo" sub="Elige el área que vas a contar" />
      <div className="contenido">
        <div className="buscador">
          <i className="ti ti-search" />
          <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Dependencia o área…" />
          {texto && <button onClick={() => setTexto('')}><i className="ti ti-x" style={{ color: 'var(--texto-4)' }} /></button>}
        </div>

        {cargando && <Cargando texto="Leyendo dependencias…" />}

        {filtradas.map(d => {
          const abiertaEsta = abierta === d.nombre || !!texto.trim()
          return (
            <div key={d.nombre} className="tarjeta plana">
              <button className="fila" onClick={() => setAbierta(abierta === d.nombre ? '' : d.nombre)}>
                <div className="crece">
                  <p className="nombre">{d.nombre}</p>
                  <p className="detalle">{d.areas.length} área{d.areas.length !== 1 ? 's' : ''} · {d.total.toLocaleString()} bienes</p>
                </div>
                <i className={`ti ti-chevron-${abiertaEsta ? 'up' : 'down'} flecha`} />
              </button>
              {abiertaEsta && d.areas.map(a => {
                const enCurso = reconteoAbierto(a.idarea)
                return (
                  <button key={a.idarea} className="fila" style={{ paddingLeft: '28px' }}
                    onClick={() => irA('m', 'reconteo', a.idarea)}>
                    <div className="crece">
                      <p className="nombre" style={{ fontWeight: 400 }}>{a.nombrearea}</p>
                      <p className="detalle">{(a.total_bienes || 0).toLocaleString()} bienes</p>
                    </div>
                    {enCurso && <span className="chip falta">En curso</span>}
                    <i className="ti ti-chevron-right flecha" />
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </>
  )
}

// ── El área: portada o lista, según haya reconteo abierto ────────────────────
export function ListaReconteo({ idarea, usuario }) {
  const [rc, setRc] = useState(() => reconteoAbierto(idarea))
  const [area, setArea] = useState(null)
  const [iniciando, setIniciando] = useState(false)
  const [error, setError] = useState(null)
  const [pestana, setPestana] = useState('faltan')
  const [texto, setTexto] = useState('')
  const [confirma, setConfirma] = useState(null)   // 'terminar' | 'cancelar'

  // Datos del área para la portada. No se abre ningún reconteo solo por entrar:
  // hay que decirlo, porque puede haberse equivocado de área.
  useEffect(() => {
    let vivo = true
    areasConDependencia()
      .then(deps => {
        if (!vivo) return
        for (const d of deps) {
          const a = d.areas.find(x => Number(x.idarea) === Number(idarea))
          if (a) { setArea({ ...a, dependencia: d.nombre }); return }
        }
      })
      .catch(e => vivo && setError(e.message))
    return () => { vivo = false }
  }, [idarea])

  useEffect(() => {
    const alCambiar = () => setRc(reconteoAbierto(idarea))
    window.addEventListener('reconteo-cambiado', alCambiar)
    return () => window.removeEventListener('reconteo-cambiado', alCambiar)
  }, [idarea])

  // Lo contado se va guardando en la base conforme avanza, no solo al cerrar:
  // el teléfono queda como respaldo para poder seguir sin señal.
  const yaSubidas = useRef(new Set())
  useEffect(() => {
    if (!rc) return
    const nuevas = Object.keys(rc.encontrados || {}).filter(c => !yaSubidas.current.has(c))
    const t = setTimeout(() => {
      subirAvance(rc, nuevas).then(ok => { if (ok) nuevas.forEach(c => yaSubidas.current.add(c)) })
        .catch(() => {})
    }, 2000)
    return () => clearTimeout(t)
  }, [rc])

  async function iniciar() {
    setIniciando(true); setError(null)
    try {
      const bienes = await bienesDeArea(idarea)
      setRc(abrirReconteo({
        idarea,
        nombrearea: area?.nombrearea || '',
        dependencia: area?.dependencia || '',
        bienes,
        usuario: usuario?.nombre,
      }))
    } catch (e) { setError(e.message) } finally { setIniciando(false) }
  }

  const s = resumen(rc)
  const sinSubir = pendientes(rc)

  // Reintenta escribir en el inventario las observaciones que no alcanzaron a
  // subir por falta de señal. Se dispara al recuperar conexión y con el botón.
  const [subiendo, setSubiendo] = useState(false)
  async function subirObservaciones() {
    if (!rc || subiendo) return
    setSubiendo(true)
    for (const p of pendientes(reconteo(rc.id))) {
      if (!p.bien?.idbien) continue
      try {
        await anotarObservacionEnBien(p.bien.idbien, p.observacion, new Date(p.fecha))
        marcarSubida(rc.id, p.clave)
      } catch { /* sigue pendiente */ }
    }
    setRc(reconteoAbierto(idarea))
    setSubiendo(false)
  }

  useEffect(() => {
    if (sinSubir.length === 0) return
    window.addEventListener('online', subirObservaciones)
    return () => window.removeEventListener('online', subirObservaciones)
  }, [sinSubir.length, rc?.id])

  const lista = useMemo(() => {
    if (!rc) return []
    const q = texto.trim().toUpperCase()
    return rc.esperados
      .map(e => ({ ...e, verificado: !!rc.encontrados[e.clave], nota: rc.encontrados[e.clave]?.observacion || '' }))
      .filter(e => (pestana === 'todos' ? true : pestana === 'ok' ? e.verificado : !e.verificado))
      .filter(e => !q || e.clave.includes(q) || (e.nombre || '').toUpperCase().includes(q))
  }, [rc, pestana, texto])

  // Los reconteos anteriores del área salen de la base, no del teléfono: así se
  // ven los que levantó otra persona y desaparecen los que se borraron desde la
  // computadora.
  const [historialArea, setHistorialArea] = useState([])
  useEffect(() => {
    let vivo = true
    historialRemoto({ idarea, limite: 5 })
      .then(filas => { if (vivo && filas) setHistorialArea(filas.filter(r => r.fin)) })
      .catch(() => {})
    return () => { vivo = false }
  }, [idarea, rc?.id])

  // ── Portada: todavía no hay reconteo abierto ──
  if (!rc) {
    return (
      <>
        <Cabecera titulo={area?.nombrearea || 'Área'} sub={area?.dependencia} atras />
        <div className="contenido">
          <div className="tarjeta">
            <p className="etiqueta">Bienes registrados en el área</p>
            <p style={{ fontSize: '30px', fontWeight: 600, lineHeight: 1.1, marginTop: '4px' }}>
              {(area?.total_bienes ?? 0).toLocaleString()}
            </p>
            <p className="detalle">Al iniciar se guarda esta lista tal como está hoy.</p>
          </div>

          {error && <div className="tarjeta" style={{ borderColor: 'var(--alerta)', color: 'var(--alerta)' }}>{error}</div>}

          <button className="boton" onClick={iniciar} disabled={iniciando || !area}>
            {iniciando
              ? <><i className="ti ti-loader-2 gira" style={{ fontSize: '18px' }} />Preparando la lista…</>
              : <><i className="ti ti-scan" style={{ fontSize: '19px' }} />Iniciar nuevo reconteo</>}
          </button>

          <button className="boton suave" onClick={() => irA('m', 'historial')}>
            <i className="ti ti-history" style={{ fontSize: '18px' }} />Ver historial
          </button>

          {historialArea.length > 0 && (
            <>
              <p className="etiqueta">Reconteos anteriores de esta área</p>
              <div className="tarjeta plana">
                {historialArea.slice(0, 4).map(r => (
                  <button key={r.idreconteo} className="fila" onClick={() => irA('m', 'historial')}>
                    <div className="crece">
                      <p className="nombre">{fechaCorta(r.inicio)}</p>
                      <p className="detalle">{r.encontrados} de {r.esperados} verificados</p>
                    </div>
                    <i className="ti ti-chevron-right flecha" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </>
    )
  }

  // ── Reconteo en curso ──
  return (
    <>
      <Cabecera titulo={rc.nombrearea || 'Área'} sub={rc.dependencia} atras
        accion={
          <button className="icono-btn" onClick={() => irA('m', 'escanear', idarea)} aria-label="Escanear">
            <i className="ti ti-scan" />
          </button>
        } />

      <div className="contenido">
        <div className="pestanas">
          <button className={pestana === 'todos' ? 'activo' : ''} onClick={() => setPestana('todos')}>
            <b>{s.total}</b>Todos
          </button>
          <button className={pestana === 'faltan' ? 'activo' : ''} onClick={() => setPestana('faltan')}>
            <b>{s.faltan}</b>Faltan
          </button>
          <button className={pestana === 'ok' ? 'activo' : ''} onClick={() => setPestana('ok')}>
            <b>{s.encontrados}</b>Verificados
          </button>
        </div>

        <button className="boton" onClick={() => irA('m', 'escanear', idarea)}>
          <i className="ti ti-scan" style={{ fontSize: '19px' }} />Escanear con la cámara
        </button>

        {s.ajenos > 0 && (
          <div className="tarjeta" style={{ borderColor: 'var(--falta)' }}>
            <p className="nombre" style={{ color: 'var(--falta)' }}>
              {s.ajenos} código{s.ajenos !== 1 ? 's' : ''} de otra área
            </p>
            <p className="detalle">{Object.keys(rc.ajenos).join(', ')}</p>
          </div>
        )}

        {/* Observaciones que se anotaron sin señal y no llegaron al inventario */}
        {sinSubir.length > 0 && (
          <div className="tarjeta" style={{ borderColor: 'var(--alerta)' }}>
            <p className="nombre" style={{ color: 'var(--alerta)' }}>
              {sinSubir.length} observación{sinSubir.length !== 1 ? 'es' : ''} sin guardar en el inventario
            </p>
            <p className="detalle">Se anotaron en el conteo pero no alcanzaron a subir. Se reintenta solo al recuperar señal.</p>
            <button className="boton suave" style={{ marginTop: '10px' }} onClick={subirObservaciones} disabled={subiendo}>
              {subiendo
                ? <><i className="ti ti-loader-2 gira" style={{ fontSize: '17px' }} />Subiendo…</>
                : <><i className="ti ti-cloud-upload" style={{ fontSize: '17px' }} />Reintentar</>}
            </button>
          </div>
        )}

        <div className="buscador">
          <i className="ti ti-search" />
          <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Filtrar esta lista…" autoCapitalize="characters" />
          {texto && <button onClick={() => setTexto('')}><i className="ti ti-x" style={{ color: 'var(--texto-4)' }} /></button>}
        </div>

        {lista.length === 0
          ? <Vacio icono={pestana === 'faltan' ? 'ti-circle-check' : 'ti-search-off'}
              texto={pestana === 'faltan' ? 'No falta ninguno por verificar' : 'Sin resultados'} />
          : (
            <div className="tarjeta plana">
              {lista.map(e => (
                <div key={e.clave} className="fila">
                  <button style={{ padding: 0 }}
                    onClick={() => (e.verificado ? desmarcar(rc.id, e.clave) : marcar(rc.id, e.clave, 'manual'))}
                    aria-label={e.verificado ? 'Quitar verificación' : 'Marcar como encontrado'}>
                    <span className={`marca ${e.verificado ? 'ok' : 'falta'}`}>
                      <i className={`ti ti-${e.verificado ? 'check' : 'question-mark'}`} />
                    </span>
                  </button>
                  <button className="crece" style={{ textAlign: 'left', padding: 0 }}
                    onClick={() => irA('b', e.clave)}>
                    <p className="clave">{e.clave}</p>
                    <p className="nombre">{e.nombre}</p>
                    {e.resguardante && e.resguardante !== '—' && <p className="detalle">{e.resguardante}</p>}
                    {e.nota && <p className="detalle" style={{ color: 'var(--falta)' }}>
                      <i className="ti ti-message-2" style={{ marginRight: '4px' }} />{e.nota}
                    </p>}
                  </button>
                </div>
              ))}
            </div>
          )}

        <button className="boton suave" onClick={() => setConfirma('terminar')}>
          <i className="ti ti-flag-check" style={{ fontSize: '18px' }} />Terminar reconteo
        </button>
        <button className="boton peligro" onClick={() => setConfirma('cancelar')}>
          <i className="ti ti-trash" style={{ fontSize: '18px' }} />Cancelar reconteo
        </button>
      </div>

      {confirma === 'terminar' && (
        <Confirmar
          titulo="¿Terminar el reconteo?"
          detalle={`Se cierra con ${s.encontrados} de ${s.total} verificados${s.faltan > 0 ? ` y ${s.faltan} sin encontrar` : ''}. Queda guardado en el historial y ya no se podrá seguir escaneando.`}
          textoOk="Sí, terminar"
          onOk={() => {
            const cerrado = cerrarReconteo(rc.id)
            // Al cerrarlo se sube a la base para que quede en el historial
            // compartido. Si no hay señal o las tablas no están, se reintenta
            // desde el historial: el conteo ya está guardado en el teléfono.
            subirReconteo(cerrado).catch(() => {})
            irA('m', 'historial')
          }}
          onCerrar={() => setConfirma(null)} />
      )}
      {confirma === 'cancelar' && (
        <Confirmar
          titulo="¿Cancelar el reconteo?"
          detalle="Se borra por completo, con todo lo que llevas verificado, y no queda en el historial. Úsalo si te equivocaste de área."
          textoOk="Sí, cancelar" peligro
          onOk={() => { borrarReconteo(rc.id); volver() }}
          onCerrar={() => setConfirma(null)} />
      )}
    </>
  )
}

// ── Historial ────────────────────────────────────────────────────────────────
// Es el mismo historial que se ve en la computadora, porque sale de la misma
// tabla: lo que se levantó desde cualquier teléfono y lo que se haya borrado
// desde la PC. El conteo en curso sigue en el teléfono hasta que se termina.
export function HistorialReconteos() {
  const [lista, setLista]     = useState([])
  const [cargando, setCargando] = useState(true)
  const [enLaBase, setEnLaBase] = useState(null)   // null = todavía no se sabe
  const [texto, setTexto]     = useState('')
  const [abierto, setAbierto] = useState('')
  const [borrar, setBorrar]   = useState(null)

  async function cargar() {
    setCargando(true)
    try {
      const hay = await hayTablas()
      setEnLaBase(hay)
      // Antes de leer se suben los conteos terminados que quedaron sin señal
      if (hay) await subirPendientes()
      const remoto = hay ? await historialRemoto({}) : null
      // Sin tablas o sin señal se enseña lo que hay en el teléfono, con la misma
      // forma que traen las filas de la base
      setLista(remoto || listaReconteos().map(r => {
        const t = resumen(r)
        return { idreconteo: r.id, idarea: r.idarea, nombrearea: r.nombrearea,
          dependencia: r.dependencia, usuario: r.usuario, inicio: r.inicio, fin: r.fin,
          esperados: t.total, encontrados: t.encontrados, _local: true }
      }))
    } catch { setLista([]) }
    finally { setCargando(false) }
  }

  useEffect(() => { cargar() }, [])
  useEffect(() => {
    const alCambiar = () => cargar()
    window.addEventListener('reconteo-cambiado', alCambiar)
    return () => window.removeEventListener('reconteo-cambiado', alCambiar)
  }, [])

  const filtrados = useMemo(() => {
    const q = texto.trim().toLowerCase()
    if (!q) return lista
    return lista.filter(r => [r.nombrearea, r.dependencia, r.usuario]
      .some(v => (v || '').toLowerCase().includes(q)))
  }, [lista, texto])

  return (
    <>
      <Cabecera titulo="Historial"
        sub={enLaBase === false ? 'Guardado solo en este equipo' : 'Reconteos del inventario'} />
      <div className="contenido">
        <div className="buscador">
          <i className="ti ti-search" />
          <input value={texto} onChange={e => setTexto(e.target.value)}
            placeholder="Buscar por área, dependencia o usuario…" />
          {texto && <button onClick={() => setTexto('')}><i className="ti ti-x" style={{ color: 'var(--texto-4)' }} /></button>}
        </div>

        {cargando && <Cargando />}
        {!cargando && filtrados.length === 0 && (
          <Vacio icono="ti-history" texto={lista.length === 0 ? 'Todavía no hay reconteos' : 'Sin resultados'} />
        )}

        {!cargando && filtrados.map(r => (
          <TarjetaReconteo key={r.idreconteo} r={r}
            abierta={abierto === r.idreconteo}
            onAbrir={() => setAbierto(abierto === r.idreconteo ? '' : r.idreconteo)}
            onBorrar={() => setBorrar(r)} />
        ))}
      </div>

      {borrar && (
        <Confirmar
          titulo="¿Borrar este reconteo del historial?"
          detalle={`Se quita el conteo de ${borrar.nombrearea} del ${fechaCorta(borrar.inicio)}. No se borra ningún bien y las observaciones siguen en el inventario; se pierde el registro del conteo, también para la computadora.`}
          textoOk="Sí, borrar" peligro
          onOk={async () => { await borrarRemoto(borrar.idreconteo).catch(() => {}); cargar() }}
          onCerrar={() => setBorrar(null)} />
      )}
    </>
  )
}

// Una tarjeta del historial: el resumen y, al abrirla, los bienes con los mismos
// tres estados que la computadora.
function TarjetaReconteo({ r, abierta, onAbrir, onBorrar }) {
  const [bienes, setBienes] = useState(null)
  const [ajenos, setAjenos] = useState([])
  const [pestana, setPestana] = useState('todos')

  useEffect(() => {
    if (!abierta || bienes) return
    let vivo = true
    ;(async () => {
      const filas = await detalleRemoto(r.idreconteo).catch(() => null)
      if (!vivo) return
      if (filas) { setBienes(filas); ajenosRemotos(r.idreconteo).then(a => vivo && setAjenos(a)) ; return }
      // Sin tablas: se arma con lo que tenga el teléfono
      const local = listaReconteos().find(x => x.id === r.idreconteo)
      setBienes(local ? local.esperados.map(e => ({
        idbien: e.idbien, clave: e.clave, nombre: e.nombre, resguardante: e.resguardante,
        encontrado: !!local.encontrados[e.clave],
        metodo: local.encontrados[e.clave]?.metodo || null,
        fecha: local.encontrados[e.clave]?.fecha || null,
        observacion: local.encontrados[e.clave]?.observacion || null,
      })) : [])
    })()
    return () => { vivo = false }
  }, [abierta])

  const total       = r.esperados || bienes?.length || 0
  const encontrados = bienes ? bienes.filter(b => b.encontrado).length : (r.encontrados || 0)
  const faltan      = Math.max(0, (bienes ? bienes.length : total) - encontrados)
  const conNota     = bienes ? bienes.filter(b => b.observacion).length : 0

  const lista = (bienes || []).filter(b =>
    pestana === 'todos' ? true : pestana === 'ok' ? b.encontrado : !b.encontrado)

  return (
    <div className="tarjeta plana">
      <button className="fila" onClick={onAbrir}>
        <div className="crece">
          <p className="nombre">{r.nombrearea}</p>
          <p className="detalle">{r.dependencia || '—'}</p>
          <p className="detalle">{fechaCorta(r.inicio)}{r.fin ? '' : ' · en curso'}{r.usuario ? ` · ${r.usuario}` : ''}</p>
          <p className="detalle" style={{ marginTop: '5px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <span className="chip ok">{encontrados} verificados</span>
            {faltan > 0 && <span className="chip falta">{faltan} faltan</span>}
            {conNota > 0 && <span className="chip falta">{conNota} con observación</span>}
          </p>
        </div>
        <i className={`ti ti-chevron-${abierta ? 'up' : 'down'} flecha`} />
      </button>

      {abierta && (
        <>
          {!bienes && <Cargando />}
          {bienes && (
            <>
              <div style={{ padding: '4px 12px 10px' }}>
                <div className="pestanas">
                  <button className={pestana === 'todos' ? 'activo' : ''} onClick={() => setPestana('todos')}>
                    <b>{bienes.length}</b>Todos
                  </button>
                  <button className={pestana === 'ok' ? 'activo' : ''} onClick={() => setPestana('ok')}>
                    <b>{encontrados}</b>Verificados
                  </button>
                  <button className={pestana === 'faltan' ? 'activo' : ''} onClick={() => setPestana('faltan')}>
                    <b>{faltan}</b>Faltan
                  </button>
                </div>
              </div>

              {lista.length === 0
                ? <div className="fila"><span className="detalle">
                    {pestana === 'faltan' ? 'Aparecieron todos los bienes del área.' : 'Sin bienes en esta lista.'}
                  </span></div>
                : lista.map(b => (
                    <button key={b.idbien} className="fila" onClick={() => irA('b', b.clave)}>
                      <span className={`marca ${b.encontrado ? 'ok' : 'falta'}`}>
                        <i className={`ti ti-${b.encontrado ? 'check' : 'question-mark'}`} />
                      </span>
                      <div className="crece">
                        <p className="clave">{b.clave}</p>
                        <p className="nombre" style={{ fontWeight: 400 }}>{b.nombre}</p>
                        {b.resguardante && b.resguardante !== '—' && <p className="detalle">{b.resguardante}</p>}
                        {b.observacion && <p className="detalle" style={{ color: 'var(--falta)' }}>
                          <i className="ti ti-message-2" style={{ marginRight: '4px' }} />{b.observacion}
                        </p>}
                      </div>
                    </button>
                  ))}

              {ajenos.length > 0 && (
                <div className="fila">
                  <i className="ti ti-alert-triangle" style={{ color: 'var(--alerta)' }} />
                  <div className="crece">
                    <p className="nombre">{ajenos.length} código{ajenos.length !== 1 ? 's' : ''} de otra área</p>
                    <p className="detalle">{ajenos.map(a => a.clave).join(', ')}</p>
                  </div>
                </div>
              )}

              {!r.fin && (
                <button className="fila" onClick={() => irA('m', 'reconteo', r.idarea)}>
                  <i className="ti ti-player-play" style={{ color: 'var(--texto-3)' }} />
                  <span className="crece nombre">Continuar este reconteo</span>
                </button>
              )}
              <button className="fila" onClick={onBorrar}>
                <i className="ti ti-trash" style={{ color: 'var(--alerta)' }} />
                <span className="crece nombre" style={{ color: 'var(--alerta)' }}>Borrar del historial</span>
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}
