const cron = require("node-cron");
const Vehiculo = require("../models/Vehiculo");
const KilometrajeDiario = require("../models/KilometrajeDiario");
const kilometrajeService = require("../services/kilometrajeService");
const logger = require("../config/logger");

/**
 * Worker: snapshot diario de kilometraje.
 *
 * Todos los días a las 23:30 (hora Colombia) consulta el kilometraje de cada
 * vehículo activo (Cellvi GPS → preoperacional → manual) y guarda un snapshot
 * por día calendario en KilometrajeDiario. Con esos snapshots se calculan
 * consolidados de recorrido real (odómetro), independientes de las rutas.
 *
 * Corre también una pasada al arrancar el proceso si el día de hoy aún no
 * tiene snapshots (recuperación tras reinicios).
 */

const TZ = "America/Bogota";

/** Día calendario colombiano "YYYY-MM-DD". */
function hoyBogota(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

let corriendo = false;

/**
 * Captura el snapshot de todos los vehículos activos para el día actual.
 * Devuelve { total, guardados, sinDato }.
 */
async function capturarSnapshotDiario() {
  if (corriendo) {
    logger.warn("[KmDiario] Captura ya en curso; se omite esta corrida");
    return { total: 0, guardados: 0, sinDato: 0, omitida: true };
  }
  corriendo = true;

  const fecha = hoyBogota();
  let guardados = 0;
  let sinDato = 0;

  try {
    const vehiculos = await Vehiculo.find({ deletedAt: null })
      .select("_id placa idCellvi kilometrajeActual ultimaActualizacionKm fuenteKilometraje")
      .lean();

    for (const vehiculo of vehiculos) {
      try {
        const resultado = await kilometrajeService.resolverKilometraje(vehiculo);
        if (resultado.kilometraje == null) {
          sinDato += 1;
          continue;
        }
        await KilometrajeDiario.findOneAndUpdate(
          { vehiculo: vehiculo._id, fecha },
          {
            $set: {
              placa: vehiculo.placa,
              kilometraje: resultado.kilometraje,
              fuente: resultado.fuente,
              capturadoEn: new Date(),
            },
          },
          { upsert: true, new: true },
        );
        guardados += 1;
      } catch (err) {
        sinDato += 1;
        logger.error(
          `[KmDiario] Error con vehículo ${vehiculo.placa || vehiculo._id}: ${err.message}`,
        );
      }
      // Pausa corta entre vehículos para no saturar el API de Cellvi
      await new Promise((r) => setTimeout(r, 300));
    }

    logger.info(
      `[KmDiario] Snapshot ${fecha}: ${guardados}/${vehiculos.length} vehículos con dato (${sinDato} sin dato)`,
    );
    return { total: vehiculos.length, guardados, sinDato };
  } finally {
    corriendo = false;
  }
}

// Corrida diaria 23:30 hora Colombia (fin del día: captura el odómetro con el
// recorrido completo de la jornada).
cron.schedule("30 23 * * *", capturarSnapshotDiario, { timezone: TZ });

// Recuperación al arrancar: si hoy no hay ningún snapshot (deploy/reinicio en
// un día sin corrida), capturar una vez pasados 2 minutos del arranque.
setTimeout(async () => {
  try {
    const existentes = await KilometrajeDiario.countDocuments({ fecha: hoyBogota() });
    if (existentes === 0) {
      logger.info("[KmDiario] Sin snapshots hoy; ejecutando captura de arranque");
      await capturarSnapshotDiario();
    }
  } catch (err) {
    logger.error(`[KmDiario] Error en captura de arranque: ${err.message}`);
  }
}, 2 * 60 * 1000);

logger.info("[KmDiario] Worker de kilometraje diario programado (23:30 America/Bogota)");

module.exports = { capturarSnapshotDiario, hoyBogota };
