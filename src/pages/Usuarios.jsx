import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import Sidebar from '../components/Sidebar'
import { useTheme } from '../context/ThemeContext'
import { supabase } from '../supabase'
import { usuariosDependencia } from '../auth'
import { sStyle, iStyle, searchBoxStyle, thBase, tdBase, btnAccion } from './BienesMuebles'

// ── Usuarios de las dependencias ─────────────────────────────────────────────
// El administrador de bienes muebles da de alta a quien va a consultar el
// inventario de cada dependencia. Esas cuentas solo consultan y descargan
// reportes: no dan de alta, no modifican y no dan de baja.
//
// Las contraseñas no se muestran nunca —ni siquiera al administrador—, porque
// la base guarda el hash y no la contraseña. Si alguien la olvida, se le pone
// una nueva; no hay forma de "verla".

function fmtFecha(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Modal de alta y edición ──────────────────────────────────────────────────
function ModalUsuario({ usuario, dependencias, onClose, onGuardado, dark, t }) {
  const esNuevo = !usuario
  const [nombre, setNombre]   = useState(usuario?.nombre || '')
  const [acceso, setAcceso]   = useState(usuario?.usuario || '')
  const [dep, setDep]         = useState(usuario?.iddependencia ?? '')
  const [puesto, setPuesto]   = useState(usuario?.puesto || '')
  const [activo, setActivo]   = useState(usuario?.activo ?? true)
  const [clave, setClave]     = useState('')
  const [clave2, setClave2]   = useState('')
  const [verClave, setVerClave] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  async function guardar() {
    if (!nombre.trim())  { setErr('Escribe el nombre de la persona'); return }
    if (!acceso.trim())  { setErr('Escribe el usuario con el que va a entrar'); return }
    if (!dep)            { setErr('Elige la dependencia a la que pertenece'); return }
    if (esNuevo) {
      if (clave.length < 6)   { setErr('La contraseña debe tener al menos 6 caracteres'); return }
      if (clave !== clave2)   { setErr('Las contraseñas no coinciden'); return }
    }
    setGuardando(true); setErr(null)
    try {
      if (esNuevo) {
        await usuariosDependencia.crear({
          usuario: acceso.trim(), nombre: nombre.trim(), iddependencia: Number(dep),
          puesto: puesto.trim(), clave,
        })
      } else {
        await usuariosDependencia.editar({
          idusuario: usuario.idusuario, usuario: acceso.trim(), nombre: nombre.trim(),
          iddependencia: Number(dep), puesto: puesto.trim(), activo,
        })
      }
      onGuardado()
      onClose()
    } catch (e) { setErr(e.message); setGuardando(false) }
  }

  const lbl = txt => (
    <p style={{ fontSize: '10px', fontWeight: 700, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>{txt}</p>
  )

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} />
      <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 301, width: '540px', maxWidth: '94vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: dark ? '#1e1e20' : '#fff', borderRadius: '16px', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', animation: 'fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)', overflow: 'hidden' }}>

        <div style={{ padding: '1.25rem 1.5rem', borderBottom: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: t.iconBox, border: `1px solid ${t.iconBoxBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className={`ti ${esNuevo ? 'ti-user-plus' : 'ti-user-edit'}`} style={{ fontSize: '18px', color: t.text1 }} />
            </div>
            <div>
              <p style={{ fontSize: '15px', fontWeight: 600, color: dark ? '#fff' : '#111' }}>{esNuevo ? 'Nuevo Usuario' : 'Modificar Usuario'}</p>
              <p style={{ fontSize: '12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>
                {esNuevo ? 'Acceso de consulta para una dependencia' : usuario.usuario}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ width: '30px', height: '30px', borderRadius: '7px', background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: dark ? '#ccc' : '#555' }}>
            <i className="ti ti-x" style={{ fontSize: '15px' }} />
          </button>
        </div>

        <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0, overflowY: 'auto' }}>
          <div>{lbl('Dependencia a la que pertenece')}
            <select value={dep} onChange={e => setDep(e.target.value)} style={sStyle(dark)}>
              <option value="">— Elige la dependencia —</option>
              {dependencias.map(d => (
                <option key={d.iddependencia} value={d.iddependencia}>{d.nombredependencia}</option>
              ))}
            </select>
            <p style={{ fontSize: '12px', color: t.text3, marginTop: '6px' }}>
              Es lo único que va a poder consultar. No verá los bienes de otras dependencias.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>{lbl('Nombre de la persona')}
              <input value={nombre} onChange={e => setNombre(e.target.value)}
                placeholder="LIC. NOMBRE APELLIDO" autoComplete="off" style={iStyle(dark)} />
            </div>
            <div>{lbl('Puesto')}
              <input value={puesto} onChange={e => setPuesto(e.target.value)}
                placeholder="Puesto del Titular" autoComplete="off" style={iStyle(dark)} />
            </div>
          </div>

          <div>{lbl('Usuario con el que entra')}
            <input value={acceso} onChange={e => setAcceso(e.target.value.toLowerCase())}
              placeholder="bienestar.social" autoComplete="off" autoCapitalize="none" spellCheck={false}
              style={{ ...iStyle(dark), fontFamily: 'monospace' }} />
          </div>

          {esNuevo ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>{lbl('Contraseña')}
                <div style={{ position: 'relative' }}>
                  <input value={clave} onChange={e => setClave(e.target.value)}
                    type={verClave ? 'text' : 'password'} autoComplete="new-password"
                    style={{ ...iStyle(dark), paddingRight: '38px' }} />
                  <button onClick={() => setVerClave(v => !v)} type="button"
                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: t.text3, display: 'flex' }}>
                    <i className={`ti ti-${verClave ? 'eye-off' : 'eye'}`} style={{ fontSize: '16px' }} />
                  </button>
                </div>
              </div>
              <div>{lbl('Repetir contraseña')}
                <input value={clave2} onChange={e => setClave2(e.target.value)}
                  type={verClave ? 'text' : 'password'} autoComplete="new-password" style={iStyle(dark)} />
              </div>
            </div>
          ) : (
            <div onClick={() => setActivo(a => !a)}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 13px', borderRadius: '10px', cursor: 'pointer', border: `1px solid ${t.cardBorder}`, background: t.cardBg }}>
              <div style={{ width: '17px', height: '17px', borderRadius: '5px', flexShrink: 0, background: activo ? (dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.78)') : 'transparent', border: dark ? '1.5px solid rgba(255,255,255,0.4)' : '1.5px solid rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {activo && <i className="ti ti-check" style={{ fontSize: '11px', color: dark ? '#1c1c1e' : '#fff' }} />}
              </div>
              <div>
                <p style={{ fontSize: '14px', fontWeight: 500, color: t.text1 }}>Cuenta activa</p>
                <p style={{ fontSize: '12px', color: t.text3 }}>Desactivada, la persona ya no puede entrar, pero el registro se conserva.</p>
              </div>
            </div>
          )}

          {err && <p style={{ fontSize: '12.5px', color: dark ? '#f8a8a8' : '#b91c1c' }}>
            <i className="ti ti-alert-circle" style={{ marginRight: '5px' }} />{err}
          </p>}
        </div>

        <div style={{ flexShrink: 0, padding: '1rem 1.5rem', borderTop: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display: 'flex', gap: '8px' }}>
          <button onClick={onClose} disabled={guardando}
            style={{ flex: 1, padding: '10px', background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)', border: dark ? '1px solid rgba(255,255,255,0.13)' : '1px solid rgba(0,0,0,0.09)', borderRadius: '9px', fontSize: '14px', fontWeight: 500, color: dark ? '#ccc' : '#444', fontFamily: 'inherit', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={guardar} disabled={guardando}
            style={{ flex: 1, padding: '10px', borderRadius: '9px', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', cursor: guardando ? 'wait' : 'pointer', background: dark ? 'rgba(168,230,207,0.18)' : 'rgba(30,126,74,0.08)', border: dark ? '1px solid rgba(168,230,207,0.35)' : '1px solid rgba(30,126,74,0.35)', color: dark ? '#a8e6cf' : '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            {guardando
              ? <><i className="ti ti-loader-2" style={{ fontSize: '15px', animation: 'spin 1s linear infinite' }} />Guardando…</>
              : (esNuevo ? 'Crear usuario' : 'Guardar cambios')}
          </button>
        </div>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translate(-50%,-48%) scale(0.98)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}} @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </>,
    document.body
  )
}

// ── Contraseña nueva ─────────────────────────────────────────────────────────
function ModalClave({ usuario, onClose, dark, t }) {
  const [clave, setClave]   = useState('')
  const [clave2, setClave2] = useState('')
  const [ver, setVer]       = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [hecho, setHecho]   = useState(false)
  const [err, setErr]       = useState(null)

  async function guardar() {
    if (clave.length < 6) { setErr('La contraseña debe tener al menos 6 caracteres'); return }
    if (clave !== clave2) { setErr('Las contraseñas no coinciden'); return }
    setGuardando(true); setErr(null)
    try {
      await usuariosDependencia.cambiarClave(usuario.idusuario, clave)
      setHecho(true)
      setTimeout(onClose, 1600)
    } catch (e) { setErr(e.message); setGuardando(false) }
  }

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} />
      <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 301, width: '460px', maxWidth: '94vw', background: dark ? '#1e1e20' : '#fff', borderRadius: '16px', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', animation: 'fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)', overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)' }}>
          <p style={{ fontSize: '15px', fontWeight: 600, color: dark ? '#fff' : '#111' }}>Contraseña nueva</p>
          <p style={{ fontSize: '12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>{usuario.nombre} · {usuario.usuario}</p>
        </div>

        <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {hecho ? (
            <p style={{ fontSize: '14px', color: dark ? '#a8e6cf' : '#15803d' }}>
              <i className="ti ti-check" style={{ marginRight: '6px' }} />Contraseña actualizada. Entrégasela a la persona.
            </p>
          ) : (
            <>
              <p style={{ fontSize: '12.5px', color: t.text3, lineHeight: 1.5 }}>
                Las contraseñas no se pueden consultar: la base guarda solo una versión cifrada.
                Si la persona la olvidó, aquí se le pone una nueva.
              </p>
              <div style={{ position: 'relative' }}>
                <input value={clave} onChange={e => setClave(e.target.value)} placeholder="Contraseña nueva"
                  type={ver ? 'text' : 'password'} autoComplete="new-password" style={{ ...iStyle(dark), paddingRight: '38px' }} />
                <button onClick={() => setVer(v => !v)} type="button"
                  style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: t.text3, display: 'flex' }}>
                  <i className={`ti ti-${ver ? 'eye-off' : 'eye'}`} style={{ fontSize: '16px' }} />
                </button>
              </div>
              <input value={clave2} onChange={e => setClave2(e.target.value)} placeholder="Repetir contraseña"
                type={ver ? 'text' : 'password'} autoComplete="new-password" style={iStyle(dark)} />
              {err && <p style={{ fontSize: '12.5px', color: dark ? '#f8a8a8' : '#b91c1c' }}>{err}</p>}
            </>
          )}
        </div>

        {!hecho && (
          <div style={{ padding: '1rem 1.5rem', borderTop: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display: 'flex', gap: '8px' }}>
            <button onClick={onClose} disabled={guardando}
              style={{ flex: 1, padding: '10px', background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)', border: dark ? '1px solid rgba(255,255,255,0.13)' : '1px solid rgba(0,0,0,0.09)', borderRadius: '9px', fontSize: '14px', fontWeight: 500, color: dark ? '#ccc' : '#444', fontFamily: 'inherit', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={guardar} disabled={guardando}
              style={{ flex: 1, padding: '10px', borderRadius: '9px', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', background: dark ? 'rgba(168,230,207,0.18)' : 'rgba(30,126,74,0.08)', border: dark ? '1px solid rgba(168,230,207,0.35)' : '1px solid rgba(30,126,74,0.35)', color: dark ? '#a8e6cf' : '#15803d' }}>
              {guardando ? 'Guardando…' : 'Cambiar contraseña'}
            </button>
          </div>
        )}
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translate(-50%,-48%) scale(0.98)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}`}</style>
    </>,
    document.body
  )
}

// ── Confirmación de baja ─────────────────────────────────────────────────────
function ModalBorrar({ usuario, onClose, onBorrado, dark, t }) {
  const [borrando, setBorrando] = useState(false)
  const [err, setErr] = useState(null)

  async function borrar() {
    setBorrando(true); setErr(null)
    try { await usuariosDependencia.borrar(usuario.idusuario); onBorrado(); onClose() }
    catch (e) { setErr(e.message); setBorrando(false) }
  }

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} />
      <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 301, width: '440px', maxWidth: '94vw', background: dark ? '#1e1e20' : '#fff', borderRadius: '16px', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', animation: 'fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)', overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem 1.5rem' }}>
          <p style={{ fontSize: '15px', fontWeight: 600, color: dark ? '#fff' : '#111', marginBottom: '8px' }}>¿Borrar este usuario?</p>
          <p style={{ fontSize: '13px', color: t.text3, lineHeight: 1.55 }}>
            {usuario.nombre} ({usuario.usuario}) dejará de tener acceso al sistema. No se borra ningún bien:
            solo se elimina la cuenta. Si prefieres conservarla, desactívala desde Modificar.
          </p>
          {err && <p style={{ fontSize: '12.5px', color: dark ? '#f8a8a8' : '#b91c1c', marginTop: '10px' }}>{err}</p>}
        </div>
        <div style={{ padding: '1rem 1.5rem', borderTop: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display: 'flex', gap: '8px' }}>
          <button onClick={onClose} disabled={borrando}
            style={{ flex: 1, padding: '10px', background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)', border: dark ? '1px solid rgba(255,255,255,0.13)' : '1px solid rgba(0,0,0,0.09)', borderRadius: '9px', fontSize: '14px', fontWeight: 500, color: dark ? '#ccc' : '#444', fontFamily: 'inherit', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={borrar} disabled={borrando}
            style={{ flex: 1, padding: '10px', borderRadius: '9px', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', background: dark ? 'rgba(244,161,161,0.18)' : 'rgba(192,57,43,0.08)', border: dark ? '1px solid rgba(244,161,161,0.35)' : '1px solid rgba(192,57,43,0.35)', color: dark ? '#f4a1a1' : '#c0392b' }}>
            {borrando ? 'Borrando…' : 'Sí, borrar'}
          </button>
        </div>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translate(-50%,-48%) scale(0.98)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}`}</style>
    </>,
    document.body
  )
}

// ── Pantalla ─────────────────────────────────────────────────────────────────
export default function Usuarios({ user, onNavigate }) {
  const { dark, t, sidebarOpen } = useTheme()

  const [usuarios, setUsuarios] = useState([])
  const [dependencias, setDependencias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError]       = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [depFiltro, setDepFiltro] = useState('')

  const [modalUsuario, setModalUsuario] = useState(null)   // 'nuevo' | usuario
  const [modalClave, setModalClave]     = useState(null)
  const [modalBorrar, setModalBorrar]   = useState(null)

  const cargar = () => {
    setCargando(true); setError(null)
    usuariosDependencia.listar()
      .then(d => setUsuarios(d || []))
      .catch(e => setError(
        /usuarios_listar/.test(e.message)
          ? 'Falta crear las tablas de usuarios en la base: aplica supabase/usuarios.sql.'
          : e.message))
      .finally(() => setCargando(false))
  }

  useEffect(() => { cargar() }, [])

  useEffect(() => {
    supabase.from('dependencias').select('iddependencia, nombredependencia').order('nombredependencia')
      .then(({ data }) => setDependencias(data || []))
  }, [])

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return usuarios.filter(u => {
      if (depFiltro && String(u.iddependencia) !== String(depFiltro)) return false
      if (!q) return true
      return [u.nombre, u.usuario, u.dependencia, u.puesto].some(v => (v || '').toLowerCase().includes(q))
    })
  }, [usuarios, busqueda, depFiltro])

  const activos = usuarios.filter(u => u.activo).length

  const bg = dark ? 'linear-gradient(145deg,#111113 0%,#1c1c1e 50%,#222224 100%)' : 'linear-gradient(145deg,#e0e0e2 0%,#ebebed 50%,#e4e4e6 100%)'
  const card = { background: t.cardBg, border: `1px solid ${t.cardBorder}`, backdropFilter: t.cardBlur, WebkitBackdropFilter: t.cardBlur, borderRadius: '14px' }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: bg }}>
      <Sidebar user={user} active="usuarios" onNavigate={onNavigate} />

      <main style={{ flex: 1, marginLeft: sidebarOpen ? '230px' : '72px', padding: '2rem 1.25rem', overflowY: 'auto', overflowX: 'hidden', minWidth: 0, transition: 'margin-left 0.25s cubic-bezier(0.4,0,0.2,1)' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 600, color: t.text1, marginBottom: '4px' }}>Usuarios</h1>
            <p style={{ fontSize: '14px', color: t.text3 }}>
              Accesos de consulta por dependencia · {cargando ? 'Cargando…' : `${activos} activo${activos !== 1 ? 's' : ''} de ${usuarios.length}`}
            </p>
          </div>
          <button onClick={() => setModalUsuario('nuevo')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: '10px', background: t.cardBg, border: `1px solid ${t.cardBorder}`, backdropFilter: 'blur(10px)', fontSize: '14px', fontWeight: 500, color: t.text1, fontFamily: 'inherit', cursor: 'pointer' }}>
            <i className="ti ti-user-plus" style={{ fontSize: '18px' }} />Nuevo Usuario
          </button>
        </div>

        {/* Filtros */}
        <div className="barra-fit" style={{ ...card, padding: '1rem 1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ ...searchBoxStyle(dark), flex: 1, minWidth: '200px' }}>
            <i className="ti ti-search" style={{ fontSize: '16px', color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)', flexShrink: 0 }} />
            <input type="text" placeholder="Buscar por usuario, nombre o dependencia..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', color: dark ? '#f0f0f0' : '#111', fontFamily: 'inherit' }} />
            {busqueda && <button onClick={() => setBusqueda('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text3, padding: 0, display: 'flex' }}><i className="ti ti-x" style={{ fontSize: '14px' }} /></button>}
          </div>
          <select value={depFiltro} onChange={e => setDepFiltro(e.target.value)} style={{ ...sStyle(dark), width: 'auto', minWidth: '220px' }}>
            <option value="">Todas las dependencias</option>
            {dependencias.map(d => <option key={d.iddependencia} value={d.iddependencia}>{d.nombredependencia}</option>)}
          </select>
        </div>

        {error && (
          <div style={{ ...card, padding: '1rem 1.25rem', marginBottom: '1rem', color: dark ? '#f4a1a1' : '#c0392b', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="ti ti-alert-circle" style={{ fontSize: '18px' }} />{error}
          </div>
        )}

        {/* Tabla */}
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}` }}>
                  <th style={thBase(dark)}>USUARIO</th>
                  <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>NOMBRE DE LA PERSONA</th>
                  <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>DEPENDENCIA</th>
                  <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>PUESTO</th>
                  <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>ESTADO</th>
                  <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>ÚLTIMO INGRESO</th>
                  <th style={{ ...thBase(dark), borderLeft: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)' }}>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {cargando
                  ? <tr><td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: t.text4 }}>
                      <i className="ti ti-loader-2" style={{ fontSize: '20px', animation: 'spin 1s linear infinite' }} />
                    </td></tr>
                  : lista.length === 0
                    ? <tr><td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: t.text4 }}>
                        <i className="ti ti-users" style={{ fontSize: '28px', display: 'block', marginBottom: '8px' }} />
                        {usuarios.length === 0 ? 'Todavía no hay usuarios de dependencia' : 'Sin resultados'}
                      </td></tr>
                    : lista.map((u, i) => {
                      const bgFila = i % 2 === 0 ? 'transparent' : (dark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.015)')
                      return (
                      <tr key={u.idusuario}
                        style={{ borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`, background: bgFila, transition: 'background 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'}
                        onMouseLeave={e => e.currentTarget.style.background = bgFila}
                      >
                        <td style={tdBase()}>
                          <span style={{ fontFamily: 'monospace', fontSize: '11px', color: t.text3 }}>{u.usuario}</span>
                        </td>
                        <td style={tdBase()}><span style={{ color: t.text1, fontWeight: 500 }}>{u.nombre}</span></td>
                        <td style={tdBase()}><span style={{ color: t.text2 }}>{u.dependencia || '—'}</span></td>
                        <td style={tdBase()}><span style={{ color: t.text3 }}>{u.puesto || '—'}</span></td>
                        <td style={tdBase()}>
                          {(() => {
                            // El mismo chip que el estado de un bien: mismos colores,
                            // mismo redondeo y el borde tenue de su propio color.
                            const c = u.activo
                              ? { color: dark ? '#7ee8a2' : '#1e7e4a', bg: dark ? 'rgba(126,232,162,0.15)' : 'rgba(30,126,74,0.1)' }
                              : { color: dark ? '#f4a1a1' : '#c0392b', bg: dark ? 'rgba(244,161,161,0.15)' : 'rgba(192,57,43,0.1)' }
                            return (
                              <span style={{ fontSize: '11px', fontWeight: 500, padding: '3px 8px', borderRadius: '20px', display: 'inline-block', background: c.bg, color: c.color, border: `1px solid ${c.color}44` }}>
                                {u.activo ? 'Activo' : 'Inactivo'}
                              </span>
                            )
                          })()}
                        </td>
                        <td style={tdBase()}><span style={{ color: t.text3 }}>{fmtFecha(u.acceso)}</span></td>
                        <td style={tdBase()}>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button onClick={() => setModalUsuario(u)} title="Modificar" style={btnAccion(dark, 'editar')}
                              onMouseEnter={e => e.currentTarget.style.opacity = '0.7'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                              <i className="ti ti-pencil" style={{ fontSize: '14px' }} />
                            </button>
                            <button onClick={() => setModalClave(u)} title="Contraseña nueva" style={btnAccion(dark, 'traspaso')}
                              onMouseEnter={e => e.currentTarget.style.opacity = '0.7'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                              <i className="ti ti-key" style={{ fontSize: '14px' }} />
                            </button>
                            <button onClick={() => setModalBorrar(u)} title="Borrar" style={btnAccion(dark, 'baja')}
                              onMouseEnter={e => e.currentTarget.style.opacity = '0.7'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                              <i className="ti ti-trash" style={{ fontSize: '14px' }} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      )
                    })}
              </tbody>
            </table>
          </div>
        </div>

        <p style={{ fontSize: '12.5px', color: t.text4, marginTop: '14px', maxWidth: '70ch', lineHeight: 1.6 }}>
          Estos accesos son de consulta: la persona ve el inventario de su dependencia y puede descargar
          sus reportes, pero no da de alta, no modifica, no traspasa ni da de baja ningún bien.
        </p>
      </main>

      <style>{`@keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }`}</style>

      {modalUsuario && (
        <ModalUsuario usuario={modalUsuario === 'nuevo' ? null : modalUsuario} dependencias={dependencias}
          onClose={() => setModalUsuario(null)} onGuardado={cargar} dark={dark} t={t} />
      )}
      {modalClave && <ModalClave usuario={modalClave} onClose={() => setModalClave(null)} dark={dark} t={t} />}
      {modalBorrar && <ModalBorrar usuario={modalBorrar} onClose={() => setModalBorrar(null)} onBorrado={cargar} dark={dark} t={t} />}
    </div>
  )
}
