const cellviClient = require("./cellviClient");
const Preoperacional = require("../models/Preoperacional");
const logger = require("../config/logger");

/**
 * Servicio de Kilometraje
 *
 * Resuelve el kilometraje actual de un vehículo combinando fuentes, en orden:
 *   1. CELLVI_GPS      → odómetro reportado por el equipo GPS (campo "variables"
 *                        del último GeoPoint, vía get_last_position)
 *   2. PREOPERACIONAL  → último kilometraje digitado por el conductor en el checklist
 *   3. MANUAL          → campo kilometrajeActual guardado en el vehículo
 *
 * El odómetro GPS depende del protocolo de cada equipo:
 *   - iStartek:   clave "Odometro", valor EN METROS (ej: 7656570 ≈ 7656 km)
 *   - Skypatrol:  clave "kilometraje" u "odometro_km"
 *   - Otros equipos: clave "RECORRIDOS", valor EN KILÓMETROS con decimales
 *                    (ej: "32594.471" ≈ 32594 km)
 *   - Equipos sin odómetro configurado reportan 0 → se descarta y se usa fallback.
 */

// Claves posibles del odómetro dentro de "variables", normalizadas
// (minúsculas, sin guiones/underscores). Distintos equipos usan distinto nombre.
const ODOMETRO_KEYS = [
  "odometro",
  "kilometraje",
  "odometrokm",
  "recorridos", // equipos que envían el km recorrido total (km con decimales)
];

// Tope de plausibilidad: ningún vehículo de la flota llega a 2.000.000 km. Un
// valor por encima es un error de digitación o un odómetro en otra unidad, y no
// debe usarse como base de los planes de mantenimiento.
const KM_MAXIMO_PLAUSIBLE = 2000000;

// Valores crudos >= a este umbral solo pueden estar en metros.
const UMBRAL_METROS = KM_MAXIMO_PLAUSIBLE;

/** ¿El valor sirve como kilometraje de un vehículo real? */
function esKmPlausible(valor) {
  return (
    typeof valor === "number" &&
    Number.isFinite(valor) &&
    valor >= 0 &&
    valor <= KM_MAXIMO_PLAUSIBLE
  );
}

/**
 * Elige entre leer el odómetro crudo como km o como metros.
 * Cuando ambas lecturas son plausibles (ej. 500.000 → 500.000 km o 500 km) se
 * decide con el kilometraje ya conocido del vehículo: gana la más cercana. Sin
 * referencia se conserva el valor crudo, que es lo que hacía antes.
 */
function elegirUnidad(raw, referencia) {
  const comoKm = Math.round(raw);
  const comoMetros = Math.round(raw / 1000);

  const kmValido = esKmPlausible(comoKm);
  const metrosValido = esKmPlausible(comoMetros) && raw >= 1000;

  if (!kmValido && !metrosValido) return null;
  if (!kmValido) return { km: comoMetros, unidad: "METROS" };
  if (!metrosValido) return { km: comoKm, unidad: "KILOMETROS" };

  if (esKmPlausible(referencia) && referencia > 0) {
    const distKm = Math.abs(comoKm - referencia);
    const distMetros = Math.abs(comoMetros - referencia);
    return distMetros < distKm
      ? { km: comoMetros, unidad: "METROS" }
      : { km: comoKm, unidad: "KILOMETROS" };
  }

  return raw >= UMBRAL_METROS
    ? { km: comoMetros, unidad: "METROS" }
    : { km: comoKm, unidad: "KILOMETROS" };
}

/**
 * Parsea el campo "variables" del GeoPoint.
 * Viene como JSON doblemente codificado (string de un string de un objeto).
 */
function parseVariables(variables) {
  let valor = variables;
  for (let i = 0; i < 3 && typeof valor === "string"; i++) {
    try {
      valor = JSON.parse(valor);
    } catch {
      return null;
    }
  }
  return valor && typeof valor === "object" ? valor : null;
}

/**
 * Extrae el odómetro de las variables del GPS.
 * Retorna { raw, km, unidadAsumida, clave } o null si no hay odómetro útil (> 0).
 */
function extraerOdometro(variables, referencia = null) {
  const vars = parseVariables(variables);
  if (!vars) return null;

  for (const key of Object.keys(vars)) {
    const normalizada = key.toLowerCase().replace(/[-_\s]/g, "");
    if (ODOMETRO_KEYS.includes(normalizada)) {
      // Algunos equipos envían el valor como string con coma decimal
      // (ej. "32594,471"); normalizamos a punto antes de convertir.
      const raw = Number(String(vars[key]).trim().replace(",", "."));
      if (!Number.isFinite(raw) || raw <= 0) return null;

      const lectura = elegirUnidad(raw, referencia);
      // Odómetro fuera de todo rango razonable: se descarta en vez de
      // contaminar el kilometraje del vehículo y los planes.
      if (!lectura) return null;

      return {
        raw,
        km: lectura.km,
        unidadAsumida: lectura.unidad,
        clave: key,
      };
    }
  }
  return null;
}

/**
 * Consulta el odómetro GPS del vehículo en Cellvi.
 * Retorna { disponible, odometroRaw, odometroKm, unidadAsumida, momento } o
 * { disponible: false, motivo } si no se pudo obtener.
 */
async function getOdometroCellvi(idCellvi, referencia = null) {
  if (!idCellvi) {
    return { disponible: false, motivo: "Vehículo sin idCellvi" };
  }

  const posicion = await cellviClient.getPosicionVehiculo(idCellvi);
  if (!posicion) {
    return { disponible: false, motivo: "Sin respuesta de Cellvi" };
  }

  const odometro = extraerOdometro(posicion.variables, referencia);
  if (!odometro) {
    return {
      disponible: false,
      motivo: "El equipo GPS no reporta odómetro (valor 0 o ausente)",
      momento: posicion.momento,
    };
  }

  return {
    disponible: true,
    odometroRaw: odometro.raw,
    odometroKm: odometro.km,
    unidadAsumida: odometro.unidadAsumida,
    clave: odometro.clave,
    momento: posicion.momento,
  };
}

/**
 * Último kilometraje digitado en preoperacional para el vehículo.
 */
async function getKilometrajePreoperacional(vehiculoId) {
  const ultima = await Preoperacional.findOne({
    vehiculo: vehiculoId,
    deletedAt: null,
    kilometraje: { $exists: true, $ne: null },
  })
    .sort({ fecha: -1 })
    .select("kilometraje fecha")
    .lean();

  return ultima
    ? { kilometraje: ultima.kilometraje, fecha: ultima.fecha }
    : null;
}

/**
 * Resuelve el kilometraje del vehículo consultando todas las fuentes.
 *
 * @param {Object} vehiculo - Documento Vehiculo (necesita _id, idCellvi,
 *                            kilometrajeActual, ultimaActualizacionKm)
 * @returns {{ kilometraje, fuente, fecha, fuentes }} kilometraje elegido +
 *          detalle de cada fuente para diagnóstico.
 */
async function resolverKilometraje(vehiculo) {
  // Referencia previa (preoperacional o dato manual) para desambiguar la unidad
  // del odómetro GPS y para descartar lecturas imposibles.
  const preoperacionalPrevio = await getKilometrajePreoperacional(vehiculo._id);
  const referencia = esKmPlausible(preoperacionalPrevio?.kilometraje)
    ? preoperacionalPrevio.kilometraje
    : esKmPlausible(vehiculo.kilometrajeActual)
      ? vehiculo.kilometrajeActual
      : null;

  const cellvi = await getOdometroCellvi(vehiculo.idCellvi, referencia).catch(
    (e) => {
      logger.error(`Error consultando odómetro Cellvi: ${e.message}`);
      return { disponible: false, motivo: e.message };
    },
  );
  const preoperacional = preoperacionalPrevio;

  const manual = vehiculo.kilometrajeActual
    ? {
        kilometraje: vehiculo.kilometrajeActual,
        fecha: vehiculo.ultimaActualizacionKm || null,
        fuenteRegistrada: vehiculo.fuenteKilometraje || null,
      }
    : null;

  let elegido = { kilometraje: null, fuente: null, fecha: null };

  // Solo se toma una fuente si su valor es plausible: un dato imposible
  // (digitación errada, odómetro dañado) desalinearía todos los planes.
  if (cellvi.disponible && esKmPlausible(cellvi.odometroKm)) {
    elegido = {
      kilometraje: cellvi.odometroKm,
      fuente: "CELLVI_GPS",
      fecha: cellvi.momento || null,
    };
  } else if (preoperacional && esKmPlausible(preoperacional.kilometraje)) {
    elegido = {
      kilometraje: preoperacional.kilometraje,
      fuente: "PREOPERACIONAL",
      fecha: preoperacional.fecha,
    };
  } else if (manual && esKmPlausible(manual.kilometraje)) {
    elegido = {
      kilometraje: manual.kilometraje,
      fuente: "MANUAL",
      fecha: manual.fecha,
    };
  }

  // Aviso explícito para la interfaz: hay dato guardado, pero no es usable.
  const descartado =
    elegido.kilometraje === null &&
    (manual?.kilometraje != null || preoperacional?.kilometraje != null)
      ? {
          valor: manual?.kilometraje ?? preoperacional?.kilometraje,
          motivo: `Fuera del rango razonable (0 a ${KM_MAXIMO_PLAUSIBLE.toLocaleString("es-CO")} km). Corrija el kilometraje del vehículo.`,
        }
      : null;

  return {
    ...elegido,
    descartado,
    fuentes: { cellvi, preoperacional, manual },
  };
}

module.exports = {
  resolverKilometraje,
  esKmPlausible,
  KM_MAXIMO_PLAUSIBLE,
  getOdometroCellvi,
  extraerOdometro,
  parseVariables,
};
