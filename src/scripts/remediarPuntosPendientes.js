/**
 * Script de remediación de daño histórico causado por el bug de sync que
 * sobrescribía `puntosControl` en cada sincronización con el RNDC.
 *
 * Síntoma: puntos en `estado: "pendiente"` que en realidad ya tenían un
 * RegistroRMM asociado (es decir, el vehículo SÍ llegó/salió pero el sync los
 * pisó).
 *
 * Estrategia: para cada manifiesto, buscar sus RegistroRMM y reconstruir el
 * estado correcto de cada punto, dejando inalterado todo lo que ya esté bien.
 *
 * Modo dry-run por defecto. Para aplicar cambios:
 *   node src/scripts/remediarPuntosPendientes.js --apply
 *
 * Solo procesa manifiestos con `estado: "activo"` o `"completado"` para no
 * tocar los `vencido` ni `anulado`.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/database");
const Manifiesto = require("../models/Manifiesto");
const RegistroRMM = require("../models/RegistroRMM");

const APPLY = process.argv.includes("--apply");

async function remediar() {
  await connectDB();

  console.log("");
  console.log(
    `MODO: ${APPLY ? "APPLY (se escribirán cambios)" : "DRY-RUN (no se escribe nada)"}`,
  );
  console.log("");

  const manifiestos = await Manifiesto.find({
    estado: { $in: ["activo", "completado"] },
  });

  console.log(`Manifiestos candidatos: ${manifiestos.length}`);

  let resumen = {
    manifiestosTocados: 0,
    puntosAEnPunto: 0,
    puntosACompletado: 0,
    rmmHuerfanos: 0,
    sinCambio: 0,
  };

  for (const m of manifiestos) {
    let cambioEnManifiesto = false;

    for (const punto of m.puntosControl) {
      // Buscar el RMM más reciente para este punto
      const rmm = await RegistroRMM.findOne({
        manifiestoId: m._id,
        puntoControlId: punto._id,
      }).sort({ createdAt: -1 });

      if (!rmm) continue;

      // Si el punto está "pendiente" pero hay RMM con llegada → debió quedar en_punto
      if (punto.estado === "pendiente" && rmm.detectadoLlegada) {
        if (rmm.detectadoSalida) {
          // Llegada y salida → completado
          punto.estado = "completado";
          if (rmm.momentoDeteccionLlegada) {
            punto.fechaHoraLlegada = rmm.momentoDeteccionLlegada;
          }
          if (rmm.latitudLlegada != null) {
            punto.latitudLlegada = rmm.latitudLlegada;
          }
          if (rmm.longitudLlegada != null) {
            punto.longitudLlegada = rmm.longitudLlegada;
          }
          if (rmm.momentoDeteccionSalida) {
            punto.fechaHoraSalida = rmm.momentoDeteccionSalida;
          }
          if (rmm.latitudSalida != null) {
            punto.latitudSalida = rmm.latitudSalida;
          }
          if (rmm.longitudSalida != null) {
            punto.longitudSalida = rmm.longitudSalida;
          }
          punto.rmmId = rmm._id;
          resumen.puntosACompletado++;
          cambioEnManifiesto = true;
          console.log(
            `  ${m.numManifiesto} (${m.placa}) punto ${punto.codigoPunto}: pendiente → completado`,
          );
        } else {
          // Solo llegada → en_punto
          punto.estado = "en_punto";
          if (rmm.momentoDeteccionLlegada) {
            punto.fechaHoraLlegada = rmm.momentoDeteccionLlegada;
          }
          if (rmm.latitudLlegada != null) {
            punto.latitudLlegada = rmm.latitudLlegada;
          }
          if (rmm.longitudLlegada != null) {
            punto.longitudLlegada = rmm.longitudLlegada;
          }
          punto.rmmId = rmm._id;
          resumen.puntosAEnPunto++;
          cambioEnManifiesto = true;
          console.log(
            `  ${m.numManifiesto} (${m.placa}) punto ${punto.codigoPunto}: pendiente → en_punto`,
          );
        }
      } else if (punto.estado === "en_punto" && rmm.detectadoSalida) {
        // Quedó en_punto pero hay salida → completado
        punto.estado = "completado";
        if (rmm.momentoDeteccionSalida) {
          punto.fechaHoraSalida = rmm.momentoDeteccionSalida;
        }
        if (rmm.latitudSalida != null) {
          punto.latitudSalida = rmm.latitudSalida;
        }
        if (rmm.longitudSalida != null) {
          punto.longitudSalida = rmm.longitudSalida;
        }
        if (!punto.rmmId) punto.rmmId = rmm._id;
        resumen.puntosACompletado++;
        cambioEnManifiesto = true;
        console.log(
          `  ${m.numManifiesto} (${m.placa}) punto ${punto.codigoPunto}: en_punto → completado`,
        );
      } else if (!punto.rmmId && rmm) {
        // rmm existe pero punto no lo apunta
        punto.rmmId = rmm._id;
        resumen.rmmHuerfanos++;
        cambioEnManifiesto = true;
      }
    }

    if (cambioEnManifiesto) {
      resumen.manifiestosTocados++;
      // Si todos los puntos terminaron en completado, actualizar el manifiesto
      const todosCompletos = m.puntosControl.every(
        (p) => p.estado === "completado",
      );
      if (todosCompletos && m.estado === "activo") {
        m.estado = "completado";
        console.log(`  ${m.numManifiesto} → manifiesto pasa a completado`);
      }
      if (APPLY) {
        await m.save();
      }
    } else {
      resumen.sinCambio++;
    }
  }

  console.log("");
  console.log("─── RESUMEN ───");
  console.log(`Manifiestos tocados:           ${resumen.manifiestosTocados}`);
  console.log(`Puntos a "en_punto":           ${resumen.puntosAEnPunto}`);
  console.log(`Puntos a "completado":         ${resumen.puntosACompletado}`);
  console.log(`Punteros rmmId reparados:      ${resumen.rmmHuerfanos}`);
  console.log(`Manifiestos sin cambio:        ${resumen.sinCambio}`);
  console.log("");
  if (!APPLY) {
    console.log("Dry-run completado. Para aplicar: --apply");
  } else {
    console.log("Cambios aplicados.");
  }

  await mongoose.connection.close();
  process.exit(0);
}

remediar().catch((err) => {
  console.error("Error en remediación:", err);
  process.exit(1);
});
