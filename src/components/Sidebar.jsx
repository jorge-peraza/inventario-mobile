import { useTheme } from '../context/ThemeContext'

const NAV_MUEBLES = [
  { icon:'ti-layout-dashboard', label:'Inicio',         id:'inicio',    page:'dashboard' },
  { icon:'ti-armchair',         label:'Bienes Muebles', id:'bienes',    page:'bienes' },
  { icon:'ti-refresh',          label:'Reconteo',       id:'reconteo',  page:'reconteo',  disabled:true },
  { icon:'ti-chart-bar',        label:'Reportes',       id:'reportes',  page:'reportes' },
  { icon:'ti-clipboard-list',   label:'Auditoría',      id:'auditoria', page:'auditoria', disabled:true },
  { icon:'ti-users',            label:'Usuarios',       id:'usuarios',  page:'usuarios',  disabled:true },
]

const NAV_INMUEBLES = [
  { icon:'ti-layout-dashboard', label:'Inicio',           id:'inicio',    page:'dashboard-inmuebles' },
  { icon:'ti-building',         label:'Bienes Inmuebles', id:'inmuebles', page:'inmuebles' },
  { icon:'ti-chart-bar',        label:'Reportes',         id:'reportes',  page:'reportes' },
  { icon:'ti-users',            label:'Usuarios',         id:'usuarios',  page:'usuarios',  disabled:true },
]

const W_OPEN   = 230
const W_CLOSED = 72

export default function Sidebar({ user, active = 'inicio', onNavigate }) {
  const { dark, t, sidebarOpen, toggleSidebar } = useTheme()
  const w = sidebarOpen ? W_OPEN : W_CLOSED
  const navItems = user?.rol === 'admin_inmuebles' ? NAV_INMUEBLES : NAV_MUEBLES

  return (
    <aside style={{ width: w, height:'100vh', flexShrink:0, display:'flex', flexDirection:'column', position:'fixed', top:0, left:0, zIndex:100, overflow:'hidden', background:t.sidebarBg, borderRight:`1px solid ${t.sidebarBorder}`, backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', transition:'width 0.25s cubic-bezier(0.4,0,0.2,1)' }}>

      {/* Header */}
      <div style={{ padding:'1.25rem 1rem', borderBottom:`1px solid ${t.divider}`, display:'flex', alignItems:'center', justifyContent: sidebarOpen ? 'space-between' : 'center', gap:'10px', flexShrink:0, height:'68px' }}>
        {sidebarOpen && (
          <div style={{ display:'flex', alignItems:'center', gap:'10px', overflow:'hidden' }}>
            <div style={{ width:'36px', height:'36px', borderRadius:'10px', flexShrink:0, background:t.iconBox, border:`1px solid ${t.iconBoxBorder}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <i className="ti ti-building-community" style={{ fontSize:'18px', color:t.text1 }} />
            </div>
            <div>
              <p style={{ fontSize:'14px', fontWeight:600, color:t.text1, lineHeight:1.2, whiteSpace:'nowrap' }}>Inventarios</p>
              <p style={{ fontSize:'12px', color:t.text3, whiteSpace:'nowrap' }}>Nogales</p>
            </div>
          </div>
        )}
        <button onClick={toggleSidebar} style={{ flexShrink:0, width:'28px', height:'28px', borderRadius:'7px', background:t.navHover, border:`1px solid ${t.cardBorder}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:t.text3, transition:'all 0.15s' }}>
          <i className={`ti ${sidebarOpen ? 'ti-layout-sidebar-left-collapse' : 'ti-layout-sidebar-left-expand'}`} style={{ fontSize:'15px' }} />
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex:1, display:'flex', flexDirection:'column', padding: '0.5rem 0.75rem', gap:'2px', overflowY:'auto', overflowX:'hidden' }}>
        {navItems.map(item => {
          const isActive = active === item.id
          const off = !!item.disabled
          return (
            <button key={item.id}
              onClick={() => { if (!off && onNavigate) onNavigate(item.page) }}
              title={off ? 'Próximamente' : (!sidebarOpen ? item.label : undefined)}
              style={{ display:'flex', alignItems:'center', gap:'12px', padding:'11px 14px', justifyContent:'flex-start', fontSize:'14px', fontWeight:isActive?500:400, textAlign:'left', width:'100%', background:isActive?t.navActive:'transparent', border:`1px solid ${isActive?t.navActiveBorder:'transparent'}`, borderRadius:'10px', color:isActive?t.text1:t.text3, cursor: off ? 'not-allowed' : 'pointer', opacity: off ? 0.38 : 1, fontFamily:'inherit', transition:'background 0.15s, border-color 0.15s, color 0.15s', whiteSpace:'nowrap', overflow:'hidden' }}
              onMouseEnter={e=>{ if(!isActive && !off){e.currentTarget.style.background=t.navHover;e.currentTarget.style.color=t.text2;e.currentTarget.style.border=`1px solid ${t.navHoverBorder}`} }}
              onMouseLeave={e=>{ if(!isActive && !off){e.currentTarget.style.background='transparent';e.currentTarget.style.color=t.text3;e.currentTarget.style.border='1px solid transparent'} }}
            >
              <i className={`ti ${item.icon}`} style={{ fontSize:'20px', flexShrink:0, color:isActive?t.text1:t.text4 }} />
              <span style={{ opacity: sidebarOpen ? 1 : 0, maxWidth: sidebarOpen ? '200px' : '0px', overflow: 'hidden', transition: 'opacity 0.2s cubic-bezier(0.4,0,0.2,1), max-width 0.25s cubic-bezier(0.4,0,0.2,1)', pointerEvents: 'none', flexShrink: 0 }}>{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Usuario */}
      <div style={{ padding:'0.75rem 1rem 1rem', borderTop:`1px solid ${t.divider}`, flexShrink:0 }}>
        {sidebarOpen ? (
          <>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', background:t.userChip, border:`1px solid ${t.userChipBorder}`, borderRadius:'12px', padding:'10px 12px', marginBottom:'8px' }}>
              <div style={{ width:'34px', height:'34px', borderRadius:'50%', flexShrink:0, background:t.iconBox, border:`1px solid ${t.iconBoxBorder}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:600, color:t.text1 }}>{user.iniciales}</div>
              <div style={{ minWidth:0 }}>
                <p style={{ fontSize:'13px', fontWeight:500, color:t.text1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user.nombre}</p>
                <p style={{ fontSize:'11px', color:t.text3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user.rol === 'admin' ? 'Administrador' : user.dependencia}</p>
              </div>
            </div>
            <button onClick={() => onNavigate && onNavigate('login')} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', width:'100%', padding:'8px', background:'transparent', border:`1px solid ${t.divider}`, borderRadius:'8px', cursor:'pointer', fontSize:'13px', color:t.text3, fontFamily:'inherit', transition:'all 0.15s' }}
              onMouseEnter={e=>{e.currentTarget.style.color=t.text1;e.currentTarget.style.background=t.navHover}}
              onMouseLeave={e=>{e.currentTarget.style.color=t.text3;e.currentTarget.style.background='transparent'}}
            >
              <i className="ti ti-logout" style={{ fontSize:'16px' }} />Cerrar sesión
            </button>
          </>
        ) : (
          <>
            <div style={{ display:'flex', justifyContent:'center', marginBottom:'8px' }}>
              <div title={user.nombre} style={{ width:'34px', height:'34px', borderRadius:'50%', background:t.iconBox, border:`1px solid ${t.iconBoxBorder}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:600, color:t.text1 }}>{user.iniciales}</div>
            </div>
            <button title="Cerrar sesión" onClick={() => onNavigate && onNavigate('login')} style={{ display:'flex', alignItems:'center', justifyContent:'center', width:'100%', padding:'8px 0', background:'transparent', border:`1px solid ${t.divider}`, borderRadius:'8px', cursor:'pointer', color:t.text3, transition:'all 0.15s' }}
              onMouseEnter={e=>{e.currentTarget.style.color=t.text1;e.currentTarget.style.background=t.navHover}}
              onMouseLeave={e=>{e.currentTarget.style.color=t.text3;e.currentTarget.style.background='transparent'}}
            >
              <i className="ti ti-logout" style={{ fontSize:'16px' }} />
            </button>
          </>
        )}
      </div>
    </aside>
  )
}
