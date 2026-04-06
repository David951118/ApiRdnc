const cron = require("node-cron");
const Preoperacional = require("../models/Preoperacional");
const logger = require("../config/logger");

/**
 * Worker: Auto-rechaza preoperacionales con novedades no resueltas
 * cuya fecha límite ya venció (15 días desde creación).
 * Ejecuta todos los días a las 00:15 AM.
 */
async function vencerNovedadesPreop() {
  try {
    const ahora = new Date();

    const resultado = await Preoperacional.updateMany(
      {
        estadoGeneral: "NOVEDAD",
        fechaLimiteNovedades: { $lt: ahora },
        deletedAt: null,
      },
      { $set: { estadoGeneral: "RECHAZADO" } },
    );

    if (resultado.modifiedCount > 0) {
      logger.info(
        `[CronNovedades] ${resultado.modifiedCount} preoperacional(es) pasaron a RECHAZADO por novedades vencidas`,
      );
    }
  } catch (error) {
    logger.error(
      `[CronNovedades] Error venciendo novedades: ${error.message}`,
    );
  }
}

// Ejecutar todos los días a las 00:15 AM
cron.schedule("15 0 * * *", vencerNovedadesPreop);

// Ejecutar una vez al iniciar
vencerNovedadesPreop();

logger.info("[CronNovedades] Worker de vencimiento de novedades iniciado");

module.exports = { vencerNovedadesPreop };
