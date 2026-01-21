const cron = require("node-cron");
const mongoose = require("mongoose");
const Manifiesto = require("../models/Manifiesto");
const RegistroRMM = require("../models/RegistroRMM");
const RegistroRNMM = require("../models/RegistroRNMM");
const rnmmService = require("../services/rnmmService");
const logger = require("../config/logger");

/**
 * Worker: RNMM Detection and Reporting
 * Schedule: Every 1 hour
 * Function: Detects cases where RNMM should be sent instead of RMM
 *
 * Códigos de novedad:
 * 1: Vehículo no apareció en ventana de tolerancia (24h después de cita)
 * 2: Placa no registrada en EMF
 * 3: Vehículo suspendido/desactivado
 * 4: Unidad remota fallando
 * 5: Sin relación con empresa de transporte
 */

let isRunning = false;

async function detectRNMM() {
  if (isRunning) {
    return;
  }

  isRunning = true;

  try {
    const ahora = new Date();
    const hace24h = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
    const hace36h = new Date(ahora.getTime() - 36 * 60 * 60 * 1000);

    logger.info("Detectando casos para RNMM...");

    // Caso 1: Vehículos que no aparecieron en ventana de tolerancia
    // Buscar manifiestos con puntos de control donde:
    // - La cita fue hace más de 24h
    // - No hay RMM registrado
    // - La cita fue hace menos de 36h (ventana de envío RNMM)

    const manifiestosSinRMM = await Manifiesto.aggregate([
      {
        $match: {
          esMonitoreable: true,
          estado: "activo",
        },
      },
      { $unwind: "$puntosControl" },
      {
        $match: {
          "puntosControl.fechaCita": {
            $gte: hace36h,
            $lte: hace24h,
          },
          "puntosControl.estado": "pendiente",
        },
      },
      {
        $project: {
          _id: 1,
          ingresoidManifiesto: 1,
          placa: 1,
          puntoControl: "$puntosControl",
        },
      },
    ]);

    logger.debug(
      `Encontrados ${manifiestosSinRMM.length} puntos de control candidatos para RNMM`,
    );

    let novedadesCreadas = 0;

    for (const item of manifiestosSinRMM) {
      // Verificar si ya existe RMM para este punto
      const existeRMM = await RegistroRMM.findOne({
        manifiestoId: item._id,
        puntoControlId: item.puntoControl._id,
      });

      if (existeRMM) {
        continue; // Ya hay RMM, no crear RNMM
      }

      // Verificar si ya existe RNMM
      const existeRNMM = await RegistroRNMM.findOne({
        manifiestoId: item._id,
        puntoControlId: item.puntoControl._id,
      });

      if (existeRNMM) {
        continue; // Ya hay RNMM
      }

      // Crear RNMM con código 1: Vehículo no apareció
      try {
        await rnmmService.crearNovedad({
          manifiestoId: item._id,
          puntoControlId: item.puntoControl._id,
          ingresoidManifiesto: item.ingresoidManifiesto,
          numPlaca: item.placa,
          codigoPuntoControl: item.puntoControl.codigoPunto,
          codigoNovedad: 1,
          fechaCita: item.puntoControl.fechaCita,
          motivoDetallado: `Vehículo ${item.placa} no apareció en ventana de tolerancia para punto de control ${item.puntoControl.codigoPunto}`,
        });

        novedadesCreadas++;
      } catch (error) {
        logger.error(
          `Error creando RNMM para ${item.ingresoidManifiesto}: ${error.message}`,
        );
      }
    }

    if (novedadesCreadas > 0) {
      logger.info(`${novedadesCreadas} novedades RNMM (código 1) creadas`);
    }

    // Caso 2: Placa no registrada en EMF (código 2)
    // Buscar manifiestos con vehiculoAsignado = false y esMonitoreable = false
    // donde motivoNoMonitoreable incluya "no existe" o "not registered"

    const manifiestosSinVehiculo = await Manifiesto.find({
      vehiculoAsignado: false,
      esMonitoreable: false,
      $or: [
        { motivoNoMonitoreable: /no existe/i },
        { motivoNoMonitoreable: /not registered/i },
        { motivoNoMonitoreable: /does not exist/i },
      ],
      estado: "activo",
    }).limit(50);

    let novedadesVehiculoNoRegistrado = 0;

    for (const manifiesto of manifiestosSinVehiculo) {
      // Crear RNMM para cada punto de control
      for (const punto of manifiesto.puntosControl) {
        // Verificar si ya existe RNMM
        const existeRNMM = await RegistroRNMM.findOne({
          manifiestoId: manifiesto._id,
          puntoControlId: punto._id,
        });

        if (existeRNMM) {
          continue;
        }

        // Verificar si la cita ya pasó hace más de 24h pero menos de 36h
        const citaFecha = new Date(punto.fechaCita);
        if (citaFecha > hace24h || citaFecha < hace36h) {
          continue;
        }

        try {
          await rnmmService.crearNovedad({
            manifiestoId: manifiesto._id,
            puntoControlId: punto._id,
            ingresoidManifiesto: manifiesto.ingresoidManifiesto,
            numPlaca: manifiesto.placa,
            codigoPuntoControl: punto.codigoPunto,
            codigoNovedad: 2,
            fechaCita: citaFecha,
            motivoDetallado: `Placa ${manifiesto.placa} no registrada en la plataforma Cellvi: ${manifiesto.motivoNoMonitoreable}`,
          });

          novedadesVehiculoNoRegistrado++;
        } catch (error) {
          logger.error(
            `Error creando RNMM código 2 para ${manifiesto.ingresoidManifiesto}: ${error.message}`,
          );
        }
      }
    }

    if (novedadesVehiculoNoRegistrado > 0) {
      logger.info(
        `${novedadesVehiculoNoRegistrado} novedades RNMM (código 2) creadas`,
      );
    }

    logger.info("Detección de RNMM completada");
  } catch (error) {
    logger.error(`Error en detección de RNMM: ${error.message}`);
  } finally {
    isRunning = false;
  }
}

// Ejecutar cada hora
cron.schedule("0 * * * *", () => {
  logger.info("Cron Trigger: RNMM Detection");
  detectRNMM();
});

logger.info("Worker started: RNMM Detection");

// Ejecutar inmediatamente si la conexión está lista
if (mongoose.connection.readyState === 1) {
  detectRNMM();
} else {
  mongoose.connection.once("open", () => {
    detectRNMM();
  });
}

module.exports = detectRNMM;
