import { useState } from 'react'
import { ThemeProvider } from './context/ThemeContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import IndexDependencia from './pages/IndexDependencia'
import BienesMuebles from './pages/BienesMuebles'
import DashboardInmuebles from './pages/DashboardInmuebles'
import BienesInmuebles from './pages/BienesInmuebles'
import Reportes from './pages/Reportes'
import ReportesInmuebles from './pages/ReportesInmuebles'
import { PAGINAS_POR_ROL, paginaInicio, cerrarSesion } from './auth'

function App() {
  const [user, setUser]         = useState(null)
  const [page, setPage]         = useState('login')
  const [navState, setNavState] = useState({})

  function navigate(to, state = {}) {
    if (to === 'login') { cerrarSesion(); setUser(null); setNavState({}); setPage('login'); return }
    // Cada usuario solo puede entrar a las páginas permitidas por su rol
    const permitidas = PAGINAS_POR_ROL[user?.rol] || []
    if (!permitidas.includes(to)) return
    setNavState(state)
    setPage(to)
  }

  function handleLogin(u) {
    setUser(u)
    setNavState({})
    setPage(paginaInicio(u.rol))
  }

  if (!user || page === 'login')      return <ThemeProvider><Login onLogin={handleLogin} /></ThemeProvider>
  if (page === 'dashboard')           return <ThemeProvider><Dashboard          user={user} onNavigate={navigate} /></ThemeProvider>
  if (page === 'index-dep')           return <ThemeProvider><IndexDependencia   user={user} onNavigate={navigate} /></ThemeProvider>
  if (page === 'bienes')              return <ThemeProvider><BienesMuebles      user={user} onNavigate={navigate} initialModo={navState.modo || 'mobiliario'} initialAreaFilter={navState.areaIds || []} initialEstado={navState.estado || 'Todos'} /></ThemeProvider>
  if (page === 'dashboard-inmuebles') return <ThemeProvider><DashboardInmuebles user={user} onNavigate={navigate} /></ThemeProvider>
  if (page === 'inmuebles')           return <ThemeProvider><BienesInmuebles    user={user} onNavigate={navigate} initialCatFilter={navState.catIds ?? []} /></ThemeProvider>
  if (page === 'reportes')            return <ThemeProvider>{user.rol === 'admin_inmuebles' ? <ReportesInmuebles user={user} onNavigate={navigate} /> : <Reportes user={user} onNavigate={navigate} />}</ThemeProvider>

  return <ThemeProvider><Login onLogin={handleLogin} /></ThemeProvider>
}

export default App
