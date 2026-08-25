import { useTheme } from '../context/ThemeContext'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import { useState, useEffect } from 'react'
import { supabaseInmuebles } from '../supabaseInmuebles'
import { ID_PROCESO, ID_DESINC, CATS_FUERA, CATS_SALIDA } from '../desincorporaciones'

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

function fmt(n) {
  if (!n) return '$ —'
  if (n >= 1_000_000) return '$ ' + (n / 1_000_000).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' M'
  return '$ ' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 0 })
}

export default function DashboardInmuebles({ user, onNavigate }) {
  const { dark, t, sidebarOpen } = useTheme()
  const fecha = useFecha()

  const [stats, setStats]         = useState(null)
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    async function cargar() {
      setLoading(true)
      try {
        const BATCH = 1000

        // Paginar todos los registros
        let todos = [], desde = 0
        while (true) {
          const { data: batch, error } = await supabaseInmuebles
            .from('bienesinmuebles')
            .select('valorcatastral, documentopropiedad, espendiente, idcategoria, fecha_enajenacion')
            .range(desde, desde + BATCH - 1)
          if (error || !batch || batch.length === 0) break
          todos = [...todos, ...batch]
          if (batch.length < BATCH) break
          desde += BATCH
        }

        if (todos.length) {
          // El patrimonio son los inmuebles del HAN: no cuentan los que están en
          // comodato ni los que salieron (en proceso / desincorporados).
          const patrimonio = todos.filter(r => !CATS_FUERA.includes(r.idcategoria))
          const total      = patrimonio.length
          const valorTotal = patrimonio.reduce((s, r) => s + (r.valorcatastral || 0), 0)
          const enProceso  = todos.filter(r => r.idcategoria === ID_PROCESO).length
          // Incorporaciones del año: movimientos de este año que no son salidas
          const anio = String(new Date().getFullYear())
          const incorporaciones = todos.filter(r =>
            String(r.fecha_enajenacion || '').startsWith(anio) && !CATS_SALIDA.includes(r.idcategoria)
          ).length
          setStats({ total, valorTotal, incorporaciones, enProceso })

          // Conteo y valor total por categoría (client-side)
          const mapaConteo = {}
          const mapaValor  = {}
          for (const r of todos) {
            if (r.idcategoria) {
              mapaConteo[r.idcategoria] = (mapaConteo[r.idcategoria] || 0) + 1
              mapaValor[r.idcategoria]  = (mapaValor[r.idcategoria]  || 0) + (r.valorcatastral || 0)
            }
          }

          // Nombres de categorías
          const { data: cats } = await supabaseInmuebles
            .from('categoriasinmuebles')
            .select('idcategoria, nombrecategoria')
            .order('nombrecategoria', { ascending: true })

          if (cats) {
            // Se listan TODAS las categorías, incluidas comodato y desincorporado.
            // Ojo: esas dos no son patrimonio del HAN, así que los conteos de las
            // tarjetas no suman el total de arriba.
            const lista = cats
              .map(c => ({
                ...c,
                total:      mapaConteo[c.idcategoria] || 0,
                valorTotal: mapaValor[c.idcategoria]  || 0,
              }))
              .filter(c => c.total > 0)
              .sort((a, b) => b.total - a.total)
            setCategorias(lista)
          }
        }

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

  const bg = dark
    ? 'linear-gradient(145deg,#111113 0%,#1c1c1e 50%,#222224 100%)'
    : 'linear-gradient(145deg,#e0e0e2 0%,#ebebed 50%,#e4e4e6 100%)'

  const kpis = [
    {
      label: 'Total inmuebles', icon: 'ti-building', iconColor: (t) => t.text1,
      value: loading ? '…' : stats?.total.toLocaleString() ?? '—',
      hint:  'registrados en inventario',
    },
    {
      label: 'Valor catastral total', icon: 'ti-coins', iconColor: (t) => t.colorGreen,
      value: loading ? '…' : fmt(stats?.valorTotal),
      hint:  'suma de todos los inmuebles',
    },
    {
      label: 'Incorporaciones en el año', icon: 'ti-circle-plus', iconColor: (t) => t.colorBlue,
      value: loading ? '…' : stats?.incorporaciones.toLocaleString() ?? '—',
      hint:  `altas registradas en ${new Date().getFullYear()}`,
    },
    {
      label: 'En proceso de desincorporación', icon: 'ti-progress', iconColor: (t) => t.colorYellow,
      value: loading ? '…' : stats?.enProceso.toLocaleString() ?? '—',
      hint:  'inmuebles en trámite de salida',
    },
  ]

  return (
    <div style={{ display:'flex', minHeight:'100vh', background: bg, transition:'background 0.3s' }}>
      <Sidebar user={user} active="inicio" onNavigate={onNavigate} />
      <main style={{ flex:1, marginLeft: sidebarOpen ? '230px' : '72px', padding:'2rem 1.25rem', overflowY:'auto', overflowX:'hidden', minWidth:0, transition:'margin-left 0.25s cubic-bezier(0.4,0,0.2,1)' }}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1.75rem' }}>
          <div>
            <h1 style={{ fontSize:'24px', fontWeight:600, color:t.text1, marginBottom:'4px' }}>Dashboard</h1>
            <p style={{ fontSize:'14px', color:t.text3 }}>Resumen general · Bienes Inmuebles</p>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            <span style={{ fontSize:'13px', color:t.text3, background:t.cardBg, border:`1px solid ${t.cardBorder}`, borderRadius:'9px', padding:'7px 14px', display:'flex', alignItems:'center', gap:'7px', backdropFilter:'blur(10px)' }}>
              <i className="ti ti-calendar" style={{ fontSize:'16px' }} />{fecha}
            </span>
            <ThemeToggle />
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'14px', marginBottom:'1.25rem' }}>
          {kpis.map((k, i) => (
            <div key={i} style={card}>
              <div style={{ width:'42px', height:'42px', borderRadius:'11px', background:t.iconBox, border:`1px solid ${t.iconBoxBorder}`, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'1rem' }}>
                <i className={`ti ${k.icon}`} style={{ fontSize:'22px', color:k.iconColor(t) }} />
              </div>
              <p style={{ fontSize:'28px', fontWeight:600, color:t.text1, lineHeight:1, marginBottom:'6px' }}>{k.value}</p>
              <p style={{ fontSize:'14px', fontWeight:500, color:t.text2, marginBottom:'3px' }}>{k.label}</p>
              <p style={{ fontSize:'12px', color: k.trendUp ? t.colorGreen : t.text4 }}>{k.hint}</p>
            </div>
          ))}
        </div>

        {/* Acciones rápidas */}
        <div style={{ marginBottom:'1.25rem' }}>
          <p style={{ fontSize:'11px', fontWeight:600, color:t.text4, textTransform:'uppercase', letterSpacing:'0.09em', marginBottom:'10px' }}>Acciones rápidas</p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px' }}>
            {[
              { icon:'ti-table',         label:'Ver inventario',   desc:'Tabla completa de inmuebles',    page:'inmuebles' },
              { icon:'ti-file-export',   label:'Exportar reporte', desc:'PDF o Excel del inventario',     page:'inmuebles', estado:{ abrirReporte:true } },
              // Va al final (derecha) y entra directo al formulario de alta
              { icon:'ti-building-plus', label:'Nuevo Inmueble',   desc:'Alta de bien inmueble municipal', page:'inmuebles', estado:{ abrirNuevo:true } },
            ].map((a, i) => (
              <button key={i} onClick={() => a.page && onNavigate(a.page, a.estado || {})}
                style={{ ...card, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'1rem 1.25rem', cursor:'pointer', textAlign:'left', transition:'opacity 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.opacity='0.75'}
                onMouseLeave={e => e.currentTarget.style.opacity='1'}
              >
                <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                  <i className={`ti ${a.icon}`} style={{ fontSize:'22px', color:t.text2 }} />
                  <div>
                    <p style={{ fontSize:'14px', fontWeight:500, color:t.text1, marginBottom:'2px' }}>{a.label}</p>
                    <p style={{ fontSize:'12px', color:t.text4 }}>{a.desc}</p>
                  </div>
                </div>
                <i className="ti ti-chevron-right" style={{ fontSize:'17px', color:t.text4 }} />
              </button>
            ))}
          </div>
        </div>

        {/* Categorías */}
        <div style={{ minWidth:0 }}>
          <p style={{ fontSize:'11px', fontWeight:600, color:t.text4, textTransform:'uppercase', letterSpacing:'0.09em', marginBottom:'10px' }}>Categorías de inmuebles</p>
          {loading ? (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px', minWidth:0 }}>
              {Array.from({ length:6 }).map((_, i) => (
                <div key={i} style={{ height:'72px', borderRadius:'14px', background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', animation:'pulse 1.5s ease-in-out infinite' }} />
              ))}
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px', minWidth:0 }}>
              {categorias.map(c => (
                <button
                  key={c.idcategoria}
                  onClick={() => onNavigate('inmuebles', { catIds: [c.idcategoria] })}
                  style={{
                    ...card,
                    display:'flex', alignItems:'center', justifyContent:'space-between',
                    padding:'1rem 1.25rem', cursor:'pointer', textAlign:'left',
                    transition:'opacity 0.15s', minWidth:0, overflow:'hidden',
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity='0.75'}
                  onMouseLeave={e => e.currentTarget.style.opacity='1'}
                >
                  <div style={{ display:'flex', alignItems:'center', gap:'12px', minWidth:0, overflow:'hidden' }}>
                    <i className="ti ti-building" style={{ fontSize:'20px', color:t.text2, flexShrink:0 }} />
                    <div style={{ minWidth:0 }}>
                      <p style={{ fontSize:'13px', fontWeight:500, color:t.text1, marginBottom:'2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {c.nombrecategoria}
                      </p>
                      <p style={{ fontSize:'12px', color:t.text4, marginBottom:'2px' }}>
                        {c.total.toLocaleString('es-MX')} inmuebles
                      </p>
                      {/* Lo desincorporado ya salió del patrimonio: se cuenta,
                          pero no se le pone valor para no sumarlo por error */}
                      {c.valorTotal > 0 && c.idcategoria !== ID_DESINC && (
                        <p style={{ fontSize:'11px', fontWeight:600, color: dark ? '#6ee7b7' : '#1e7e4a' }}>
                          {fmt(c.valorTotal)}
                        </p>
                      )}
                    </div>
                  </div>
                  <i className="ti ti-chevron-right" style={{ fontSize:'16px', color:t.text4, flexShrink:0, marginLeft:'8px' }} />
                </button>
              ))}
            </div>
          )}
        </div>

      </main>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  )
}