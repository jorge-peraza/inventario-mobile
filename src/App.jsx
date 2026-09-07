import { useState, useEffect } from 'react'
import { ThemeProvider } from './context/ThemeContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import IndexDependencia from './pages/IndexDependencia'
import BienesMuebles from './pages/BienesMuebles'
import DashboardInmuebles from './pages/DashboardInmuebles'
import BienesInmuebles from './pages/BienesInmuebles'
import Reportes from './pages/Reportes'
import ReportesInmuebles from './pages/ReportesInmuebles'
import Dependencias from './pages/Dependencias'
import Usuarios from './pages/Usuarios'
import Reconteo from './pages/Reconteo'
import AppMovil from './movil/AppMovil'
import { supabase } from './supabase'
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
      .then(u => { if (u) { setUser(u); setPage(paginaInicio(u.rol)) } })
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
    setUser(u)
    setNavState({})
    setPage(paginaInicio(u.rol))
    if (esMovil) reemplazarRuta(...(u.rol === 'admin_inmuebles' ? ['i', 'inicio'] : ['m', 'inicio']))
    else         reemplazarRuta(paginaInicio(u.rol))
  }

  if (restaurando)                    return <ThemeProvider><div style={{ minHeight: '100vh' }} /></ThemeProvider>
  if (!user || page === 'login')      return <ThemeProvider><Login onLogin={handleLogin} /></ThemeProvider>
  // En el celular manda la vista móvil: barra de navegación abajo, tarjetas en
  // vez de tablas y el reconteo con la cámara. Es la herramienta de quien
  // administra el inventario, no de quien solo lo consulta: una dependencia no
  // entra ahí y se le dice por qué.
  if (esMovil && esDependencia)       return <ThemeProvider><SoloEscritorio user={user} onSalir={() => navigate('login')} /></ThemeProvider>
  if (esMovil)                        return <ThemeProvider><AppMovil user={user} onSalir={() => navigate('login')} /></ThemeProvider>
  if (page === 'dashboard')           return <ThemeProvider><Dashboard key={recarga}          user={user} onNavigate={navigate} /></ThemeProvider>
  if (page === 'index-dep')           return <ThemeProvider><IndexDependencia key={recarga}   user={user} onNavigate={navigate} /></ThemeProvider>
  // Una dependencia entra al mismo inventario, pero acotado a sus áreas y sin
  // poder tocar nada: consulta y descarga sus reportes.
  if (page === 'bienes')              return <ThemeProvider><BienesMuebles key={recarga}      user={user} onNavigate={navigate} initialModo={navState.modo || 'mobiliario'} initialAreaFilter={navState.areaIds || []} initialEstado={navState.estado || 'Todos'} initialBusqueda={navState.busqueda || ''} soloLectura={esDependencia}
    /* Mientras cargan las áreas se manda una imposible: así no alcanza a verse
       ni un renglón de otra dependencia. */
    areasPermitidas={esDependencia ? (areasDeDependencia.length ? areasDeDependencia : [-1]) : null} /></ThemeProvider>
  if (page === 'dashboard-inmuebles') return <ThemeProvider><DashboardInmuebles key={recarga} user={user} onNavigate={navigate} /></ThemeProvider>
  if (page === 'inmuebles')           return <ThemeProvider><BienesInmuebles key={recarga}    user={user} onNavigate={navigate} initialCatFilter={navState.catIds ?? []} abrirNuevo={!!navState.abrirNuevo} abrirReporte={!!navState.abrirReporte} /></ThemeProvider>
  if (page === 'reportes')            return <ThemeProvider>{user.rol === 'admin_inmuebles' ? <ReportesInmuebles key={recarga} user={user} onNavigate={navigate} /> : <Reportes key={recarga} user={user} onNavigate={navigate} />}</ThemeProvider>
  // key propia: Papelera y Bienes Muebles son el mismo componente, y con la
  // misma key React reutilizaba la instancia y mostraba los datos del otro
  if (page === 'papelera')            return <ThemeProvider><BienesMuebles key={`papelera-${recarga}`} user={user} onNavigate={navigate} papelera /></ThemeProvider>
  if (page === 'traspasos')           return <ThemeProvider><BienesMuebles key={`traspasos-${recarga}`} user={user} onNavigate={navigate} traspasos /></ThemeProvider>
  if (page === 'dependencias')        return <ThemeProvider><Dependencias key={recarga}       user={user} onNavigate={navigate} /></ThemeProvider>
  if (page === 'usuarios')            return <ThemeProvider><Usuarios key={recarga}           user={user} onNavigate={navigate} /></ThemeProvider>
  // El reconteo se levanta desde el celular; aquí se consulta el historial
  if (page === 'reconteo')            return <ThemeProvider><Reconteo key={recarga}           user={user} onNavigate={navigate} /></ThemeProvider>

  return <ThemeProvider><Login onLogin={handleLogin} /></ThemeProvider>
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
