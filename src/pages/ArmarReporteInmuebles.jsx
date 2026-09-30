import { useState, useRef } from 'react'
import { fileADataURL } from '../reporteEvidencias'

// Solo queda la página de evidencias del reporte de inmuebles. Aquí vivía
// también una pantalla vieja para armar ese reporte (ArmarReporteInmuebles)
// que ya no se abría desde ningún lado y usaba un modal que no existía.

function thBase(dark) {
  return { padding: '9px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', verticalAlign: 'middle', background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }
}
function tdBase() { return { padding: '10px 10px', verticalAlign: 'top' } }

// Zona para arrastrar / elegir un archivo de imagen
function Dropzone({ valor, onArchivo, dark }) {
  const [drag, setDrag] = useState(false)
  const ref = useRef(null)
  function tomar(files) { const f = Array.from(files).find(x => x.type.startsWith('image/')); if (f) onArchivo(f) }
  return (
    <div onClick={() => ref.current.click()}
      onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); tomar(e.dataTransfer.files) }}
      style={{ position: 'relative', width: '100%', height: '64px', borderRadius: '8px', cursor: 'pointer',
        border: `2px dashed ${drag ? (dark ? '#a8c5f8' : '#2563eb') : (dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)')}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        background: drag ? (dark ? 'rgba(168,197,248,0.08)' : 'rgba(37,99,235,0.04)') : 'transparent' }}>
      <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => tomar(e.target.files)} />
      {valor
        ? <img src={valor.dataURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        : <span style={{ fontSize: '11px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textAlign: 'center', padding: '0 6px' }}><i className="ti ti-photo-up" style={{ fontSize: '16px', display: 'block', marginBottom: '2px' }} />Arrastra o elige</span>}
    </div>
  )
}


// ── Página de evidencias ──────────────────────────────────────────────────────
// Se muestra como segunda página del modal de Generar Reporte: adjunta la foto y
// el documento de cada inmueble y genera el reporte con esas imágenes.
export function PaginaEvidencias({ onVolver, bienes, adjuntos, setAdjuntos, dark, t }) {
  const sep = dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)'
  const conImagen = bienes.filter(b => adjuntos[b.idinmueble]?.foto || adjuntos[b.idinmueble]?.documento).length

  async function setArchivo(id, campo, file) {
    const img = await fileADataURL(file)
    setAdjuntos(prev => ({ ...prev, [id]: { ...prev[id], [campo]: img } }))
  }
  function quitar(id, campo) { setAdjuntos(prev => ({ ...prev, [id]: { ...prev[id], [campo]: null } })) }

  return (
    <>
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: sep, display: 'flex', alignItems: 'center', gap: '11px', flexShrink: 0 }}>
        <button onClick={onVolver} title="Volver"
          style={{ width: '34px', height: '34px', borderRadius: '9px', flexShrink: 0, background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', border: `1px solid ${t.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: t.text2 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: '17px' }} />
        </button>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: '15px', fontWeight: 600, color: dark ? '#fff' : '#111' }}>Evidencias</p>
          <p style={{ fontSize: '12px', color: t.text4 }}>
            {conImagen} de {bienes.length} con evidencia · se anexan al final del reporte
          </p>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {bienes.length === 0
          ? <p style={{ fontSize: '13px', color: t.text4, textAlign: 'center', padding: '3rem 0' }}>Cargando inmuebles…</p>
          : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={{ ...thBase(dark), width: '56px' }}>NO.</th>
                  <th style={{ ...thBase(dark), width: '110px' }}>CLAVE</th>
                  <th style={{ ...thBase(dark) }}>NOMBRE DEL INMUEBLE</th>
                  <th style={{ ...thBase(dark), width: '140px' }}>FOTO</th>
                  <th style={{ ...thBase(dark), width: '140px' }}>DOCUMENTO</th>
                </tr>
              </thead>
              <tbody>
                {bienes.map((b, i) => (
                  <tr key={b.idinmueble} style={{ borderBottom: sep }}>
                    <td style={{ ...tdBase(), verticalAlign: 'middle', color: t.text4 }}>{i + 1}</td>
                    <td style={{ ...tdBase(), verticalAlign: 'middle' }}><span style={{ fontFamily: 'monospace', fontSize: '11px', color: t.text3 }}>{b.claveinmueble || '—'}</span></td>
                    <td style={{ ...tdBase(), verticalAlign: 'middle' }}><span style={{ color: t.text1, fontSize: '12px' }}>{b.nombreinmueble || '—'}</span></td>
                    <td style={tdBase()}>
                      <div style={{ position: 'relative' }}>
                        <Dropzone valor={adjuntos[b.idinmueble]?.foto} onArchivo={f => setArchivo(b.idinmueble, 'foto', f)} dark={dark} />
                        {adjuntos[b.idinmueble]?.foto && <button onClick={() => quitar(b.idinmueble, 'foto')} style={{ position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px', borderRadius: '50%', background: dark ? '#333' : '#fff', border: `1px solid ${dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'}`, cursor: 'pointer', fontSize: '10px', color: dark ? '#ccc' : '#555', padding: 0 }}>✕</button>}
                      </div>
                    </td>
                    <td style={tdBase()}>
                      <div style={{ position: 'relative' }}>
                        <Dropzone valor={adjuntos[b.idinmueble]?.documento} onArchivo={f => setArchivo(b.idinmueble, 'documento', f)} dark={dark} />
                        {adjuntos[b.idinmueble]?.documento && <button onClick={() => quitar(b.idinmueble, 'documento')} style={{ position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px', borderRadius: '50%', background: dark ? '#333' : '#fff', border: `1px solid ${dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'}`, cursor: 'pointer', fontSize: '10px', color: dark ? '#ccc' : '#555', padding: 0 }}>✕</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>}
      </div>

      <div style={{ flexShrink: 0, padding: '1rem 1.5rem', borderTop: sep, display: 'flex' }}>
        <button onClick={onVolver}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '7px', padding: '11px 22px', borderRadius: '9px', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)', border: `1px solid ${t.cardBorder}`, color: t.text1 }}>
          <i className="ti ti-check" style={{ fontSize: '15px' }} />Listo
        </button>
      </div>
    </>
  )
}
