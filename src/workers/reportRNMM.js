const cron = require("node-cron");
const mongoose = require("mongoose");
const RegistroRNMM = require("../models/RegistroRNMM");
const rnmmService = require("../services/rnmmService");
const logger = require("../config/logger");

/**
 * Worker: RNMM Reporting
 * Schedule: Every 15 minutes
 * Function: Reports pending RNMM records to RNDC
 *
 * RNMM must be sent between 24h and 36h after the appointment time
 */

let isRunning = false;

async function reportRNMM() {
  if (isRunning) {
    return;
  }

  isRunning = true;

  try {
    const ahora = new Date();

    // Buscar RNMM pendientes que estén en ventana de envío (24-36h después de cita)
    const rnmmsPendientes = await RegistroRNMM.find({
      estado: { $in: ["pendiente", "error"] },
      intentos: { $lt: 3 },
      fechaLimiteReporte: { $gt: ahora }, // No vencidos
    }).limit(20);

    if (rnmmsPendientes.length === 0) {
      return;
    }

    logger.info(`Reporting ${rnmmsPendientes.length} pending RNMM records`);

    let exitosos = 0;
    let errores = 0;
    let fueraDeVentana = 0;

    for (const rnmm of rnmmsPendientes) {
      // Verificar si está en ventana de envío
      if (!rnmm.estaEnVentanaEnvio()) {
        const limite24h = new Date(
          rnmm.fechaCita.getTime() + 24 * 60 * 60 * 1000,
        );

        if (ahora < limite24h) {
          // Aún no es tiempo de enviar (debe esperar 24h)
          fueraDeVentana++;
          continue;
        }
      }

      // Reportar al RNDC
      try {
        const resultado = await rnmmService.reportarNovedad(rnmm._id);

        if (resultado.success) {
          exitosos++;
        } else {
          errores++;
        }
      } catch (error) {
        logger.error(`Error reporting RNMM ${rnmm._id}: ${error.message}`);
        errores++;
      }
    }

    // Marcar RNMM vencidos (después de 36h)
    const resultado = await RegistroRNMM.updateMany(
      {
        estado: { $in: ["pendiente", "error"] },
        fechaLimiteReporte: { $lte: ahora },
      },
      {
        $set: { estado: "vencido" },
      },
    );

    if (resultado.modifiedCount > 0) {
      logger.warn(`${resultado.modifiedCount} RNMM records marked as overdue`);
    }

    logger.info(
      `RNMM Reporting completed: ${exitosos} success, ${errores} errors, ${fueraDeVentana} out of window`,
    );
  } catch (error) {
    logger.error(`Error in RNMM reporting: ${error.message}`);
  } finally {
    isRunning = false;
  }
}

// Ejecutar cada 15 minutos
cron.schedule("*/15 * * * *", () => {
  logger.info("Cron Trigger: RNMM Reporting");
  reportRNMM();
});

logger.info("Worker started: RNMM Reporting");

// Ejecutar inmediatamente si la conexión está lista
if (mongoose.connection.readyState === 1) {
  reportRNMM();
} else {
  mongoose.connection.once("open", () => {
    reportRNMM();
  });
}

module.exports = reportRNMM;
