/**
 * Login contra el backend de pruebas (:3001) usando credenciales del .env.
 * Guarda el token en .test-token (gitignorable) e imprime roles. No imprime la password.
 * Uso: node src/scripts/loginTest.js
 */
require("dotenv").config();
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3001";

async function main() {
  const username = process.env.CELLVI_USERNAME;
  const password = process.env.CELLVI_PASSWORD;
  if (!username || !password) {
    console.error("Faltan CELLVI_USERNAME/CELLVI_PASSWORD en .env");
    process.exit(1);
  }
  try {
    const r = await axios.post(`${BASE}/api/auth/login`, { username, password });
    const token = r.data.token || r.data.accessToken || (r.data.data && r.data.data.token);
    const user = r.data.user || (r.data.data && r.data.data.user) || {};
    if (!token) {
      console.error("No se encontro token en la respuesta:", JSON.stringify(r.data).slice(0, 400));
      process.exit(1);
    }
    fs.writeFileSync(path.join(__dirname, "..", "..", ".test-token"), token);
    console.log("LOGIN OK como:", username);
    console.log("Roles:", JSON.stringify(user.roles || r.data.roles || "(no roles en payload)"));
    console.log("Token guardado en apirndc/.test-token");
  } catch (e) {
    const status = e.response ? e.response.status : "(sin respuesta)";
    const body = e.response ? JSON.stringify(e.response.data).slice(0, 400) : e.message;
    console.error(`LOGIN FALLO [${status}]:`, body);
    process.exit(1);
  }
}
main();
