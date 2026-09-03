import { useEffect, useState } from 'react'
import './estilos.css'
import { useTheme } from '../context/ThemeContext'
import { useRuta, irA, reemplazarRuta, volver } from '../rutas'
import { InicioMuebles, BuscarBienes, FichaBien, ElegirArea, ListaReconteo, HistorialReconteos } from './PantallasMuebles'
import { Escaner } from './Escaner'
import { InicioInmuebles, BuscarInmuebles, FichaInmueble, ReportesInmueblesMovil } from './PantallasInmuebles'

// ── Armazón de la vista móvil ─────────────────────────────────────────────────
// Una sola pantalla a la vez, barra de navegación abajo y un botón "Más" para
// lo que no cabe en la barra, que es como funcionan las apps del celular.
// El reconteo con cámara existe nada más en bienes muebles; inmuebles usa la
// misma cáscara sin ese botón.

// Los colores salen del mismo tema del escritorio: así el celular se siente la
// misma aplicación y respeta el claro/oscuro guardado en la cuenta.
function variablesDelTema(t, dark) {
  return {
    '--fondo':        t.bg,
    '--tarjeta':      t.cardBg,
    '--borde':        t.cardBorder,
    '--borde-fuerte': dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)',
    '--texto-1':      t.text1,
    '--texto-2':      t.text2,
    '--texto-3':      t.text3,
    '--texto-4':      t.text4,
    // Las cajas de captura son las mismas del escritorio (searchBoxStyle)
    '--campo':        dark ? '#2a2a2c' : '#ffffff',
    '--barra':        t.sidebarBg,
    '--ok':           t.colorGreen,
    '--ok-suave':     dark ? 'rgba(126,232,162,0.14)' : 'rgba(22,163,74,0.10)',
    '--falta':        t.colorYellow,
    '--falta-suave':  dark ? 'rgba(255,213,128,0.14)' : 'rgba(217,119,6,0.10)',
    '--alerta':       t.colorRed,
    '--alerta-suave': dark ? 'rgba(244,161,161,0.14)' : 'rgba(220,38,38,0.09)',
    '--sombra':       dark ? '0 6px 20px rgba(0,0,0,0.35)' : '0 6px 20px rgba(0,0,0,0.07)',
  }
}

export default function AppMovil({ user, onSalir }) {
  const ruta = useRuta()
  const { dark, t } = useTheme()
  const [hoja, setHoja] = useState(false)

  const inmuebles = user?.rol === 'admin_inmuebles'
  const raiz = inmuebles ? 'i/inicio' : 'm/inicio'

  // Sin dirección o con una que no existe, se manda al inicio sin dejar rastro
  useEffect(() => {
    if (!ruta.pagina) reemplazarRuta(...raiz.split('/'))
  }, [ruta.pagina, raiz])

  const seccion = ruta.pagina                       // 'm' | 'i' | 'b'
  const sub     = ruta.params[0] || ''              // 'inicio' | 'bienes' | …
  const arg     = ruta.params[1] || ''              // idarea, clave, idcategoria

  // Qué pestaña de la barra se ve encendida
  const activa = seccion === 'b' ? (inmuebles ? 'inmuebles' : 'bienes') : sub

  function pantalla() {
    // La ficha por clave es la dirección del QR de la etiqueta: #/b/CLAVE
    if (seccion === 'b') {
      const clave = ruta.params[0] || ''
      return inmuebles
        ? <FichaInmueble clave={clave} />
        : <FichaBien clave={clave} usuario={user} />
    }

    if (inmuebles) {
      switch (sub) {
        case 'inmuebles': return <BuscarInmuebles />
        case 'cat':       return <BuscarInmuebles idcategoria={arg} />
        case 'reportes':  return <ReportesInmueblesMovil />
        default:          return <InicioInmuebles user={user} />
      }
    }

    switch (sub) {
      case 'bienes':    return <BuscarBienes />
      case 'traspasos': return <BuscarBienes lista="traspasos" />
      case 'papelera':  return <BuscarBienes lista="papelera" />
      case 'reconteo':  return arg ? <ListaReconteo idarea={arg} usuario={user} /> : <ElegirArea />
      case 'escanear':  return <Escaner idarea={arg} usuario={user} />
      case 'historial': return <HistorialReconteos />
      default:          return <InicioMuebles user={user} />
    }
  }

  // El escáner ocupa la pantalla completa: sin encabezado ni barra de abajo
  const pantallaLlena = !inmuebles && sub === 'escanear'

  const items = inmuebles
    ? [
        { id: 'inicio',    icono: 'ti-home',        texto: 'Inicio',    ir: () => irA('i', 'inicio') },
        { id: 'inmuebles', icono: 'ti-building',    texto: 'Inmuebles', ir: () => irA('i', 'inmuebles') },
        { id: 'buscar',    icono: 'ti-search',      texto: 'Buscar',    ir: () => irA('i', 'inmuebles'), principal: true },
        { id: 'reportes',  icono: 'ti-chart-bar',   texto: 'Reportes',  ir: () => irA('i', 'reportes') },
        { id: 'mas',       icono: 'ti-dots',        texto: 'Más',       ir: () => setHoja(true) },
      ]
    : [
        { id: 'inicio',    icono: 'ti-home',        texto: 'Inicio',   ir: () => irA('m', 'inicio') },
        { id: 'bienes',    icono: 'ti-armchair',    texto: 'Bienes',   ir: () => irA('m', 'bienes') },
        { id: 'reconteo',  icono: 'ti-scan',        texto: 'Reconteo', ir: () => irA('m', 'reconteo'), principal: true },
        { id: 'historial', icono: 'ti-history',     texto: 'Historial', ir: () => irA('m', 'historial') },
        { id: 'mas',       icono: 'ti-dots',        texto: 'Más',      ir: () => setHoja(true) },
      ]

  return (
    <div className="movil" style={variablesDelTema(t, dark)}>
      {pantalla()}

      {!pantallaLlena && (
        <nav className="movil-barra">
          {items.map(it => (
            <button key={it.id} onClick={it.ir}
              className={`${activa === it.id ? 'activo' : ''} ${it.principal ? 'principal' : ''}`}>
              <i className={`ti ${it.icono}`} />
              {it.texto}
            </button>
          ))}
        </nav>
      )}

      {hoja && (
        <HojaMas user={user} inmuebles={inmuebles} dark={dark}
          onCerrar={() => setHoja(false)} onSalir={onSalir} />
      )}
    </div>
  )
}

// ── Cabecera de cada pantalla ────────────────────────────────────────────────
export function Cabecera({ titulo, sub, atras = false, accion = null }) {
  return (
    <header className="encabezado">
      {atras && (
        <button className="icono-btn" onClick={volver} aria-label="Regresar">
          <i className="ti ti-chevron-left" />
        </button>
      )}
      <div className="titulo">
        <h1>{titulo}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {accion}
    </header>
  )
}

// ── Lo que no cabe en la barra ───────────────────────────────────────────────
// Son las mismas opciones del menú lateral del escritorio, en una hoja.
function HojaMas({ user, inmuebles, dark, onCerrar, onSalir }) {
  const { toggle } = useTheme()
  const ir = (...r) => { onCerrar(); irA(...r) }

  const opciones = inmuebles
    ? [
        { icono: 'ti-building',      texto: 'Bienes inmuebles',  al: () => ir('i', 'inmuebles') },
        { icono: 'ti-chart-bar',     texto: 'Reportes',          al: () => ir('i', 'reportes') },
      ]
    : [
        { icono: 'ti-armchair',        texto: 'Bienes muebles',   al: () => ir('m', 'bienes') },
        { icono: 'ti-arrows-exchange', texto: 'Traspasos',        al: () => ir('m', 'traspasos') },
        { icono: 'ti-trash',           texto: 'Papelera',         al: () => ir('m', 'papelera') },
        { icono: 'ti-history',         texto: 'Historial de reconteos', al: () => ir('m', 'historial') },
      ]

  return (
    <>
      <div className="movil-telon" onClick={onCerrar} />
      <div className="movil-hoja">
        <div className="asa" />
        <div style={{ padding: '0 16px 10px' }}>
          <p style={{ fontSize: '15px', fontWeight: 600 }}>{user?.nombre}</p>
          <p style={{ fontSize: '12.5px', color: 'var(--texto-3)' }}>
            {inmuebles ? 'Administrador · Bienes inmuebles' : 'Administrador · Bienes muebles'}
          </p>
        </div>
        {opciones.map(o => (
          <button key={o.texto} className="fila" onClick={o.al}>
            <i className={`ti ${o.icono}`} style={{ fontSize: '20px', color: 'var(--texto-3)' }} />
            <span className="crece nombre">{o.texto}</span>
            <i className="ti ti-chevron-right flecha" />
          </button>
        ))}
        <button className="fila" onClick={toggle}>
          <i className={`ti ti-${dark ? 'sun' : 'moon'}`} style={{ fontSize: '20px', color: 'var(--texto-3)' }} />
          <span className="crece nombre">{dark ? 'Tema claro' : 'Tema oscuro'}</span>
        </button>
        <button className="fila" onClick={() => { onCerrar(); onSalir?.() }}>
          <i className="ti ti-logout" style={{ fontSize: '20px', color: 'var(--alerta)' }} />
          <span className="crece nombre" style={{ color: 'var(--alerta)' }}>Cerrar sesión</span>
        </button>
      </div>
    </>
  )
}
