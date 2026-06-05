const cron = require("node-cron");
const mongoose = require("mongoose");
const Manifiesto = require("../models/Manifiesto");
const cellviAdminClient = require("../services/cellviAdminClient");
const logger = require("../config/logger");

/**
 * Worker: cierre de manifiestos vencidos y desasignación de vehículos.
 *
 * Regla del negocio:
 *   El RNDC da 24 h desde la cita para reportar la llegada del vehículo a un
 *   punto de control. Pasado ese plazo, el manifiesto ya no admite
 *   seguimiento útil. Mantener el vehículo asignado al usuario RNDC en Cellvi
 *   consume cupo y genera ruido (posiciones sin razón de monitoreo).
 *
 * Para cada manifiesto activo:
 *   1. Si TODOS sus puntos están en estado terminal (completado, o cita +24h
 *      vencida sin llegada) → marcar el manifiesto como "vencido".
 *   2. Para cada placa vencida, si NO tiene otros manifiestos en "activo",
 *      desasignar el vehículo del usuario RNDC en Cellvi.
 *
 * Corre cada 30 min para que la liberación sea oportuna pero no abuse del API
 * de Cellvi.
 */

let isRunning = false;
const VENTANA_GRACIA_HORAS = 24;

function calcularFechaHoraCita(punto) {
  if (!punto.fechaCita || !punto.horaCita) return null;
  const base = new Date(punto.fechaCita);
  const [hora, minuto] = punto.horaCita.split(":");
  // Construir con componentes UTC del fechaCita + hora/minuto literales.
  // Mantener consistencia con el resto del sistema (monitorVehiculos también).
  return new Date(
    base.getUTCFullYear(),
    base.getUTCMonth(),
    base.getUTCDate(),
    parseInt(hora, 10) || 0,
    parseInt(minuto, 10) || 0,
    0,
  );
}

function manifiestoEstaVencido(manifiesto, ahora) {
  if (!manifiesto.puntosControl || manifiesto.puntosControl.length === 0) {
    return false;
  }
  return manifiesto.puntosControl.every((p) => {
    if (p.estado === "completado") return true;
    const fechaHoraCita = calcularFechaHoraCita(p);
    if (!fechaHoraCita) return false; // sin fecha conocida → no se vence solo
    const limite =
      fechaHoraCita.getTime() + VENTANA_GRACIA_HORAS * 60 * 60 * 1000;
    return ahora.getTime() > limite;
  });
}

async function cerrarManifiestosVencidos() {
  if (isRunning) {
    logger.debug("cerrarManifiestosVencidos: ya en ejecución, saltando");
    return;
  }
  isRunning = true;

  try {
    const ahora = new Date();
    const activos = await Manifiesto.find({ estado: "activo" });

    if (activos.length === 0) {
      return;
    }

    const cerrados = [];
    for (const m of activos) {
      if (manifiestoEstaVencido(m, ahora)) {
        m.estado = "vencido";
        m.fechaCierreVencido = ahora;
        await m.save();
        cerrados.push(m);
      }
    }

    if (cerrados.length === 0) {
      return;
    }

    logger.info(
      `cerrarManifiestosVencidos: ${cerrados.length} manifiesto(s) marcados como vencidos`,
    );

    // Recolectar placas únicas a evaluar
    const placasAEvaluar = [...new Set(cerrados.map((m) => m.placa))];

    // Para cada placa, decidir si liberar el vehículo del usuario RNDC.
    for (const placa of placasAEvaluar) {
      try {
        const otrosActivos = await Manifiesto.countDocuments({
          placa,
          estado: "activo",
        });
        if (otrosActivos > 0) {
          logger.debug(
            `Placa ${placa}: tiene ${otrosActivos} manifiesto(s) activo(s), no se desasigna`,
          );
          continue;
        }

        // Optimización: si ningún manifiesto vencido para esta placa tuvo el
        // vehículo asignado al usuario RNDC, no hay nada que desasignar.
        // Marcamos los manifiestos como "desasignados" (a efectos de
        // contabilidad: la placa nunca llegó al inventario) y seguimos.
        const tuvoAsignacion = cerrados.some(
          (m) => m.placa === placa && m.vehiculoAsignado === true,
        );
        if (!tuvoAsignacion) {
          logger.debug(
            `Placa ${placa}: nunca estuvo asignada al usuario RNDC, no se busca en Cellvi`,
          );
          await Manifiesto.updateMany(
            {
              placa,
              estado: "vencido",
              vehiculoDesasignado: { $ne: true },
            },
            { $set: { vehiculoDesasignado: true } },
          );
          continue;
        }

        // Estaba asignada → buscar en Cellvi y desasignar.
        const vehiculoCellvi =
          await cellviAdminClient.buscarVehiculoGlobal(placa);
        if (!vehiculoCellvi || !vehiculoCellvi.id) {
          // Caso raro: estaba marcada como asignada en la BD pero Cellvi ya no
          // la reconoce. Logueamos como info, marcamos como desasignada y
          // seguimos (no hay nada que llamar).
          logger.info(
            `Placa ${placa}: marcada como asignada pero no existe en Cellvi; se cierra sin desasignar`,
          );
          await Manifiesto.updateMany(
            {
              placa,
              estado: "vencido",
              vehiculoDesasignado: { $ne: true },
            },
            { $set: { vehiculoDesasignado: true } },
          );
          continue;
        }

        const resultado = await cellviAdminClient.desasignarVehiculo(
          vehiculoCellvi.id,
        );

        if (resultado.success) {
          logger.info(
            `Placa ${placa} (id Cellvi ${vehiculoCellvi.id}): desasignada del usuario RNDC tras 24 h sin monitoreo activo`,
          );
          await Manifiesto.updateMany(
            {
              placa,
              estado: "vencido",
              vehiculoDesasignado: { $ne: true },
            },
            { $set: { vehiculoDesasignado: true } },
          );
        } else {
          logger.error(
            `Placa ${placa}: falló desasignación (${resultado.error || "sin detalle"})`,
          );
        }
      } catch (e) {
        logger.error(
          `Error procesando placa ${placa} en cierre de vencidos: ${e.message}`,
        );
      }
    }
  } catch (error) {
    logger.error(
      `Error en cerrarManifiestosVencidos: ${error.message}\n${error.stack}`,
    );
  } finally {
    isRunning = false;
  }
}

const init = () => {
  // Cada 30 minutos
  cron.schedule("*/30 * * * *", () => {
    cerrarManifiestosVencidos();
  });

  logger.info("Worker started: cerrarManifiestosVencidos");

  if (mongoose.connection.readyState === 1) {
    cerrarManifiestosVencidos();
  } else {
    mongoose.connection.once("open", () => {
      cerrarManifiestosVencidos();
    });
  }
};

module.exports = { cerrarManifiestosVencidos, init };
