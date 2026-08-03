import Sidebar from '../components/Sidebar'
import { useTheme } from '../context/ThemeContext'

const modulos = [
  { icon: 'ti-armchair',  nombre: 'Bienes Muebles', desc: 'Consulta, registra altas y bajas de tu inventario', iconColor: (t) => t.text1 },
  { icon: 'ti-refresh',   nombre: 'Reconteo',        desc: 'Verificación física de bienes con código QR',       iconColor: () => '#ffd580' },
  { icon: 'ti-chart-bar', nombre: 'Reportes',         desc: 'Exporta tu inventario a PDF o Excel',               iconColor: () => '#a8c5f8' },
]

const resumen = [
  { label: 'Mis bienes',     value: '342', hint: 'activos en inventario',   icon: 'ti-box',         iconColor: (t) => t.text1 },
  { label: 'Altas este mes', value: '18',  hint: 'registradas por mi área', icon: 'ti-circle-plus', iconColor: () => '#7ee8a2' },
  { label: 'Pendientes',     value: '5',   hint: 'esperando autorización',  icon: 'ti-clock',       iconColor: () => '#ffd580' },
]

export default function IndexDependencia({ user, onNavigate }) {
  const { dark, t, sidebarOpen } = useTheme()

  const card = {
    background: t.cardBg,
    border: `1px solid ${t.cardBorder}`,
    backdropFilter: t.cardBlur,
    WebkitBackdropFilter: t.cardBlur,
    borderRadius: '14px',
    padding: '1.25rem',
  }

  const lightBg = 'linear-gradient(145deg, #e0e0e2 0%, #ebebed 50%, #e4e4e6 100%)'
  const darkBg  = 'linear-gradient(145deg, #111113 0%, #1c1c1e 50%, #222224 100%)'

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: dark ? darkBg : lightBg, transition: 'background 0.3s' }}>
      <Sidebar user={user} active="inicio" onNavigate={onNavigate} />

      <main style={{ flex: 1, marginLeft: sidebarOpen ? '230px' : '72px', padding: '2rem 1.25rem', transition: 'margin-left 0.25s cubic-bezier(0.4,0,0.2,1)' }}>

        <div style={{ marginBottom: '1.75rem' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 600, color: t.text1, marginBottom: '4px' }}>
            Bienvenido, <span style={{ color: t.text3 }}>{user.nombre}</span>
          </h1>
          <p style={{ fontSize: '14px', color: t.text3 }}>{user.dependencia} · 16 de mayo de 2025</p>
        </div>

        {/* Resumen */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '2rem' }}>
          {resumen.map((r, i) => (
            <div key={i} style={card}>
              <div style={{
                width: '42px', height: '42px', borderRadius: '11px',
                background: t.iconBox, border: `1px solid ${t.iconBoxBorder}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: '1rem',
              }}>
                <i className={`ti ${r.icon}`} style={{ fontSize: '22px', color: r.iconColor(t) }} />
              </div>
              <p style={{ fontSize: '34px', fontWeight: 600, color: t.text1, lineHeight: 1, marginBottom: '6px' }}>{r.value}</p>
              <p style={{ fontSize: '14px', fontWeight: 500, color: t.text2, marginBottom: '3px' }}>{r.label}</p>
              <p style={{ fontSize: '12px', color: t.text4 }}>{r.hint}</p>
            </div>
          ))}
        </div>

        {/* Módulos */}
        <p style={{ fontSize: '11px', fontWeight: 600, color: t.text4, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '10px' }}>
          Acciones rápidas
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
          {modulos.map((m, i) => (
            <button key={i} style={{
              ...card, display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', padding: '1.25rem',
              cursor: 'pointer', textAlign: 'left',
              transition: 'opacity 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: '11px', flexShrink: 0,
                  background: t.iconBox, border: `1px solid ${t.iconBoxBorder}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <i className={`ti ${m.icon}`} style={{ fontSize: '22px', color: m.iconColor(t) }} />
                </div>
                <div>
                  <p style={{ fontSize: '15px', fontWeight: 500, color: t.text1, marginBottom: '3px' }}>{m.nombre}</p>
                  <p style={{ fontSize: '12px', color: t.text4, lineHeight: 1.4 }}>{m.desc}</p>
                </div>
              </div>
              <i className="ti ti-chevron-right" style={{ fontSize: '18px', color: t.text4, flexShrink: 0 }} />
            </button>
          ))}
        </div>

      </main>
    </div>
  )
}
