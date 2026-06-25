/**
 * Lanza la migración de mantenimientos apuntando a la base de pruebas.
 * Uso: node src/scripts/runMigrationTest.js            (simulación)
 *      node src/scripts/runMigrationTest.js --ejecutar  (aplica en base de pruebas)
 */
require("dotenv").config();
const u = new URL(process.env.MONGODB_URI);
u.pathname = "/cellvi-rndc-test";
process.env.MONGODB_URI = u.toString();
console.log("[MIGRACION-TEST] DB ->", u.pathname);
require("./migrarMantenimientosAOT");
