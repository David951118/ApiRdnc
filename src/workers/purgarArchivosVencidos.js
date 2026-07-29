const cron = require("node-cron");
const Documento = require("../models/Documento");
const s3Service = require("../services/s3Service");
const logger = require("../config/logger");

/**
 * Worker: Purga de S3 los archivos de documentos con más de 1 año de vencidos.
 * Ejecuta todos los días a las 02:30 AM.
 *
 * - Elimina de S3 archivo, archivoReverso y archivoExtra.
 * - CONSERVA el registro en MongoDB (id, número, tipo, fechas, nombreOriginal)
 *   como referencia histórica; solo quita las keys y marca archivosPurgados.
 * - Incluye documentos en papelera (deletedAt != null): también pagan S3.
 * - No toca documentos sin fechaVencimiento (CEDULA, RUT, etc. sin vigencia).
 * - Si un borrado de S3 falla, conserva esa key y la reintenta en la
 *   siguiente corrida; solo marca el documento como purgado cuando todas
 *   sus keys fueron eliminadas.
 */

const DIAS_VENCIDO_PARA_PURGA = 365;
const MAX_DOCS_POR_CORRIDA = 500; // Límite de seguridad por corrida

async function purgarArchivosVencidos() {
  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() - DIAS_VENCIDO_PARA_PURGA);

  try {
    const candidatos = await Documento.find({
      fechaVencimiento: { $ne: null, $lt: fechaLimite },
      archivosPurgados: { $ne: true },
      $or: [
        { "archivo.key": { $exists: true, $ne: null } },
        { "archivoReverso.key": { $exists: true, $ne: null } },
        { "archivoExtra.key": { $exists: true, $ne: null } },
      ],
    })
      .select("archivo archivoReverso archivoExtra fechaVencimiento")
      .limit(MAX_DOCS_POR_CORRIDA)
      .lean();

    if (candidatos.length === 0) return;

    logger.info(
      `[PurgaS3] ${candidatos.length} documento(s) con +${DIAS_VENCIDO_PARA_PURGA} días de vencidos para purgar`,
    );

    let docsPurgados = 0;
    let archivosEliminados = 0;
    let fallos = 0;

    for (const doc of candidatos) {
      // Pares campo → key a eliminar
      const campos = [
        ["archivo", doc.archivo?.key],
        ["archivoReverso", doc.archivoReverso?.key],
        ["archivoExtra", doc.archivoExtra?.key],
      ].filter(([, key]) => key);

      const resultados = await Promise.allSettled(
        campos.map(([, key]) => s3Service.deleteObject(key)),
      );

      const unset = {};
      let todasEliminadas = true;

      resultados.forEach((r, i) => {
        const [campo, key] = campos[i];
        if (r.status === "fulfilled") {
          unset[`${campo}.key`] = "";
          archivosEliminados++;
        } else {
          todasEliminadas = false;
          fallos++;
          logger.warn(
            `[PurgaS3] No se pudo eliminar ${key} del documento ${doc._id}: ${r.reason?.message || r.reason}`,
          );
        }
      });

      const update = {};
      if (Object.keys(unset).length > 0) update.$unset = unset;
      if (todasEliminadas) {
        update.$set = { archivosPurgados: true, fechaPurgaS3: new Date() };
        docsPurgados++;
      }

      if (Object.keys(update).length > 0) {
        await Documento.updateOne({ _id: doc._id }, update);
      }
    }

    logger.info(
      `[PurgaS3] Corrida completada: ${docsPurgados}/${candidatos.length} documentos purgados, ` +
        `${archivosEliminados} archivos S3 eliminados, ${fallos} fallos (se reintentan mañana)`,
    );
  } catch (error) {
    logger.error(`[PurgaS3] Error en purga de archivos vencidos: ${error.message}`);
  }
}

// Ejecutar todos los días a las 02:30 AM (hora del servidor)
cron.schedule("30 2 * * *", purgarArchivosVencidos);

logger.info(
  `[PurgaS3] Worker de purga de archivos S3 iniciado (documentos con +${DIAS_VENCIDO_PARA_PURGA} días de vencidos, diario 02:30 AM)`,
);

module.exports = { purgarArchivosVencidos };
