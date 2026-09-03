import { useEffect, useState } from 'react'
import { Cabecera } from './AppMovil'
import { irA } from '../rutas'
import {
  categoriasInmuebles, conteoPorCategoria, inmueblesDeCategoria,
  buscarInmuebles, conteosDesincorporacion, inmueblePorClave,
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
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    categoriasInmuebles()
      .then(async lista => {
        const [porCat, sal] = await Promise.all([conteoPorCategoria(lista), conteosDesincorporacion()])
        setCats(porCat); setConteos(sal)
      })
      .catch(console.error)
      .finally(() => setCargando(false))
  }, [])

  const total = cats.reduce((s, c) => s + c.total, 0)

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
              <p className="detalle">{cats.length} categorías</p>
            </div>

            <p className="etiqueta">Por categoría</p>
            <div className="tarjeta plana">
              {cats.map(c => (
                <button key={c.idcategoria} className="fila" onClick={() => irA('i', 'cat', c.idcategoria)}>
                  <div className="crece">
                    <p className="nombre">{c.nombrecategoria}</p>
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

  useEffect(() => { categoriasInmuebles().then(setCats).catch(console.error) }, [])

  // Con categoría se lista completa; sin ella, se busca por texto
  useEffect(() => {
    if (!idcategoria) return
    setCargando(true)
    categoriasInmuebles()
      .then(lista => inmueblesDeCategoria(idcategoria, lista))
      .then(setDatos)
      .catch(console.error)
      .finally(() => setCargando(false))
  }, [idcategoria])

  useEffect(() => {
    if (idcategoria) return
    if (!texto.trim()) { setDatos([]); return }
    setCargando(true)
    const tm = setTimeout(() => {
      buscarInmuebles(texto, cats).then(setDatos).catch(console.error).finally(() => setCargando(false))
    }, 400)
    return () => clearTimeout(tm)
  }, [texto, cats, idcategoria])

  const q = texto.trim().toLowerCase()
  const lista = idcategoria && q
    ? datos.filter(d => (d.nombre + d.clave + d.ubicacion).toLowerCase().includes(q))
    : datos
  const nombreCat = cats.find(c => Number(c.idcategoria) === Number(idcategoria))?.nombrecategoria

  return (
    <>
      <Cabecera titulo={nombreCat || 'Bienes inmuebles'}
        sub={idcategoria ? `${datos.length} inmuebles` : 'Buscar en el inventario'}
        atras={!!idcategoria} />
      <div className="contenido">
        <div className="buscador">
          <i className="ti ti-search" />
          <input value={texto} onChange={e => setTexto(e.target.value)}
            placeholder={idcategoria ? 'Filtrar esta lista…' : 'Nombre, clave, catastral o ubicación…'} />
          {texto && <button onClick={() => setTexto('')}><i className="ti ti-x" style={{ color: 'var(--texto-4)' }} /></button>}
        </div>

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
