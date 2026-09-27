import { useEffect, useMemo, useState } from 'react'
import { Cabecera } from './AppMovil'
import { irA, volver } from '../rutas'
import { useBloquearScroll } from './useBloquearScroll'
import { useProgresivo } from './comunes'
import {
  categoriasInmuebles, conteoPorCategoria, inmueblesDeCategoria, estadisticasInmuebles,
  buscarInmuebles, conteosDesincorporacion, inmueblePorClave, inmueblePorId, actualizarInmueble,
} from './datosInmuebles'
import { ID_PROCESO, ID_DESINC } from '../desincorporaciones'

const fmtM2 = n => (n != null ? Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 }) + ' m²' : '—')
const fmtDinero = n => (n ? '$ ' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—')

function Cargando({ texto = 'Cargando…' }) {
  return <div className="cargando"><i className="ti ti-loader-2 gira" />{texto}</div>
}
function Vacio({ icono = 'ti-search-off', texto }) {
  return <div className="vacio"><i className={`ti ${icono}`} />{texto}</div>
}

// ── Inicio ───────────────────────────────────────────────────────────────────
// Las mismas cifras del tablero de la computadora, en las tarjetas chicas que
// ya usa bienes muebles.
export function InicioInmuebles({ user }) {
  const [cats, setCats] = useState([])
  const [conteos, setConteos] = useState({ proceso: 0, desinc: 0 })
  const [stats, setStats] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    categoriasInmuebles()
      .then(async lista => {
        const [porCat, sal, cifras] = await Promise.all([
          conteoPorCategoria(lista), conteosDesincorporacion(), estadisticasInmuebles(),
        ])
        // De mayor a menor, como en la computadora: comodato y desincorporado
        // acaban abajo por tener pocos.
        // Las dos de salida tienen su propio apartado abajo: aquí estorban
        setCats(porCat
          .filter(c => ![ID_PROCESO, ID_DESINC].includes(Number(c.idcategoria)))
          .sort((a, b) => b.total - a.total))
        setConteos(sal); setStats(cifras)
      })
      .catch(console.error)
      .finally(() => setCargando(false))
  }, [])

  const kpis = stats ? [
    { label: 'Total de inmuebles',   valor: stats.total,           color: 'var(--texto-1)', icono: 'ti-building' },
    { label: 'Incorporaciones ' + new Date().getFullYear(), valor: stats.incorporaciones, color: 'var(--ok)', icono: 'ti-circle-plus' },
    { label: 'En desincorporación',  valor: stats.enProceso,       color: 'var(--falta)',   icono: 'ti-progress' },
  ] : []

  return (
    <>
      <Cabecera titulo="Inventario Nogales" sub={`Bienes inmuebles · ${user?.nombre || ''}`} />
      <div className="contenido">
        {cargando && <Cargando texto="Leyendo el inventario…" />}
        {!cargando && (
          <>
            {/* minmax(0,1fr) y no 1fr: con 1fr la columna no baja del ancho de
                su texto y las tarjetas se salen de la pantalla */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
              {kpis.map(k => (
                <div key={k.label} className="tarjeta" style={{ padding: '11px' }}>
                  <i className={`ti ${k.icono}`} style={{ fontSize: '17px', color: k.color }} />
                  <p style={{ fontSize: '18px', fontWeight: 600, lineHeight: 1.2, marginTop: '4px' }}>{k.valor.toLocaleString()}</p>
                  <p style={{ fontSize: '10.5px', color: 'var(--texto-3)', lineHeight: 1.25 }}>{k.label}</p>
                </div>
              ))}
            </div>

            <p className="etiqueta">Por categoría</p>
            <div className="tarjeta plana">
              {cats.map(c => (
                <button key={c.idcategoria} className="fila" onClick={() => irA('i', 'cat', c.idcategoria)}>
                  <div className="crece">
                    <p className="nombre">{c.nombrecategoria}</p>
                    {/* Estas dos aparecen, pero no suman en el total de arriba */}
                    {c.fueraDelPatrimonio && <p className="detalle">Fuera del patrimonio</p>}
                  </div>
                  <span className="detalle">{c.total.toLocaleString()}</span>
                  <i className="ti ti-chevron-right flecha" />
                </button>
              ))}
            </div>

            <p className="etiqueta">Desincorporación</p>
            <div className="tarjeta plana">
              <button className="fila" onClick={() => irA('i', 'cat', ID_PROCESO)}>
                <span className="marca falta"><i className="ti ti-progress" /></span>
                <div className="crece"><p className="nombre">En proceso</p><p className="detalle">Trámite sin concluir</p></div>
                <span className="detalle">{conteos.proceso}</span>
                <i className="ti ti-chevron-right flecha" />
              </button>
              <button className="fila" onClick={() => irA('i', 'cat', ID_DESINC)}>
                <span className="marca" style={{ background: 'var(--alerta-suave)', color: 'var(--alerta)' }}><i className="ti ti-circle-minus" /></span>
                <div className="crece"><p className="nombre">Desincorporados</p><p className="detalle">Ya salieron del patrimonio</p></div>
                <span className="detalle">{conteos.desinc}</span>
                <i className="ti ti-chevron-right flecha" />
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

// ── Buscar / listar inmuebles ────────────────────────────────────────────────
export function BuscarInmuebles({ idcategoria = '' }) {
  const [cats, setCats] = useState([])
  const [texto, setTexto] = useState('')
  const [datos, setDatos] = useState([])
  const [cargando, setCargando] = useState(!!idcategoria)
  // Filtro de categoría de la propia pantalla, para no tener que volver al
  // inicio cada vez. Si se entró desde una categoría, ese es el punto de partida.
  const [cat, setCat] = useState(idcategoria ? String(idcategoria) : '')
  const [hojaCats, setHojaCats] = useState(false)
  // Rango de superficie, en metros cuadrados. Vacío = sin límite por ese lado.
  const [m2, setM2] = useState({ min: '', max: '' })
  const [hojaM2, setHojaM2] = useState(false)

  useEffect(() => { categoriasInmuebles().then(setCats).catch(console.error) }, [])
  useEffect(() => { setCat(idcategoria ? String(idcategoria) : '') }, [idcategoria])

  // Las salidas y el inventario no se mezclan en el mismo filtro: viniendo de
  // Desincorporaciones solo se ofrecen esas dos categorías, y en el inventario
  // no aparecen, porque se consultan en su propia pantalla.
  const enSalidas = [ID_PROCESO, ID_DESINC].includes(Number(cat))
  const catsDelFiltro = useMemo(() => cats.filter(c => {
    const salida = [ID_PROCESO, ID_DESINC].includes(Number(c.idcategoria))
    return enSalidas ? salida : !salida
  }), [cats, enSalidas])

  // Con categoría se lista completa; sin ella, se busca por texto
  useEffect(() => {
    if (!cat) return
    setCargando(true)
    categoriasInmuebles()
      .then(lista => inmueblesDeCategoria(cat, lista))
      .then(setDatos)
      .catch(console.error)
      .finally(() => setCargando(false))
  }, [cat])

  useEffect(() => {
    if (cat) return
    if (!texto.trim()) { setDatos([]); return }
    setCargando(true)
    const tm = setTimeout(() => {
      buscarInmuebles(texto, cats).then(setDatos).catch(console.error).finally(() => setCargando(false))
    }, 400)
    return () => clearTimeout(tm)
  }, [texto, cats, cat])

  const q = texto.trim().toLowerCase()
  const min = m2.min === '' ? null : Number(m2.min)
  const max = m2.max === '' ? null : Number(m2.max)
  const hayM2 = min != null || max != null
  const lista = useMemo(() => {
    let r = datos
    if (cat && q) r = r.filter(d => (d.nombre + d.clave + d.ubicacion).toLowerCase().includes(q))
    if (hayM2) r = r.filter(d => {
      const v = Number(d.superficie)
      if (!Number.isFinite(v)) return false
      if (min != null && v < min) return false
      if (max != null && v > max) return false
      return true
    })
    return r
  }, [datos, cat, q, min, max, hayM2])
  const nombreCat = cats.find(c => Number(c.idcategoria) === Number(cat))?.nombrecategoria
  const { visibles, fin } = useProgresivo(lista, { reinicio: [cat, q, m2.min, m2.max] })
  // Corto a propósito: al lado del de categorías no hay sitio para más, y con
  // un rango largo el botón se salía de la pantalla.
  const textoM2 = !hayM2 ? 'm²'
    : min != null && max != null ? `${min.toLocaleString()}–${max.toLocaleString()}`
    : min != null ? `≥ ${min.toLocaleString()}`
    : `≤ ${max.toLocaleString()}`

  return (
    <>
      <Cabecera titulo={nombreCat || 'Bienes inmuebles'}
        sub={cat ? `${datos.length} inmuebles` : 'Buscar en el inventario'}
        atras={!!idcategoria} />
      <div className="contenido">
        <div className="buscador">
          <i className="ti ti-search" />
          <input value={texto} onChange={e => setTexto(e.target.value)}
            placeholder={cat ? 'Filtrar esta lista…' : 'Nombre, clave, catastral o ubicación…'} />
          {texto && <button onClick={() => setTexto('')}><i className="ti ti-x" style={{ color: 'var(--texto-4)' }} /></button>}
        </div>

        {/* Los dos filtros, uno al lado del otro: la categoría y el tamaño */}
        <div style={{ display: 'flex', gap: '8px', minWidth: 0 }}>
          <button className="chip-filtro" style={{ flex: '1 1 0', minWidth: 0 }} onClick={() => setHojaCats(true)}>
            <i className="ti ti-category" />
            <span className="crece">{nombreCat || 'Todas las categorías'}</span>
            <i className="ti ti-chevron-down" />
          </button>
          <button className="chip-filtro" style={{ flex: '0 1 auto', width: 'auto', minWidth: 0, maxWidth: '48%' }}
            onClick={() => setHojaM2(true)}>
            <i className="ti ti-ruler-measure" style={{ color: hayM2 ? 'var(--texto-1)' : undefined }} />
            <span className="crece">{textoM2}</span>
          </button>
        </div>

        {cargando && <Cargando texto="Buscando…" />}
        {/* El aviso solo cuando de verdad no hay nada que enseñar: con una
            categoría elegida la lista sale sola, sin tener que escribir. */}
        {!cargando && !cat && !texto.trim() && <Vacio icono="ti-search" texto="Escribe para buscar un inmueble" />}
        {!cargando && lista.length === 0 && (cat || texto.trim()) && <Vacio texto="Sin resultados" />}

        {lista.length > 0 && (
          <div className="tarjeta plana">
            {visibles.map(i => (
              <button key={i.idinmueble} className="fila" onClick={() => irA('i', 'inm', i.idinmueble)}>
                <div className="crece">
                  <p className="clave">{i.clave}</p>
                  <p className="nombre">{i.nombre}</p>
                  <p className="detalle">{fmtM2(i.superficie)}{i.ubicacion ? ' · ' + i.ubicacion : ''}</p>
                  {!cat && i.categoria && <p className="detalle">{i.categoria}</p>}
                </div>
                <i className="ti ti-chevron-right flecha" />
              </button>
            ))}
          </div>
        )}
        {fin}
      </div>

      {hojaCats && (
        <HojaCategorias cats={catsDelFiltro} cat={cat} conTodas={!enSalidas}
          onElegir={id => { setCat(id); setHojaCats(false); setDatos([]) }}
          onCerrar={() => setHojaCats(false)} />
      )}
      {hojaM2 && (
        <HojaSuperficie m2={m2} onElegir={r => { setM2(r); setHojaM2(false) }}
          onCerrar={() => setHojaM2(false)} />
      )}
    </>
  )
}

// Elegir la categoría desde la propia lista
function HojaCategorias({ cats, cat, onElegir, onCerrar, conTodas = true }) {
  useBloquearScroll()
  const [texto, setTexto] = useState('')
  const lista = useMemo(() => {
    const q = texto.trim().toLowerCase()
    return q ? cats.filter(c => c.nombrecategoria.toLowerCase().includes(q)) : cats
  }, [cats, texto])

  return (
    <>
      <div className="movil-telon" onClick={onCerrar} />
      <div className="movil-hoja">
        <div className="asa" />
        <div style={{ padding: '0 16px 10px' }}>
          <p style={{ fontSize: '16px', fontWeight: 600, marginBottom: '10px' }}>Categoría</p>
          <div className="buscador">
            <i className="ti ti-search" />
            <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar categoría…" />
          </div>
        </div>
        {conTodas && (
          <button className="fila" onClick={() => onElegir('')}>
            <i className="ti ti-category" style={{ fontSize: '20px', color: 'var(--texto-3)' }} />
            <span className="crece nombre">Todas las categorías</span>
            {!cat && <i className="ti ti-check" style={{ color: 'var(--texto-1)' }} />}
          </button>
        )}
        {lista.map(c => (
          <button key={c.idcategoria} className="fila" onClick={() => onElegir(String(c.idcategoria))}>
            <span className="crece nombre">{c.nombrecategoria}</span>
            {String(cat) === String(c.idcategoria) && <i className="ti ti-check" style={{ color: 'var(--texto-1)' }} />}
          </button>
        ))}
      </div>
    </>
  )
}

// Rango de superficie: de cuánto a cuánto, en metros cuadrados
function HojaSuperficie({ m2, onElegir, onCerrar }) {
  useBloquearScroll()
  const [min, setMin] = useState(m2.min)
  const [max, setMax] = useState(m2.max)

  const campo = (valor, poner, etq, ph) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <p className="etiqueta" style={{ marginBottom: '6px' }}>{etq}</p>
      <input value={valor} onChange={e => poner(e.target.value.replace(/[^\d.]/g, ''))}
        inputMode="decimal" placeholder={ph}
        style={{ width: '100%', padding: '12px 13px', borderRadius: '12px', background: 'var(--campo)',
          border: '1px solid var(--borde-fuerte)', color: 'var(--texto-1)', fontSize: '16px', outline: 'none' }} />
    </div>
  )

  return (
    <>
      <div className="movil-telon" onClick={onCerrar} />
      <div className="movil-hoja">
        <div className="asa" />
        <div style={{ padding: '0 16px 14px' }}>
          <p style={{ fontSize: '16px', fontWeight: 600, marginBottom: '10px' }}>Superficie</p>
          <div style={{ display: 'flex', gap: '10px' }}>
            {campo(min, setMin, 'Desde (m²)', '0')}
            {campo(max, setMax, 'Hasta (m²)', 'sin límite')}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            <button className="boton suave" onClick={() => onElegir({ min: '', max: '' })}>Quitar</button>
            <button className="boton" onClick={() => onElegir({ min, max })}>Aplicar</button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Ficha de un inmueble ─────────────────────────────────────────────────────
export function FichaInmueble({ clave = '', idinmueble = '', soloLectura = false }) {
  const [inm, setInm] = useState(null)
  const [cargando, setCargando] = useState(true)

  // Por id cuando se llega desde una lista —hay desincorporados que comparten
  // clave o no tienen—, y por clave cuando se llega desde el QR.
  useEffect(() => {
    setCargando(true)
    categoriasInmuebles()
      .then(cats => (idinmueble ? inmueblePorId(idinmueble, cats) : inmueblePorClave(clave, cats)))
      .then(setInm)
      .catch(console.error)
      .finally(() => setCargando(false))
  }, [clave, idinmueble])

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
      <Cabecera titulo="Inmueble" sub={inm?.clave || clave} atras
        accion={inm && !soloLectura && (
          <button className="icono-btn" onClick={() => irA('i', 'editar', inm.idinmueble)} aria-label="Modificar">
            <i className="ti ti-pencil" />
          </button>
        )} />
      <div className="contenido">
        {cargando && <Cargando />}
        {!cargando && !inm && <Vacio icono="ti-qrcode-off" texto={`No hay ningún inmueble con la clave ${clave}`} />}
        {inm && (
          <>
            <div className="tarjeta">
              <p className="clave">{inm.clave}</p>
              <p style={{ fontSize: '17px', fontWeight: 600, lineHeight: 1.3, marginTop: '3px' }}>{inm.nombre}</p>
              <p style={{ fontSize: '13px', color: 'var(--texto-3)', marginTop: '4px' }}>{inm.categoria}</p>
            </div>
            <div className="tarjeta plana">
              {dato('Clave catastral', inm.catastral)}
              {dato('Superficie', fmtM2(inm.superficie))}
              {dato('Ubicación', inm.ubicacion)}
              {dato('Valor catastral', fmtDinero(inm.valor))}
              {dato('A favor de', inm.afavorde)}
              {dato('Documento de propiedad', inm.documento)}
              {dato('Expediente', inm.expediente)}
            </div>
          </>
        )}
      </div>
    </>
  )
}

// ── Modificar un inmueble ────────────────────────────────────────────────────
// Los mismos datos que se corrigen en la computadora, menos la categoría y la
// clave: cambiarlas reasigna el consecutivo y eso se hace desde allá.
export function EditarInmueble({ idinmueble }) {
  const [inm, setInm] = useState(null)
  const [campos, setCampos] = useState({
    nombre: '', catastral: '', ubicacion: '', superficie: '', valor: '',
    documento: '', expediente: '', afavorde: '',
  })
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setCargando(true)
    categoriasInmuebles()
      .then(cats => inmueblePorId(idinmueble, cats))
      .then(i => {
        setInm(i)
        if (i) setCampos({
          nombre: i.nombre || '', catastral: i.catastral || '', ubicacion: i.ubicacion || '',
          superficie: i.superficie ?? '', valor: i.valor ?? '',
          documento: i.documento || '', expediente: i.expediente || '', afavorde: i.afavorde || '',
        })
      })
      .catch(e => setError(e.message))
      .finally(() => setCargando(false))
  }, [idinmueble])

  async function guardar() {
    if (!inm) return
    setGuardando(true); setError(null)
    try {
      await actualizarInmueble(inm.idinmueble, campos)
      volver()
    } catch (e) { setError(e.message); setGuardando(false) }
  }

  const campo = (etq, llave, opciones = {}) => (
    <div key={llave}>
      <p className="etiqueta" style={{ marginBottom: '6px' }}>{etq}</p>
      {opciones.largo
        ? <textarea value={campos[llave]} onChange={e => setCampos(c => ({ ...c, [llave]: e.target.value }))}
            rows={3} placeholder={opciones.placeholder} autoCapitalize="off" autoCorrect="off" spellCheck={false}
            style={{ width: '100%', padding: '11px 13px', borderRadius: '12px', background: 'var(--campo)',
              border: '1px solid var(--borde-fuerte)', color: 'var(--texto-1)', fontSize: '15px', outline: 'none', resize: 'vertical',
              textTransform: llave === 'nombre' ? 'uppercase' : 'none' }} />
        // Sin autoCapitalize: el teclado de Android dejaba el texto "en
        // composición" y no entraban ni los espacios. Lo que se guarda no
        // cambia por esto.
        : <input value={campos[llave]} onChange={e => setCampos(c => ({ ...c, [llave]: e.target.value }))}
            placeholder={opciones.placeholder} inputMode={opciones.numero ? 'decimal' : undefined}
            autoCapitalize="off" autoCorrect="off" spellCheck={false}
            style={{ width: '100%', padding: '11px 13px', borderRadius: '12px', background: 'var(--campo)',
              border: '1px solid var(--borde-fuerte)', color: 'var(--texto-1)', fontSize: '16px', outline: 'none' }} />}
    </div>
  )

  return (
    <>
      <Cabecera titulo="Modificar inmueble" sub={inm?.clave} atras />
      <div className="contenido">
        {cargando && <Cargando />}
        {!cargando && !inm && <Vacio icono="ti-qrcode-off" texto="No se encontró el inmueble" />}
        {inm && (
          <>
            {campo('Nombre del inmueble', 'nombre', { largo: true })}
            {campo('Clave catastral', 'catastral')}
            {campo('Ubicación', 'ubicacion', { largo: true })}
            {campo('Superficie (m²)', 'superficie', { numero: true })}
            {campo('Valor catastral', 'valor', { numero: true })}
            {campo('A favor de', 'afavorde')}
            {campo('Documento de propiedad', 'documento')}
            {campo('Expediente', 'expediente')}

            <p className="detalle">La categoría y la clave se cambian desde la computadora.</p>

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

// ── Desincorporaciones ───────────────────────────────────────────────────────
// Los dos apartados de salida. Desde aquí se entra a la lista, se consulta cada
// inmueble y se corrige lo que haga falta, igual que en el resto del inventario.
// Los reportes en Excel y PDF se siguen haciendo desde la computadora, así que
// esta pantalla ya no los ofrece.
export function DesincorporacionesMovil() {
  const [conteos, setConteos] = useState({ proceso: 0, desinc: 0 })
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    conteosDesincorporacion().then(setConteos).catch(console.error).finally(() => setCargando(false))
  }, [])

  return (
    <>
      <Cabecera titulo="Desincorporaciones" sub="Salidas del patrimonio" />
      <div className="contenido">
        {cargando && <Cargando />}
        {!cargando && (
          <>
            <div className="tarjeta plana">
              <button className="fila" onClick={() => irA('i', 'cat', ID_PROCESO)}>
                <span className="marca falta"><i className="ti ti-progress" /></span>
                <div className="crece">
                  <p className="nombre">En proceso de desincorporación</p>
                  <p className="detalle">Trámite sin concluir · siguen siendo del ayuntamiento</p>
                </div>
                <span className="detalle">{conteos.proceso}</span>
                <i className="ti ti-chevron-right flecha" />
              </button>
              <button className="fila" onClick={() => irA('i', 'cat', ID_DESINC)}>
                <span className="marca" style={{ background: 'var(--alerta-suave)', color: 'var(--alerta)' }}><i className="ti ti-circle-minus" /></span>
                <div className="crece">
                  <p className="nombre">Desincorporados del HAN</p>
                  <p className="detalle">Ya salieron del patrimonio</p>
                </div>
                <span className="detalle">{conteos.desinc}</span>
                <i className="ti ti-chevron-right flecha" />
              </button>
            </div>

          </>
        )}
      </div>
    </>
  )
}
