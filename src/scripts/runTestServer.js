/**
 * Lanza el backend apuntando a la base AISLADA cellvi-rndc-test en el puerto 3001.
 * No interfiere con la instancia de produccion en :3000.
 * Uso: node src/scripts/runTestServer.js
 */
require("dotenv").config();

// Inyectar nombre de base de datos de pruebas en la URI (sin tocar credenciales)
const base = process.env.MONGODB_URI;
const url = new URL(base);
url.pathname = "/cellvi-rndc-test";
process.env.MONGODB_URI = url.toString();
process.env.PORT = "3001";
process.env.NODE_ENV = "test";

console.log("[TEST-SERVER] DB ->", url.pathname, "| PORT -> 3001");

require("../app");
