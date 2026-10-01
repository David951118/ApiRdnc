/**
 * Corrige los tanqueos (cargas de combustible) guardados a medianoche UTC.
 *
 * Antes del 2026-10-01 la fecha escogida en el formulario ("2026-09-30") se
 * guardaba como 2026-09-30T00:00Z, que en Colombia se muestra como el 29 a las
 * 7 p. m. Este script la mueve al mismo día colombiano: a la hora de registro
 * si el tanqueo se registró ese mismo día, o al mediodía si no.
 *
 * Uso (desde la raíz del API):
 *   node scripts/fix-fechas-tanqueos.js            -> solo cuenta
 *   node scripts/fix-fechas-tanqueos.js --aplicar  -> respalda y corrige
 * El respaldo (valores anteriores) queda en backup-fechas-tanqueos-<fecha>.json.
 * Incluye los tanqueos en papelera para que queden bien si se restauran.
 */
require("dotenv").config();
const fs = require("fs");
const mongoose = require("mongoose");
const { diaColombia } = require("../src/utils/rangoFechas");

const aplicar = process.argv.includes("--aplicar");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const col = mongoose.connection.db.collection("cargacombustibles");
  const docs = await col
    .find({}, { projection: { fecha: 1, createdAt: 1, placa: 1 } })
    .toArray();

  const cambios = [];
  for (const d of docs) {
    const f = d.fecha;
    if (!(f instanceof Date)) continue;
    if (f.getUTCHours() || f.getUTCMinutes() || f.getUTCSeconds() || f.getUTCMilliseconds()) continue;
    const dia = f.toISOString().slice(0, 10);
    const nueva =
      d.createdAt && diaColombia(d.createdAt) === dia
        ? d.createdAt
        : new Date(`${dia}T12:00:00.000-05:00`);
    cambios.push({ _id: d._id, placa: d.placa, antes: f, despues: nueva });
  }

  console.log(`Tanqueos a corregir: ${cambios.length} de ${docs.length}`);

  if (aplicar && cambios.length) {
    const archivo = `backup-fechas-tanqueos-${diaColombia()}.json`;
    fs.writeFileSync(archivo, JSON.stringify(cambios, null, 1));
    const r = await col.bulkWrite(
      cambios.map((c) => ({
        updateOne: {
          filter: { _id: c._id, fecha: c.antes },
          update: { $set: { fecha: c.despues } },
        },
      })),
    );
    console.log(`Corregidos: ${r.modifiedCount}. Respaldo: ${archivo}`);
  }

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
