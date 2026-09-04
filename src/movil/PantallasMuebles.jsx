import { useEffect, useMemo, useState } from 'react'
import { Cabecera } from './AppMovil'
import { irA, volver } from '../rutas'
import { areasConDependencia, bienesDeArea, bienPorClave, buscarBienes, actualizarBien, anotarObservacionEnBien } from './datos'
import {
  abrirReconteo, reconteoAbierto, reconteo, listaReconteos, marcar, desmarcar,
  cerrarReconteo, borrarReconteo, resumen, fechaCorta, pendientes, marcarSubida,
} from './reconteo'

const fmtDinero = n => (n ? '$ ' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—')

function Cargando({ texto = 'Cargando…' }) {
  return <div className="cargando"><i className="ti ti-loader-2 gira" />{texto}</div>
}

function Vacio({ icono = 'ti-search-off', texto }) {
  return <div className="vacio"><i className={`ti ${icono}`} />{texto}</div>
}

// Pregunta antes de algo que no se puede deshacer. Es la misma idea de los
// modales de confirmación del escritorio, en hoja.
function Confirmar({ titulo, detalle, textoOk, peligro, onOk, onCerrar }) {
  return (
    <>
      <div className="movil-telon" onClick={onCerrar} />
      <div className="movil-hoja">
        <div className="asa" />
        <div style={{ padding: '4px 16px 14px' }}>
          <p style={{ fontSize: '16px', fontWeight: 600 }}>{titulo}</p>
          {detalle && <p style={{ fontSize: '13px', color: 'var(--texto-3)', marginTop: '6px', lineHeight: 1.5 }}>{detalle}</p>}
        </div>
        <div style={{ display: 'flex', gap: '8px', padding: '0 16px' }}>
          <button className="boton suave" onClick={onCerrar}>Cancelar</button>
          <button className={`boton${peligro ? ' peligro' : ''}`} onClick={() => { onOk(); onCerrar() }}>{textoOk}</button>
        </div>
      </div>
    </>
  )
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
      <Cabecera titulo="Bienes Muebles" sub={`Inventario Municipal · ${user?.nombre || ''}`} />
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
              <p className="nombre">Bienes muebles</p>
              <p className="detalle">Buscar por nombre, clave o serie</p>
            </div>
            <i className="ti ti-chevron-right flecha" />
          </button>
          <button className="fila" onClick={() => irA('m', 'traspasos')}>
            <i className="ti ti-arrows-exchange" style={{ fontSize: '22px', color: 'var(--texto-2)' }} />
            <div className="crece">
              <p className="nombre">Traspasos</p>
              <p className="detalle">Bienes traspasados</p>
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

// ── Listas de bienes: inventario, traspasos y papelera ───────────────────────
const TITULOS = {
  inventario: { titulo: 'Bienes Muebles', sub: 'Inventario Municipal' },
  traspasos:  { titulo: 'Traspasos',      sub: 'Bienes traspasados' },
  papelera:   { titulo: 'Papelera',       sub: 'Bienes capturados por error' },
}

// Los filtros se recuerdan: antes vivían en el estado de la pantalla y al
// entrar a un bien y regresar había que volver a ponerlos.
function filtroGuardado(lista) {
  try { return JSON.parse(localStorage.getItem('filtro-' + lista) || '{}') } catch { return {} }
}
function guardarFiltro(lista, filtro) {
  try { localStorage.setItem('filtro-' + lista, JSON.stringify(filtro)) } catch { /* modo privado */ }
}

export function BuscarBienes({ lista = 'inventario' }) {
  const guardado = filtroGuardado(lista)
  const [texto, setTexto] = useState(guardado.texto || '')
  const [areas, setAreas] = useState([])
  const [areaSel, setAreaSel] = useState(guardado.areaSel || [])   // idarea marcadas
  const [hojaAreas, setHojaAreas] = useState(false)
  const [datos, setDatos] = useState([])
  const [cargando, setCargando] = useState(false)

  useEffect(() => { areasConDependencia().then(setAreas).catch(console.error) }, [])
  useEffect(() => { guardarFiltro(lista, { texto, areaSel }) }, [lista, texto, areaSel])

  useEffect(() => {
    if (!texto.trim() && areaSel.length === 0) { setDatos([]); return }
    setCargando(true)
    const tm = setTimeout(() => {
      buscarBienes(texto, { lista, areaIds: areaSel })
        .then(setDatos).catch(console.error).finally(() => setCargando(false))
    }, 400)
    return () => clearTimeout(tm)
  }, [texto, areaSel, lista])

  const cab = TITULOS[lista] || TITULOS.inventario
  const nombreArea = areaSel.length === 1
    ? areas.flatMap(d => d.areas).find(a => a.idarea === areaSel[0])?.nombrearea
    : `${areaSel.length} áreas`

  return (
    <>
      <Cabecera titulo={cab.titulo} sub={cab.sub} atras={lista !== 'inventario'} />
      <div className="contenido">
        <div className="buscador">
          <i className="ti ti-search" />
          <input value={texto} onChange={e => setTexto(e.target.value)}
            placeholder="Nombre, clave, marca o serie…" autoCorrect="off" />
          {texto && <button onClick={() => setTexto('')}><i className="ti ti-x" style={{ color: 'var(--texto-4)' }} /></button>}
        </div>

        {/* Mismo filtro de dependencia y área que en la computadora */}
        <button className="buscador" onClick={() => setHojaAreas(true)} style={{ textAlign: 'left' }}>
          <i className="ti ti-building" />
          <span style={{ flex: 1, color: areaSel.length ? 'var(--texto-1)' : 'var(--texto-4)' }}>
            {areaSel.length === 0 ? 'Todas las dependencias' : nombreArea}
          </span>
          {areaSel.length > 0
            ? <i className="ti ti-x" onClick={e => { e.stopPropagation(); setAreaSel([]) }} style={{ color: 'var(--texto-4)' }} />
            : <i className="ti ti-chevron-down" style={{ color: 'var(--texto-4)' }} />}
        </button>

        {cargando && <Cargando texto="Buscando…" />}
        {!cargando && !texto.trim() && areaSel.length === 0 && (
          <Vacio icono="ti-search" texto="Busca por texto o elige una dependencia" />
        )}
        {!cargando && (texto.trim() || areaSel.length > 0) && datos.length === 0 && <Vacio texto="Sin resultados" />}

        {datos.length > 0 && (
          <div className="tarjeta plana">
            {datos.map(b => (
              <button key={b.idbien} className="fila" onClick={() => irA('b', b.clave)}>
                <div className="crece">
                  <p className="clave">{b.clave}</p>
                  <p className="nombre">{b.nombre}</p>
                  <p className="detalle">{[b.marca, b.modelo].filter(Boolean).join(' · ') || 'Sin marca'}</p>
                  <p className="detalle">{b.area}</p>
                </div>
                <i className="ti ti-chevron-right flecha" />
              </button>
            ))}
          </div>
        )}
      </div>

      {hojaAreas && (
        <HojaAreas areas={areas} seleccion={areaSel}
          onElegir={ids => { setAreaSel(ids); setHojaAreas(false) }}
          onCerrar={() => setHojaAreas(false)} />
      )}
    </>
  )
}

// El selector de dependencias del escritorio, en hoja
function HojaAreas({ areas, seleccion, onElegir, onCerrar }) {
  const [texto, setTexto] = useState('')
  const [abierta, setAbierta] = useState('')

  const filtradas = useMemo(() => {
    const q = texto.trim().toLowerCase()
    if (!q) return areas
    return areas
      .map(d => ({ ...d, areas: d.areas.filter(a => a.nombrearea.toLowerCase().includes(q) || d.nombre.toLowerCase().includes(q)) }))
      .filter(d => d.areas.length > 0)
  }, [areas, texto])

  return (
    <>
      <div className="movil-telon" onClick={onCerrar} />
      <div className="movil-hoja">
        <div className="asa" />
        <div style={{ padding: '0 16px 10px' }}>
          <p style={{ fontSize: '16px', fontWeight: 600, marginBottom: '10px' }}>Dependencias</p>
          <div className="buscador">
            <i className="ti ti-search" />
            <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar dependencia o área…" />
          </div>
        </div>
        <button className="fila" onClick={() => onElegir([])}>
          <span className="crece nombre">Todas las dependencias</span>
          {seleccion.length === 0 && <i className="ti ti-check" style={{ color: 'var(--texto-1)' }} />}
        </button>
        {filtradas.map(d => (
          <div key={d.nombre}>
            <button className="fila" onClick={() => setAbierta(abierta === d.nombre ? '' : d.nombre)}>
              <div className="crece">
                <p className="nombre">{d.nombre}</p>
                <p className="detalle">{d.areas.length} área{d.areas.length !== 1 ? 's' : ''} · {d.total.toLocaleString()} bienes</p>
              </div>
              <i className={`ti ti-chevron-${abierta === d.nombre || texto.trim() ? 'up' : 'down'} flecha`} />
            </button>
            {(abierta === d.nombre || texto.trim()) && d.areas.map(a => (
              <button key={a.idarea} className="fila" style={{ paddingLeft: '28px' }} onClick={() => onElegir([a.idarea])}>
                <div className="crece">
                  <p className="nombre" style={{ fontWeight: 400 }}>{a.nombrearea}</p>
                  <p className="detalle">{(a.total_bienes || 0).toLocaleString()} bienes</p>
                </div>
                {seleccion.includes(a.idarea) && <i className="ti ti-check" style={{ color: 'var(--texto-1)' }} />}
              </button>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

// ── Ficha de un bien (a donde lleva el QR) ───────────────────────────────────
// Los mismos campos que el panel de consulta de la computadora.
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
      <Cabecera titulo="Bien" sub={clave} atras
        accion={bien && (
          <button className="icono-btn" onClick={() => irA('m', 'editar', clave)} aria-label="Modificar">
            <i className="ti ti-pencil" />
          </button>
        )} />
      <div className="contenido">
        {cargando && <Cargando />}
        {!cargando && !bien && (
          <Vacio icono="ti-qrcode" texto={`No hay ningún bien con la clave ${clave}`} />
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
              {dato('Tipo / Modelo', bien.modelo)}
              {dato('Serie', bien.serie)}
              {dato('Categoría', bien.categoria)}
              {dato('Área de adscripción', bien.area)}
              {dato('Resguardo a cargo de', bien.resguardante)}
              {dato('Puesto', bien.puesto)}
              {dato('Estado', bien.estado)}
              {dato('Factura', bien.factura)}
              {dato('Fecha de factura', bien.fechafactura)}
              {dato('Importe', fmtDinero(bien.importe))}
              {dato('Observaciones', bien.observaciones)}
            </div>
          </>
        )}
      </div>
    </>
  )
}

// ── Modificar un bien desde el celular ───────────────────────────────────────
// Solo los datos que se corrigen viendo el mueble enfrente. La factura, el área
// y el resguardo se quedan en la computadora: mueven claves y catálogos, y eso
// no se hace de paso en un pasillo.
export function EditarBien({ clave }) {
  const [bien, setBien] = useState(null)
  const [campos, setCampos] = useState({ nombre: '', marca: '', modelo: '', serie: '', observaciones: '' })
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setCargando(true)
    bienPorClave(clave)
      .then(b => {
        setBien(b)
        if (b) setCampos({
          nombre: b.nombre || '', marca: b.marca || '', modelo: b.modelo || '',
          serie: b.serie || '', observaciones: b.observaciones || '',
        })
      })
      .catch(e => setError(e.message))
      .finally(() => setCargando(false))
  }, [clave])

  async function guardar() {
    if (!bien) return
    setGuardando(true); setError(null)
    try {
      await actualizarBien(bien.idbien, campos)
      volver()
    } catch (e) { setError(e.message); setGuardando(false) }
  }

  const campo = (etq, llave, opciones = {}) => (
    <div key={llave}>
      <p className="etiqueta" style={{ marginBottom: '6px' }}>{etq}</p>
      {opciones.largo
        ? <textarea value={campos[llave]} onChange={e => setCampos(c => ({ ...c, [llave]: e.target.value }))}
            rows={4} placeholder={opciones.placeholder}
            style={{ width: '100%', padding: '11px 13px', borderRadius: '12px', background: 'var(--campo)',
              border: '1px solid var(--borde-fuerte)', color: 'var(--texto-1)', fontSize: '15px', outline: 'none', resize: 'vertical' }} />
        : <input value={campos[llave]} onChange={e => setCampos(c => ({ ...c, [llave]: e.target.value }))}
            placeholder={opciones.placeholder} autoCapitalize="characters" autoCorrect="off"
            style={{ width: '100%', padding: '11px 13px', borderRadius: '12px', background: 'var(--campo)',
              border: '1px solid var(--borde-fuerte)', color: 'var(--texto-1)', fontSize: '16px', outline: 'none' }} />}
    </div>
  )

  return (
    <>
      <Cabecera titulo="Modificar bien" sub={clave} atras />
      <div className="contenido">
        {cargando && <Cargando />}
        {!cargando && !bien && <Vacio icono="ti-qrcode" texto={`No hay ningún bien con la clave ${clave}`} />}
        {bien && (
          <>
            {campo('Nombre del bien', 'nombre')}
            {campo('Marca', 'marca')}
            {campo('Tipo / Modelo', 'modelo')}
            {campo('Serie', 'serie')}
            {campo('Observaciones', 'observaciones', { largo: true, placeholder: 'Agregar Comentarios.' })}

            <p className="detalle">
              El área, el resguardo y la factura se cambian desde la computadora.
            </p>

            {error && <div className="tarjeta" style={{ borderColor: 'var(--alerta)', color: 'var(--alerta)' }}>{error}</div>}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="boton suave" onClick={volver} disabled={guardando}>Cancelar</button>
              <button className="boton" onClick={guardar} disabled={guardando}>
                {guardando
                  ? <><i className="ti ti-loader-2 gira" style={{ fontSize: '17px' }} />Guardando…</>
                  : <><i className="ti ti-device-floppy" style={{ fontSize: '17px' }} />Guardar</>}
              </button>
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

// ── El área: portada o lista, según haya reconteo abierto ────────────────────
export function ListaReconteo({ idarea, usuario }) {
  const [rc, setRc] = useState(() => reconteoAbierto(idarea))
  const [area, setArea] = useState(null)
  const [iniciando, setIniciando] = useState(false)
  const [error, setError] = useState(null)
  const [pestana, setPestana] = useState('faltan')
  const [texto, setTexto] = useState('')
  const [confirma, setConfirma] = useState(null)   // 'terminar' | 'cancelar'

  // Datos del área para la portada. No se abre ningún reconteo solo por entrar:
  // hay que decirlo, porque puede haberse equivocado de área.
  useEffect(() => {
    let vivo = true
    areasConDependencia()
      .then(deps => {
        if (!vivo) return
        for (const d of deps) {
          const a = d.areas.find(x => Number(x.idarea) === Number(idarea))
          if (a) { setArea({ ...a, dependencia: d.nombre }); return }
        }
      })
      .catch(e => vivo && setError(e.message))
    return () => { vivo = false }
  }, [idarea])

  useEffect(() => {
    const alCambiar = () => setRc(reconteoAbierto(idarea))
    window.addEventListener('reconteo-cambiado', alCambiar)
    return () => window.removeEventListener('reconteo-cambiado', alCambiar)
  }, [idarea])

  async function iniciar() {
    setIniciando(true); setError(null)
    try {
      const bienes = await bienesDeArea(idarea)
      setRc(abrirReconteo({
        idarea,
        nombrearea: area?.nombrearea || '',
        dependencia: area?.dependencia || '',
        bienes,
        usuario: usuario?.nombre,
      }))
    } catch (e) { setError(e.message) } finally { setIniciando(false) }
  }

  const s = resumen(rc)
  const sinSubir = pendientes(rc)

  // Reintenta escribir en el inventario las observaciones que no alcanzaron a
  // subir por falta de señal. Se dispara al recuperar conexión y con el botón.
  const [subiendo, setSubiendo] = useState(false)
  async function subirPendientes() {
    if (!rc || subiendo) return
    setSubiendo(true)
    for (const p of pendientes(reconteo(rc.id))) {
      if (!p.bien?.idbien) continue
      try {
        await anotarObservacionEnBien(p.bien.idbien, p.observacion, new Date(p.fecha))
        marcarSubida(rc.id, p.clave)
      } catch { /* sigue pendiente */ }
    }
    setRc(reconteoAbierto(idarea))
    setSubiendo(false)
  }

  useEffect(() => {
    if (sinSubir.length === 0) return
    window.addEventListener('online', subirPendientes)
    return () => window.removeEventListener('online', subirPendientes)
  }, [sinSubir.length, rc?.id])

  const lista = useMemo(() => {
    if (!rc) return []
    const q = texto.trim().toUpperCase()
    return rc.esperados
      .map(e => ({ ...e, verificado: !!rc.encontrados[e.clave], nota: rc.encontrados[e.clave]?.observacion || '' }))
      .filter(e => (pestana === 'todos' ? true : pestana === 'ok' ? e.verificado : !e.verificado))
      .filter(e => !q || e.clave.includes(q) || (e.nombre || '').toUpperCase().includes(q))
  }, [rc, pestana, texto])

  const historialArea = listaReconteos().filter(r => r.idarea === Number(idarea) && r.fin)

  // ── Portada: todavía no hay reconteo abierto ──
  if (!rc) {
    return (
      <>
        <Cabecera titulo={area?.nombrearea || 'Área'} sub={area?.dependencia} atras />
        <div className="contenido">
          <div className="tarjeta">
            <p className="etiqueta">Bienes registrados en el área</p>
            <p style={{ fontSize: '30px', fontWeight: 600, lineHeight: 1.1, marginTop: '4px' }}>
              {(area?.total_bienes ?? 0).toLocaleString()}
            </p>
            <p className="detalle">Al iniciar se guarda esta lista tal como está hoy.</p>
          </div>

          {error && <div className="tarjeta" style={{ borderColor: 'var(--alerta)', color: 'var(--alerta)' }}>{error}</div>}

          <button className="boton" onClick={iniciar} disabled={iniciando || !area}>
            {iniciando
              ? <><i className="ti ti-loader-2 gira" style={{ fontSize: '18px' }} />Preparando la lista…</>
              : <><i className="ti ti-scan" style={{ fontSize: '19px' }} />Iniciar nuevo reconteo</>}
          </button>

          <button className="boton suave" onClick={() => irA('m', 'historial')}>
            <i className="ti ti-history" style={{ fontSize: '18px' }} />Ver historial
          </button>

          {historialArea.length > 0 && (
            <>
              <p className="etiqueta">Reconteos anteriores de esta área</p>
              <div className="tarjeta plana">
                {historialArea.slice(0, 4).map(r => {
                  const t = resumen(r)
                  return (
                    <button key={r.id} className="fila" onClick={() => irA('m', 'historial')}>
                      <div className="crece">
                        <p className="nombre">{fechaCorta(r.inicio)}</p>
                        <p className="detalle">{t.encontrados} de {t.total} verificados</p>
                      </div>
                      <i className="ti ti-chevron-right flecha" />
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </>
    )
  }

  // ── Reconteo en curso ──
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

        {/* Observaciones que se anotaron sin señal y no llegaron al inventario */}
        {sinSubir.length > 0 && (
          <div className="tarjeta" style={{ borderColor: 'var(--alerta)' }}>
            <p className="nombre" style={{ color: 'var(--alerta)' }}>
              {sinSubir.length} observación{sinSubir.length !== 1 ? 'es' : ''} sin guardar en el inventario
            </p>
            <p className="detalle">Se anotaron en el conteo pero no alcanzaron a subir. Se reintenta solo al recuperar señal.</p>
            <button className="boton suave" style={{ marginTop: '10px' }} onClick={subirPendientes} disabled={subiendo}>
              {subiendo
                ? <><i className="ti ti-loader-2 gira" style={{ fontSize: '17px' }} />Subiendo…</>
                : <><i className="ti ti-cloud-upload" style={{ fontSize: '17px' }} />Reintentar</>}
            </button>
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
                  <button style={{ padding: 0 }}
                    onClick={() => (e.verificado ? desmarcar(rc.id, e.clave) : marcar(rc.id, e.clave, 'manual'))}
                    aria-label={e.verificado ? 'Quitar verificación' : 'Marcar como encontrado'}>
                    <span className={`marca ${e.verificado ? 'ok' : 'falta'}`}>
                      <i className={`ti ti-${e.verificado ? 'check' : 'question-mark'}`} />
                    </span>
                  </button>
                  <button className="crece" style={{ textAlign: 'left', padding: 0 }}
                    onClick={() => irA('b', e.clave)}>
                    <p className="clave">{e.clave}</p>
                    <p className="nombre">{e.nombre}</p>
                    {e.resguardante && e.resguardante !== '—' && <p className="detalle">{e.resguardante}</p>}
                    {e.nota && <p className="detalle" style={{ color: 'var(--falta)' }}>
                      <i className="ti ti-message-2" style={{ marginRight: '4px' }} />{e.nota}
                    </p>}
                  </button>
                </div>
              ))}
            </div>
          )}

        <button className="boton suave" onClick={() => setConfirma('terminar')}>
          <i className="ti ti-flag-check" style={{ fontSize: '18px' }} />Terminar reconteo
        </button>
        <button className="boton peligro" onClick={() => setConfirma('cancelar')}>
          <i className="ti ti-trash" style={{ fontSize: '18px' }} />Cancelar reconteo
        </button>
      </div>

      {confirma === 'terminar' && (
        <Confirmar
          titulo="¿Terminar el reconteo?"
          detalle={`Se cierra con ${s.encontrados} de ${s.total} verificados${s.faltan > 0 ? ` y ${s.faltan} sin encontrar` : ''}. Queda guardado en el historial y ya no se podrá seguir escaneando.`}
          textoOk="Sí, terminar"
          onOk={() => { cerrarReconteo(rc.id); irA('m', 'historial') }}
          onCerrar={() => setConfirma(null)} />
      )}
      {confirma === 'cancelar' && (
        <Confirmar
          titulo="¿Cancelar el reconteo?"
          detalle="Se borra por completo, con todo lo que llevas verificado, y no queda en el historial. Úsalo si te equivocaste de área."
          textoOk="Sí, cancelar" peligro
          onOk={() => { borrarReconteo(rc.id); volver() }}
          onCerrar={() => setConfirma(null)} />
      )}
    </>
  )
}

// ── Historial ────────────────────────────────────────────────────────────────
export function HistorialReconteos() {
  const [lista, setLista] = useState(() => listaReconteos())
  const [abierto, setAbierto] = useState('')
  const [borrar, setBorrar] = useState(null)

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
          // Los que se verificaron con una nota: es lo que hay que revisar
          // después, y por eso van juntos y arriba de los faltantes.
          const conNota = r.esperados
            .map(e => ({ ...e, nota: r.encontrados[e.clave]?.observacion || '' }))
            .filter(e => e.nota)
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
                    {conNota.length > 0 && <span className="chip falta">{conNota.length} con observación</span>}
                  </p>
                </div>
                <i className={`ti ti-chevron-${abiertaEsta ? 'up' : 'down'} flecha`} />
              </button>

              {abiertaEsta && (
                <>
                  {conNota.length > 0 && (
                    <>
                      <div className="fila" style={{ paddingBottom: '4px' }}>
                        <span className="etiqueta">Con observación</span>
                      </div>
                      {conNota.map(e => (
                        <button key={'n' + e.clave} className="fila" style={{ paddingLeft: '28px' }} onClick={() => irA('b', e.clave)}>
                          <span className="marca ok"><i className="ti ti-message-2" /></span>
                          <div className="crece">
                            <p className="clave">{e.clave}</p>
                            <p className="nombre" style={{ fontWeight: 400 }}>{e.nombre}</p>
                            <p className="detalle" style={{ color: 'var(--falta)' }}>{e.nota}</p>
                          </div>
                        </button>
                      ))}
                      <div className="fila" style={{ paddingBottom: '4px' }}>
                        <span className="etiqueta">No se encontraron</span>
                      </div>
                    </>
                  )}
                  {faltantes.length === 0
                    ? <div className="fila"><span className="detalle">Aparecieron todos los bienes del área.</span></div>
                    : faltantes.map(e => (
                        <button key={e.clave} className="fila" style={{ paddingLeft: '28px' }} onClick={() => irA('b', e.clave)}>
                          <span className="marca falta"><i className="ti ti-question-mark" /></span>
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
                  <button className="fila" onClick={() => setBorrar(r)}>
                    <i className="ti ti-trash" style={{ color: 'var(--alerta)' }} />
                    <span className="crece nombre" style={{ color: 'var(--alerta)' }}>Borrar del historial</span>
                  </button>
                </>
              )}
            </div>
          )
        })}
      </div>

      {borrar && (
        <Confirmar
          titulo="¿Borrar este reconteo?"
          detalle={`Se quita del historial el reconteo de ${borrar.nombrearea} del ${fechaCorta(borrar.inicio)}. No se puede recuperar.`}
          textoOk="Sí, borrar" peligro
          onOk={() => borrarReconteo(borrar.id)}
          onCerrar={() => setBorrar(null)} />
      )}
    </>
  )
}
