const Documento = require("../models/Documento");
const s3Service = require("../services/s3Service");
const logger = require("../config/logger");

/**
 * Elimina documentos que coinciden con el filtro y limpia sus archivos de S3.
 * @param {Object} filter - Filtro de Mongoose para buscar documentos
 * @returns {{ deletedCount: number, s3Deleted: number }}
 */
async function deleteDocumentosWithS3(filter) {
  const documentos = await Documento.find(filter).select("archivo archivoReverso archivoExtra").lean();

  if (documentos.length === 0) return { deletedCount: 0, s3Deleted: 0 };

  // Recopilar keys de S3
  const s3Keys = [];
  for (const doc of documentos) {
    if (doc.archivo?.key) s3Keys.push(doc.archivo.key);
    if (doc.archivoReverso?.key) s3Keys.push(doc.archivoReverso.key);
    if (doc.archivoExtra?.key) s3Keys.push(doc.archivoExtra.key);
  }

  // Eliminar archivos de S3 (en paralelo, sin bloquear si falla uno)
  if (s3Keys.length > 0) {
    const results = await Promise.allSettled(
      s3Keys.map((key) => s3Service.deleteObject(key)),
    );
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      logger.warn(`S3: ${failed.length}/${s3Keys.length} archivos no se pudieron eliminar`);
    }
  }

  // Eliminar documentos de MongoDB
  const { deletedCount } = await Documento.deleteMany(filter);

  logger.info(`Cascade: ${deletedCount} documentos eliminados, ${s3Keys.length} archivos S3 procesados`);
  return { deletedCount, s3Deleted: s3Keys.length };
}

/**
 * Limpia referencias de entidadesAsociadas en documentos que apuntan a IDs eliminados.
 * Remueve del array entidadesAsociadas sin borrar el documento.
 * @param {Array<ObjectId>} entityIds - IDs de entidades eliminadas
 * @param {string} entidadModelo - "Vehiculo", "Tercero" o "Empresa"
 */
async function cleanEntidadesAsociadas(entityIds, entidadModelo) {
  if (!entityIds.length) return;

  const result = await Documento.updateMany(
    { "entidadesAsociadas.entidadId": { $in: entityIds } },
    {
      $pull: {
        entidadesAsociadas: {
          entidadId: { $in: entityIds },
          entidadModelo,
        },
      },
    },
  );

  if (result.modifiedCount > 0) {
    logger.info(`Cascade: limpiadas entidadesAsociadas en ${result.modifiedCount} documentos`);
  }
}

module.exports = { deleteDocumentosWithS3, cleanEntidadesAsociadas };
