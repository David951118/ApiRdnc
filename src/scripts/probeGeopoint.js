/**
 * Prueba el endpoint correcto de puntos GPS por fecha (JSON):
 *   POST /cellvi/geopoint/ruta/vehiculo/fecha
 * Uso: node src/scripts/probeGeopoint.js
 */
require("dotenv").config();
const cellviClient = require("../services/cellviClient");

(async () => {
  const ID = "4254";
  // Reusar la instancia axios autenticada del cliente Cellvi
  const ax = cellviClient.axiosInstance;
  for (const [ini, fin, etq] of [
    ["2026-06-16 00:00:00", "2026-06-16 23:59:59", "hoy"],
    ["2026-06-10 00:00:00", "2026-06-16 23:59:59", "ult.7dias"],
  ]) {
    try {
      const r = await ax.post("/cellvi/geopoint/ruta/vehiculo/fecha", {
        vehiculo: ID, fechaInicial: ini, fechaFinal: fin,
      }, { timeout: 60000 });
      const d = r.data;
      const arr = Array.isArray(d) ? d : d && d.data ? d.data : [];
      console.log(`\n=== [${etq}] HTTP ${r.status} | puntos=${arr.length} ===`);
      if (arr.length) console.log("primer punto:", JSON.stringify(arr[0]));
    } catch (e) {
      console.log(`[${etq}]`, e.response ? `HTTP ${e.response.status}` : e.message);
    }
  }
  process.exit(0);
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
