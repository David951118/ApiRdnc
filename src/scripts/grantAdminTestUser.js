/**
 * En la base de pruebas, asocia un Tercero al usuario Cellvi 'rndc' con
 * rolesSistema ROLE_ADMIN para que el login le otorgue permisos de gestion.
 * Clona un tercero existente (schema-valido) y le cambia identidad + roles.
 * Uso: node src/scripts/grantAdminTestUser.js
 */
require("dotenv").config();
const { MongoClient, ObjectId } = require("mongodb");

async function main() {
  const base = new URL(process.env.MONGODB_URI);
  base.pathname = "/cellvi-rndc-test";
  const client = new MongoClient(base.toString());
  await client.connect();
  const db = client.db("cellvi-rndc-test");
  const terceros = db.collection("terceros");

  const existente = await terceros.findOne({});
  if (!existente) throw new Error("No hay terceros en la base de pruebas (correr seed primero)");

  const clon = { ...existente };
  delete clon._id;
  clon._id = new ObjectId();
  clon.usuarioCellvi = "rndc";
  clon.nombres = "USUARIO PRUEBA ADMIN";
  clon.numeroDocumento = "TEST-RNDC-ADMIN";
  clon.rolesSistema = ["ROLE_ADMIN"];

  await terceros.deleteMany({ usuarioCellvi: "rndc" });
  await terceros.insertOne(clon);

  console.log("OK: Tercero admin de prueba creado para usuarioCellvi='rndc'");
  console.log("  _id:", clon._id.toString(), "| rolesSistema:", clon.rolesSistema);

  await client.close();
}
main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
