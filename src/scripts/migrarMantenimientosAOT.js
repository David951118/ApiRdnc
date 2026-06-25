require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});
const mongoose = require("mongoose");
const Vehiculo = require("../models/Vehiculo");
const OrdenTrabajo = require("../models/OrdenTrabajo");

/**
 * Migración: convierte el historial embebido Vehiculo.mantenimientos
 * en Órdenes de Trabajo CERRADAS (origen: MIGRACION).
 *
 * - Idempotente: no duplica si se corre dos veces (verifica por vehículo +
 *   fecha + descripción de entradas ya migradas).
 * - NO borra el array embebido (queda como respaldo; el cierre de OTs nuevas
 *   lo sigue alimentando como resumen).
 *
 * Uso:  node src/scripts/migrarMantenimientosAOT.js          (simulación)
 *       node src/scripts/migrarMantenimientosAOT.js --ejecutar
 */
async function migrar() {
  const ejecutar = process.argv.includes("--ejecutar");
  console.log(
    ejecutar
      ? "\n🚀 MIGRACIÓN REAL de mantenimientos embebidos a OTs\n"
      : "\n🔍 SIMULACIÓN (use --ejecutar para aplicar)\n",
  );

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });

  const vehiculos = await Vehiculo.find({
    "mantenimientos.0": { $exists: true },
    deletedAt: null,
  });

  console.log(`Vehículos con historial embebido: ${vehiculos.length}`);

  let creadas = 0;
  let omitidas = 0;

  for (const vehiculo of vehiculos) {
    for (const m of vehiculo.mantenimientos) {
      // Saltar entradas que ya provienen de OTs (descripcion inicia con "OT-")
      if (m.descripcion && /^OT-\d{4}-\d+/.test(m.descripcion)) {
        omitidas++;
        continue;
      }

      // Idempotencia: ¿ya existe una OT migrada equivalente?
      const existente = await OrdenTrabajo.findOne({
        vehiculo: vehiculo._id,
        origen: "MIGRACION",
        fechaCierre: m.fecha,
        descripcion: m.descripcion || "Mantenimiento migrado",
      });
      if (existente) {
        omitidas++;
        continue;
      }

      console.log(
        `  + ${vehiculo.placa} | ${m.tipo || "CORRECTIVO"} | ${
          m.fecha ? new Date(m.fecha).toISOString().slice(0, 10) : "sin fecha"
        } | ${m.descripcion || "(sin descripción)"}`,
      );

      if (ejecutar) {
        const ot = new OrdenTrabajo({
          vehiculo: vehiculo._id,
          placa: vehiculo.placa,
          empresa: vehiculo.empresaAfiliadora || null,
          tipo: m.tipo || "CORRECTIVO",
          origen: "MIGRACION",
          estado: "CERRADA",
          descripcion: m.descripcion || "Mantenimiento migrado",
          kilometraje: m.kilometraje ?? null,
          taller: m.taller || null,
          fechaCierre: m.fecha || new Date(),
          creadoPor: "migracion",
          historial: [
            {
              usuario: "migracion",
              accion: "CREADA",
              detalle: "Migrada desde Vehiculo.mantenimientos",
            },
          ],
        });
        await ot.save();
        creadas++;
      } else {
        creadas++;
      }
    }
  }

  console.log(
    `\n${ejecutar ? "✅ Migradas" : "Se migrarían"}: ${creadas} | Omitidas (ya migradas/de OTs): ${omitidas}\n`,
  );

  await mongoose.disconnect();
}

migrar().catch((err) => {
  console.error("❌ Error en migración:", err.message);
  process.exit(1);
});
