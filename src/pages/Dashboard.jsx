import { useState, useEffect } from 'react'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import { useTheme } from '../context/ThemeContext'
import { supabase } from '../supabase'

// Tipos (mismos que Bienes Muebles)
// Deben cubrir TODAS las categorías activas: si falta alguna, el total de la dona
// no cuadra con el total de bienes activos de la tarjeta.
const TIPOS = [
  { id: 'mobiliario', label: 'Mobiliario', icon: 'ti-armchair',      cats: ['MOBILIARIO'] },
  { id: 'computo',    label: 'Cómputo',    icon: 'ti-device-laptop', cats: ['EQUIPO DE COMPUTO', 'EQUIPO'] },
  { id: 'defensa',    label: 'Defensa y Seguridad', icon: 'ti-shield', cats: ['MAQUINARIA Y EQUIPO DE DEFENSA Y SEGURIDAD PUBLICA'] },
  { id: 'maquinaria', label: 'Maquinaria', icon: 'ti-bulldozer',     cats: ['MAQUINARIA'] },
  { id: 'vehiculos',  label: 'Vehículos',  icon: 'ti-car',           cats: ['VEHICULAR', 'VEHICULAR-MAQUINARIA', 'VEHICULAR-REMOLQUES-CARROCERIAS'] },
  { id: 'radiocomunicacion', label: 'Radiocomunicaciones', icon: 'ti-phone', cats: ['RADIOCOMUNICACION'] },
  { id: 'parquimetros',   label: 'Parquímetros',      icon: 'ti-clock',     cats: ['EQUIPO DE CONTROL TIEMPO PARQUI'] },
  { id: 'senalizaciones', label: 'Señalizaciones',    icon: 'ti-road-sign', cats: ['SEÑALIZACIONES'] },
  { id: 'arbolesplantas', label: 'Árboles y Plantas', icon: 'ti-tree',      cats: ['ARBOLES Y PLANTAS'] },
]
const CAT_A_MODO = {}
for (const t of TIPOS) for (const c of t.cats) CAT_A_MODO[c] = t.id

const TONOS_TIPO = {
  light: ['#3a3a3c', '#69696c', '#9a9a9d', '#c6c6c9'],
  dark:  ['#f0f0f0', '#bcbcbe', '#88888a', '#5a5a5c'],
}

// Genera el path de un segmento de dona
function arcoDona(cx, cy, rOut, rIn, a0, a1) {
  const p = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  const large = (a1 - a0) > Math.PI ? 1 : 0
  const [x0, y0] = p(rOut, a0)
  const [x1, y1] = p(rOut, a1)
  const [x2, y2] = p(rIn, a1)
  const [x3, y3] = p(rIn, a0)
  return `M${x0} ${y0} A${rOut} ${rOut} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${rIn} ${rIn} 0 ${large} 0 ${x3} ${y3} Z`
}

function clasificarEstado(obs) {
  const o = (obs || '').toLowerCase()
  if (o.includes('deteriorado') || o.includes('quebrado')) return 'deteriorado'
  if (o.includes('no verificado')) return 'noverificado'
  return 'bueno'
}

function fmt(n) {
  if (!n) return '$ —'
  if (n >= 1_000_000) return '$ ' + (n / 1_000_000).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' M'
  return '$ ' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 0 })
}

function useFecha() {
  const [fecha, setFecha] = useState('')
  useEffect(() => {
    function actualizar() {
      setFecha(new Date().toLocaleString('es-MX', {
        timeZone: 'America/Hermosillo',
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      }))
    }
    actualizar()
    const id = setInterval(actualizar, 60000)
    return () => clearInterval(id)
  }, [])
  return fecha
}

export default function Dashboard({ user, onNavigate }) {
  const { dark, t, sidebarOpen } = useTheme()
  const fecha = useFecha()

  const [stats, setStats]   = useState(null)
  const [tipos, setTipos]   = useState([])
  const [loading, setLoading] = useState(true)
  const [hoverTipo, setHoverTipo] = useState(null)

  useEffect(() => {
    async function cargar() {
      setLoading(true)
      try {
        const BATCH = 1000

        // Una sola pasada paginada sobre bienes activos
        let todos = [], desde = 0
        while (true) {
          const { data, error } = await supabase
            .from('bienes')
            .select('categoriainventario, observaciones, facturas ( costoinicial )')
            .eq('estadobien', 'ACTIVO')
            .range(desde, desde + BATCH - 1)
          if (error || !data || data.length === 0) break
          todos = [...todos, ...data]
          if (data.length < BATCH) break
          desde += BATCH
        }

        const total      = todos.length
        const valorTotal = todos.reduce((s, b) => s + (b.facturas?.costoinicial || 0), 0)
        let bueno = 0, deteriorado = 0, noverificado = 0
        const conteoTipo = {}
        for (const b of todos) {
          const est = clasificarEstado(b.observaciones)
          if (est === 'bueno') bueno++
          else if (est === 'deteriorado') deteriorado++
          else noverificado++
          const modo = CAT_A_MODO[b.categoriainventario]
          if (modo) conteoTipo[modo] = (conteoTipo[modo] || 0) + 1
        }

        setStats({ total, valorTotal, bueno, deteriorado, noverificado })

        const maxTipo = Math.max(1, ...TIPOS.map(t => conteoTipo[t.id] || 0))
        setTipos(TIPOS.map(t => ({ ...t, total: conteoTipo[t.id] || 0, pct: Math.round((conteoTipo[t.id] || 0) / maxTipo * 100) })))

      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    cargar()
  }, [])

  const card = {
    background: t.cardBg, border: `1px solid ${t.cardBorder}`,
    backdropFilter: t.cardBlur, WebkitBackdropFilter: t.cardBlur,
    borderRadius: '14px', padding: '1.25rem',
  }

  const lightBg = 'linear-gradient(145deg, #e0e0e2 0%, #ebebed 50%, #e4e4e6 100%)'
  const darkBg  = 'linear-gradient(145deg, #111113 0%, #1c1c1e 50%, #222224 100%)'

  const kpis = [
    { label: 'Total bienes',  icon: 'ti-box',           iconColor: t.text1,       value: loading ? '…' : stats?.total.toLocaleString() ?? '—',        hint: 'activos en inventario',   estado: 'Todos' },
    { label: 'Buen estado',   icon: 'ti-circle-check',  iconColor: t.colorGreen,  value: loading ? '…' : stats?.bueno.toLocaleString() ?? '—',        hint: 'verificados sin daño',    estado: 'Buen estado' },
    { label: 'Deteriorados',  icon: 'ti-alert-triangle',iconColor: t.colorRed,    value: loading ? '…' : stats?.deteriorado.toLocaleString() ?? '—',  hint: 'requieren reparación',    estado: 'Deteriorado' },
    { label: 'Sin verificar', icon: 'ti-clock',         iconColor: t.colorYellow, value: loading ? '…' : stats?.noverificado.toLocaleString() ?? '—', hint: 'pendientes de revisión',  estado: 'No verificado' },
  ]

  const acciones = [
    { icon: 'ti-circle-plus', label: 'Dar de alta un bien', desc: 'Registrar nuevo bien mueble', go: () => onNavigate('bienes') },
    { icon: 'ti-table',       label: 'Ver inventario',      desc: 'Tabla completa de bienes',    go: () => onNavigate('bienes') },
    { icon: 'ti-file-export', label: 'Exportar reporte',    desc: 'PDF o Excel del inventario',  go: () => onNavigate('bienes') },
  ]

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: dark ? darkBg : lightBg, transition: 'background 0.3s' }}>
      <Sidebar user={user} active="inicio" onNavigate={onNavigate} />

      <main style={{ flex: 1, marginLeft: sidebarOpen ? '230px' : '72px', padding: '2rem 1.25rem', overflowY: 'auto', overflowX: 'hidden', minWidth: 0, transition: 'margin-left 0.25s cubic-bezier(0.4,0,0.2,1)' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 600, color: t.text1, marginBottom: '4px' }}>Dashboard</h1>
            <p style={{ fontSize: '14px', color: t.text3 }}>Resumen general del sistema · Bienes Muebles</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: t.text3, background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: '9px', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: '7px', backdropFilter: 'blur(10px)' }}>
              <i className="ti ti-calendar" style={{ fontSize: '16px' }} />{fecha}
            </span>
            <ThemeToggle />
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '1.25rem' }}>
          {kpis.map((k, i) => (
            <button key={i} onClick={() => onNavigate('bienes', { estado: k.estado })}
              style={{ ...card, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              <div style={{ width: '42px', height: '42px', borderRadius: '11px', background: t.iconBox, border: `1px solid ${t.iconBoxBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                <i className={`ti ${k.icon}`} style={{ fontSize: '22px', color: k.iconColor }} />
              </div>
              <p style={{ fontSize: '30px', fontWeight: 600, color: t.text1, lineHeight: 1, marginBottom: '6px' }}>{k.value}</p>
              <p style={{ fontSize: '14px', fontWeight: 500, color: t.text2, marginBottom: '3px' }}>{k.label}</p>
              <p style={{ fontSize: '12px', color: t.text4 }}>{k.hint}</p>
            </button>
          ))}
        </div>

        {/* Acciones rápidas */}
        <div style={{ marginBottom: '1.25rem' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, color: t.text4, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '10px' }}>Acciones rápidas</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {acciones.map((a, i) => (
              <button key={i} onClick={a.go}
                style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', cursor: 'pointer', textAlign: 'left', transition: 'opacity 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <i className={`ti ${a.icon}`} style={{ fontSize: '22px', color: t.text2 }} />
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: 500, color: t.text1, marginBottom: '2px' }}>{a.label}</p>
                    <p style={{ fontSize: '12px', color: t.text4 }}>{a.desc}</p>
                  </div>
                </div>
                <i className="ti ti-chevron-right" style={{ fontSize: '17px', color: t.text4 }} />
              </button>
            ))}
          </div>
        </div>

        {/* Mid row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '14px', minWidth: 0, alignItems: 'stretch' }}>

          {/* Bienes por tipo (dona) */}
          <div style={{ ...card, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.25rem' }}>
              <i className="ti ti-chart-pie" style={{ fontSize: '18px', color: t.text2 }} />
              <p style={{ fontSize: '14px', fontWeight: 500, color: t.text1 }}>Bienes por tipo</p>
            </div>

            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '210px' }}>
                <div style={{ width: '170px', height: '170px', borderRadius: '50%', background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', animation: 'pulse 1.5s ease-in-out infinite' }} />
              </div>
            ) : (() => {
              const CLARO = dark ? '#48484a' : '#d9d9dc'   // tono claro por defecto
              const OSCURO = dark ? '#e8e8ea' : '#3a3a3c'   // tono al hacer hover
              const GAP = 0.022   // separación entre segmentos (radianes)
              const totalTipos = tipos.reduce((s, x) => s + x.total, 0) || 1
              let ang = -Math.PI / 2
              const cx = 135, cy = 135, rOut = 120, rIn = 74
              const segs = tipos.map((b, i) => {
                const frac = b.total / totalTipos
                const a0 = ang
                const a1 = ang + frac * Math.PI * 2
                ang = a1
                const mid = (a0 + a1) / 2
                return { ...b, i, a0, a1, mid, frac }
              })
              const hov = hoverTipo != null ? segs[hoverTipo] : null
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', width: '100%' }}>
                  {/* Dona */}
                  <svg width="270" height="270" viewBox="0 0 270 270" style={{ flexShrink: 0 }}>
                    {segs.map(s => {
                      const activo = hoverTipo === s.i
                      const off = activo ? 7 : 0
                      const dx = Math.cos(s.mid) * off
                      const dy = Math.sin(s.mid) * off
                      // En segmentos muy pequeños la separación no puede ser fija:
                      // se reduce para que el arco no quede invertido.
                      const g = Math.min(GAP, (s.a1 - s.a0) / 3)
                      return (
                        <path key={s.i}
                          d={arcoDona(cx, cy, rOut, rIn, s.a0 + g, s.a1 - g)}
                          fill={activo ? OSCURO : CLARO}
                          transform={`translate(${dx} ${dy})`}
                          onMouseEnter={() => setHoverTipo(s.i)}
                          onMouseLeave={() => setHoverTipo(null)}
                          onClick={() => onNavigate('bienes', { modo: s.id })}
                          style={{ cursor: 'pointer', transition: 'transform 0.2s cubic-bezier(0.4,0,0.2,1), fill 0.2s' }}
                        />
                      )
                    })}
                    {/* Centro */}
                    <text x={cx} y={cy - 5} textAnchor="middle" style={{ fontSize: '32px', fontWeight: 700, fill: t.text1 }}>
                      {(hov ? hov.total : totalTipos).toLocaleString()}
                    </text>
                    <text x={cx} y={cy + 19} textAnchor="middle" style={{ fontSize: '12px', fill: t.text4 }}>
                      {hov ? hov.label : 'Total'}
                    </text>
                  </svg>

                  {/* Leyenda */}
                  <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: '4px 10px', alignContent: 'center' }}>
                    {segs.map(s => {
                      const activo = hoverTipo === s.i
                      return (
                        <div key={s.i}
                          onMouseEnter={() => setHoverTipo(s.i)}
                          onMouseLeave={() => setHoverTipo(null)}
                          onClick={() => onNavigate('bienes', { modo: s.id })}
                          style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '9px', cursor: 'pointer', background: activo ? (dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') : 'transparent', transition: 'background 0.15s' }}>
                          <div style={{ width: '30px', height: '30px', borderRadius: '8px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: activo ? OSCURO : CLARO, transition: 'background 0.2s' }}>
                            <i className={`ti ${s.icon}`} style={{ fontSize: '17px', color: activo ? (dark ? '#1c1c1e' : '#fff') : t.text2, transition: 'color 0.2s' }} />
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <p style={{ fontSize: '13px', fontWeight: 500, color: t.text1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</p>
                            <p style={{ fontSize: '11px', color: t.text4 }}>{Math.round(s.frac * 100)}%</p>
                          </div>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: t.text2, flexShrink: 0 }}>{s.total.toLocaleString()}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
            </div>
          </div>
        </div>

      </main>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  )
}
