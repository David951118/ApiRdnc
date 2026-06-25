/**
 * Dump CRUDO de la respuesta de Cellvi para ruta_fraccionada (diagnostico Fase 5).
 * Uso: node src/scripts/probeRecorrido.js
 */
require("dotenv").config();
const cellviClient = require("../services/cellviClient");

(async () => {
  const ID = "4254"; // idCellvi del vehiculo sembrado
  for (const [ini, fin, etq] of [
    ["2026-06-16 00:00:00", "2026-06-16 23:59:59", "hoy"],
    ["2026-06-10 00:00:00", "2026-06-16 23:59:59", "ult.7dias"],
  ]) {
    const crudo = await cellviClient.getRecorrido(ID, ini, fin);
    console.log(`\n=== [${etq}] tipo=${Array.isArray(crudo) ? "array(" + crudo.length + ")" : typeof crudo} ===`);
    const muestra = JSON.stringify(crudo);
    console.log(muestra ? muestra.slice(0, 600) : crudo);
  }
  process.exit(0);
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
