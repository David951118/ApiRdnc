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

module.exports = {
  enviarEmail,
  renderContactoHTML,
};
