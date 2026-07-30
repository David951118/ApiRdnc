/**
 * Prueba de conectividad contra el AMBIENTE DE PRUEBAS oficial del RNDC
 * (plc.mintransporte.gov.co). Usa credenciales ficticias: se espera el error
 * de seguridad del Ministerio, lo que confirma conectividad + parseo XML.
 * Uso: node scripts/test-expedicion-conectividad.js
 */
require("dotenv").config();
const RNDCClient = require("../src/services/rndcClient");
const config = require("../src/config/env");

(async () => {
  console.log(`Endpoint de pruebas: ${config.rndc.endpointPruebas}`);
  const client = new RNDCClient(
    "usuario-prueba-conectividad",
    "clave-ficticia",
    config.rndc.endpointPruebas,
  );

  const r = await client.enviarProceso(
    "exp_test_conectividad",
    3,
    4,
    "INGRESOID",
    "<NUMNITEMPRESATRANSPORTE>999999999</NUMNITEMPRESATRANSPORTE>",
    { prueba: true },
  );

  console.log("Respuesta del RNDC (pruebas):", JSON.stringify(r, null, 2));
  if (!r.success && r.error) {
    console.log("\n✔ CONECTIVIDAD OK: el ambiente de pruebas respondió y el error fue parseado.");
  } else if (r.success) {
    console.log("\n✔ CONECTIVIDAD OK (respuesta exitosa inesperada con credencial ficticia)");
  } else {
    console.log("\n✘ Sin respuesta clara del RNDC");
    process.exitCode = 1;
  }
  process.exit();
})();
