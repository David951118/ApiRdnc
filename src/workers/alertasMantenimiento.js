const cron = require("node-cron");
const alertasService = require("../services/alertasMantenimientoService");
const logger = require("../config/logger");

/**
 * Worker: Alertas de mantenimiento preventivo.
 * Ejecuta todos los días a las 06:00 AM.
 *
 * Cruza los planes de mantenimiento activos contra el kilometraje actual
 * (Cellvi GPS → preoperacional → manual) y el historial de OTs cerradas.
 * Deja el resumen en logs; el envío de email a gerencia se agrega en Fase 4
 * (reportes automáticos).
 */
async function revisarAlertasMantenimiento() {
  try {
    const alertas = await alertasService.calcularAlertas({
      soloAccionables: true,
      consultarCellvi: true,
    });

    const vencidos = alertas.filter((a) => a.estado === "VENCIDO");
    const proximos = alertas.filter((a) => a.estado === "PROXIMO");

    if (vencidos.length === 0 && proximos.length === 0) {
      logger.info("[AlertasMant] Sin alertas de mantenimiento pendientes");
      return;
    }

    logger.warn(
      `[AlertasMant] ${vencidos.length} VENCIDOS, ${proximos.length} PRÓXIMOS`,
    );

    for (const a of [...vencidos, ...proximos]) {
      const detalle =
        a.kmRestantes != null
          ? `${a.kmRestantes} km restantes`
          : a.diasRestantes != null
            ? `${a.diasRestantes} días restantes`
            : "";
      logger.warn(
        `[AlertasMant] ${a.estado} | ${a.vehiculo.placa} | ${a.item} | ${detalle} | plan: ${a.plan.nombre}`,
      );
    }
  } catch (error) {
    logger.error(`[AlertasMant] Error revisando alertas: ${error.message}`);
  }
}

// Todos los días a las 06:00 AM
cron.schedule("0 6 * * *", revisarAlertasMantenimiento);

logger.info("[AlertasMant] Worker de alertas de mantenimiento iniciado");

module.exports = { revisarAlertasMantenimiento };
