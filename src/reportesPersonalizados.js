// Reportes personalizados del módulo de Bienes Muebles.
//
// Viven en la tabla `reportes_personalizados` (supabase/persistencia-muebles.sql,
// ya aplicada). Antes se guardaban en el user_metadata de la cuenta y en el
// navegador: eso no salía en un respaldo de la base ni se podía exportar.
//
// Lo único que queda de antes es el RESCATE: la primera vez que se abre
// Reportes, si la tabla está vacía y la cuenta o el equipo todavía tienen
// reportes viejos, se suben y se limpia el navegador.

import { supabase } from './supabase'
import { metadataUsuario } from './auth'

const LS = 'reportes_personalizados'
const TABLA = 'reportes_personalizados'

// La fila de la tabla se traduce al mismo objeto de configuración de siempre
function aConfig(fila) {
  const cfg = (fila.config && typeof fila.config === 'object') ? fila.config : {}
  return { ...cfg, id: fila.idreporte, titulo: fila.titulo ?? cfg.titulo }
}

function aFila(cfg, usuario) {
  return {
    idreporte:   String(cfg.id),
    usuario:     usuario || null,
    titulo:      cfg.titulo || 'Reporte',
    config:      cfg,
    actualizado: new Date().toISOString(),
  }
}

export async function listarReportes(usuario) {
  const { data, error } = await supabase.from(TABLA)
    .select('idreporte, titulo, config').order('creado', { ascending: true })
  if (error) throw error

  const enBase = (data || []).map(aConfig)
  if (enBase.length) return enBase

  // Tabla vacía: puede ser que este equipo tenga los de antes
  const previos = await reportesPrevios()
  if (!previos.length) return []
  await Promise.all(previos.map(c => guardarReporteRemoto(c, usuario)))
  limpiarPrevios()
  return previos
}

export async function guardarReporteRemoto(cfg, usuario) {
  const { error } = await supabase.from(TABLA)
    .upsert(aFila(cfg, usuario), { onConflict: 'idreporte' })
  if (error) throw error
}

export async function borrarReporteRemoto(id) {
  const { error } = await supabase.from(TABLA).delete().eq('idreporte', String(id))
  if (error) throw error
}

// ── Rescate de lo guardado antes de la migración ────────────────────────────
export function getLocales() {
  try { return JSON.parse(localStorage.getItem(LS) || '[]') } catch { return [] }
}

async function reportesPrevios() {
  try {
    const m = await metadataUsuario()
    const cuenta = Array.isArray(m?.reportes_personalizados) ? m.reportes_personalizados : null
    if (cuenta && cuenta.length) return cuenta
  } catch { /* sin sesión */ }
  return getLocales()
}

function limpiarPrevios() {
  try { localStorage.removeItem(LS) } catch { /* modo privado */ }
}
