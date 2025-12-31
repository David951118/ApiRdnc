const cron = require("node-cron");
const mongoose = require("mongoose");
const Manifiesto = require("../models/Manifiesto");
const RegistroRMM = require("../models/RegistroRMM");
const cellviClient = require("../services/cellviClient");
const logger = require("../config/logger");
const config = require("../config/env");

/**
 * Worker: Vehicle Monitoring and Event Detection.
 * Schedule: Every 1 minute.
 * Optimization: Filters manifests to only monitor those within a relevant time window relative to their appointment.
 */

let isRunning = false;

async function monitorVehiculos() {
  if (isRunning) {
    return;
  }

  isRunning = true;

  try {
    // Retrieve active and monitorable manifests
    const manifiestos = await Manifiesto.find({
      estado: "activo",
      esMonitoreable: true,
    });

    if (manifiestos.length === 0) {
      return;
    }

    // Filter manifests with control points near the appointment time
    const manifestosParaMonitorear = manifiestos.filter((m) =>
      tieneAlgunPuntoCercaDeHoraCita(m)
    );

    if (manifestosParaMonitorear.length === 0) {
      return;
    }

    // Process each relevant manifest
    for (const manifiesto of manifestosParaMonitorear) {
      await monitorearManifiesto(manifiesto);
    }
  } catch (error) {
    logger.error(`Error in vehicle monitoring: ${error.message}`);
  } finally {
    isRunning = false;
  }
}

/**
 * Checks if any control point is within the monitoring window.
 * Window: 2 hours before appointment up to 24 hours after.
 * @param {Object} manifiesto
 * @returns {boolean}
 */
function tieneAlgunPuntoCercaDeHoraCita(manifiesto) {
  const ahora = new Date();

  for (const punto of manifiesto.puntosControl) {
    if (punto.estado === "completado") {
      continue;
    }

    // If no specific appointment date, monitor indefinitely
    if (!punto.fechaCita) {
      return true;
    }

    // Construct UTC date to match backend storage and avoid timezone offsets
    const [hora, minuto] = punto.horaCita.split(":");
    const baseDate = new Date(punto.fechaCita);

    const fechaHoraCita = new Date(
      baseDate.getUTCFullYear(),
      baseDate.getUTCMonth(),
      baseDate.getUTCDate(),
      parseInt(hora),
      parseInt(minuto),
      0
    );

    const ventanaInicio = new Date(
      fechaHoraCita.getTime() - 2 * 60 * 60 * 1000
    );
    const ventanaFin = new Date(fechaHoraCita.getTime() + 24 * 60 * 60 * 1000);

    if (ahora >= ventanaInicio && ahora <= ventanaFin) {
      return true;
    }

    // Continue monitoring if vehicle is currently at the point
    if (punto.estado === "en_punto") {
      return true;
    }
  }

  return false;
}

/**
 * Monitors a single manifest: retrieves vehicle position, checks geofences, and triggers events.
 * @param {Object} manifiesto
 */
async function monitorearManifiesto(manifiesto) {
  try {
    const posicion = await cellviClient.getPosicionByPlaca(manifiesto.placa);

    if (!posicion) {
      return;
    }

    // Check each control point
    for (const punto of manifiesto.puntosControl) {
      if (punto.estado === "completado") {
        continue;
      }

      const enGeocerca = estaEnGeocerca(posicion, punto);

      // Event: Arrival (LLEGADA)
      if (enGeocerca && punto.estado === "pendiente") {
        await procesarLlegada(manifiesto, punto, posicion);
      }

      // Event: Departure (SALIDA)
      if (!enGeocerca && punto.estado === "en_punto") {
        await procesarSalida(manifiesto, punto, posicion);
      }

      // Event: Timeout / No Departure (SIN SALIDA - 72h limit)
      if (punto.estado === "en_punto" && punto.fechaHoraLlegada) {
        const horasEnPunto =
          (new Date() - punto.fechaHoraLlegada) / (1000 * 60 * 60);

        if (horasEnPunto >= 72) {
          await procesarSinSalida(manifiesto, punto);
        }
      }
    }

    // Check if manifest is fully completed
    const todosCompletados = manifiesto.puntosControl.every(
      (p) => p.estado === "completado"
    );

    if (todosCompletados) {
      manifiesto.estado = "completado";
      await manifiesto.save();
      logger.info(`Manifest completed: ${manifiesto.numManifiesto}`);
    }
  } catch (error) {
    logger.error(
      `Error monitoring manifest ${manifiesto.numManifiesto}: ${error.message}`
    );
  }
}

async function procesarLlegada(manifiesto, punto, posicion) {
  logger.info(
    `Arrival detected: ${manifiesto.placa} at Point ${punto.codigoPunto}`
  );

  punto.estado = "en_punto";
  punto.fechaHoraLlegada = new Date();
  punto.latitudLlegada = posicion.lat;
  punto.longitudLlegada = posicion.lng;

  const fechaLimite = new Date();
  fechaLimite.setHours(fechaLimite.getHours() + 72);

  const rmm = await RegistroRMM.create({
    manifiestoId: manifiesto._id,
    puntoControlId: punto._id,
    ingresoidManifiesto: manifiesto.ingresoidManifiesto,
    numPlaca: manifiesto.placa,
    codigoPuntoControl: punto.codigoPunto,
    latitudLlegada: posicion.lat,
    longitudLlegada: posicion.lng,
    fechaLlegada: formatFecha(new Date()),
    horaLlegada: formatHora(new Date()),
    estado: "pendiente",
    fechaLimiteReporte: fechaLimite,
    intentos: 0,
  });

  punto.rmmId = rmm._id;
  await manifiesto.save();
}

async function procesarSalida(manifiesto, punto, posicion) {
  logger.info(
    `Departure detected: ${manifiesto.placa} from Point ${punto.codigoPunto}`
  );

  // Update RMM with departure data and reset status to 'pendiente' to trigger re-send
  await RegistroRMM.findByIdAndUpdate(punto.rmmId, {
    latitudSalida: posicion.lat,
    longitudSalida: posicion.lng,
    fechaSalida: formatFecha(new Date()),
    horaSalida: formatHora(new Date()),
    estado: "pendiente",
    intentos: 0,
    errorMensaje: null,
  });

  punto.estado = "completado";
  punto.fechaHoraSalida = new Date();
  punto.latitudSalida = posicion.lat;
  punto.longitudSalida = posicion.lng;

  await manifiesto.save();
}

async function procesarSinSalida(manifiesto, punto) {
  logger.warn(
    `No departure detected (72h limit): ${manifiesto.placa} at Point ${punto.codigoPunto}`
  );

  await RegistroRMM.findByIdAndUpdate(punto.rmmId, {
    sinSalida: true,
  });
}

function estaEnGeocerca(posicion, punto) {
  const distancia = calcularDistancia(posicion, punto);
  return distancia <= punto.radio;
}

function calcularDistancia(posicion, punto) {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (posicion.lat * Math.PI) / 180;
  const φ2 = (punto.latitud * Math.PI) / 180;
  const Δφ = ((punto.latitud - posicion.lat) * Math.PI) / 180;
  const Δλ = ((punto.longitud - posicion.lng) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

function formatFecha(date) {
  const dia = String(date.getDate()).padStart(2, "0");
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const anio = date.getFullYear();
  return `${dia}/${mes}/${anio}`;
}

function formatHora(date) {
  const hora = String(date.getHours()).padStart(2, "0");
  const minuto = String(date.getMinutes()).padStart(2, "0");
  return `${hora}:${minuto}`;
}

// Scheduled interval: Every 1 minute
cron.schedule("* * * * *", () => {
  monitorVehiculos();
});

logger.info("Worker started: Vehicle Monitoring");

if (mongoose.connection.readyState === 1) {
  monitorVehiculos();
} else {
  mongoose.connection.once("open", () => {
    monitorVehiculos();
  });
}

module.exports = monitorVehiculos;
