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

// ════════════════════════════════════════════════════════════════
// KILOMETRAJE DIARIO (snapshots del worker kilometrajeDiario)
// ════════════════════════════════════════════════════════════════

const KilometrajeDiario = require("../models/KilometrajeDiario");

/**
 * Calcula el consolidado de recorrido a partir de snapshots ordenados por fecha.
 * Suma solo las diferencias positivas para tolerar resets o correcciones del
 * odómetro (una diferencia negativa no puede ser recorrido real).
 */
function consolidarRecorrido(snapshots) {
  if (!snapshots || snapshots.length === 0) {
    return { dias: 0, kmInicio: null, kmFin: null, recorridoKm: 0 };
  }
  let recorrido = 0;
  for (let i = 1; i < snapshots.length; i++) {
    const delta = snapshots[i].kilometraje - snapshots[i - 1].kilometraje;
    if (delta > 0) recorrido += delta;
  }
  return {
    dias: snapshots.length,
    kmInicio: snapshots[0].kilometraje,
    kmFin: snapshots[snapshots.length - 1].kilometraje,
    fechaInicio: snapshots[0].fecha,
    fechaFin: snapshots[snapshots.length - 1].fecha,
    recorridoKm: Math.round(recorrido),
  };
}

/**
 * GET /api/telemetria/kilometraje-diario/:id?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 * Serie de snapshots diarios + consolidado de recorrido del rango.
 * :id puede ser el ObjectId del vehículo o la placa.
 */
exports.kilometrajeDiario = async (req, res) => {
  try {
    const vehiculo = await resolverVehiculo(req.params.id);
    if (!vehiculo)
      return res
        .status(404)
        .json({ success: false, message: "Vehículo no encontrado" });

    const { desde, hasta } = req.query;
    const query = { vehiculo: vehiculo._id };
    if (desde || hasta) {
      query.fecha = {};
      if (desde) query.fecha.$gte = String(desde).slice(0, 10);
      if (hasta) query.fecha.$lte = String(hasta).slice(0, 10);
    }

    const snapshots = await KilometrajeDiario.find(query)
      .sort({ fecha: 1 })
      .select("fecha kilometraje fuente capturadoEn")
      .lean();

    res.json({
      success: true,
      data: {
        vehiculo: { _id: vehiculo._id, placa: vehiculo.placa },
        resumen: consolidarRecorrido(snapshots),
        snapshots,
      },
    });
  } catch (error) {
    logger.error(`Error consultando kilometraje diario: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/telemetria/recorrido-flota?desde=&hasta=
 * Consolidado de recorrido por vehículo para toda la flota (para vistas admin).
 */
exports.recorridoFlota = async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const match = {};
    if (desde || hasta) {
      match.fecha = {};
      if (desde) match.fecha.$gte = String(desde).slice(0, 10);
      if (hasta) match.fecha.$lte = String(hasta).slice(0, 10);
    }

    const snapshots = await KilometrajeDiario.find(match)
      .sort({ vehiculo: 1, fecha: 1 })
      .select("vehiculo placa fecha kilometraje")
      .lean();

    const porVehiculo = new Map();
    for (const s of snapshots) {
      const key = String(s.vehiculo);
      if (!porVehiculo.has(key)) porVehiculo.set(key, { placa: s.placa, lista: [] });
      porVehiculo.get(key).lista.push(s);
    }

    const data = [...porVehiculo.entries()].map(([vehiculoId, v]) => ({
      vehiculo: vehiculoId,
      placa: v.placa,
      ...consolidarRecorrido(v.lista),
    }));
    data.sort((a, b) => b.recorridoKm - a.recorridoKm);

    res.json({ success: true, data });
  } catch (error) {
    logger.error(`Error consultando recorrido de flota: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/telemetria/kilometraje-diario/capturar
 * Dispara manualmente la captura del snapshot del día (solo ADMIN).
 */
exports.capturarKilometrajeDiario = async (req, res) => {
  try {
    const { capturarSnapshotDiario } = require("../workers/kilometrajeDiario");
    const resultado = await capturarSnapshotDiario();
    res.json({ success: true, data: resultado });
  } catch (error) {
    logger.error(`Error capturando kilometraje diario: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};
