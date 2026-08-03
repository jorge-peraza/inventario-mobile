import { supabase } from './supabase'

// ── Claves de inventario ──────────────────────────────────────────────────────
// Formato: {PREFIJO}{AA}-{CLAVE TESORERIA}-{TIPO}-{CONSECUTIVO}
// Ejemplo: I25-3401-2-794  →  Innovación, 2025, clave 3401, cómputo, consecutivo 794
//
// El catálogo se obtuvo de las claves ya existentes en la base: para cada área se
// tomó el par (prefijo, clave) dominante entre las claves con el formato vigente
// (clave de Tesorería numérica). No hay claves inventadas.

// idarea → [prefijo, clave de Tesorería]
export const CLAVE_POR_AREA = {
  1: ['CR', '0101'],              // H. CABILDO
  3: ['I', '3401'],               // INNOVACION Y PROYECTOS ESPECIALES
  8: ['DS', '3101'],              // CENTRO DE PROTECCION Y CONTROL ANIMAL
  10: ['DS', '3101'],             // SALUD
  22: ['AP', '0703'],             // ALUMBRADO PUBLICO
  26: ['SP', '0701'],             // SERVICIOS PUBLICOS
  63: ['DGJ', '2001'],            // ASUNTOS JURIDICOS
  65: ['IMJ', '3301'],            // INSTITUTO MUNICIPAL DE LA JUVENTUD
  68: ['OM', '1101'],             // OFICIALIA MAYOR
  71: ['RH', '1103'],             // RECURSOS HUMANOS
  74: ['OM', '1102'],             // SUB OFICIALIA
  81: ['BS', '1104'],             // BIENES Y SERVICIOS
  85: ['RM', '1106'],             // RASTRO MUNICIPAL
  91: ['TALLER', '1108'],         // TALLER MUNICIPAL
  95: ['PM', '0301'],             // SECRETARIA PARTICULAR
  112: ['DPDU', '1809'],          // PLANEACION
  119: ['DPDU', '1809'],          // DESARROLLO URBANO
  124: ['DOP', '1803'],           // OBRAS PUBLICAS
  126: ['SDU', '1801'],           // ECOLOGIA
  144: ['DS', '0201'],            // DESPACHO SINDICATURA
  148: ['DJ', '0201'],            // AREA JURIDICA
  150: ['CI', '0202'],            // CONTROL DE INVENTARIOS
  152: ['CM', '0504'],            // CATASTRO
  154: ['TM', '0501'],            // TESORERIA MUNICIPAL
  177: ['CS', '1301'],            // COMUNICACION SOCIAL
  179: ['DDE', '1601'],           // DESARROLLO ECONOMICO
  182: ['DBS', '1401'],           // DESPACHO
  189: ['DE', '3001'],            // EDUCACION MUNICIPAL
  190: ['DIU', '3201'],           // IMAGEN URBANA
  198: ['JC', '0401'],            // MEDICOS CALIFICADORES
  200: ['JC', '0403'],            // JUZGADO CONCILIATORIO
  205: ['SA', '0401'],            // SECRETARIA DEL AYUNTAMIENTO
  211: ['PROFECO', '0401'],       // PROFECO
  213: ['AC', '0409'],            // ACCION CIVICA
  214: ['IV', '0407'],            // INSPECCION Y VIGILANCIA
  217: ['JMR', '0401'],           // JUNTA MUNICIPAL DE RECLUTAMIENTO
  218: ['SRE', '0401'],           // OFICINA ENLACE RELACIONES EXTERIORES
  220: ['PC', '0405'],            // PROTECCION CIVIL
  222: ['DBSFM', '1401'],         // FLORES MAGON
  224: ['DBSLMESA', '1401'],      // LA MESA
  225: ['DBSCS', '1401'],         // 5 DE MAYO
  228: ['DBSJM', '1401'],         // JARDINES DE LA MONTANA
  301: ['DBSESPE', '1401'],       // LA ESPERANZA
  304: ['DBSCOL', '1401'],        // COLOSIO
  306: ['DBSR', '1401'],          // ROSARITO
  309: ['DBSCS', '1401'],         // COLINAS DEL SOL
  312: ['DSY', '1401'],           // YAQUI CTS-CROC
  316: ['DBSBJ', '1401'],         // BENITO JUAREZ
  320: ['DBST', '1401'],          // TAPIROS
  323: ['DSCARTE', '1401'],       // CONARTE
  325: ['DBSEMP', '1401'],        // EMPALME
  326: ['DSP', '0801'],           // DESPACHO
  332: ['DSPINF', '0801'],        // INFORMATICA
  333: ['DSPVROB', '0801'],       // VEHICULOS ROBADOS
  335: ['DSPPMEX', '0801'],       // PLATAFORMA MEXICO
  338: ['DSPZCIBU', '0801'],      // DELEGACION CIBUTA
  339: ['DSPDGAMA', '0801'],      // DELEGACION GAMA INDUSTRIAL
  340: ['DSPDN', '0801'],         // DELEGACION NORTE
  344: ['DSPSDS', '0808'],        // DELEGACION SUR
  346: ['DSPDE', '0809'],         // DELEGACION ESTE
  347: ['DSPLAMESA', '0801'],     // DELEGACION LA MESA
  349: ['DSPAUX', '0801'],        // POLICIA AUXILIAR
  351: ['DSPD', '0806'],          // DACTILOSCOPIA
  352: ['DSPAR', '0804'],         // ARMAS
  354: ['DSPZC', '0801'],         // DELEGACION CENTRO
  358: ['SPJC', '0801'],          // JUSTICIA CIVICA
  359: ['DSPT', '0803'],          // TRANSITO
  385: ['DSPJOPER', '0801'],      // JEFATURA OPERATIVA
  387: ['CHJP', '0801'],          // HONOR Y JUSTICIA
  388: ['DSPSD', '0801'],         // SUB DIRECCION
  390: ['DSPAVD', '0801'],        // UNAVIM
  392: ['DSPUNAD', '0801'],       // ATENCION AL DELITO
  393: ['OCEGAN', '1001'],        // CONTRALORIA
  395: ['AI', '1002'],            // ASUNTOS INTERNOS
  396: ['JC', '0406'],            // COORDINACION DE JUECES
  398: ['JC', '0401'],            // JUECES DELEGACION SUR
  399: ['JC', '0401'],            // JUECES DELEGACION ESTE
}

// Dígito de tipo de inventario, según el uso real en la base
const TIPO_POR_MODO = {
  mobiliario: '1', computo: '2', vehiculos: '3', maquinaria: '4',
  radiocomunicacion: '5', parquimetros: '6', senalizaciones: '7',
  arbolesplantas: '7', defensa: '1',
}
const TIPO_POR_CATEGORIA = {
  'MOBILIARIO': '1', 'EQUIPO DE COMPUTO': '2', 'EQUIPO': '2',
  'VEHICULAR': '3', 'VEHICULAR-MAQUINARIA': '3', 'VEHICULAR-REMOLQUES-CARROCERIAS': '3',
  'MAQUINARIA': '4', 'RADIOCOMUNICACION': '5',
  'EQUIPO DE CONTROL TIEMPO PARQUI': '6', 'SEÑALIZACIONES': '7', 'ARBOLES Y PLANTAS': '7',
  'MAQUINARIA Y EQUIPO DE DEFENSA Y SEGURIDAD PUBLICA': '1',
}

export function tipoDeModo(modo) { return TIPO_POR_MODO[modo] || '1' }
export function tipoDeCategoria(cat) { return TIPO_POR_CATEGORIA[(cat || '').toUpperCase()] || '1' }
export function claveDeArea(idarea) { return CLAVE_POR_AREA[Number(idarea)] || null }

// Genera la siguiente clave para un área + tipo, consultando el consecutivo más
// alto ya usado con ese mismo prefijo, año y tipo.
// Devuelve { clave, prefijo, tesoreria, tipo, consecutivo } o null si el área no
// tiene clave asignada.
export async function siguienteClave({ idarea, tipo, anio }) {
  const par = claveDeArea(idarea)
  if (!par) return null
  const [prefijo, tesoreria] = par
  const aa = String(anio ?? new Date().getFullYear()).slice(-2)
  const raiz = `${prefijo}${aa}-${tesoreria}-${tipo}-`

  const { data, error } = await supabase
    .from('bienes')
    .select('claveinventario')
    .like('claveinventario', `${raiz}%`)
  if (error) throw error

  let max = 0
  for (const r of (data || [])) {
    const n = parseInt(String(r.claveinventario).slice(raiz.length), 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  const consecutivo = max + 1
  return {
    clave: raiz + String(consecutivo).padStart(3, '0'),
    prefijo, tesoreria, tipo, consecutivo,
  }
}
