const cron = require("node-cron");
const mongoose = require("mongoose");
const RegistroRMM = require("../models/RegistroRMM");
const Manifiesto = require("../models/Manifiesto");
const RNDCClient = require("../services/rndcClient");
const logger = require("../config/logger");

/**
 * Worker: RNDC Reporting (RMM).
 * Schedule: Every 30 seconds.
 * Function: Processes pending RMM records and sends them to the RNDC SOAP API.
 */

let isRunning = false;

async function reportRMM() {
  if (isRunning) {
    return;
  }

  isRunning = true;

  try {
    const ahora = new Date();

    // Fetch pending RMM records within the 72h window
    const rmmsPendientes = await RegistroRMM.find({
      estado: { $in: ["pendiente", "error"] },
      fechaLimiteReporte: { $gt: ahora },
      intentos: { $lt: 3 },
    }).limit(10);

    if (rmmsPendientes.length === 0) {
      return;
    }

    logger.info(`Reporting ${rmmsPendientes.length} pending RMM records`);

    const username = process.env.RNDC_USERNAME;
    const password = process.env.RNDC_PASSWORD;
    const nitGPS = process.env.RNDC_NIT_GPS;

    const client = new RNDCClient(username, password);

    for (const rmm of rmmsPendientes) {
      await reportarRMM(rmm, client, nitGPS);
    }

    // Mark overdue records
    const resultado = await RegistroRMM.updateMany(
      {
        estado: { $in: ["pendiente", "error"] },
        fechaLimiteReporte: { $lte: ahora },
      },
      {
        $set: { estado: "vencido" },
      }
    );

    if (resultado.modifiedCount > 0) {
      logger.warn(`${resultado.modifiedCount} RMM records marked as overdue`);
    }
  } catch (error) {
    logger.error(`Error in RMM reporting: ${error.message}`);
  } finally {
    isRunning = false;
  }
}

async function reportarRMM(rmm, client, nitGPS) {
  try {
    // Update status to prevent concurrent processing
    rmm.estado = "enviando";
    rmm.intentos++;
    rmm.ultimoIntento = new Date();
    await rmm.save();

    // Prepare data payload
    const datos = {
      numidgps: nitGPS,
      ingresoidmanifiesto: rmm.ingresoidManifiesto,
      numplaca: rmm.numPlaca,
      codpuntocontrol: rmm.codigoPuntoControl,
      // Default to arrival coordinates
      latitud: rmm.latitudLlegada,
      longitud: rmm.longitudLlegada,
      fechallegada: rmm.fechaLlegada,
      horallegada: rmm.horaLlegada,
    };

    // Add departure details if available
    if (rmm.sinSalida) {
      datos.sinsalida = "S";
    } else if (rmm.fechaSalida && rmm.horaSalida) {
      datos.fechasalida = rmm.fechaSalida;
      datos.horasalida = rmm.horaSalida;

      // If departure, use departure coordinates if available, otherwise fallback to arrival
      if (rmm.latitudSalida && rmm.longitudSalida) {
        datos.latitud = rmm.latitudSalida;
        datos.longitud = rmm.longitudSalida;
      }
    }

    // Send to RNDC
    logger.info(
      `Sending RMM: ${rmm.ingresoidManifiesto} - Point ${rmm.codigoPuntoControl}`
    );

    const response = await client.registrarRMM(datos);

    if (response.success) {
      // Success
      rmm.estado = "reportado";
      rmm.radicadoRNDC = response.radicado;
      await rmm.save();

      // Update related manifest
      await Manifiesto.updateOne(
        {
          _id: rmm.manifiestoId,
          "puntosControl._id": rmm.puntoControlId,
        },
        {
          $set: { "puntosControl.$.radicadoRNDC": response.radicado },
        }
      );

      logger.info(`RMM reported successfully - Ref: ${response.radicado}`);
    } else {
      // API Error
      rmm.estado = "error";
      rmm.errorMensaje = response.error;
      await rmm.save();

      logger.error(`RNDC API Error: ${response.error}`);
    }
  } catch (error) {
    rmm.estado = "error";
    rmm.errorMensaje = error.message;
    await rmm.save();

    logger.error(`Exception reporting RMM: ${error.message}`);
  }
}

// Interval: Every 30 seconds
cron.schedule("*/30 * * * * *", () => {
  reportRMM();
});

logger.info("Worker started: RMM Reporting");

if (mongoose.connection.readyState === 1) {
  reportRMM();
} else {
  mongoose.connection.once("open", () => {
    reportRMM();
  });
}

module.exports = reportRMM;
