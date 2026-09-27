import { useState, useEffect, lazy, Suspense } from 'react'
import { ThemeProvider, useTheme } from './context/ThemeContext'
import Login from './pages/Login'
import { supabase } from './supabase'

// ── Pantallas bajo demanda ────────────────────────────────────────────────────
// Cada pantalla se descarga cuando hace falta, no todas al abrir la app. El
// celular ya no baja el código del escritorio —más de la mitad del paquete— y
// la computadora no baja el de la cámara. Justo después de entrar se precargan
// en segundo plano las del rol, así que el primer clic no se nota.
const cargas = {
  Dashboard:          () => import('./pages/Dashboard'),
  IndexDependencia:   () => import('./pages/IndexDependencia'),
  BienesMuebles:      () => import('./pages/BienesMuebles'),
  DashboardInmuebles: () => import('./pages/DashboardInmuebles'),
  BienesInmuebles:    () => import('./pages/BienesInmuebles'),
  Reportes:           () => import('./pages/Reportes'),
  ReportesInmuebles:  () => import('./pages/ReportesInmuebles'),
  Dependencias:       () => import('./pages/Dependencias'),
  Usuarios:           () => import('./pages/Usuarios'),
  Reconteo:           () => import('./pages/Reconteo'),
  AppMovil:           () => import('./movil/AppMovil'),
}
const Dashboard          = lazy(cargas.Dashboard)
const IndexDependencia   = lazy(cargas.IndexDependencia)
const BienesMuebles      = lazy(cargas.BienesMuebles)
const DashboardInmuebles = lazy(cargas.DashboardInmuebles)
const BienesInmuebles    = lazy(cargas.BienesInmuebles)
const Reportes           = lazy(cargas.Reportes)
const ReportesInmuebles  = lazy(cargas.ReportesInmuebles)
const Dependencias       = lazy(cargas.Dependencias)
const Usuarios           = lazy(cargas.Usuarios)
const Reconteo           = lazy(cargas.Reconteo)
const AppMovil           = lazy(cargas.AppMovil)

const PRECARGA_POR_ROL = {
  admin:           ['Dashboard', 'BienesMuebles', 'Reportes', 'Reconteo', 'Usuarios'],
  admin_inmuebles: ['DashboardInmuebles', 'BienesInmuebles', 'ReportesInmuebles'],
  dependencia:     ['IndexDependencia', 'BienesMuebles'],
}
function precargar(rol, esMovil) {
  const nombres = esMovil ? ['AppMovil'] : (PRECARGA_POR_ROL[rol] || [])
  const correr = () => nombres.forEach(n => cargas[n]?.().catch(() => {}))
  if ('requestIdleCallback' in window) window.requestIdleCallback(correr, { timeout: 2500 })
  else setTimeout(correr, 600)
}

// Lo que se ve mientras llega una pantalla: el mismo fondo, sin parpadeo
function Esperando() {
  const { t } = useTheme()
  return <div style={{ minHeight: '100vh', background: t.bg }} />
}
import { useEsMovil } from './movil/useEsMovil'
import { useRuta, irA, reemplazarRuta } from './rutas'
import { PAGINAS_POR_ROL, paginaInicio, cerrarSesion, sesionActual } from './auth'

function App() {
  const [user, setUser]         = useState(null)
  const [page, setPage]         = useState('login')
  const [navState, setNavState] = useState({})
  const [restaurando, setRestaurando] = useState(true)
  // Cambia al re-navegar a la misma página: fuerza a React a montarla de nuevo
  const [recarga, setRecarga] = useState(0)
  const esMovil = useEsMovil()
  const ruta = useRuta()
  // Áreas de la dependencia del usuario: es el corte que se aplica a todas sus
  // consultas. Mientras se leen, la lista va vacía y no se muestra nada ajeno.
  const [areasDeDependencia, setAreasDeDependencia] = useState([])
  const esDependencia = user?.rol === 'dependencia'

  useEffect(() => {
    if (!esDependencia || !user?.iddependencia) { setAreasDeDependencia([]); return }
    let vivo = true
    supabase.from('areas').select('idarea').eq('iddependencia', user.iddependencia)
      .then(({ data }) => { if (vivo) setAreasDeDependencia((data || []).map(a => a.idarea)) })
    return () => { vivo = false }
  }, [esDependencia, user?.iddependencia])

  // Al abrir/recargar la página, restaura la sesión guardada en el navegador
  useEffect(() => {
    sesionActual()
      .then(u => { if (u) { setUser(u); setPage(paginaInicio(u.rol)); precargar(u.rol, esMovil) } })
      .finally(() => setRestaurando(false))
  }, [])

  // La pantalla vive en la dirección (#/bienes, #/reportes). Antes vivía solo en
  // este estado: el botón Atrás del navegador salía del sistema en vez de
  // regresar, y no se podía compartir un enlace a un bien. La vista móvil lleva
  // sus propias direcciones (#/m/…, #/i/…), así que aquí no se tocan.
  useEffect(() => {
    if (!user || esMovil) return
    const permitidas = PAGINAS_POR_ROL[user.rol] || []
    const destino = ruta.pagina

    if (!destino) { reemplazarRuta(paginaInicio(user.rol)); return }
    // La dirección del QR: #/b/CLAVE abre el inventario buscando esa clave
    if (destino === 'b') {
      setNavState({ busqueda: ruta.params[0] || '' })
      setPage(user.rol === 'admin_inmuebles' ? 'inmuebles' : 'bienes')
      return
    }
    if (!permitidas.includes(destino)) { reemplazarRuta(paginaInicio(user.rol)); return }
    if (destino !== page) setPage(destino)
  }, [ruta.pagina, ruta.params[0], user, esMovil])

  function navigate(to, state = {}) {
    if (to === 'login') { cerrarSesion(); setUser(null); setNavState({}); setPage('login'); reemplazarRuta('login'); return }
    // Cada usuario solo puede entrar a las páginas permitidas por su rol
    const permitidas = PAGINAS_POR_ROL[user?.rol] || []
    if (!permitidas.includes(to)) return
    setNavState(state)
    setPage(to)
    // Volver a la misma página desde el menú debe reiniciarla (p. ej. salir de
    // "En proceso de desincorporación" y regresar al inicio de Reportes).
    if (to === page) setRecarga(r => r + 1)
    irA(to)
  }

  function handleLogin(u) {
    precargar(u.rol, esMovil)
    setUser(u)
    setNavState({})
    setPage(paginaInicio(u.rol))
    if (esMovil) reemplazarRuta(...(u.rol === 'admin_inmuebles' ? ['i', 'inicio'] : ['m', 'inicio']))
    else         reemplazarRuta(paginaInicio(u.rol))
  }

  return (
    <ThemeProvider>
      <Suspense fallback={<Esperando />}>
        {pantalla()}
      </Suspense>
    </ThemeProvider>
  )

  // Un solo ThemeProvider para toda la app: antes cada pantalla montaba el suyo,
  // así que navegar reiniciaba el tema y el menú lateral se volvía a abrir solo.
  function pantalla() {
    if (restaurando)                    return <div style={{ minHeight: '100vh' }} />
    if (!user || page === 'login')      return <Login onLogin={handleLogin} />
    // En el celular manda la vista móvil: barra de navegación abajo, tarjetas en
    // vez de tablas y el reconteo con la cámara. Es la herramienta de quien
    // administra el inventario, no de quien solo lo consulta: una dependencia no
    // entra ahí y se le dice por qué.
    if (esMovil && esDependencia)       return <SoloEscritorio user={user} onSalir={() => navigate('login')} />
    if (esMovil)                        return <AppMovil user={user} onSalir={() => navigate('login')} />
    if (page === 'dashboard')           return <Dashboard key={recarga}          user={user} onNavigate={navigate} />
    if (page === 'index-dep')           return <IndexDependencia key={recarga}   user={user} onNavigate={navigate} />
    // Una dependencia entra al mismo inventario, pero acotado a sus áreas y sin
    // poder tocar nada: consulta y descarga sus reportes.
    if (page === 'bienes')              return <BienesMuebles key={recarga}      user={user} onNavigate={navigate} initialModo={navState.modo || 'mobiliario'} initialAreaFilter={navState.areaIds || []} initialEstado={navState.estado || 'Todos'} initialBusqueda={navState.busqueda || ''} soloLectura={esDependencia}
      /* Mientras cargan las áreas se manda una imposible: así no alcanza a verse
         ni un renglón de otra dependencia. */
      areasPermitidas={esDependencia ? (areasDeDependencia.length ? areasDeDependencia : [-1]) : null} />
    if (page === 'dashboard-inmuebles') return <DashboardInmuebles key={recarga} user={user} onNavigate={navigate} />
    if (page === 'inmuebles')           return <BienesInmuebles key={recarga}    user={user} onNavigate={navigate} initialCatFilter={navState.catIds ?? []} abrirNuevo={!!navState.abrirNuevo} abrirReporte={!!navState.abrirReporte} />
    if (page === 'reportes')            return user.rol === 'admin_inmuebles' ? <ReportesInmuebles key={recarga} user={user} onNavigate={navigate} /> : <Reportes key={recarga} user={user} onNavigate={navigate} />
    // key propia: Papelera y Bienes Muebles son el mismo componente, y con la
    // misma key React reutilizaba la instancia y mostraba los datos del otro
    if (page === 'papelera')            return <BienesMuebles key={`papelera-${recarga}`} user={user} onNavigate={navigate} papelera />
    // Traspasos y bajas llevan el mismo corte por dependencia que el inventario:
    // sin él, una dependencia vería los movimientos de todas las demás.
    if (page === 'traspasos')           return <BienesMuebles key={`traspasos-${recarga}`} user={user} onNavigate={navigate} traspasos soloLectura={esDependencia}
      areasPermitidas={esDependencia ? (areasDeDependencia.length ? areasDeDependencia : [-1]) : null} />
    if (page === 'bajas')               return <BienesMuebles key={`bajas-${recarga}`} user={user} onNavigate={navigate} bajas soloLectura={esDependencia}
      areasPermitidas={esDependencia ? (areasDeDependencia.length ? areasDeDependencia : [-1]) : null} />
    if (page === 'dependencias')        return <Dependencias key={recarga}       user={user} onNavigate={navigate} />
    if (page === 'usuarios')            return <Usuarios key={recarga}           user={user} onNavigate={navigate} />
    // El reconteo se levanta desde el celular; aquí se consulta el historial
    if (page === 'reconteo')            return <Reconteo key={recarga}           user={user} onNavigate={navigate} />

    return <Login onLogin={handleLogin} />
  }
}

// Aviso para las cuentas de dependencia que abren el sistema desde un celular
function SoloEscritorio({ user, onSalir }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
      background: 'linear-gradient(145deg,#e0e0e2 0%,#ebebed 50%,#e4e4e6 100%)', fontFamily: 'inherit' }}>
      <div style={{ maxWidth: '380px', textAlign: 'center', background: '#fff', border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: '16px', padding: '2rem 1.5rem', boxShadow: '0 10px 40px rgba(0,0,0,0.08)' }}>
        <div style={{ width: '52px', height: '52px', margin: '0 auto 1rem', borderRadius: '14px', background: 'rgba(0,0,0,0.05)',
          border: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="ti ti-device-desktop" style={{ fontSize: '26px', color: '#333' }} />
        </div>
        <p style={{ fontSize: '17px', fontWeight: 600, color: '#111', marginBottom: '8px' }}>Entra desde una computadora</p>
        <p style={{ fontSize: '13.5px', color: 'rgba(0,0,0,0.55)', lineHeight: 1.6, marginBottom: '1.25rem' }}>
          La consulta del inventario de {user?.dependencia || 'tu dependencia'} y la descarga de reportes están
          hechas para pantalla grande. La versión de celular es para el personal que levanta el inventario.
        </p>
        <button onClick={onSalir}
          style={{ width: '100%', padding: '11px', borderRadius: '10px', background: 'rgba(0,0,0,0.04)',
            border: '1px solid rgba(0,0,0,0.1)', fontSize: '14px', fontWeight: 500, color: '#333',
            fontFamily: 'inherit', cursor: 'pointer' }}>
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}

export default App
