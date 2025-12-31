const cellviClient = require("./cellviClient");
const cellviAdminClient = require("./cellviAdminClient");
const logger = require("../config/logger");

/**
 * Servicio para gestión automática de asignaciones de vehículos
 */
class AsignacionService {
  /**
   * Procesar asignaciones automáticas para manifiestos
   * 1. Obtener manifiestos no monitoreables
   * 2. Validar vehículos (existen + monitoreados)
   * 3. Asignar al usuario RNDC
   * 4. Actualizar estado de manifiestos
   */
  async procesarAsignacionesAutomaticas() {
    try {
      logger.info("=".repeat(60));
      logger.info("Procesando asignaciones automáticas de vehículos");
      logger.info("=".repeat(60));

      // Obtener vehículos actualmente asignados al usuario RNDC
      // IMPORTANTE: Usar cellviClient (token RNDC) para consultar
      const vehiculosAsignados = await cellviClient.getVehiculosUsuario();
      const idsAsignados = vehiculosAsignados.map((v) => v.id);

      logger.info(
        `Usuario RNDC tiene ${idsAsignados.length} vehículos asignados`
      );

      // Obtener manifiestos no monitoreables por falta de asignación o pendientes
      const Manifiesto = require("../models/Manifiesto");
      const manifestosNoAsignados = await Manifiesto.find({
        esMonitoreable: false,
        motivoNoMonitoreable: {
          $in: [
            "Vehículo no asignado al usuario RNDC",
            "Pendiente de validación",
          ],
        },
      });

      logger.info(
        `Encontrados ${manifestosNoAsignados.length} manifiestos con vehículos no asignados`
      );

      if (manifestosNoAsignados.length === 0) {
        logger.info("No hay vehículos para asignar");
        return {
          success: true,
          asignados: 0,
          rechazados: 0,
        };
      }

      // Validar y asignar vehículos
      const vehiculosParaAsignar = [];
      const stats = {
        asignados: 0,
        rechazados: 0,
        yaAsignados: 0,
        noExisten: 0,
        noMonitoreados: 0,
      };

      for (const manifiesto of manifestosNoAsignados) {
        const placa = manifiesto.placa;

        // Validar vehículo
        const vehiculoDetalle = await cellviClient.getVehiculoByPlacaDetallado(
          placa
        );

        if (!vehiculoDetalle) {
          logger.warn(`${placa}: No existe en Cellvi`);
          stats.noExisten++;

          // Actualizar motivo
          await Manifiesto.updateOne(
            { _id: manifiesto._id },
            { motivoNoMonitoreable: "Vehículo no existe en Cellvi" }
          );
          continue;
        }

        if (!vehiculoDetalle.monitoreado) {
          logger.warn(`${placa}: No está monitoreado`);
          stats.noMonitoreados++;

          // Actualizar motivo
          await Manifiesto.updateOne(
            { _id: manifiesto._id },
            { motivoNoMonitoreable: "Vehículo no monitoreado en Cellvi" }
          );
          continue;
        }

        // Verificar si ya está asignado
        if (idsAsignados.includes(vehiculoDetalle.id)) {
          logger.info(`${placa}: Ya está asignado al usuario RNDC`);
          stats.yaAsignados++;

          // Actualizar manifiesto como monitoreable
          await Manifiesto.updateOne(
            { _id: manifiesto._id },
            {
              vehiculoAsignado: true,
              esMonitoreable: true,
              motivoNoMonitoreable: null,
            }
          );
          continue;
        }

        // Agregar a lista para asignar
        vehiculosParaAsignar.push({
          id: vehiculoDetalle.id,
          placa: vehiculoDetalle.placa,
          manifiestoId: manifiesto._id,
        });

        logger.info(`${placa} (ID: ${vehiculoDetalle.id}): Listo para asignar`);
      }

      // Asignar vehículos en lote
      if (vehiculosParaAsignar.length > 0) {
        logger.info(
          `Asignando ${vehiculosParaAsignar.length} vehículos al usuario RNDC...`
        );

        const ids = vehiculosParaAsignar.map((v) => v.id);
        const resultado = await cellviAdminClient.asignarVehiculos(ids);

        if (resultado.success) {
          stats.asignados = vehiculosParaAsignar.length;

          // Actualizar manifiestos como monitoreables
          for (const vehiculo of vehiculosParaAsignar) {
            await Manifiesto.updateOne(
              { _id: vehiculo.manifiestoId },
              {
                vehiculoAsignado: true,
                esMonitoreable: true,
                motivoNoMonitoreable: null,
              }
            );

            logger.info(
              `✅ ${vehiculo.placa}: Asignado y manifiesto actualizado`
            );
          }
        } else {
          logger.error(`Error asignando vehículos: ${resultado.error}`);
          stats.rechazados = vehiculosParaAsignar.length;
        }
      }

      logger.info("=".repeat(60));
      logger.info("Resumen de asignaciones:");
      logger.info(`  ✅ Asignados: ${stats.asignados}`);
      logger.info(`  ℹ️  Ya asignados: ${stats.yaAsignados}`);
      logger.info(`  ❌ No existen: ${stats.noExisten}`);
      logger.info(`  ⚠️  No monitoreados: ${stats.noMonitoreados}`);
      logger.info(`  ❌ Rechazados: ${stats.rechazados}`);
      logger.info("=".repeat(60));

      return {
        success: true,
        ...stats,
      };
    } catch (error) {
      logger.error(`Error en procesamiento de asignaciones: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Desasignar vehículo al completar manifiesto
   */
  async desasignarVehiculoCompletado(manifiestoId) {
    try {
      const Manifiesto = require("../models/Manifiesto");
      const manifiesto = await Manifiesto.findById(manifiestoId);

      if (!manifiesto) {
        return { success: false, error: "Manifiesto no encontrado" };
      }

      // Obtener detalle del vehículo
      const vehiculoDetalle = await cellviClient.getVehiculoByPlacaDetallado(
        manifiesto.placa
      );

      if (!vehiculoDetalle) {
        logger.warn(
          `No se puede desasignar ${manifiesto.placa}: no existe en Cellvi`
        );
        return { success: false, error: "Vehículo no existe" };
      }

      // Desasignar
      const resultado = await cellviAdminClient.desasignarVehiculo(
        vehiculoDetalle.id
      );

      if (resultado.success) {
        logger.info(
          `✅ Vehículo ${manifiesto.placa} desasignado tras completar manifiesto`
        );
      }

      return resultado;
    } catch (error) {
      logger.error(`Error desasignando vehículo: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new AsignacionService();
