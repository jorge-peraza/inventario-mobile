import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { listarFotos, subirFotos, revisarArchivos, hayServidorFotos, MAX_MB_FOTO } from '../fotos'

// ── Fotos de un bien mueble ──────────────────────────────────────────────────
// Dos pasos en el mismo modal, uno al lado del otro:
//   1. Galería: la foto grande a la izquierda y las demás en miniatura a la
//      derecha; al tocar una miniatura pasa a la grande.
//   2. Agregar imágenes: el modal se desliza a la izquierda y aparece la zona
//      para arrastrar o elegir fotos.
// Las fotos viven en un servidor aparte (src/fotos.js).

export default function ModalFotos({ bien, onClose, dark, t }) {
  const [fotos, setFotos]       = useState(null)      // null = cargando
  const [sel, setSel]           = useState(0)
  const [paso, setPaso]         = useState('galeria') // 'galeria' | 'subir'
  const [nuevas, setNuevas]     = useState([])        // [{ archivo, url }]
  const [arrastrando, setArrastrando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [err, setErr]           = useState(null)
  const [errCarga, setErrCarga] = useState(null)
  const refInput = useRef(null)

  async function cargar(irA = 0) {
    setFotos(null); setErrCarga(null)
    try {
      const lista = await listarFotos(bien.idbien)
      setFotos(lista)
      setSel(Math.max(0, Math.min(irA, lista.length - 1)))
    } catch (e) { setErrCarga(e.message); setFotos([]) }
  }
  useEffect(() => { cargar() }, [bien.idbien])

  // Las vistas previas ocupan memoria: se sueltan al quitarlas, al subirlas y
  // al cerrar el modal
  const refNuevas = useRef([])
  useEffect(() => { refNuevas.current = nuevas }, [nuevas])
  useEffect(() => () => refNuevas.current.forEach(n => URL.revokeObjectURL(n.url)), [])

  function agregarArchivos(lista) {
    const { buenos, malos } = revisarArchivos([...lista])
    setErr(malos.length ? malos.join(' · ') : null)
    setNuevas(prev => [...prev, ...buenos.map(archivo => ({ archivo, url: URL.createObjectURL(archivo) }))])
  }
  function quitar(i) {
    URL.revokeObjectURL(nuevas[i].url)
    setNuevas(prev => prev.filter((_, j) => j !== i))
  }

  async function subir() {
    if (!nuevas.length) return
    setSubiendo(true); setErr(null)
    try {
      await subirFotos(bien.idbien, bien.claveinventario, nuevas.map(n => n.archivo))
      const antes = fotos?.length || 0
      nuevas.forEach(n => URL.revokeObjectURL(n.url))
      setNuevas([])
      setPaso('galeria')
      await cargar(antes)   // queda a la vista la primera de las nuevas
    } catch (e) { setErr(e.message) }
    finally { setSubiendo(false) }
  }

  const foto = fotos && fotos[sel]
  // Con una sola foto, o ninguna, la grande ocupa todo el ancho: la columna de
  // miniaturas solo aparece cuando hay entre cuáles escoger
  const conMiniaturas = !!fotos && fotos.length > 1
  const sep = dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)'
  const lienzo = { background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', border: `1px solid ${t.cardBorder}`, borderRadius: '12px' }
  const btnCerrar = { flex: 1, padding: '10px', background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)', border: dark ? '1px solid rgba(255,255,255,0.13)' : '1px solid rgba(0,0,0,0.09)', borderRadius: '9px', fontSize: '14px', fontWeight: 500, color: dark ? '#ccc' : '#444', fontFamily: 'inherit', cursor: 'pointer' }
  const btnVerde = activo => ({ flex: 1, padding: '10px', borderRadius: '9px', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', cursor: activo ? 'pointer' : 'not-allowed', opacity: activo ? 1 : 0.5, background: dark ? 'rgba(168,230,207,0.18)' : 'rgba(30,126,74,0.08)', border: dark ? '1px solid rgba(168,230,207,0.35)' : '1px solid rgba(30,126,74,0.35)', color: dark ? '#a8e6cf' : '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' })
  const pie = { flexShrink: 0, padding: '1rem 1.5rem', borderTop: sep, display: 'flex', gap: '8px' }

  return createPortal(
    <>
      <div onClick={subiendo ? undefined : onClose} className="telon" style={{ zIndex: 400 }} />
      <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 401, width: '820px', maxWidth: '94vw', background: dark ? '#1e1e20' : '#fff', borderRadius: '16px', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', animation: 'fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)', overflow: 'hidden' }}>

        {/* Encabezado */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: sep, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '9px', flexShrink: 0, background: t.iconBox, border: `1px solid ${t.iconBoxBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className={`ti ${paso === 'subir' ? 'ti-photo-plus' : 'ti-photo'}`} style={{ fontSize: '18px', color: t.text1 }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: '15px', fontWeight: 600, color: dark ? '#fff' : '#111' }}>{paso === 'subir' ? 'Agregar imágenes' : 'Fotos del bien'}</p>
              <p style={{ fontSize: '12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {bien.claveinventario} · {bien.nombrebien}
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={subiendo} style={{ width: '30px', height: '30px', borderRadius: '7px', flexShrink: 0, background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: dark ? '#ccc' : '#555' }}>
            <i className="ti ti-x" style={{ fontSize: '15px' }} />
          </button>
        </div>

        {/* Los dos pasos van lado a lado; se desliza de uno a otro */}
        <div style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', width: '200%', transform: paso === 'subir' ? 'translateX(-50%)' : 'translateX(0)', transition: 'transform 0.35s cubic-bezier(0.4,0,0.2,1)', willChange: 'transform' }}>

            {/* ── 1. Galería ── */}
            <div style={{ width: '50%', display: 'flex', flexDirection: 'column' }} aria-hidden={paso !== 'galeria'}>
              <div style={{ padding: '1.25rem 1.5rem', display: 'grid', gridTemplateColumns: conMiniaturas ? 'minmax(0,1fr) 92px' : '1fr', gap: '12px', height: '420px' }}>
                <div style={{ ...lienzo, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', minHeight: 0 }}>
                  {fotos === null ? (
                    <i className="ti ti-loader-2" style={{ fontSize: '24px', color: t.text4, animation: 'spin 1s linear infinite' }} />
                  ) : foto ? (
                    <img key={foto.id} src={foto.url} alt={`Foto ${sel + 1} de ${bien.claveinventario}`}
                      style={{ width: '100%', height: '100%', objectFit: 'contain', animation: 'telonEntra 0.25s ease-out' }} />
                  ) : (
                    <div style={{ textAlign: 'center', color: t.text4, padding: '1rem' }}>
                      <i className="ti ti-photo-off" style={{ fontSize: '34px', display: 'block', marginBottom: '8px' }} />
                      <p style={{ fontSize: '13.5px', color: t.text3 }}>{errCarga || 'Este bien todavía no tiene fotos'}</p>
                      {!hayServidorFotos() && (
                        <p style={{ fontSize: '12px', color: t.text4, marginTop: '4px' }}>Se verán aquí cuando se conecte el servidor de imágenes.</p>
                      )}
                    </div>
                  )}
                </div>
                {/* Las miniaturas, en una sola columna junto a la foto grande */}
                {conMiniaturas && (
                <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0, paddingRight: '2px' }}>
                  {(fotos || []).map((f, i) => (
                    <button key={f.id} onClick={() => setSel(i)} title={`Foto ${i + 1}`}
                      style={{ flex: '0 0 auto', width: '100%', padding: 0, aspectRatio: '1', borderRadius: '8px', overflow: 'hidden', cursor: 'pointer', background: 'none',
                        border: i === sel ? `2px solid ${t.text1}` : `1px solid ${t.cardBorder}`, opacity: i === sel ? 1 : 0.7, transition: 'opacity 0.15s' }}>
                      <img src={f.miniatura} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </button>
                  ))}
                </div>
                )}
              </div>
              <div style={pie}>
                <button onClick={onClose} style={btnCerrar}>Cerrar</button>
                <button onClick={() => { setErr(null); setPaso('subir') }} style={btnVerde(true)}>
                  <i className="ti ti-photo-plus" style={{ fontSize: '16px' }} />Agregar imágenes
                </button>
              </div>
            </div>

            {/* ── 2. Agregar imágenes ── */}
            <div style={{ width: '50%', display: 'flex', flexDirection: 'column' }} aria-hidden={paso !== 'subir'}>
              <div style={{ padding: '1.25rem 1.5rem', height: '420px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div
                  onClick={() => refInput.current?.click()}
                  onDragOver={e => { e.preventDefault(); setArrastrando(true) }}
                  onDragLeave={() => setArrastrando(false)}
                  onDrop={e => { e.preventDefault(); setArrastrando(false); agregarArchivos(e.dataTransfer.files) }}
                  style={{ ...lienzo, flex: nuevas.length ? '0 0 150px' : 1, borderStyle: 'dashed', borderWidth: '2px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', textAlign: 'center', padding: '1rem',
                    borderColor: arrastrando ? t.text2 : t.cardBorder, background: arrastrando ? (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)') : lienzo.background, transition: 'background 0.15s, border-color 0.15s, flex-basis 0.25s' }}>
                  <i className="ti ti-cloud-upload" style={{ fontSize: '30px', color: t.text3 }} />
                  <p style={{ fontSize: '14px', fontWeight: 500, color: t.text1 }}>Arrastra imágenes aquí o haz clic para seleccionar</p>
                  <p style={{ fontSize: '12px', color: t.text4 }}>JPG, PNG o WEBP · hasta {MAX_MB_FOTO} MB cada una</p>
                  <input ref={refInput} type="file" accept="image/*" multiple hidden
                    onChange={e => { agregarArchivos(e.target.files); e.target.value = '' }} />
                </div>
                {nuevas.length > 0 && (
                  <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: '8px', alignContent: 'start' }}>
                    {nuevas.map((n, i) => (
                      <div key={n.url} style={{ position: 'relative', aspectRatio: '1', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${t.cardBorder}` }}>
                        <img src={n.url} alt={n.archivo.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        <button onClick={() => quitar(i)} title="Quitar" disabled={subiendo}
                          style={{ position: 'absolute', top: '5px', right: '5px', width: '24px', height: '24px', borderRadius: '6px', border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <i className="ti ti-x" style={{ fontSize: '13px' }} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {err && <p style={{ fontSize: '12.5px', color: dark ? '#f8a8a8' : '#b91c1c' }}><i className="ti ti-alert-circle" style={{ marginRight: '5px' }} />{err}</p>}
              </div>
              <div style={pie}>
                <button onClick={() => { setErr(null); setPaso('galeria') }} disabled={subiendo} style={btnCerrar}>
                  <i className="ti ti-arrow-left" style={{ fontSize: '15px', marginRight: '6px', verticalAlign: '-2px' }} />Regresar
                </button>
                <button onClick={subir} disabled={subiendo || !nuevas.length} style={btnVerde(!subiendo && nuevas.length > 0)}>
                  {subiendo
                    ? <><i className="ti ti-loader-2" style={{ fontSize: '15px', animation: 'spin 1s linear infinite' }} />Subiendo…</>
                    : <><i className="ti ti-upload" style={{ fontSize: '16px' }} />{nuevas.length ? `Subir ${nuevas.length} ${nuevas.length === 1 ? 'imagen' : 'imágenes'}` : 'Subir imágenes'}</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
