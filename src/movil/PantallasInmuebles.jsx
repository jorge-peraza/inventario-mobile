import { useEffect, useMemo, useState } from 'react'
import { Cabecera } from './AppMovil'
import { irA, volver } from '../rutas'
import { useBloquearScroll } from './useBloquearScroll'
import {
  categoriasInmuebles, conteoPorCategoria, inmueblesDeCategoria, totalPatrimonio,
  buscarInmuebles, conteosDesincorporacion, inmueblePorClave, actualizarInmueble,
} from './datosInmuebles'

const fmtM2 = n => (n != null ? Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 }) + ' m²' : '—')
const fmtDinero = n => (n ? '$ ' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—')

function Cargando({ texto = 'Cargando…' }) {
  return <div className="cargando"><i className="ti ti-loader-2 gira" />{texto}</div>
}
function Vacio({ icono = 'ti-search-off', texto }) {
  return <div className="vacio"><i className={`ti ${icono}`} />{texto}</div>
}

// ── Inicio ───────────────────────────────────────────────────────────────────
export function InicioInmuebles({ user }) {
  const [cats, setCats] = useState([])
  const [conteos, setConteos] = useState({ proceso: 0, desinc: 0 })
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    categoriasInmuebles()
      .then(async lista => {
        const [porCat, sal, suma] = await Promise.all([
          conteoPorCategoria(lista), conteosDesincorporacion(), totalPatrimonio(),
        ])
        // De mayor a menor, como en la computadora: comodato y desincorporado
        // acaban abajo por tener pocos.
        setCats(porCat.sort((a, b) => b.total - a.total))
        setConteos(sal); setTotal(suma)
      })
      .catch(console.error)
      .finally(() => setCargando(false))
  }, [])

  return (
    <>
      <Cabecera titulo="Inventario Nogales" sub={`Bienes inmuebles · ${user?.nombre || ''}`} />
      <div className="contenido">
        {cargando && <Cargando texto="Leyendo el inventario…" />}
        {!cargando && (
          <>
            <div className="tarjeta">
              <p className="etiqueta">Inmuebles del ayuntamiento</p>
              <p style={{ fontSize: '30px', fontWeight: 600, lineHeight: 1.1, marginTop: '4px' }}>{total.toLocaleString()}</p>
              <p className="detalle">{cats.length} categorías · sin contar comodato ni desincorporados</p>
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
              <button className="fila" onClick={() => irA('i', 'reportes')}>
                <span className="marca falta"><i className="ti ti-progress" /></span>
                <div className="crece"><p className="nombre">En proceso</p><p className="detalle">Trámite sin concluir</p></div>
                <span className="detalle">{conteos.proceso}</span>
              </button>
              <button className="fila" onClick={() => irA('i', 'reportes')}>
                <span className="marca" style={{ background: 'var(--alerta-suave)', color: 'var(--alerta)' }}><i className="ti ti-circle-minus" /></span>
                <div className="crece"><p className="nombre">Desincorporados</p><p className="detalle">Ya salieron del patrimonio</p></div>
                <span className="detalle">{conteos.desinc}</span>
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

  useEffect(() => { categoriasInmuebles().then(setCats).catch(console.error) }, [])
  useEffect(() => { setCat(idcategoria ? String(idcategoria) : '') }, [idcategoria])

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
  const lista = cat && q
    ? datos.filter(d => (d.nombre + d.clave + d.ubicacion).toLowerCase().includes(q))
    : datos
  const nombreCat = cats.find(c => Number(c.idcategoria) === Number(cat))?.nombrecategoria

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

        {/* Filtro por categoría, como el de tipo de bien en muebles */}
        <button className="chip-filtro" onClick={() => setHojaCats(true)}>
          <i className="ti ti-category" />
          <span className="crece">{nombreCat || 'Todas las categorías'}</span>
          <i className="ti ti-chevron-down" />
        </button>

        {cargando && <Cargando texto="Buscando…" />}
        {!cargando && !idcategoria && !texto.trim() && <Vacio icono="ti-search" texto="Escribe para buscar un inmueble" />}
        {!cargando && lista.length === 0 && (idcategoria || texto.trim()) && <Vacio texto="Sin resultados" />}

        {lista.length > 0 && (
          <div className="tarjeta plana">
            {lista.map(i => (
              <button key={i.idinmueble} className="fila" onClick={() => irA('b', i.clave)}>
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
      </div>

      {hojaCats && (
        <HojaCategorias cats={cats} cat={cat}
          onElegir={id => { setCat(id); setHojaCats(false); setDatos([]) }}
          onCerrar={() => setHojaCats(false)} />
      )}
    </>
  )
}

// Elegir la categoría desde la propia lista
function HojaCategorias({ cats, cat, onElegir, onCerrar }) {
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
        <button className="fila" onClick={() => onElegir('')}>
          <i className="ti ti-category" style={{ fontSize: '20px', color: 'var(--texto-3)' }} />
          <span className="crece nombre">Todas las categorías</span>
          {!cat && <i className="ti ti-check" style={{ color: 'var(--texto-1)' }} />}
        </button>
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

// ── Ficha de un inmueble ─────────────────────────────────────────────────────
export function FichaInmueble({ clave }) {
  const [inm, setInm] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    setCargando(true)
    categoriasInmuebles()
      .then(cats => inmueblePorClave(clave, cats))
      .then(setInm)
      .catch(console.error)
      .finally(() => setCargando(false))
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
      <Cabecera titulo="Inmueble" sub={clave} atras />
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
            <button className="boton suave" onClick={() => irA('i', 'editar', inm.clave)}>
              <i className="ti ti-pencil" style={{ fontSize: '18px' }} />Modificar inmueble
            </button>
          </>
        )}
      </div>
    </>
  )
}

// ── Modificar un inmueble ────────────────────────────────────────────────────
// Los mismos datos que se corrigen en la computadora, menos la categoría y la
// clave: cambiarlas reasigna el consecutivo y eso se hace desde allá.
export function EditarInmueble({ clave }) {
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
      .then(cats => inmueblePorClave(clave, cats))
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
  }, [clave])

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
            rows={3} placeholder={opciones.placeholder}
            style={{ width: '100%', padding: '11px 13px', borderRadius: '12px', background: 'var(--campo)',
              border: '1px solid var(--borde-fuerte)', color: 'var(--texto-1)', fontSize: '15px', outline: 'none', resize: 'vertical' }} />
        : <input value={campos[llave]} onChange={e => setCampos(c => ({ ...c, [llave]: e.target.value }))}
            placeholder={opciones.placeholder} inputMode={opciones.numero ? 'decimal' : undefined}
            autoCapitalize={opciones.numero ? 'none' : 'characters'} autoCorrect="off"
            style={{ width: '100%', padding: '11px 13px', borderRadius: '12px', background: 'var(--campo)',
              border: '1px solid var(--borde-fuerte)', color: 'var(--texto-1)', fontSize: '16px', outline: 'none' }} />}
    </div>
  )

  return (
    <>
      <Cabecera titulo="Modificar inmueble" sub={clave} atras />
      <div className="contenido">
        {cargando && <Cargando />}
        {!cargando && !inm && <Vacio icono="ti-qrcode-off" texto={`No hay ningún inmueble con la clave ${clave}`} />}
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

// ── Salidas del patrimonio ───────────────────────────────────────────────────
export function ReportesInmueblesMovil() {
  const [conteos, setConteos] = useState({ proceso: 0, desinc: 0 })
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    conteosDesincorporacion().then(setConteos).catch(console.error).finally(() => setCargando(false))
  }, [])

  return (
    <>
      <Cabecera titulo="Reportes" sub="Movimientos de inmuebles" />
      <div className="contenido">
        {cargando && <Cargando />}
        {!cargando && (
          <>
            <div className="tarjeta">
              <p className="etiqueta">En proceso de desincorporación</p>
              <p style={{ fontSize: '28px', fontWeight: 600, lineHeight: 1.1, marginTop: '4px' }}>{conteos.proceso}</p>
              <p className="detalle">Inmuebles en trámite</p>
            </div>
            <div className="tarjeta">
              <p className="etiqueta">Desincorporados</p>
              <p style={{ fontSize: '28px', fontWeight: 600, lineHeight: 1.1, marginTop: '4px' }}>{conteos.desinc}</p>
              <p className="detalle">Ya salieron del patrimonio</p>
            </div>
            <p className="detalle" style={{ textAlign: 'center' }}>
              Los reportes en Excel y PDF se generan desde la computadora.
            </p>
          </>
        )}
      </div>
    </>
  )
}
