/**
 * Corrige las actividades de inventario GPS guardadas a medianoche UTC.
 *
 * Antes del 2026-09-28 la fecha escogida en el formulario ("2026-09-25") se
 * guardaba como 2026-09-25T00:00Z, que en Colombia se muestra como el 24 a las
 * 7 p. m. Este script la mueve al mismo día colombiano: a la hora de creación
 * si la actividad se registró ese mismo día, o al mediodía si no.
 *
 * Uso (desde la raíz del API):
 *   node scripts/fix-fechas-actividades.js            -> solo cuenta
 *   node scripts/fix-fechas-actividades.js --aplicar  -> respalda y corrige
 * El respaldo (valores anteriores) queda en backup-fechas-actividades-<fecha>.json.
 */
require("dotenv").config();
const fs = require("fs");
const mongoose = require("mongoose");
const { diaColombia } = require("../src/utils/rangoFechas");

const aplicar = process.argv.includes("--aplicar");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const col = mongoose.connection.db.collection("actividadgps");
  const docs = await col
    .find({}, { projection: { fechaActividad: 1, createdAt: 1 } })
    .toArray();

  const cambios = [];
  for (const d of docs) {
    const f = d.fechaActividad;
    if (!(f instanceof Date)) continue;
    if (f.getUTCHours() || f.getUTCMinutes() || f.getUTCSeconds() || f.getUTCMilliseconds()) continue;
    const dia = f.toISOString().slice(0, 10);
    const nueva =
      d.createdAt && diaColombia(d.createdAt) === dia
        ? d.createdAt
        : new Date(`${dia}T12:00:00.000-05:00`);
    cambios.push({ _id: d._id, antes: f, despues: nueva });
  }

  console.log(`Actividades a corregir: ${cambios.length} de ${docs.length}`);

  if (aplicar && cambios.length) {
    const archivo = `backup-fechas-actividades-${diaColombia()}.json`;
    fs.writeFileSync(archivo, JSON.stringify(cambios, null, 1));
    const r = await col.bulkWrite(
      cambios.map((c) => ({
        updateOne: {
          filter: { _id: c._id, fechaActividad: c.antes },
          update: { $set: { fechaActividad: c.despues } },
        },
      })),
    );
    console.log(`Corregidas: ${r.modifiedCount}. Respaldo: ${archivo}`);
  }

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
