/**
 * Etiquetas legibles de los ítems y secciones de la preoperacional.
 *
 * En la base de datos los ítems se guardan con la clave del schema
 * ("aseoInterno", "seccionDelantera.frenos"). Para cualquier texto que vea el
 * usuario —anotaciones, estadísticas, correos— se usa `labelItemPreop`, que
 * traduce por diccionario y, si la clave no está, separa el camelCase.
 */

// Etiquetas curadas (mismas que muestra el formulario del PESV).
const ETIQUETAS_ITEMS = {
  // Sección delantera
  luces: "Luces",
  direccionalesDelanteros: "Direccionales Delanteros",
  limpiabrisas: "Limpiabrisas",
  parabrisas: "Parabrisas",
  llantaDelanteraDerecha: "Llanta Delantera Derecha",
  llantaDelanteraIzquierda: "Llanta Delantera Izquierda",
  bocina: "Bocina",
  frenos: "Frenos",
  nivelAceiteMotor: "Nivel de Aceite del Motor",
  nivelLiquidoFrenos: "Nivel de Líquido de Frenos",
  nivelAguaRadiador: "Nivel de Agua del Radiador",
  estadoBateria: "Estado de la Batería",
  fugasLiquidos: "Fugas de Líquidos",

  // Sección media
  tablero: "Tablero",
  timon: "Timón",
  pedales: "Pedales",
  frenoMano: "Freno de Mano",
  kitPrimerosAuxilios: "Kit de Primeros Auxilios",
  reflectivos: "Reflectivos",
  aireAcondicionado: "Aire Acondicionado",
  silleteria: "Silletería",
  nivelCombustible: "Nivel de Combustible",
  pito: "Pito",
  cinturonesSeguridad: "Cinturones de Seguridad",
  airbags: "Airbags",
  vidrios: "Vidrios",
  apoyacabezas: "Apoyacabezas",
  espejoIzquierdo: "Espejo Izquierdo",
  espejoDerecho: "Espejo Derecho",
  espejoRetrovisor: "Espejo Retrovisor",
  estadoDireccion: "Estado de la Dirección",
  suspensionDelantera: "Suspensión Delantera",
  suspensionTrasera: "Suspensión Trasera",
  calcomanias: "Calcomanías",
  puertas: "Puertas",

  // Sección trasera
  stop: "Stop",
  llantasRepuesto: "Llantas de Repuesto",
  equipoCarretera: "Equipo de Carretera",
  llantaTraseraDerecha: "Llanta Trasera Derecha",
  llantaTraseraIzquierda: "Llanta Trasera Izquierda",
  direccionalesTraseros: "Direccionales Traseros",
  placa: "Placa",
  extintor: "Extintor",
  herramienta: "Herramienta",

  // Sección aseo
  aseoInterno: "Aseo Interno",
  aseoExterno: "Aseo Externo",
  latas: "Latas",
  pintura: "Pintura",

  // Ítems no corregibles (estado del conductor)
  sueno: "Estado de Sueño",
  salud: "Estado de Salud",
  sustancias: "Consumo de Sustancias",
};

const ETIQUETAS_SECCIONES = {
  seccionDelantera: "Sección Delantera",
  seccionMedia: "Sección Media",
  seccionTrasera: "Sección Trasera",
  seccionAseo: "Sección Aseo",
  estadoConductor: "Estado del Conductor",
};

/** "aseoInterno" → "Aseo Interno" (respeta siglas y números). */
function separarCamelCase(clave) {
  return String(clave)
    .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, "$1 $2")
    .replace(/([A-ZÁÉÍÓÚÑ]+)([A-ZÁÉÍÓÚÑ][a-záéíóúñ])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

/**
 * Etiqueta legible de un ítem. Acepta la clave suelta ("aseoInterno") o
 * calificada con la sección ("seccionAseo.aseoInterno").
 */
function labelItemPreop(clave) {
  if (!clave) return "";
  const partes = String(clave).split(".");
  const ultima = partes[partes.length - 1];
  return ETIQUETAS_ITEMS[ultima] || separarCamelCase(ultima);
}

/** Etiqueta legible de una sección ("seccionAseo" → "Sección Aseo"). */
function labelSeccionPreop(clave) {
  if (!clave) return "";
  return ETIQUETAS_SECCIONES[clave] || separarCamelCase(clave);
}

module.exports = {
  ETIQUETAS_ITEMS,
  ETIQUETAS_SECCIONES,
  labelItemPreop,
  labelSeccionPreop,
  separarCamelCase,
};
