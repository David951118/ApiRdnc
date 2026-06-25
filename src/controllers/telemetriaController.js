const Vehiculo = require("../models/Vehiculo");
const cellviClient = require("../services/cellviClient");
const kilometrajeService = require("../services/kilometrajeService");
const { longitudRecorridoKm } = require("../helpers/geo");
const logger = require("../config/logger");

/**
 * Controlador de telemetría (Fase 5 — datos de Cellvi vía proxy).
 *
 * ⚠️ EXPERIMENTAL: depende del endpoint ruta_fraccionada de Cellvi, cuyo path y
 * formato de respuesta exactos están pendientes de confirmar en producción.
 * El front NUNCA debe llamar a Cellvi directo: todo pasa por aquí.
 */

/**
 * Normaliza un punto del recorrido sin importar el nombre de las claves.
 */
function normalizarPunto(p) {
  const lat = Number(p.latitud ?? p.lat ?? p.latitude);
  const lng = Number(p.longitud ?? p.lng ?? p.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    momento: p.momento || p.fecha || p.fecha_hora || null,
    velocidad: p.velocidad ?? null,
  };
}

async function resolverVehiculo(idParam) {
  const query = idParam.match(/^[0-9a-fA-F]{24}$/)
    ? { _id: idParam, deletedAt: null }
    : { placa: idParam.toUpperCase(), deletedAt: null };
  return Vehiculo.findOne(query);
}

/**
 * GET /api/telemetria/posicion/:id
 * Última posición + odómetro normalizado del vehículo.
 */
exports.posicionActual = async (req, res) => {
  try {
    const vehiculo = await resolverVehiculo(req.params.id);
    if (!vehiculo)
      return res
        .status(404)
        .json({ success: false, message: "Vehículo no encontrado" });

    if (!vehiculo.idCellvi) {
      return res.status(400).json({
        success: false,
        message: "El vehículo no tiene idCellvi para consultar telemetría",
      });
    }

    const posicion = await cellviClient.getPosicionVehiculo(vehiculo.idCellvi);
    if (!posicion) {
      return res
        .status(502)
        .json({ success: false, message: "Sin respuesta de Cellvi" });
    }

    const odometro = kilometrajeService.getOdometroCellvi
      ? kilometrajeService.extraerOdometro(posicion.variables)
      : null;

    res.json({
      success: true,
      data: {
        placa: vehiculo.placa,
        lat: posicion.lat,
        lng: posicion.lng,
        velocidad: posicion.velocidad,
        momento: posicion.momento,
        sentido: posicion.sentido,
        odometro, // { raw, km, unidadAsumida, clave } | null
      },
    });
  } catch (error) {
    logger.error(`Error consultando posición: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/telemetria/recorrido/:id?desde=&hasta=
 * Recorrido del vehículo en el rango + km recorridos calculados por haversine.
 * desde/hasta en formato que Cellvi acepte (ISO o 'YYYY-MM-DD HH:mm:ss').
 */
exports.recorrido = async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({
        success: false,
        message: "Debe indicar 'desde' y 'hasta'",
      });
    }

    const vehiculo = await resolverVehiculo(req.params.id);
    if (!vehiculo)
      return res
        .status(404)
        .json({ success: false, message: "Vehículo no encontrado" });

    if (!vehiculo.idCellvi) {
      return res.status(400).json({
        success: false,
        message: "El vehículo no tiene idCellvi para consultar telemetría",
      });
    }

    const crudo = await cellviClient.getRecorrido(
      vehiculo.idCellvi,
      desde,
      hasta,
    );

    if (crudo === null) {
      return res.status(502).json({
        success: false,
        message: "Sin respuesta de Cellvi para el recorrido",
      });
    }

    const puntos = crudo.map(normalizarPunto).filter(Boolean);
    const kmRecorridos = longitudRecorridoKm(puntos);

    res.json({
      success: true,
      data: {
        placa: vehiculo.placa,
        desde,
        hasta,
        totalPuntos: puntos.length,
        kmRecorridos,
        puntos,
      },
    });
  } catch (error) {
    logger.error(`Error consultando recorrido: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};
