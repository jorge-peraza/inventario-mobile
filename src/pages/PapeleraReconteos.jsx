import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabase'
import { thBase, tdBase, btnAccion } from './ui'

// ── Papelera de reconteos ────────────────────────────────────────────────────
// Los reconteos que se quitaron del historial (desde la computadora o desde el
// celular). Siguen completos en la base, con todo lo que se verificó; desde
// aquí se regresan al historial tal como estaban.

function fmtFecha(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtHora(iso) {
  return iso ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : ''
}

function ModalRestaurar({ reconteo, onClose, onHecho, dark, t }) {
  const [ocupado, setOcupado] = useState(false)
  const [err, setErr] = useState(null)
  async function restaurar() {
    setOcupado(true); setErr(null)
    try {
      const { error } = await supabase.from('reconteos').update({ en_papelera: null }).eq('idreconteo', reconteo.idreconteo)
      if (error) throw error
      onHecho()
    } catch (e) { setErr(e.message); setOcupado(false) }
  }
  return createPortal(
    <>
      <div onClick={ocupado ? undefined : onClose} className="telon" style={{ zIndex: 300 }} />
      <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 301, width: '440px', maxWidth: '94vw', background: dark ? '#1e1e20' : '#fff', borderRadius: '16px', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', animation: 'fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)', overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem 1.5rem' }}>
          <p style={{ fontSize: '15px', fontWeight: 600, color: dark ? '#fff' : '#111', marginBottom: '8px' }}>¿Regresar este reconteo al historial?</p>
          <p style={{ fontSize: '13px', color: t.text3, lineHeight: 1.55 }}>
            El conteo de "{reconteo.nombrearea}" del {fmtFecha(reconteo.inicio)} vuelve al historial con todo lo que se verificó.
          </p>
          {err && <p style={{ fontSize: '12.5px', color: dark ? '#f8a8a8' : '#b91c1c', marginTop: '10px' }}>{err}</p>}
        </div>
        <div style={{ padding: '1rem 1.5rem', borderTop: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', display: 'flex', gap: '8px' }}>
          <button onClick={onClose} disabled={ocupado}
            style={{ flex: 1, padding: '10px', background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)', border: dark ? '1px solid rgba(255,255,255,0.13)' : '1px solid rgba(0,0,0,0.09)', borderRadius: '9px', fontSize: '14px', fontWeight: 500, color: dark ? '#ccc' : '#444', fontFamily: 'inherit', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={restaurar} disabled={ocupado}
            style={{ flex: 1, padding: '10px', borderRadius: '9px', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', background: dark ? 'rgba(168,230,207,0.18)' : 'rgba(30,126,74,0.08)', border: dark ? '1px solid rgba(168,230,207,0.35)' : '1px solid rgba(30,126,74,0.35)', color: dark ? '#a8e6cf' : '#15803d' }}>
            {ocupado ? 'Regresando…' : 'Regresar al historial'}
          </button>
        </div>
      </div>
    </>,
    document.body
  )
}

export default function PapeleraReconteos({ dark, t, card, onConteo }) {
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [restaurar, setRestaurar] = useState(null)

  const cargar = useCallback(async () => {
    setCargando(true); setError(null)
    try {
      const { data, error } = await supabase.from('reconteos').select('*').order('inicio', { ascending: false })
      if (error) throw error
      const enPapelera = (data || []).filter(r => r.en_papelera)
        .sort((a, b) => String(b.en_papelera).localeCompare(String(a.en_papelera)))
      setLista(enPapelera)
      onConteo?.(enPapelera.length)
    } catch (e) { setError(e.message); onConteo?.(0) }
    finally { setCargando(false) }
  // onConteo cambia en cada render de la página: no debe volver a cargar
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const borde = dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)'
  const COLS = ['FECHA', 'ÁREA', 'DEPENDENCIA', 'INICIÓ', 'BIENES', 'VERIFICADOS', 'EN LA PAPELERA DESDE', 'ACCIONES']

  return (
    <>
      {error && (
        <div style={{ ...card, padding: '1rem 1.25rem', marginBottom: '1rem', color: dark ? '#f4a1a1' : '#c0392b', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="ti ti-alert-circle" style={{ fontSize: '18px' }} />{error}
        </div>
      )}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}` }}>
                {COLS.map((c, i) => <th key={c} style={{ ...thBase(dark), borderLeft: i ? borde : 'none' }}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {cargando
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>{COLS.map((c, j) => (
                      <td key={c} style={tdBase()}><div style={{ height: '14px', borderRadius: '6px', background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', animation: 'pulse 1.5s ease-in-out infinite', width: j === 1 ? '80%' : '60%' }} /></td>
                    ))}</tr>
                  ))
                : lista.length === 0
                  ? <tr><td colSpan={COLS.length} style={{ padding: '3rem', textAlign: 'center', color: t.text4 }}>
                      <i className="ti ti-trash-off" style={{ fontSize: '28px', display: 'block', marginBottom: '8px' }} />
                      No hay reconteos en la papelera
                    </td></tr>
                  : lista.map((r, i) => {
                      const bgFila = i % 2 === 0 ? 'transparent' : (dark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.015)')
                      return (
                        <tr key={r.idreconteo} style={{ borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`, background: bgFila }}>
                          <td style={{ ...tdBase(), whiteSpace: 'nowrap' }}>
                            <p style={{ color: t.text1, fontWeight: 500 }}>{fmtFecha(r.inicio)}</p>
                            <p style={{ color: t.text4, fontSize: '11px', marginTop: '2px' }}>{fmtHora(r.inicio)}</p>
                          </td>
                          <td style={{ ...tdBase(), maxWidth: '210px', overflowWrap: 'anywhere' }}><span style={{ color: t.text1, fontWeight: 500 }}>{r.nombrearea || '—'}</span></td>
                          <td style={{ ...tdBase(), maxWidth: '190px', overflowWrap: 'anywhere' }}><span style={{ color: t.text2 }}>{r.dependencia || '—'}</span></td>
                          <td style={tdBase()}><span style={{ color: t.text2 }}>{r.usuario || '—'}</span></td>
                          <td style={tdBase()}><span style={{ color: t.text2, fontWeight: 500 }}>{(r.esperados || 0).toLocaleString()}</span></td>
                          <td style={tdBase()}><span style={{ color: dark ? '#7ee8a2' : '#1e7e4a', fontWeight: 500 }}>{(r.encontrados || 0).toLocaleString()}</span></td>
                          <td style={{ ...tdBase(), whiteSpace: 'nowrap' }}>
                            <p style={{ color: t.text2 }}>{fmtFecha(r.en_papelera)}</p>
                            <p style={{ color: t.text4, fontSize: '11px', marginTop: '2px' }}>{fmtHora(r.en_papelera)}</p>
                          </td>
                          <td style={tdBase()}>
                            <button onClick={() => setRestaurar(r)} title="Regresar al historial" style={btnAccion(dark, 'editar')}
                              onMouseEnter={e => e.currentTarget.style.opacity = '0.7'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                              <i className="ti ti-arrow-back-up" style={{ fontSize: '14px' }} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
            </tbody>
          </table>
        </div>
      </div>

      {restaurar && (
        <ModalRestaurar reconteo={restaurar} dark={dark} t={t}
          onClose={() => setRestaurar(null)}
          onHecho={() => { setRestaurar(null); cargar() }} />
      )}
    </>
  )
}
