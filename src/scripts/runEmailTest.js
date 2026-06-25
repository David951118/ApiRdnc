/**
 * Prueba del reporte gerencial semanal contra la base de pruebas.
 * - Calcula KPIs y renderiza el HTML del reporte (lo guarda para previsualizar).
 * - Si hay credenciales SMTP (EMAIL_FROM_USER/PASS) y destinatario, lo ENVÍA.
 * Uso: node src/scripts/runEmailTest.js
 */
require("dotenv").config();
const u = new URL(process.env.MONGODB_URI);
u.pathname = "/cellvi-rndc-test";
process.env.MONGODB_URI = u.toString();

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const kpiService = require("../services/kpiService");
const emailService = require("../services/emailService");

const DEST = process.env.REPORTE_GERENCIAL_TO || "asegurar.limitada@asegurar.com.co";

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  console.log("DB ->", u.pathname);

  const hasta = new Date();
  const desde = new Date();
  desde.setDate(desde.getDate() - 7);

  const kpis = await kpiService.kpisGerenciales({ desde, hasta });
  console.log("KPIs calculados:", JSON.stringify(kpis).slice(0, 220), "...");

  const html = emailService.renderReporteGerencialHTML({
    periodo: "semanal",
    desde: desde.toLocaleDateString("es-CO"),
    hasta: hasta.toLocaleDateString("es-CO"),
    kpis,
  });

  const out = path.join(__dirname, "..", "..", "reporte-gerencial-preview.html");
  fs.writeFileSync(out, html);
  console.log("HTML del reporte generado (" + html.length + " bytes) -> reporte-gerencial-preview.html");

  if (process.env.EMAIL_FROM_USER && process.env.EMAIL_FROM_PASS) {
    try {
      await emailService.enviarEmail({
        to: DEST,
        subject: "Reporte gerencial semanal (PRUEBA)",
        html,
      });
      console.log("✅ Correo ENVIADO a:", DEST);
    } catch (e) {
      console.log("❌ Falló el envío SMTP:", e.message);
    }
  } else {
    console.log("⚠️  Envío OMITIDO: faltan EMAIL_FROM_USER/EMAIL_FROM_PASS en .env (App Password de Gmail).");
    console.log("    Para enviar de verdad: definir EMAIL_FROM_USER, EMAIL_FROM_PASS y REPORTE_GERENCIAL_TO.");
  }

  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => { console.error("ERROR:", e); process.exit(1); });
