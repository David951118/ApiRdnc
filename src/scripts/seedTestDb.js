/**
 * Seed de base de pruebas AISLADA (cellvi-rndc-test) copiando datos reales minimos.
 * Lee de la base real (default 'test') y escribe en 'cellvi-rndc-test' en el MISMO cluster.
 * Uso: node src/scripts/seedTestDb.js
 */
require("dotenv").config();
const { MongoClient } = require("mongodb");

const TARGET_DB = "cellvi-rndc-test";

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();

  // Detectar la base de origen (la que tiene las colecciones reales)
  const admin = client.db().admin();
  const { databases } = await admin.listDatabases();
  console.log("Bases en el cluster:", databases.map((d) => d.name).join(", "));

  // Buscar la base que contenga 'vehiculos'
  let sourceDbName = "test";
  for (const d of databases) {
    if (["admin", "local", "config", TARGET_DB].includes(d.name)) continue;
    const cols = await client
      .db(d.name)
      .listCollections({ name: "vehiculos" })
      .toArray();
    if (cols.length) {
      sourceDbName = d.name;
      break;
    }
  }
  console.log("Base de origen detectada:", sourceDbName);

  const src = client.db(sourceDbName);
  const dst = client.db(TARGET_DB);

  // Limpiar destino para un seed reproducible
  await dst.dropDatabase();
  console.log(`Base destino '${TARGET_DB}' limpiada.`);

  const report = {};

  // 1) Empresa (cualquiera)
  const empresa = await src.collection("empresas").findOne({});
  if (empresa) {
    await dst.collection("empresas").insertOne(empresa);
    report.empresa = { id: empresa._id, nombre: empresa.razonSocial || empresa.nombre };
  }

  // 2) Vehiculo (con capacidad de carga para prueba de sobrecarga)
  const vehiculo = await src.collection("vehiculos").findOne({});
  if (vehiculo) {
    vehiculo.capacidadCargaKg = vehiculo.capacidadCargaKg || 2000;
    vehiculo.pesoMaximoKg = vehiculo.pesoMaximoKg || 2500;
    await dst.collection("vehiculos").insertOne(vehiculo);
    report.vehiculo = {
      id: vehiculo._id,
      placa: vehiculo.placa,
      idCellvi: vehiculo.idCellvi,
      kilometrajeActual: vehiculo.kilometrajeActual,
    };
  }

  // 3) Conductor
  const conductor = await src
    .collection("terceros")
    .findOne({ "roles": /CONDUCTOR/i });
  const conductorAny =
    conductor || (await src.collection("terceros").findOne({}));
  if (conductorAny) {
    await dst.collection("terceros").insertOne(conductorAny);
    report.conductor = {
      id: conductorAny._id,
      nombre: conductorAny.nombres || conductorAny.razonSocial,
      usuarioCellvi: conductorAny.usuarioCellvi,
    };
  }

  // 4) Mecanico (otro tercero) con rolesSistema ROLE_MECANICO
  const mecanico = await src
    .collection("terceros")
    .findOne({ _id: { $ne: conductorAny ? conductorAny._id : null } });
  if (mecanico) {
    mecanico.rolesSistema = ["ROLE_MECANICO"];
    await dst.collection("terceros").insertOne(mecanico);
    report.mecanico = {
      id: mecanico._id,
      nombre: mecanico.nombres || mecanico.razonSocial,
      usuarioCellvi: mecanico.usuarioCellvi,
    };
  }

  // 5) Ruta
  const ruta = await src.collection("rutas").findOne({});
  if (ruta) {
    await dst.collection("rutas").insertOne(ruta);
    report.ruta = { id: ruta._id, nombre: ruta.nombre };
  }

  console.log("\n=== SEED OK -> base", TARGET_DB, "===");
  console.log(JSON.stringify(report, null, 2));

  await client.close();
}

main().catch((e) => {
  console.error("SEED ERROR:", e);
  process.exit(1);
});
