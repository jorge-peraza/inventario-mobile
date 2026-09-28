import { supabase } from './supabase'
import { supabaseInmuebles } from './supabaseInmuebles'

// ── Logos del encabezado de los reportes ─────────────────────────────────────
//
// Los tres venían fijos dentro del programa. Ahora se pueden cambiar desde
// Configuración: el que se sube se guarda en la tabla `configuracion` y los
// reportes lo usan en lugar del de fábrica.
//
// CADA MÓDULO TIENE LOS SUYOS. Muebles guarda en la base de muebles e inmuebles
// en la de inmuebles, así que el administrador de inmuebles no le mueve los
// logos a los reportes de muebles ni al revés. Por eso hay dos archivos de
// instalación: supabase/logos.sql y supabase/logos-inmuebles.sql.
//
// El módulo se decide por el reporte, no por quién entró: un reporte de muebles
// sale con los logos de muebles siempre.
//
// Si la tabla no existe, o está vacía, o la base no contesta, se usan los de
// fábrica. Nunca se queda un reporte sin logos por esto.

export const LOGOS = [
  { id: 'ayuntamiento', etiqueta: 'Logo del Ayuntamiento', archivo: '/logo-ayuntamiento.png', donde: 'Izquierda del encabezado' },
  { id: 'nogales',      etiqueta: 'Escudo de Nogales',     archivo: '/escudo-nogales.png',     donde: 'Centro del encabezado' },
  { id: 'mexico',       etiqueta: 'Escudo de México',      archivo: '/escudo-mexico.png',      donde: 'Derecha del encabezado' },
]

// ── Quiénes firman ───────────────────────────────────────────────────────────
// Los nombres venían escritos dentro de cada documento. Cuando cambia el
// síndico o quien elabora hay que cambiarlos en cuatro lugares distintos y es
// fácil que se olvide uno, así que ahora se escriben una vez aquí.
//
// Lo de abajo son los valores de fábrica: mientras nadie los cambie desde
// Personalización, los documentos salen exactamente igual que antes.
export const FIRMAS = {
  muebles: [
    { id: 'firma',   etiqueta: 'Quien firma',   donde: 'Resguardos y hoja de vehículo',
      nombre: 'MTRA. EDNA ELINORA SOTO GRACIA', puesto: 'SINDICO MUNICIPAL' },
    { id: 'elaboro', etiqueta: 'Quien elabora', donde: 'Resguardos y hoja de vehículo',
      nombre: 'C. ELSA MÓNICA LÓPEZ LEYVA',     puesto: 'ASISTENTE ADMINISTRATIVO' },
  ],
  inmuebles: [
    { id: 'firma',   etiqueta: 'Quien firma',   donde: 'Reporte de Tesorería',
      nombre: 'MTRA. EDNA ELINORA SOTO GRACIA', puesto: 'SINDICO MUNICIPAL' },
    { id: 'elaboro', etiqueta: 'Quien elabora', donde: 'Reporte de Tesorería',
      nombre: 'ING. ELISEO ESCOBEDO',           puesto: '' },
  ],
}

export const MODULOS = ['muebles', 'inmuebles']

const clienteDe = modulo => (modulo === 'inmuebles' ? supabaseInmuebles : supabase)

// En la tabla todo vive junto con una clave con prefijo: logo_nogales,
// firma_elaboro. Así un solo renglón por cosa y una sola consulta por módulo.
const claveLogo  = id => 'logo_' + id
const claveFirma = id => 'firma_' + id
const deFabrica  = id => LOGOS.find(l => l.id === id)?.archivo || ''
const firmaDeFabrica = (modulo, id) =>
  (FIRMAS[modulo] || []).find(f => f.id === id) || { nombre: '', puesto: '' }

// El módulo que le toca a cada quien en la pantalla de Personalización
export const moduloDeUsuario = user => (user?.rol === 'admin_inmuebles' ? 'inmuebles' : 'muebles')

// Se recuerdan en el navegador para que el primer reporte de la sesión no tenga
// que esperar a la base, y para que sigan saliendo si la red falla un momento.
const CACHE = 'personalizacion-reportes'
let cambiados = leerCache()

function vacio() {
  return { muebles: { logos: {}, firmas: {} }, inmuebles: { logos: {}, firmas: {} } }
}
function leerCache() {
  try {
    const g = JSON.parse(localStorage.getItem(CACHE) || '{}')
    const base = vacio()
    for (const m of ['muebles', 'inmuebles']) {
      base[m].logos  = g?.[m]?.logos  || {}
      base[m].firmas = g?.[m]?.firmas || {}
    }
    return base
  } catch { return vacio() }
}
function guardarCache() {
  try { localStorage.setItem(CACHE, JSON.stringify(cambiados)) } catch { /* modo privado */ }
}

// ── Logos ────────────────────────────────────────────────────────────────────

// Para `cargarImagen`, que ya le antepone la ruta base a lo que empieza con "/"
export function rutaLogo(modulo, id) {
  return cambiados[modulo]?.logos?.[id] || deFabrica(id)
}

// Para un <img src> armado a mano. La dirección queda ABSOLUTA a propósito: el
// resguardo y la hoja de vehículo se abren como archivo aparte —muchas veces
// desde la carpeta de Descargas—, y ahí una ruta como /inventario-nogales/x.png
// apunta a C:\inventario-nogales\ y el logo sale roto. El logo cambiado no
// tiene este problema porque viaja dentro del propio archivo.
export function srcLogo(modulo, id) {
  const propio = cambiados[modulo]?.logos?.[id]
  if (propio) return propio
  const base = window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, '')
  return base + deFabrica(id)
}

export function hayCambiado(modulo, id) { return !!cambiados[modulo]?.logos?.[id] }

export async function guardarLogo(modulo, id, dataURL) {
  await escribir(modulo, claveLogo(id), dataURL)
  cambiados[modulo].logos = { ...cambiados[modulo].logos, [id]: dataURL }
  guardarCache()
}

// Volver al de fábrica es borrar el renglón, no guardar el original otra vez
export async function restaurarLogo(modulo, id) {
  await borrar(modulo, claveLogo(id))
  const { [id]: _fuera, ...resto } = cambiados[modulo].logos
  cambiados[modulo].logos = resto
  guardarCache()
}

// ── Firmas ───────────────────────────────────────────────────────────────────

// Lo que va impreso: la que se guardó, o la de fábrica si nadie la ha cambiado
export function firma(modulo, id) {
  const propia = cambiados[modulo]?.firmas?.[id]
  const base = firmaDeFabrica(modulo, id)
  return {
    nombre: propia?.nombre ?? base.nombre,
    puesto: propia?.puesto ?? base.puesto,
  }
}

export function firmaCambiada(modulo, id) { return !!cambiados[modulo]?.firmas?.[id] }

export async function guardarFirma(modulo, id, { nombre, puesto }) {
  const valor = JSON.stringify({ nombre: (nombre || '').trim(), puesto: (puesto || '').trim() })
  await escribir(modulo, claveFirma(id), valor)
  cambiados[modulo].firmas = { ...cambiados[modulo].firmas, [id]: JSON.parse(valor) }
  guardarCache()
}

export async function restaurarFirma(modulo, id) {
  await borrar(modulo, claveFirma(id))
  const { [id]: _fuera, ...resto } = cambiados[modulo].firmas
  cambiados[modulo].firmas = resto
  guardarCache()
}

// ── Base de datos ────────────────────────────────────────────────────────────

// Una sola vez al entrar. Se piden los dos módulos: quien entra a muebles puede
// no tocar nunca inmuebles, pero traerlos juntos sale igual de barato que uno.
export async function cargarPersonalizacion() {
  await Promise.all(MODULOS.map(cargarModulo))
  guardarCache()
  return cambiados
}

async function cargarModulo(modulo) {
  try {
    const { data, error } = await clienteDe(modulo).from('configuracion').select('clave,valor')
    if (error) return
    const logos = {}, firmas = {}
    for (const f of data || []) {
      if (!f.valor) continue
      const clave = String(f.clave || '')
      if (clave.startsWith('logo_')) logos[clave.slice(5)] = f.valor
      else if (clave.startsWith('firma_')) {
        // Si alguien editó el renglón a mano y quedó mal, se ignora ese y ya
        try { firmas[clave.slice(6)] = JSON.parse(f.valor) } catch { /* noop */ }
      }
    }
    cambiados[modulo] = { logos, firmas }
  } catch { /* sin conexión: quedan los de la última vez */ }
}

async function escribir(modulo, clave, valor) {
  const { error } = await clienteDe(modulo)
    .from('configuracion').upsert({ clave, valor }, { onConflict: 'clave' })
  if (error) throw new Error(mensaje(error, modulo))
}

async function borrar(modulo, clave) {
  const { error } = await clienteDe(modulo).from('configuracion').delete().eq('clave', clave)
  if (error) throw new Error(mensaje(error, modulo))
}

function mensaje(error, modulo) {
  const m = error.message || 'No se pudo guardar'
  const archivo = modulo === 'inmuebles' ? 'supabase/logos-inmuebles.sql' : 'supabase/logos.sql'
  if (/relation .* does not exist|schema cache/i.test(m))
    return `Falta crear la tabla de configuración: hay que correr ${archivo} en Supabase`
  if (/row-level security|permission denied/i.test(m))
    return 'Esta cuenta no tiene permiso para cambiar esto'
  return m
}

// ── Preparar la imagen que sube el usuario ───────────────────────────────────
// Se vuelve a dibujar como PNG y se limita el tamaño: alguien puede elegir una
// foto de 4000 px y el logo se imprime de dos centímetros. Se conserva la
// proporción y la transparencia.
const LADO_MAX = 900

export function prepararImagen(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No elegiste ningún archivo'))
    if (!/^image\//.test(file.type)) return reject(new Error('Eso no es una imagen'))

    const lector = new FileReader()
    lector.onerror = () => reject(new Error('No pude leer el archivo'))
    lector.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('No pude abrir la imagen'))
      img.onload = () => {
        const escala = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight))
        const w = Math.max(1, Math.round(img.naturalWidth * escala))
        const h = Math.max(1, Math.round(img.naturalHeight * escala))
        const c = document.createElement('canvas')
        c.width = w; c.height = h
        c.getContext('2d').drawImage(img, 0, 0, w, h)
        const dataURL = c.toDataURL('image/png')
        resolve({ dataURL, w, h, original: { w: img.naturalWidth, h: img.naturalHeight }, bytes: Math.round(dataURL.length * 0.75) })
      }
      img.src = lector.result
    }
    lector.readAsDataURL(file)
  })
}
