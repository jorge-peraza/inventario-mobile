import { useEffect, useMemo, useState } from 'react'
import { Cabecera } from './AppMovil'
import { irA } from '../rutas'
import { areasConDependencia, bienesDeArea, bienPorClave, buscarBienes } from './datos'
import {
  abrirReconteo, reconteoAbierto, reconteo, listaReconteos, marcar, desmarcar,
  cerrarReconteo, resumen, fechaCorta,
} from './reconteo'

const fmtDinero = n => n ? '$ ' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'

function Cargando({ texto = 'Cargando…' }) {
  return <div className="cargando"><i className="ti ti-loader-2 gira" />{texto}</div>
}

function Vacio({ icono = 'ti-search-off', texto }) {
  return <div className="vacio"><i className={`ti ${icono}`} />{texto}</div>
}

// ── Inicio ───────────────────────────────────────────────────────────────────
export function InicioMuebles({ user }) {
  const [abiertos, setAbiertos] = useState(() => listaReconteos().filter(r => !r.fin))

  useEffect(() => {
    const alCambiar = () => setAbiertos(listaReconteos().filter(r => !r.fin))
    window.addEventListener('reconteo-cambiado', alCambiar)
    return () => window.removeEventListener('reconteo-cambiado', alCambiar)
  }, [])

  return (
    <>
      <Cabecera titulo="Inventario Nogales" sub={`Bienes muebles · ${user?.nombre || ''}`} />
      <div className="contenido">
        {abiertos.length > 0 && (
          <>
            <p className="etiqueta">Reconteo en curso</p>
            <div className="tarjeta plana">
              {abiertos.map(r => {
                const s = resumen(r)
                return (
                  <button key={r.id} className="fila" onClick={() => irA('m', 'reconteo', r.idarea)}>
                    <div className="crece">
                      <p className="nombre">{r.nombrearea}</p>
                      <p className="detalle">{s.encontrados} de {s.total} verificados · desde {fechaCorta(r.inicio)}</p>
                    </div>
                    <i className="ti ti-chevron-right flecha" />
                  </button>
                )
              })}
            </div>
          </>
        )}

        <p className="etiqueta">Qué quieres hacer</p>
        <div className="tarjeta plana">
          <button className="fila" onClick={() => irA('m', 'reconteo')}>
            <i className="ti ti-scan" style={{ fontSize: '22px', color: 'var(--texto-2)' }} />
            <div className="crece">
              <p className="nombre">Reconteo por área</p>
              <p className="detalle">Verificar bienes con la cámara</p>
            </div>
            <i className="ti ti-chevron-right flecha" />
          </button>
          <button className="fila" onClick={() => irA('m', 'bienes')}>
            <i className="ti ti-armchair" style={{ fontSize: '22px', color: 'var(--texto-2)' }} />
            <div className="crece">
              <p className="nombre">Buscar un bien</p>
              <p className="detalle">Por nombre, clave o serie</p>
            </div>
            <i className="ti ti-chevron-right flecha" />
          </button>
          <button className="fila" onClick={() => irA('m', 'historial')}>
            <i className="ti ti-history" style={{ fontSize: '22px', color: 'var(--texto-2)' }} />
            <div className="crece">
              <p className="nombre">Historial de reconteos</p>
              <p className="detalle">Qué se contó y qué faltó</p>
            </div>
            <i className="ti ti-chevron-right flecha" />
          </button>
        </div>
      </div>
    </>
  )
}

// ── Buscar bienes ────────────────────────────────────────────────────────────
export function BuscarBienes() {
  const [texto, setTexto] = useState('')
  const [datos, setDatos] = useState([])
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (!texto.trim()) { setDatos([]); return }
    setCargando(true)
    const tm = setTimeout(() => {
      buscarBienes(texto).then(setDatos).catch(console.error).finally(() => setCargando(false))
    }, 400)
    return () => clearTimeout(tm)
  }, [texto])

  return (
    <>
      <Cabecera titulo="Bienes muebles" sub="Buscar en el inventario" />
      <div className="contenido">
        <div className="buscador">
          <i className="ti ti-search" />
          <input value={texto} onChange={e => setTexto(e.target.value)}
            placeholder="Nombre, clave o serie…" autoCorrect="off" autoCapitalize="characters" />
          {texto && <button onClick={() => setTexto('')}><i className="ti ti-x" style={{ color: 'var(--texto-4)' }} /></button>}
        </div>

        {cargando && <Cargando texto="Buscando…" />}
        {!cargando && texto.trim() && datos.length === 0 && <Vacio texto="Sin resultados" />}
        {!cargando && !texto.trim() && <Vacio icono="ti-search" texto="Escribe para buscar un bien" />}

        {datos.length > 0 && (
          <div className="tarjeta plana">
            {datos.map(b => (
              <button key={b.idbien} className="fila" onClick={() => irA('b', b.clave)}>
                <div className="crece">
                  <p className="clave">{b.clave}</p>
                  <p className="nombre">{b.nombre}</p>
                  <p className="detalle">{b.area}</p>
                </div>
                <i className="ti ti-chevron-right flecha" />
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ── Ficha de un bien (a donde lleva el QR) ───────────────────────────────────
export function FichaBien({ clave }) {
  const [bien, setBien] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    setCargando(true)
    bienPorClave(clave).then(setBien).catch(console.error).finally(() => setCargando(false))
  }, [clave])

  const dato = (etq, valor) => (
    <div className="fila" key={etq}>
      <div className="crece">
        <p className="etiqueta">{etq}</p>
        <p className="nombre" style={{ fontWeight: 400 }}>{valor || '—'}</p>
      </div>
    </div>
  )

  return (
    <>
      <Cabecera titulo="Bien" sub={clave} atras />
      <div className="contenido">
        {cargando && <Cargando />}
        {!cargando && !bien && (
          <Vacio icono="ti-qrcode-off" texto={`No hay ningún bien con la clave ${clave}`} />
        )}
        {bien && (
          <>
            <div className="tarjeta">
              <p className="clave">{bien.clave}</p>
              <p style={{ fontSize: '17px', fontWeight: 600, lineHeight: 1.3, marginTop: '3px' }}>{bien.nombre}</p>
              <p style={{ fontSize: '13px', color: 'var(--texto-3)', marginTop: '4px' }}>{bien.area}</p>
            </div>
            <div className="tarjeta plana">
              {dato('Marca', bien.marca)}
              {dato('Modelo / Tipo', bien.modelo)}
              {dato('Serie', bien.serie)}
              {dato('Resguardo a cargo de', bien.resguardante)}
              {dato('Puesto', bien.puesto)}
              {dato('Categoría', bien.categoria)}
              {dato('Estado', bien.estado)}
              {dato('Factura', bien.factura)}
              {dato('Importe', fmtDinero(bien.importe))}
              {dato('Observaciones', bien.observaciones)}
            </div>
          </>
        )}
      </div>
    </>
  )
}

// ── Elegir el área a recontar ────────────────────────────────────────────────
export function ElegirArea() {
  const [deps, setDeps] = useState([])
  const [cargando, setCargando] = useState(true)
  const [abierta, setAbierta] = useState('')
  const [texto, setTexto] = useState('')

  useEffect(() => {
    areasConDependencia().then(setDeps).catch(console.error).finally(() => setCargando(false))
  }, [])

  const filtradas = useMemo(() => {
    const q = texto.trim().toLowerCase()
    if (!q) return deps
    return deps
      .map(d => ({ ...d, areas: d.areas.filter(a => a.nombrearea.toLowerCase().includes(q) || d.nombre.toLowerCase().includes(q)) }))
      .filter(d => d.areas.length > 0)
  }, [deps, texto])

  return (
    <>
      <Cabecera titulo="Reconteo" sub="Elige el área que vas a contar" />
      <div className="contenido">
        <div className="buscador">
          <i className="ti ti-search" />
          <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Dependencia o área…" />
          {texto && <button onClick={() => setTexto('')}><i className="ti ti-x" style={{ color: 'var(--texto-4)' }} /></button>}
        </div>

        {cargando && <Cargando texto="Leyendo dependencias…" />}

        {filtradas.map(d => {
          const abiertaEsta = abierta === d.nombre || !!texto.trim()
          return (
            <div key={d.nombre} className="tarjeta plana">
              <button className="fila" onClick={() => setAbierta(abierta === d.nombre ? '' : d.nombre)}>
                <div className="crece">
                  <p className="nombre">{d.nombre}</p>
                  <p className="detalle">{d.areas.length} área{d.areas.length !== 1 ? 's' : ''} · {d.total.toLocaleString()} bienes</p>
                </div>
                <i className={`ti ti-chevron-${abiertaEsta ? 'up' : 'down'} flecha`} />
              </button>
              {abiertaEsta && d.areas.map(a => {
                const enCurso = reconteoAbierto(a.idarea)
                return (
                  <button key={a.idarea} className="fila" style={{ paddingLeft: '28px' }}
                    onClick={() => irA('m', 'reconteo', a.idarea)}>
                    <div className="crece">
                      <p className="nombre" style={{ fontWeight: 400 }}>{a.nombrearea}</p>
                      <p className="detalle">{(a.total_bienes || 0).toLocaleString()} bienes</p>
                    </div>
                    {enCurso && <span className="chip falta">En curso</span>}
                    <i className="ti ti-chevron-right flecha" />
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </>
  )
}

// ── Lista del reconteo de un área ────────────────────────────────────────────
export function ListaReconteo({ idarea, usuario }) {
  const [rc, setRc] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [pestana, setPestana] = useState('faltan')   // 'todos' | 'faltan' | 'ok'
  const [texto, setTexto] = useState('')

  // Al entrar: si ya hay un reconteo abierto se continúa; si no, se levanta uno
  // con la lista que la base tiene en este momento.
  useEffect(() => {
    let vivo = true
    setCargando(true); setError(null)
    const existente = reconteoAbierto(idarea)
    if (existente) { setRc(existente); setCargando(false); return }

    Promise.all([bienesDeArea(idarea), areasConDependencia()])
      .then(([bienes, deps]) => {
        if (!vivo) return
        let nombrearea = '', dependencia = ''
        for (const d of deps) {
          const a = d.areas.find(x => Number(x.idarea) === Number(idarea))
          if (a) { nombrearea = a.nombrearea; dependencia = d.nombre; break }
        }
        setRc(abrirReconteo({ idarea, nombrearea, dependencia, bienes, usuario: usuario?.nombre }))
      })
      .catch(e => vivo && setError(e.message))
      .finally(() => vivo && setCargando(false))
    return () => { vivo = false }
  }, [idarea])

  // Cualquier marca (aquí o en el escáner) refresca la pantalla
  useEffect(() => {
    const alCambiar = () => setRc(r => (r ? reconteo(r.id) : r))
    window.addEventListener('reconteo-cambiado', alCambiar)
    return () => window.removeEventListener('reconteo-cambiado', alCambiar)
  }, [])

  const s = resumen(rc)
  const lista = useMemo(() => {
    if (!rc) return []
    const q = texto.trim().toUpperCase()
    return rc.esperados
      .map(e => ({ ...e, verificado: !!rc.encontrados[e.clave] }))
      .filter(e => (pestana === 'todos' ? true : pestana === 'ok' ? e.verificado : !e.verificado))
      .filter(e => !q || e.clave.includes(q) || (e.nombre || '').toUpperCase().includes(q))
  }, [rc, pestana, texto])

  if (cargando) return (<><Cabecera titulo="Reconteo" atras /><Cargando texto="Preparando la lista del área…" /></>)
  if (error)    return (<><Cabecera titulo="Reconteo" atras /><div className="contenido"><Vacio icono="ti-alert-circle" texto={error} /></div></>)
  if (!rc)      return null

  return (
    <>
      <Cabecera titulo={rc.nombrearea || 'Área'} sub={rc.dependencia} atras
        accion={
          <button className="icono-btn" onClick={() => irA('m', 'escanear', idarea)} aria-label="Escanear">
            <i className="ti ti-scan" />
          </button>
        } />

      <div className="contenido">
        <div className="pestanas">
          <button className={pestana === 'todos' ? 'activo' : ''} onClick={() => setPestana('todos')}>
            <b>{s.total}</b>Todos
          </button>
          <button className={pestana === 'faltan' ? 'activo' : ''} onClick={() => setPestana('faltan')}>
            <b>{s.faltan}</b>Faltan
          </button>
          <button className={pestana === 'ok' ? 'activo' : ''} onClick={() => setPestana('ok')}>
            <b>{s.encontrados}</b>Verificados
          </button>
        </div>

        <button className="boton" onClick={() => irA('m', 'escanear', idarea)}>
          <i className="ti ti-scan" style={{ fontSize: '19px' }} />Escanear con la cámara
        </button>

        {s.ajenos > 0 && (
          <div className="tarjeta" style={{ borderColor: 'var(--falta)' }}>
            <p className="nombre" style={{ color: 'var(--falta)' }}>
              {s.ajenos} código{s.ajenos !== 1 ? 's' : ''} de otra área
            </p>
            <p className="detalle">{Object.keys(rc.ajenos).join(', ')}</p>
          </div>
        )}

        <div className="buscador">
          <i className="ti ti-search" />
          <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Filtrar esta lista…" autoCapitalize="characters" />
          {texto && <button onClick={() => setTexto('')}><i className="ti ti-x" style={{ color: 'var(--texto-4)' }} /></button>}
        </div>

        {lista.length === 0
          ? <Vacio icono={pestana === 'faltan' ? 'ti-circle-check' : 'ti-search-off'}
              texto={pestana === 'faltan' ? 'No falta ninguno por verificar' : 'Sin resultados'} />
          : (
            <div className="tarjeta plana">
              {lista.map(e => (
                <div key={e.clave} className="fila">
                  <button className="marca" style={{ background: 'none', padding: 0 }}
                    onClick={() => (e.verificado ? desmarcar(rc.id, e.clave) : marcar(rc.id, e.clave, 'manual'))}
                    aria-label={e.verificado ? 'Quitar verificación' : 'Marcar como encontrado'}>
                    <span className={`marca ${e.verificado ? 'ok' : 'falta'}`}>
                      <i className={`ti ti-${e.verificado ? 'check' : 'point'}`} />
                    </span>
                  </button>
                  <button className="crece" style={{ background: 'none', textAlign: 'left', padding: 0 }}
                    onClick={() => irA('b', e.clave)}>
                    <p className="clave">{e.clave}</p>
                    <p className="nombre">{e.nombre}</p>
                    {e.resguardante && e.resguardante !== '—' && <p className="detalle">{e.resguardante}</p>}
                  </button>
                </div>
              ))}
            </div>
          )}

        {!rc.fin && (
          <button className="boton suave" onClick={() => { cerrarReconteo(rc.id); irA('m', 'historial') }}>
            <i className="ti ti-flag-check" style={{ fontSize: '18px' }} />Terminar reconteo
          </button>
        )}
      </div>
    </>
  )
}

// ── Historial ────────────────────────────────────────────────────────────────
export function HistorialReconteos() {
  const [lista, setLista] = useState(() => listaReconteos())
  const [abierto, setAbierto] = useState('')

  useEffect(() => {
    const alCambiar = () => setLista(listaReconteos())
    window.addEventListener('reconteo-cambiado', alCambiar)
    return () => window.removeEventListener('reconteo-cambiado', alCambiar)
  }, [])

  return (
    <>
      <Cabecera titulo="Historial" sub="Reconteos levantados en este equipo" />
      <div className="contenido">
        {lista.length === 0 && <Vacio icono="ti-history" texto="Todavía no hay reconteos" />}

        {lista.map(r => {
          const s = resumen(r)
          const faltantes = r.esperados.filter(e => !r.encontrados[e.clave])
          const abiertaEsta = abierto === r.id
          return (
            <div key={r.id} className="tarjeta plana">
              <button className="fila" onClick={() => setAbierto(abiertaEsta ? '' : r.id)}>
                <div className="crece">
                  <p className="nombre">{r.nombrearea}</p>
                  <p className="detalle">{fechaCorta(r.inicio)}{r.fin ? '' : ' · en curso'}</p>
                  <p className="detalle" style={{ marginTop: '5px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <span className="chip ok">{s.encontrados} encontrados</span>
                    {s.faltan > 0 && <span className="chip falta">{s.faltan} faltaron</span>}
                  </p>
                </div>
                <i className={`ti ti-chevron-${abiertaEsta ? 'up' : 'down'} flecha`} />
              </button>

              {abiertaEsta && (
                <>
                  {faltantes.length === 0
                    ? <div className="fila"><span className="detalle">Aparecieron todos los bienes del área.</span></div>
                    : faltantes.map(e => (
                        <button key={e.clave} className="fila" style={{ paddingLeft: '28px' }} onClick={() => irA('b', e.clave)}>
                          <span className="marca falta"><i className="ti ti-point" /></span>
                          <div className="crece">
                            <p className="clave">{e.clave}</p>
                            <p className="nombre" style={{ fontWeight: 400 }}>{e.nombre}</p>
                          </div>
                        </button>
                      ))}
                  {!r.fin && (
                    <button className="fila" onClick={() => irA('m', 'reconteo', r.idarea)}>
                      <i className="ti ti-player-play" style={{ color: 'var(--texto-3)' }} />
                      <span className="crece nombre">Continuar este reconteo</span>
                    </button>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
