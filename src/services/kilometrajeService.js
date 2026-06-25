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
 *   - Equipos sin odómetro configurado reportan 0 → se descarta y se usa fallback.
 */

// Claves posibles del odómetro dentro de "variables", normalizadas
// (minúsculas, sin guiones/underscores)
const ODOMETRO_KEYS = ["odometro", "kilometraje", "odometrokm"];

// Valores crudos >= a este umbral se asumen en metros (ningún vehículo de la
// flota supera 1.000.000 km; un equipo que reporta metros lo supera con 1.000 km)
const UMBRAL_METROS = 1000000;

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
function extraerOdometro(variables) {
  const vars = parseVariables(variables);
  if (!vars) return null;

  for (const key of Object.keys(vars)) {
    const normalizada = key.toLowerCase().replace(/[-_\s]/g, "");
    if (ODOMETRO_KEYS.includes(normalizada)) {
      const raw = Number(vars[key]);
      if (!Number.isFinite(raw) || raw <= 0) return null;

      const esMetros = raw >= UMBRAL_METROS;
      return {
        raw,
        km: esMetros ? Math.round(raw / 1000) : Math.round(raw),
        unidadAsumida: esMetros ? "METROS" : "KILOMETROS",
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
async function getOdometroCellvi(idCellvi) {
  if (!idCellvi) {
    return { disponible: false, motivo: "Vehículo sin idCellvi" };
  }

  const posicion = await cellviClient.getPosicionVehiculo(idCellvi);
  if (!posicion) {
    return { disponible: false, motivo: "Sin respuesta de Cellvi" };
  }

  const odometro = extraerOdometro(posicion.variables);
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
  const [cellvi, preoperacional] = await Promise.all([
    getOdometroCellvi(vehiculo.idCellvi).catch((e) => {
      logger.error(`Error consultando odómetro Cellvi: ${e.message}`);
      return { disponible: false, motivo: e.message };
    }),
    getKilometrajePreoperacional(vehiculo._id),
  ]);

  const manual = vehiculo.kilometrajeActual
    ? {
        kilometraje: vehiculo.kilometrajeActual,
        fecha: vehiculo.ultimaActualizacionKm || null,
        fuenteRegistrada: vehiculo.fuenteKilometraje || null,
      }
    : null;

  let elegido = { kilometraje: null, fuente: null, fecha: null };

  if (cellvi.disponible) {
    elegido = {
      kilometraje: cellvi.odometroKm,
      fuente: "CELLVI_GPS",
      fecha: cellvi.momento || null,
    };
  } else if (preoperacional) {
    elegido = {
      kilometraje: preoperacional.kilometraje,
      fuente: "PREOPERACIONAL",
      fecha: preoperacional.fecha,
    };
  } else if (manual) {
    elegido = {
      kilometraje: manual.kilometraje,
      fuente: "MANUAL",
      fecha: manual.fecha,
    };
  }

  return {
    ...elegido,
    fuentes: { cellvi, preoperacional, manual },
  };
}

module.exports = {
  resolverKilometraje,
  getOdometroCellvi,
  extraerOdometro,
  parseVariables,
};
