const cron = require("node-cron");
const Documento = require("../models/Documento");
const logger = require("../config/logger");

/**
 * Worker: Actualiza el estado de los documentos según su fechaVencimiento.
 * Ejecuta todos los días a las 00:05 AM.
 *
 * Transiciones:
 *   VIGENTE / POR_VENCER → VENCIDO    (fechaVencimiento < hoy)
 *   VIGENTE              → POR_VENCER  (fechaVencimiento <= hoy + 30 días)
 *   POR_VENCER / VENCIDO → VIGENTE     (fechaVencimiento > hoy + 30 días, corrección manual)
 *
 * No toca documentos con estado HISTORICO o RECHAZADO.
 */
async function actualizarEstadoDocumentos() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const en30Dias = new Date(hoy);
  en30Dias.setDate(en30Dias.getDate() + 30);

  try {
    // 1. Marcar VENCIDOS: fechaVencimiento < hoy
    const vencidos = await Documento.updateMany(
      {
        fechaVencimiento: { $lt: hoy },
        estado: { $in: ["VIGENTE", "POR_VENCER"] },
        deletedAt: null,
      },
      { $set: { estado: "VENCIDO" } },
    );

    // 2. Marcar POR_VENCER: fechaVencimiento >= hoy y <= hoy+30
    const porVencer = await Documento.updateMany(
      {
        fechaVencimiento: { $gte: hoy, $lte: en30Dias },
        estado: { $in: ["VIGENTE"] },
        deletedAt: null,
      },
      { $set: { estado: "POR_VENCER" } },
    );

    // 3. Corregir: si alguien actualizó la fecha y ahora es vigente de nuevo
    const vigentes = await Documento.updateMany(
      {
        fechaVencimiento: { $gt: en30Dias },
        estado: { $in: ["VENCIDO", "POR_VENCER"] },
        deletedAt: null,
      },
      { $set: { estado: "VIGENTE" } },
    );

    const total =
      (vencidos.modifiedCount || 0) +
      (porVencer.modifiedCount || 0) +
      (vigentes.modifiedCount || 0);

    if (total > 0) {
      logger.info(
        `[CronDocumentos] Actualizados ${total} documentos: ` +
          `${vencidos.modifiedCount} → VENCIDO, ` +
          `${porVencer.modifiedCount} → POR_VENCER, ` +
          `${vigentes.modifiedCount} → VIGENTE`,
      );
    }
  } catch (error) {
    logger.error(
      `[CronDocumentos] Error actualizando estados: ${error.message}`,
    );
  }
}

// Ejecutar todos los días a las 00:05 AM
cron.schedule("5 0 * * *", actualizarEstadoDocumentos);

// Ejecutar una vez al iniciar el servidor para sincronizar estados pendientes
actualizarEstadoDocumentos();

logger.info("[CronDocumentos] Worker de actualización de estados iniciado");

module.exports = { actualizarEstadoDocumentos };
