/**
 * Corrige los campos de "solo día" guardados a medianoche UTC.
 *
 * Los formularios envían un día ("2026-10-20") y Joi.date() lo guardaba como
 * 2026-10-20T00:00Z, que en Colombia se muestra como el 19 a las 7 p. m.
 * (vencimientos, matrícula, fecha límite de pago, etc. salían con un día menos
 * y un documento quedaba VENCIDO el mismo día de su vencimiento). Este script
 * mueve esos valores al mediodía colombiano del mismo día UTC, que es como los
 * guarda ahora el API (rangoFechas.fechaSoloDia).
 *
 * Uso (desde la raíz del API):
 *   node scripts/fix-fechas-solo-dia.js            -> solo cuenta
 *   node scripts/fix-fechas-solo-dia.js --aplicar  -> respalda y corrige
 * El respaldo (valores anteriores) queda en backup-fechas-solo-dia-<fecha>.json.
 */
require("dotenv").config();
const fs = require("fs");
const mongoose = require("mongoose");
const { diaColombia } = require("../src/utils/rangoFechas");

const aplicar = process.argv.includes("--aplicar");

// colección -> campos (ruta con puntos para los anidados)
const CAMPOS = {
  documentos: ["fechaExpedicion", "fechaVencimiento"],
  vehiculos: ["fechaMatricula", "fechaAfiliacion"],
  terceros: ["datosAdministrativo.fechaIngreso"],
  multas: ["fechaLimitePago", "pago.fechaPago"],
  viajes: ["fechaProgramada"],
  ordentrabajos: ["fechaProgramada"],
  equipogps: ["fechaInstalacion"],
  camaras: ["fechaInstalacion"],
};

const leer = (obj, ruta) => ruta.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

const esMedianocheUTC = (f) =>
  f instanceof Date &&
  !isNaN(f.getTime()) &&
  !f.getUTCHours() &&
  !f.getUTCMinutes() &&
  !f.getUTCSeconds() &&
  !f.getUTCMilliseconds();

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const existentes = new Set((await db.listCollections().toArray()).map((c) => c.name));
  const respaldo = [];
  const pendientes = [];

  for (const [coleccion, campos] of Object.entries(CAMPOS)) {
    if (!existentes.has(coleccion)) {
      console.log(`${coleccion}: no existe, se omite`);
      continue;
    }
    const col = db.collection(coleccion);
    const proyeccion = Object.fromEntries(campos.map((c) => [c, 1]));
    const docs = await col.find({}, { projection: proyeccion }).toArray();

    const ops = [];
    const conteo = Object.fromEntries(campos.map((c) => [c, 0]));
    for (const d of docs) {
      const set = {};
      const filtro = { _id: d._id };
      for (const campo of campos) {
        const f = leer(d, campo);
        if (!esMedianocheUTC(f)) continue;
        const nueva = new Date(`${f.toISOString().slice(0, 10)}T12:00:00.000-05:00`);
        set[campo] = nueva;
        filtro[campo] = f;
        conteo[campo]++;
        respaldo.push({ coleccion, _id: d._id, campo, antes: f, despues: nueva });
      }
      if (Object.keys(set).length) ops.push({ updateOne: { filter: filtro, update: { $set: set } } });
    }

    const detalle = campos.map((c) => `${c}=${conteo[c]}`).join(", ");
    console.log(`${coleccion}: ${ops.length} de ${docs.length} registros a corregir (${detalle})`);

    if (ops.length) pendientes.push({ coleccion, col, ops });
  }

  if (aplicar && respaldo.length) {
    // El respaldo se escribe antes de tocar nada.
    const archivo = `backup-fechas-solo-dia-${diaColombia()}.json`;
    fs.writeFileSync(archivo, JSON.stringify(respaldo, null, 1));
    console.log(`Respaldo: ${archivo}`);
    for (const { coleccion, col, ops } of pendientes) {
      const r = await col.bulkWrite(ops);
      console.log(`${coleccion}: corregidos ${r.modifiedCount}`);
    }
  }

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
