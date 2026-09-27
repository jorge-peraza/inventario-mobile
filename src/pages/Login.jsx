import { useState } from 'react'
import { useTheme, tokens } from '../context/ThemeContext'
import ThemeToggle from '../components/ThemeToggle'
import { iniciarSesion } from '../auth'

export default function Login({ onLogin }) {
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(false)
  const { dark } = useTheme()
  const t = tokens(dark)

  async function handleSubmit(e) {
    e.preventDefault()
    if (cargando) return
    setError(null); setCargando(true)
    try {
      const user = await iniciarSesion(usuario, password)
      onLogin(user)
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión')
      setCargando(false)
    }
  }

  const bg = dark
    ? 'linear-gradient(145deg,#111113 0%,#1c1c1e 60%,#1A0A14 100%)'
    : 'linear-gradient(145deg,#e0e0e2 0%,#ebebed 50%,#e4e4e6 100%)'

  return (
    <div style={{ minHeight:'100vh', background:bg, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'2rem', position:'relative', overflow:'hidden', transition:'background 0.3s' }}>
      <div style={{ position:'absolute',top:'1.25rem',right:'1.25rem',zIndex:10 }}><ThemeToggle /></div>
      <div style={{ position:'absolute',width:'500px',height:'500px',borderRadius:'50%', background:dark?'rgba(255,255,255,0.025)':'rgba(0,0,0,0.025)', filter:'blur(80px)',top:'-100px',left:'-100px',pointerEvents:'none' }} />
      <div style={{ position:'absolute',width:'400px',height:'400px',borderRadius:'50%', background:dark?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.03)', filter:'blur(80px)',bottom:'-80px',right:'-80px',pointerEvents:'none' }} />
      <div style={{ position:'relative',zIndex:2,width:'100%',maxWidth:'400px', background:t.cardBg, border:`1px solid ${t.cardBorder}`, backdropFilter:'blur(28px)',WebkitBackdropFilter:'blur(28px)', borderRadius:'20px',padding:'2.5rem', boxShadow:dark?'0 8px 40px rgba(0,0,0,0.5)':'0 4px 24px rgba(0,0,0,0.1)', transition:'background 0.3s,border-color 0.3s' }}>
        <div style={{ display:'flex',alignItems:'center',gap:'14px',marginBottom:'2rem' }}>
          <div style={{ width:'50px',height:'50px',borderRadius:'13px',flexShrink:0, background:t.iconBox, border:`1px solid ${t.iconBoxBorder}`, display:'flex',alignItems:'center',justifyContent:'center' }}>
            <i className="ti ti-building-community" style={{ fontSize:'24px',color:t.text1 }} />
          </div>
          <div>
            <p style={{ fontSize:'15px',fontWeight:600,color:t.text1,lineHeight:1.3 }}>H. Ayuntamiento de Nogales</p>
            <p style={{ fontSize:'12px',color:t.text3,marginTop:'2px' }}>Sistema de Inventarios y Tesorería</p>
          </div>
        </div>
        <div style={{ height:'1px',background:t.divider,marginBottom:'1.75rem' }} />
        <p style={{ fontSize:'20px',fontWeight:600,color:t.text1,marginBottom:'4px' }}>Inicio de sesión</p>
        <p style={{ fontSize:'13px',color:t.text3,marginBottom:'1.5rem' }}>Ingresa con tu cuenta institucional</p>
        <form onSubmit={handleSubmit} style={{ display:'flex',flexDirection:'column',gap:'1rem' }}>
          <div style={{ display:'flex',flexDirection:'column',gap:'6px' }}>
            <label style={{ fontSize:'13px',fontWeight:500,color:t.text2 }}>Usuario / CURP</label>
            <div style={{ display:'flex',alignItems:'center',gap:'10px',padding:'11px 14px',borderRadius:'11px', background:dark?'#2a2a2c':'#fff', border:dark?'1px solid rgba(255,255,255,0.18)':'1px solid rgba(0,0,0,0.18)' }}>
              <i className="ti ti-user" style={{ fontSize:'18px',color:t.text4 }} />
              <input type="text" placeholder="Ingresa tu usuario" value={usuario} onChange={e=>setUsuario(e.target.value)} style={{ flex:1,background:'transparent',border:'none',outline:'none',fontSize:'14px',color:t.text1,fontFamily:'inherit' }} />
            </div>
          </div>
          <div style={{ display:'flex',flexDirection:'column',gap:'6px' }}>
            <label style={{ fontSize:'13px',fontWeight:500,color:t.text2 }}>Contraseña</label>
            <div style={{ display:'flex',alignItems:'center',gap:'10px',padding:'11px 14px',borderRadius:'11px', background:dark?'#2a2a2c':'#fff', border:dark?'1px solid rgba(255,255,255,0.18)':'1px solid rgba(0,0,0,0.18)' }}>
              <i className="ti ti-lock" style={{ fontSize:'18px',color:t.text4 }} />
              <input type="password" placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} style={{ flex:1,background:'transparent',border:'none',outline:'none',fontSize:'14px',color:t.text1,fontFamily:'inherit' }} />
            </div>
          </div>
          {error && (
            <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 13px', borderRadius:'10px', background: dark ? 'rgba(244,161,161,0.12)' : 'rgba(192,57,43,0.07)', border: dark ? '1px solid rgba(244,161,161,0.3)' : '1px solid rgba(192,57,43,0.25)' }}>
              <i className="ti ti-alert-circle" style={{ fontSize:'16px', color: dark ? '#f4a1a1' : '#c0392b', flexShrink:0 }} />
              <span style={{ fontSize:'13px', color: dark ? '#f4a1a1' : '#c0392b' }}>{error}</span>
            </div>
          )}
          <button type="submit" disabled={cargando} style={{ marginTop:'6px',padding:'13px',background:t.btnBg,border:`1px solid ${t.btnBorder}`,borderRadius:'11px',color:t.text1,fontSize:'15px',fontWeight:600,fontFamily:'inherit',cursor:cargando?'wait':'pointer',opacity:cargando?0.7:1,backdropFilter:'blur(10px)',transition:'opacity 0.2s' }} onMouseEnter={e=>{if(!cargando)e.currentTarget.style.opacity='0.75'}} onMouseLeave={e=>{if(!cargando)e.currentTarget.style.opacity='1'}}>{cargando ? 'Verificando…' : 'Entrar'}</button>
        </form>
        <div style={{ display:'flex',justifyContent:'center',alignItems:'center',gap:'8px',marginTop:'1.25rem',fontSize:'13px' }}>
          <a href="#" style={{ color:t.text3 }}>¿Olvidaste tu contraseña?</a>
          <span style={{ color:t.text4 }}>·</span>
          <a href="#" style={{ color:t.text3 }}>Soporte</a>
        </div>
      </div>
      <p style={{ position:'relative',zIndex:2,marginTop:'1.5rem',fontSize:'12px',color:t.text4,textAlign:'center' }}>H. Ayuntamiento de Nogales 2024–2027 · Dirección de Tesorería e Inventarios</p>
    </div>
  )
}
