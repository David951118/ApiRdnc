const nodemailer = require("nodemailer");
const logger = require("../config/logger");

/**
 * Transporter de Gmail SMTP usando App Password.
 * Requiere tener habilitada la verificación en 2 pasos y generar una
 * "Contraseña de aplicación" en https://myaccount.google.com/apppasswords
 */
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_FROM_USER,
      pass: process.env.EMAIL_FROM_PASS, // App Password de 16 caracteres
    },
  });

  return transporter;
}

/**
 * Enviar email genérico.
 * @param {Object} opts - { to, subject, html, text, replyTo }
 */
async function enviarEmail({ to, subject, html, text, replyTo }) {
  const from = process.env.EMAIL_FROM_USER;
  if (!from) {
    throw new Error("EMAIL_FROM_USER no está configurado en .env");
  }

  const info = await getTransporter().sendMail({
    from: `"Asegurar" <${from}>`,
    to,
    replyTo,
    subject,
    html,
    text,
  });

  logger.info(`Email enviado a ${to}: ${info.messageId}`);
  return info;
}

/**
 * Plantilla HTML simple para formulario de contacto.
 */
function renderContactoHTML({ nombre, email, celular, observacion }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 8px;">
        Nuevo mensaje de contacto
      </h2>
      <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
        <tr>
          <td style="padding: 8px; font-weight: bold; background: #f4f4f4; width: 140px;">Nombre</td>
          <td style="padding: 8px;">${escapeHtml(nombre)}</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold; background: #f4f4f4;">Email</td>
          <td style="padding: 8px;"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold; background: #f4f4f4;">Celular</td>
          <td style="padding: 8px;"><a href="tel:${escapeHtml(celular)}">${escapeHtml(celular)}</a></td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold; background: #f4f4f4; vertical-align: top;">Observación</td>
          <td style="padding: 8px; white-space: pre-wrap;">${escapeHtml(observacion)}</td>
        </tr>
      </table>
      <p style="color: #7f8c8d; font-size: 12px; margin-top: 20px;">
        Enviado desde el formulario de contacto de Asegurar.
      </p>
    </div>
  `;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatCOP(valor) {
  if (valor == null) return "—";
  return "$" + Math.round(valor).toLocaleString("es-CO");
}

/**
 * Plantilla HTML del reporte gerencial (semanal/mensual).
 * @param {Object} opts - { periodo, desde, hasta, kpis }
 */
function renderReporteGerencialHTML({ periodo, desde, hasta, kpis }) {
  const { flota, mantenimiento, costos, rankingVehiculos } = kpis;

  const filas = (rankingVehiculos || [])
    .slice(0, 10)
    .map(
      (v, i) => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${i + 1}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-weight:bold;">${escapeHtml(v.placa)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${formatCOP(v.costoMantenimiento)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${formatCOP(v.costoCombustible)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:bold;">${formatCOP(v.costoTotal)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${v.costoPorKm != null ? formatCOP(v.costoPorKm) : "—"}</td>
      </tr>`,
    )
    .join("");

  const tarjeta = (titulo, valor, color) => `
    <td style="padding:16px;background:${color};border-radius:8px;color:#fff;text-align:center;width:25%;">
      <div style="font-size:24px;font-weight:bold;">${valor}</div>
      <div style="font-size:12px;opacity:0.9;">${titulo}</div>
    </td>`;

  return `
  <div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;color:#2c3e50;">
    <h2 style="color:#2c3e50;border-bottom:2px solid #3498db;padding-bottom:8px;">
      Reporte gerencial ${escapeHtml(periodo)}
    </h2>
    <p style="color:#7f8c8d;font-size:13px;">Periodo: ${escapeHtml(desde)} a ${escapeHtml(hasta)}</p>

    <table style="width:100%;border-collapse:separate;border-spacing:8px;margin:16px 0;">
      <tr>
        ${tarjeta("Disponibilidad de flota", flota.disponibilidad != null ? flota.disponibilidad + "%" : "—", "#27ae60")}
        ${tarjeta("Preventivo", mantenimiento.pctPreventivo != null ? mantenimiento.pctPreventivo + "%" : "—", "#2980b9")}
        ${tarjeta("Costo por km", costos.costoPorKmGlobal != null ? formatCOP(costos.costoPorKmGlobal) : "—", "#8e44ad")}
        ${tarjeta("Costo total flota", formatCOP(costos.costoTotalFlota), "#c0392b")}
      </tr>
    </table>

    <h3 style="margin-top:24px;">Resumen de mantenimiento</h3>
    <p style="font-size:14px;">
      Órdenes cerradas: <b>${mantenimiento.totalOrdenes}</b>
      (${mantenimiento.preventivos} preventivas, ${mantenimiento.correctivos} correctivas).
      Flota disponible: <b>${flota.disponibles}/${flota.total}</b>
      (${flota.enMantenimiento} en mantenimiento).
    </p>

    <h3 style="margin-top:24px;">Top 10 vehículos más costosos</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f4f4f4;text-align:left;">
          <th style="padding:8px;">#</th>
          <th style="padding:8px;">Placa</th>
          <th style="padding:8px;text-align:right;">Mantenimiento</th>
          <th style="padding:8px;text-align:right;">Combustible</th>
          <th style="padding:8px;text-align:right;">Total</th>
          <th style="padding:8px;text-align:right;">$/km</th>
        </tr>
      </thead>
      <tbody>${filas || '<tr><td colspan="6" style="padding:12px;text-align:center;color:#999;">Sin datos en el periodo</td></tr>'}</tbody>
    </table>

    <p style="color:#7f8c8d;font-size:12px;margin-top:24px;">
      Generado automáticamente por la plataforma Asegurar el ${escapeHtml(new Date().toLocaleString("es-CO"))}.
    </p>
  </div>`;
}

module.exports = {
  enviarEmail,
  renderContactoHTML,
  renderReporteGerencialHTML,
};
