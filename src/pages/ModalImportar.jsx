import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { iStyle, sStyle } from './ui'
import {
  leerArchivo, detectarEncabezado, mapearColumnas, extraerFilas,
  CAMPOS_MUEBLES, CAMPOS_INMUEBLES, aTexto,
} from '../importarExcel'
import { analizarMuebles, guardarMuebles, analizarInmuebles, guardarInmuebles } from '../importarGuardar'

// ── Importar bienes desde un Excel ───────────────────────────────────────────
//
// Cuatro pasos y ninguno escribe hasta el último:
//
//   1 archivo   se elige el .xlsx y la hoja
//   2 mapeo     se enseña qué columna entendió para cada campo, y se corrige
//   3 revisión  renglón por renglón: listo, clave repetida o con error
//   4 guardar   solo se insertan los que quedaron en "listo"
//
// La clave se respeta tal como viene del archivo. Las repetidas se saltan: en
// este inventario una misma clave llegó a usarse para bienes distintos, así que
// duplicarlas al recargar un archivo es justo lo que hay que evitar.

const COLORES = {
  listo:    { luz: '#1e7e4a', osc: '#7ee8a2', etq: 'Listo' },
  repetido: { luz: '#b7790a', osc: '#ffd580', etq: 'Ya existe' },
  error:    { luz: '#c0392b', osc: '#f4a1a1', etq: 'Con problema' },
}

// De qué categoría es la hoja, por su nombre: así el Excel de MOBILIARIO entra
// como mobiliario y el de VEHICULAR como vehículos, sin tener que elegirlo.
const CAT_POR_HOJA = [
  [/VEHICULAR.*REMOLQUE|REMOLQUE|CARROCERIA/i, 'VEHICULAR-REMOLQUES-CARROCERIAS'],
  [/VEHICULAR.*MAQUINARIA/i,                   'VEHICULAR-MAQUINARIA'],
  [/VEHICULAR|VEHICULO/i,                      'VEHICULAR'],
  [/MAQUINARIA.*DEFENSA|DEFENSA|SEGURIDAD PUBLICA/i, 'MAQUINARIA Y EQUIPO DE DEFENSA Y SEGURIDAD PUBLICA'],
  [/MAQUINARIA/i,                              'MAQUINARIA'],
  [/COMPUTO|COMPUTO|EQUIPO DE COMPUTO/i,       'EQUIPO DE COMPUTO'],
  [/RADIO/i,                                   'RADIOCOMUNICACION'],
  [/PARQUI/i,                                  'EQUIPO DE CONTROL TIEMPO PARQUI'],
  [/SENALIZ|SEÑALIZ/i,                         'SEÑALIZACIONES'],
  [/ARBOL|PLANTA/i,                            'ARBOLES Y PLANTAS'],
  [/MOBILIARIO/i,                              'MOBILIARIO'],
  [/EQUIPO/i,                                  'EQUIPO DE COMPUTO'],
]
const CATEGORIAS_MUEBLES = [
  'MOBILIARIO', 'EQUIPO DE COMPUTO', 'MAQUINARIA', 'VEHICULAR',
  'VEHICULAR-MAQUINARIA', 'VEHICULAR-REMOLQUES-CARROCERIAS', 'RADIOCOMUNICACION',
  'EQUIPO DE CONTROL TIEMPO PARQUI', 'SEÑALIZACIONES', 'ARBOLES Y PLANTAS',
  'MAQUINARIA Y EQUIPO DE DEFENSA Y SEGURIDAD PUBLICA',
]
const categoriaDeHoja = nombre => (CAT_POR_HOJA.find(([re]) => re.test(nombre || '')) || [])[1] || 'MOBILIARIO'

// Hojas que no son de altas: sus bienes ya se dieron de baja, se traspasaron o
// son reclasificaciones —esos no van en el inventario—. Se pueden marcar a mano
// si hiciera falta, pero de entrada quedan fuera.
const NO_SON_ALTAS = /BAJA|TRASPAS|RECLASIFIC|GASTO|DESINCORPOR/i

// embebido: sin fondo, sin marco y sin encabezado propios. Así va como segunda
// página de "Nuevo bien" / "Nuevo inmueble", que ya ponen el encabezado.
export default function ModalImportar({ tipo = 'muebles', areas = [], categorias = [], onClose, onImportado, dark, t, embebido = false }) {
  const esMuebles = tipo === 'muebles'
  const CAMPOS = esMuebles ? CAMPOS_MUEBLES : CAMPOS_INMUEBLES

  const [paso, setPaso]       = useState('archivo')   // archivo | mapeo | revision | resultado
  const [nombreArch, setNombreArch] = useState('')
  const [hojas, setHojas]     = useState([])          // una entrada por hoja del archivo
  const [analizadas, setAnalizadas]   = useState([])
  const [ocupado, setOcupado] = useState(false)
  const [avance, setAvance]   = useState(null)
  const [err, setErr]         = useState(null)
  const [resultado, setResultado] = useState(null)
  const [arrastrando, setArrastrando] = useState(false)

  async function elegirArchivo(file) {
    if (!file) return
    setOcupado(true); setErr(null)
    try {
      const leidas = await leerArchivo(file)
      setNombreArch(file.name)
      // Todas las hojas se preparan de una vez: un inventario trae mobiliario,
      // cómputo y vehicular en el mismo archivo y no tiene caso importarlo
      // tres veces, una por hoja.
      setHojas(leidas.map(h => {
        const enc = detectarEncabezado(h.filas, CAMPOS)
        const mapa = enc ? mapearColumnas(enc.titulos, CAMPOS) : {}
        const filas = enc ? extraerFilas(h.filas, enc.filaDatos, mapa, CAMPOS) : []
        const noEsAlta = NO_SON_ALTAS.test(h.nombre || '')
        return {
          nombre: h.nombre, enc, mapa, filas, noEsAlta,
          categoria: categoriaDeHoja(h.nombre),
          // Las de bajas, traspasos y reclasificación se dejan desmarcadas: sus
          // bienes no son altas, y los de reclasificación no deben entrar.
          incluir: !!enc && filas.length > 0 && !noEsAlta,
        }
      }))
      setPaso('mapeo')
    } catch (e) { setErr('No pude leer el archivo: ' + e.message) }
    finally { setOcupado(false) }
  }

  const cambiarHoja = (i, campos) => setHojas(l => l.map((h, j) => j === i ? { ...h, ...campos } : h))

  const elegidas = useMemo(() => hojas.filter(h => h.incluir && h.enc && h.filas.length), [hojas])
  const totalFilas = useMemo(() => elegidas.reduce((n, h) => n + h.filas.length, 0), [elegidas])

  async function revisar() {
    setOcupado(true); setErr(null)
    try {
      const todas = []
      for (const h of elegidas) {
        // Sin área ni categoría por omisión: lo que no se reconozca se marca como
        // problema y se queda fuera, en vez de irse a un cajón elegido a mano.
        const r = esMuebles
          ? await analizarMuebles(h.filas, { areas, idareaPorDefecto: null })
          : await analizarInmuebles(h.filas, { categorias, idcategoriaPorDefecto: null })
        r.forEach(x => { x.hoja = h.nombre; x.categoria = h.categoria })
        todas.push(...r)
      }

      // Una misma clave puede venir en dos hojas del mismo archivo —el bien
      // aparece en MOBILIARIO y otra vez en TRASPASOS—. Contra la base ya se
      // comparó cada hoja; esto atrapa las que se repiten entre ellas.
      const vistas = new Set()
      for (const r of todas) {
        const k = (r.clave || '').trim().toUpperCase()
        if (!k) continue
        if (vistas.has(k) && r.estado === 'listo') {
          r.estado = 'repetido'
          r.nota = 'la clave se repite en otra hoja del archivo'
        }
        vistas.add(k)
      }

      setAnalizadas(todas)
      setPaso('revision')
    } catch (e) { setErr(e.message) }
    finally { setOcupado(false) }
  }

  async function guardar() {
    setOcupado(true); setErr(null); setAvance({ hechos: 0, total: 0 })
    try {
      const listas = analizadas.filter(r => r.estado === 'listo')
      const total = listas.length
      let insertados = 0, facturas = 0
      const porCategoria = []

      if (esMuebles) {
        // Cada categoría va en su propia pasada: `categoriainventario` es del
        // bien, y en un archivo vienen mezcladas.
        const grupos = new Map()
        for (const r of listas) {
          if (!grupos.has(r.categoria)) grupos.set(r.categoria, [])
          grupos.get(r.categoria).push(r)
        }
        let base = 0
        for (const [cat, grupo] of grupos) {
          const r = await guardarMuebles(grupo, {
            categoria: cat,
            onProgreso: hechos => setAvance({ hechos: base + hechos, total }),
          })
          insertados += r.insertados; facturas += r.facturas || 0
          porCategoria.push({ etq: cat, n: r.insertados })
          base += grupo.length
        }
      } else {
        const r = await guardarInmuebles(listas, { onProgreso: hechos => setAvance({ hechos, total }) })
        insertados = r.insertados
      }

      setResultado({ insertados, facturas, porCategoria })
      setPaso('resultado')
      onImportado && onImportado()
    } catch (e) { setErr(e.message) }
    finally { setOcupado(false); setAvance(null) }
  }

  const cuenta = useMemo(() => {
    const c = { listo: 0, repetido: 0, error: 0 }
    analizadas.forEach(r => { c[r.estado] = (c[r.estado] || 0) + 1 })
    return c
  }, [analizadas])

  const nombreCategoria = id => categorias.find(c => c.idcategoria === Number(id))?.nombrecategoria || ''

  const lbl = { fontSize: '10px', fontWeight: 700, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }
  const sep = dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)'
  const color = e => (dark ? COLORES[e]?.osc : COLORES[e]?.luz) || t.text3

  const contenido = (
    <>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* 1. Archivo */}
          {/* Ocupa todo el alto disponible y también recibe el archivo arrastrado */}
          {paso === 'archivo' && (
            <label
              onDragOver={e => { e.preventDefault(); setArrastrando(true) }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={e => {
                e.preventDefault(); setArrastrando(false)
                const archivo = e.dataTransfer.files?.[0]
                if (archivo && !/\.(xlsx|xlsm|xls)$/i.test(archivo.name)) { setErr(`${archivo.name} no es un archivo de Excel`); return }
                elegirArchivo(archivo)
              }}
              style={{ flex: 1, minHeight: '260px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2.5rem 1rem', textAlign: 'center', borderRadius: '12px', cursor: 'pointer',
                border: `2px dashed ${arrastrando ? t.text2 : (dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.16)')}`,
                background: arrastrando ? (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)') : (dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                transition: 'background 0.15s, border-color 0.15s' }}>
              <input type="file" accept=".xlsx,.xlsm,.xls" style={{ display: 'none' }}
                onChange={e => elegirArchivo(e.target.files?.[0])} />
              <i className={`ti ${arrastrando ? 'ti-file-download' : 'ti-upload'}`} style={{ fontSize: '34px', color: t.text3 }} />
              <p style={{ fontSize: '14px', color: t.text1, fontWeight: 500, marginTop: '10px' }}>
                {ocupado ? 'Leyendo…' : arrastrando ? 'Suelta el archivo aquí' : 'Arrastra el archivo de Excel aquí o haz clic para elegirlo'}
              </p>
              <p style={{ fontSize: '12px', color: t.text4, marginTop: '4px' }}>
                Se lee el archivo tal como está; no se modifica.
              </p>
            </label>
          )}

          {/* 2. Mapeo */}
          {paso === 'mapeo' && (
            <>
              <div>
                <p style={lbl}>Hojas del archivo · se importan todas las marcadas</p>
                <div style={{ border: `1px solid ${t.cardBorder}`, borderRadius: '10px', overflow: 'hidden' }}>
                  {hojas.map((h, i) => {
                    const sirve = !!h.enc && h.filas.length > 0
                    return (
                      <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderBottom: i < hojas.length - 1 ? sep : 'none', cursor: sirve ? 'pointer' : 'default', background: h.incluir ? (dark ? 'rgba(168,230,207,0.07)' : 'rgba(30,126,74,0.04)') : 'transparent' }}>
                        <input type="checkbox" checked={h.incluir} disabled={!sirve}
                          onChange={e => cambiarHoja(i, { incluir: e.target.checked })}
                          style={{ width: '15px', height: '15px', flexShrink: 0, accentColor: dark ? '#a8e6cf' : '#15803d' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '13px', color: sirve ? t.text1 : t.text4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {h.nombre}
                          </p>
                          <p style={{ fontSize: '11px', color: t.text4, marginTop: '1px' }}>
                            {!h.enc ? 'no encontré el encabezado'
                              : !h.filas.length ? 'sin renglones con nombre'
                              : `${h.filas.length} renglones · encabezado en el ${h.enc.fila + 1}`}
                            {sirve && h.noEsAlta && ' · no parece hoja de altas'}
                          </p>
                        </div>
                        {/* Solo en las hojas de altas que se van a importar. En las de
                            bajas y traspasos no sale nunca, ni marcándolas a mano. */}
                        {esMuebles && sirve && h.incluir && !h.noEsAlta && (
                          <select value={h.categoria} onClick={e => e.preventDefault()}
                            onChange={e => cambiarHoja(i, { categoria: e.target.value })}
                            style={{ ...sStyle(dark), width: '235px', flexShrink: 0, fontSize: '12px', padding: '6px 9px' }}>
                            {CATEGORIAS_MUEBLES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        )}
                      </label>
                    )
                  })}
                </div>
              </div>

              {!elegidas.length ? (
                <div style={{ padding: '11px 13px', borderRadius: '10px', border: `1px solid ${t.cardBorder}`, background: dark ? 'rgba(244,161,161,0.1)' : 'rgba(192,57,43,0.06)' }}>
                  <p style={{ fontSize: '13px', color: color('error') }}>
                    No hay ninguna hoja marcada con renglones que leer.
                  </p>
                </div>
              ) : (
                <>
                  {/* Un vistazo a los primeros renglones de la primera hoja marcada,
                      ya interpretados, para cachar un mapeo torcido antes de seguir */}
                  {elegidas[0] && (
                    <div>
                      <p style={lbl}>Primeros renglones de {elegidas[0].nombre}</p>
                      <div style={{ overflowX: 'auto', border: `1px solid ${t.cardBorder}`, borderRadius: '9px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                          <tbody>
                            {elegidas[0].filas.slice(0, 4).map((f, i) => (
                              <tr key={i} style={{ borderBottom: i < 3 ? sep : 'none' }}>
                                {CAMPOS.filter(c => elegidas[0].mapa[c.id] != null).slice(0, 6).map(c => (
                                  <td key={c.id} style={{ padding: '6px 9px', color: t.text2, whiteSpace: 'nowrap', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {aTexto(f.datos[c.id]) || '—'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* 3. Revisión */}
          {paso === 'revision' && (
            <>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['listo', 'repetido', 'error'].map(e => (
                  <div key={e} style={{ flex: 1, padding: '10px 12px', borderRadius: '10px', border: `1px solid ${t.cardBorder}`, background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}>
                    <p style={{ fontSize: '22px', fontWeight: 600, color: color(e), lineHeight: 1 }}>{cuenta[e] || 0}</p>
                    <p style={{ fontSize: '11px', color: t.text3, marginTop: '4px' }}>{COLORES[e].etq}</p>
                  </div>
                ))}
              </div>

              <div style={{ border: `1px solid ${t.cardBorder}`, borderRadius: '9px', overflow: 'hidden' }}>
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <tbody>
                      {analizadas.map((r, i) => (
                        <tr key={i} style={{ borderBottom: sep }}>
                          {/* De qué hoja salió: en un archivo con varias, sin esto no se
                              sabe a cuál volver cuando un renglón sale con problema */}
                          <td style={{ padding: '6px 9px', color: t.text4, maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.hoja}</td>
                          <td style={{ padding: '6px 9px', color: t.text4, whiteSpace: 'nowrap' }}>{r.fila}</td>
                          <td style={{ padding: '6px 9px', color: t.text2, whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '11px' }}>{r.clave || '—'}</td>
                          <td style={{ padding: '6px 9px', color: t.text1, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nombre}</td>
                          {/* En inmuebles la categoría cambia renglón por renglón, así que
                              se ve aquí para poder revisarla antes de dar de alta */}
                          <td style={{ padding: '6px 9px', color: t.text3, maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {esMuebles ? (r.nombreArea || '—') : (nombreCategoria(r.idcategoria) || '—')}
                          </td>
                          <td style={{ padding: '6px 9px', whiteSpace: 'nowrap', color: color(r.estado) }}>{COLORES[r.estado].etq}</td>
                          <td style={{ padding: '6px 9px', color: t.text4, maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nota}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <p style={{ fontSize: '11.5px', color: t.text4 }}>
                Se darán de alta los <b style={{ color: color('listo') }}>{cuenta.listo || 0}</b> renglones en estado listo.
                Los que ya existen y los que tienen problema se quedan fuera.
              </p>
            </>
          )}

          {/* 4. Resultado */}
          {paso === 'resultado' && resultado && (
            <div style={{ padding: '1.5rem', textAlign: 'center' }}>
              <i className="ti ti-circle-check" style={{ fontSize: '34px', color: color('listo') }} />
              <p style={{ fontSize: '16px', fontWeight: 600, color: t.text1, marginTop: '10px' }}>
                Se dieron de alta {resultado.insertados} {esMuebles ? 'bienes' : 'inmuebles'}
              </p>
              {resultado.facturas > 0 && (
                <p style={{ fontSize: '12.5px', color: t.text3, marginTop: '5px' }}>y {resultado.facturas} facturas</p>
              )}
              {resultado.porCategoria?.length > 1 && (
                <div style={{ marginTop: '10px', display: 'inline-flex', flexDirection: 'column', gap: '2px' }}>
                  {resultado.porCategoria.map(c => (
                    <p key={c.etq} style={{ fontSize: '12px', color: t.text3 }}>{c.etq}: <b>{c.n}</b></p>
                  ))}
                </div>
              )}
              {(cuenta.repetido || cuenta.error) > 0 && (
                <p style={{ fontSize: '12.5px', color: t.text3, marginTop: '8px' }}>
                  Quedaron fuera {cuenta.repetido || 0} por clave repetida y {cuenta.error || 0} con problema.
                </p>
              )}
            </div>
          )}

          {avance && (
            <p style={{ fontSize: '12px', color: t.text3 }}>Guardando… {avance.hechos} de {avance.total}</p>
          )}
          {err && (
            <p style={{ fontSize: '12px', color: color('error') }}>
              <i className="ti ti-alert-circle" style={{ marginRight: '5px' }} />{err}
            </p>
          )}
        </div>

        {/* Botones */}
        <div style={{ padding: '1rem 1.5rem 1.25rem', display: 'flex', gap: '8px', borderTop: sep, flexShrink: 0 }}>
          {paso === 'mapeo' && (
            <>
              <button onClick={() => { setPaso('archivo'); setHojas([]); setNombreArch('') }} disabled={ocupado}
                style={{ padding: '11px 16px', borderRadius: '9px', fontSize: '14px', fontFamily: 'inherit', cursor: 'pointer', background: 'transparent', border: `1px solid ${t.cardBorder}`, color: t.text3 }}>
                Otro archivo
              </button>
              <button onClick={revisar} disabled={ocupado || !totalFilas}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', padding: '11px', borderRadius: '9px', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', cursor: (ocupado || !totalFilas) ? 'not-allowed' : 'pointer', opacity: totalFilas ? 1 : 0.5, background: dark ? 'rgba(168,230,207,0.18)' : 'rgba(30,126,74,0.08)', border: dark ? '1px solid rgba(168,230,207,0.35)' : '1px solid rgba(30,126,74,0.35)', color: dark ? '#a8e6cf' : '#15803d' }}>
                {ocupado ? 'Revisando…' : `Revisar ${totalFilas} renglones de ${elegidas.length} ${elegidas.length === 1 ? 'hoja' : 'hojas'}`}
              </button>
            </>
          )}
          {paso === 'revision' && (
            <>
              <button onClick={() => setPaso('mapeo')} disabled={ocupado}
                style={{ padding: '11px 16px', borderRadius: '9px', fontSize: '14px', fontFamily: 'inherit', cursor: 'pointer', background: 'transparent', border: `1px solid ${t.cardBorder}`, color: t.text3 }}>
                Volver
              </button>
              <button onClick={guardar} disabled={ocupado || !(cuenta.listo > 0)}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', padding: '11px', borderRadius: '9px', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', cursor: (ocupado || !cuenta.listo) ? 'not-allowed' : 'pointer', opacity: cuenta.listo ? 1 : 0.5, background: dark ? 'rgba(168,230,207,0.18)' : 'rgba(30,126,74,0.08)', border: dark ? '1px solid rgba(168,230,207,0.35)' : '1px solid rgba(30,126,74,0.35)', color: dark ? '#a8e6cf' : '#15803d' }}>
                {ocupado ? 'Guardando…' : `Dar de alta ${cuenta.listo || 0}`}
              </button>
            </>
          )}
          {paso === 'resultado' && (
            <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: '9px', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', border: `1px solid ${t.cardBorder}`, color: t.text1 }}>
              Cerrar
            </button>
          )}
          {paso === 'archivo' && (
            <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: '9px', fontSize: '14px', fontFamily: 'inherit', cursor: 'pointer', background: 'transparent', border: `1px solid ${t.cardBorder}`, color: t.text3 }}>
              Cancelar
            </button>
          )}
        </div>
    </>
  )

  if (embebido) return <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{contenido}</div>

  return createPortal(
    <>
      <div onClick={ocupado ? undefined : onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} />
      <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 301, width: '760px', maxWidth: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: dark ? '#1e1e20' : '#fff', borderRadius: '16px', border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', overflow: 'hidden' }}>

        {/* Encabezado */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: sep, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '9px', flexShrink: 0, background: t.iconBox, border: `1px solid ${t.iconBoxBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="ti ti-file-spreadsheet" style={{ fontSize: '18px', color: t.text1 }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: '15px', fontWeight: 600, color: dark ? '#fff' : '#111' }}>
                Importar {esMuebles ? 'bienes muebles' : 'inmuebles'} desde Excel
              </p>
              <p style={{ fontSize: '12px', color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {nombreArch || 'Elige el archivo y revisa antes de guardar'}
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={ocupado} style={{ width: '30px', height: '30px', flexShrink: 0, borderRadius: '7px', background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: ocupado ? 'default' : 'pointer', color: dark ? '#ccc' : '#555' }}>
            <i className="ti ti-x" style={{ fontSize: '15px' }} />
          </button>
        </div>

        {contenido}
      </div>
    </>,
    document.body
  )
}
