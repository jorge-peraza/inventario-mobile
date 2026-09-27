import { useTheme } from '../context/ThemeContext'

export default function ThemeToggle() {
  const { dark, toggle, t } = useTheme()

  return (
    <button
      onClick={toggle}
      title={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '7px', borderRadius: '9px',
        background: t.cardBg,
        border: `1px solid ${t.cardBorder}`,
        backdropFilter: 'blur(10px)',
        color: t.text3,
        transition: 'all 0.2s',
        cursor: 'pointer',
        flexShrink: 0,
      }}
      onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
    >
      <i className={`ti ${dark ? 'ti-sun' : 'ti-moon'}`} style={{ fontSize: '20px' }} />
    </button>
  )
}
