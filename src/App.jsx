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
import AppMovil from './movil/AppMovil'
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
  // vez de tablas y el reconteo con la cámara.
  if (esMovil)                        return <ThemeProvider><AppMovil user={user} onSalir={() => navigate('login')} /></ThemeProvider>
  if (page === 'dashboard')           return <ThemeProvider><Dashboard key={recarga}          user={user} onNavigate={navigate} /></ThemeProvider>
  if (page === 'index-dep')           return <ThemeProvider><IndexDependencia key={recarga}   user={user} onNavigate={navigate} /></ThemeProvider>
  if (page === 'bienes')              return <ThemeProvider><BienesMuebles key={recarga}      user={user} onNavigate={navigate} initialModo={navState.modo || 'mobiliario'} initialAreaFilter={navState.areaIds || []} initialEstado={navState.estado || 'Todos'} initialBusqueda={navState.busqueda || ''} /></ThemeProvider>
  if (page === 'dashboard-inmuebles') return <ThemeProvider><DashboardInmuebles key={recarga} user={user} onNavigate={navigate} /></ThemeProvider>
  if (page === 'inmuebles')           return <ThemeProvider><BienesInmuebles key={recarga}    user={user} onNavigate={navigate} initialCatFilter={navState.catIds ?? []} abrirNuevo={!!navState.abrirNuevo} abrirReporte={!!navState.abrirReporte} /></ThemeProvider>
  if (page === 'reportes')            return <ThemeProvider>{user.rol === 'admin_inmuebles' ? <ReportesInmuebles key={recarga} user={user} onNavigate={navigate} /> : <Reportes key={recarga} user={user} onNavigate={navigate} />}</ThemeProvider>
  // key propia: Papelera y Bienes Muebles son el mismo componente, y con la
  // misma key React reutilizaba la instancia y mostraba los datos del otro
  if (page === 'papelera')            return <ThemeProvider><BienesMuebles key={`papelera-${recarga}`} user={user} onNavigate={navigate} papelera /></ThemeProvider>
  if (page === 'traspasos')           return <ThemeProvider><BienesMuebles key={`traspasos-${recarga}`} user={user} onNavigate={navigate} traspasos /></ThemeProvider>
  if (page === 'dependencias')        return <ThemeProvider><Dependencias key={recarga}       user={user} onNavigate={navigate} /></ThemeProvider>

  return <ThemeProvider><Login onLogin={handleLogin} /></ThemeProvider>
}

export default App
