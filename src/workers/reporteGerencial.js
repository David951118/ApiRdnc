const cron = require("node-cron");
const kpiService = require("../services/kpiService");
const emailService = require("../services/emailService");
const Empresa = require("../models/Empresa");
const logger = require("../config/logger");

/**
 * Worker: Reportes gerenciales automáticos (requerimiento d).
 *
 *   - Semanal: lunes 07:00 → KPIs de los últimos 7 días.
 *   - Mensual: día 1 a las 07:30 → KPIs del mes anterior.
 *
 * Destinatarios: variable de entorno REPORTE_GERENCIAL_TO (lista separada por
 * comas). Si no está configurada, el worker no envía (solo loguea).
 *
 * Se genera un reporte global (toda la flota) y, si hay empresas, uno por empresa
 * cuando exista REPORTE_GERENCIAL_POR_EMPRESA=true.
 */

function getDestinatarios() {
  const raw = process.env.REPORTE_GERENCIAL_TO || "";
  return raw
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

async function enviarReporte({ periodo, desde, hasta, empresaId, sufijo }) {
  const destinatarios = getDestinatarios();
  if (destinatarios.length === 0) {
    logger.warn(
      "[ReporteGerencial] REPORTE_GERENCIAL_TO no configurado; no se envía email.",
    );
    return;
  }

  const kpis = await kpiService.kpisGerenciales({
    empresaId,
    desde,
    hasta,
  });

  const html = emailService.renderReporteGerencialHTML({
    periodo,
    desde: new Date(desde).toLocaleDateString("es-CO"),
    hasta: new Date(hasta).toLocaleDateString("es-CO"),
    kpis,
  });

  await emailService.enviarEmail({
    to: destinatarios.join(","),
    subject: `Reporte gerencial ${periodo}${sufijo ? " - " + sufijo : ""}`,
    html,
  });

  logger.info(
    `[ReporteGerencial] Reporte ${periodo} enviado a ${destinatarios.length} destinatario(s)`,
  );
}

async function reporteSemanal() {
  try {
    const hasta = new Date();
    const desde = new Date();
    desde.setDate(desde.getDate() - 7);
    await enviarReporte({ periodo: "semanal", desde, hasta });
  } catch (error) {
    logger.error(`[ReporteGerencial] Error semanal: ${error.message}`);
  }
}

async function reporteMensual() {
  try {
    const ahora = new Date();
    // Mes anterior completo
    const desde = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
    const hasta = new Date(ahora.getFullYear(), ahora.getMonth(), 0, 23, 59, 59);
    await enviarReporte({ periodo: "mensual", desde, hasta });
  } catch (error) {
    logger.error(`[ReporteGerencial] Error mensual: ${error.message}`);
  }
}

// Lunes 07:00
cron.schedule("0 7 * * 1", reporteSemanal);
// Día 1 a las 07:30
cron.schedule("30 7 1 * *", reporteMensual);

logger.info("[ReporteGerencial] Worker de reportes gerenciales iniciado");

module.exports = { reporteSemanal, reporteMensual };
