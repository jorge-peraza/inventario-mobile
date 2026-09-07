import { useState, useEffect } from 'react'
import Dashboard from './Dashboard'
import { supabase } from '../supabase'

// Inicio de una dependencia.
//
// Es el mismo tablero del administrador —las cuatro tarjetas y la dona de bienes
// por tipo— pero acotado a las áreas de la dependencia y sin el acceso de alta:
// esta cuenta solo consulta y descarga sus reportes.
export default function IndexDependencia({ user, onNavigate }) {
  const [areaIds, setAreaIds] = useState(null)   // null = todavía no se sabe

  useEffect(() => {
    if (!user?.iddependencia) { setAreaIds([]); return }
    let vivo = true
    supabase.from('areas').select('idarea').eq('iddependencia', user.iddependencia)
      .then(({ data }) => { if (vivo) setAreaIds((data || []).map(a => a.idarea)) })
    return () => { vivo = false }
  }, [user?.iddependencia])

  const acciones = [
    { icon: 'ti-table',       label: 'Ver mi inventario',  desc: 'Bienes a cargo de la dependencia', go: () => onNavigate('bienes') },
    { icon: 'ti-file-export', label: 'Exportar reporte',   desc: 'PDF o Excel de mi inventario',     go: () => onNavigate('bienes') },
  ]

  return (
    <Dashboard
      user={user}
      onNavigate={onNavigate}
      areaIds={areaIds || []}
      esperando={areaIds === null}
      titulo={`Bienvenido, ${user.nombre}`}
      subtitulo={`${user.dependencia} · Consulta de inventario`}
      acciones={acciones}
    />
  )
}
