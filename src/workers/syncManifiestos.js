const cron = require("node-cron");
const mongoose = require("mongoose");
const Manifiesto = require("../models/Manifiesto");
const Configuracion = require("../models/Configuracion");
const RNDCClient = require("../services/rndcClient");
const cellviClient = require("../services/cellviClient");
const cellviAdminClient = require("../services/cellviAdminClient");
const logger = require("../config/logger");
const config = require("../config/env");

/**
 * Worker: Optimized Manifest Synchronization from RNDC2.
 * - Queries "new" manifests every 15 minutes.
 * - Queries "all" manifests every 24 hours.
 * - Validates and classifies manifests (processible vs non-processible).
 * - Detects and handles duplicate control points.
 */

let isRunning = false;

async function syncManifiestos(mockResponse = null) {
  if (isRunning) {
    logger.warn("Sync already in progress, skipping execution.");
    return;
  }

  isRunning = true;
  logger.info("Starting RNDC2 Manifest Synchronization");

  try {
    const username = process.env.RNDC_USERNAME;
    const password = process.env.RNDC_PASSWORD;
    const nitGPS = process.env.RNDC_NIT_GPS;

    if (!username || !password || !nitGPS) {
      throw new Error("Missing RNDC credentials in environment variables.");
    }

    const rndcClient = new RNDCClient(username, password);

    // Retrieve vehicles assigned to the RNDC user
    logger.debug("Fetching vehicles assigned to RNDC user...");
    const vehiculosAsignados = await cellviClient.getVehiculosUsuario();
    const placasAsignadas = new Set(
      vehiculosAsignados.map((v) => v.placa.toUpperCase())
    );
    logger.debug(`Assigned vehicles found: ${placasAsignadas.size}`);

    // Determine query type: "todos" (all) or "nuevos" (new)
    const configTodos = await Configuracion.findOne({
      clave: "ultima_consulta_todos",
    });

    const ahora = new Date();
    const ultimaConsultaTodos = configTodos?.valor
      ? new Date(configTodos.valor)
      : null;

    const hace24h =
      ultimaConsultaTodos && ahora - ultimaConsultaTodos < 24 * 60 * 60 * 1000;

    const tipo = hace24h ? "nuevos" : "todos";

    logger.debug(`Query Type: ${tipo.toUpperCase()}`);
    if (ultimaConsultaTodos) {
      const horasDesdeUltima = (
        (ahora - ultimaConsultaTodos) /
        (1000 * 60 * 60)
      ).toFixed(1);
      logger.debug(`Last "todos" query: ${horasDesdeUltima} hours ago`);
    }

    // Execute RNDC Query
    const response =
      mockResponse ||
      (await rndcClient.consultarManifiestosAutorizados(nitGPS, tipo));

    if (!response.success) {
      logger.error(`RNDC Query Error: ${response.error}`);
      return;
    }

    // Update timestamp if "todos" was queried
    if (tipo === "todos") {
      await Configuracion.findOneAndUpdate(
        { clave: "ultima_consulta_todos" },
        { valor: ahora },
        { upsert: true }
      );
      logger.debug("'todos' timestamp updated.");
    }

    const documentos = response.documentos || [];
    logger.debug(`Received ${documentos.length} manifests from RNDC`);

    // Process and Save Manifests
    let stats = {
      total: documentos.length,
      nuevos: 0,
      actualizados: 0,
      monitoreables: 0,
      noMonitoreables: 0,
      vehiculoNoAsignado: 0,
      puntosDuplicados: 0,
      errores: 0,
    };

    for (const doc of documentos) {
      try {
        const resultado = await procesarManifiesto(doc, placasAsignadas, stats);

        if (resultado.upserted) {
          stats.nuevos++;
        } else {
          stats.actualizados++;
        }

        if (resultado.esMonitoreable) {
          stats.monitoreables++;
        } else {
          stats.noMonitoreables++;
        }
      } catch (error) {
        stats.errores++;
        logger.error(`Error processing manifest: ${error.message}`);
      }
    }

    logger.info("Synchronization Completed:");
    logger.info(`  Total Received: ${stats.total}`);
    logger.info(`  New Saved: ${stats.nuevos}`);
    logger.info(`  Updated: ${stats.actualizados}`);
    logger.info(`  Monitorable: ${stats.monitoreables}`);
    logger.info(`  Non-Monitorable: ${stats.noMonitoreables}`);
    logger.info(`  Unassigned Vehicles: ${stats.vehiculoNoAsignado}`);
    logger.info(`  Duplicate Points Cleaned: ${stats.puntosDuplicados}`);
    logger.info(`  Errors: ${stats.errores}`);
  } catch (error) {
    logger.error(`Synchronization Fatal Error: ${error.message}`);
    logger.error(error.stack);
  } finally {
    isRunning = false;
  }
}

async function procesarManifiesto(doc, placasAsignadas, stats) {
  const ingresoid = doc.ingresoidmanifiesto;
  const numManifiesto = doc.nummanifiestocarga;
  const placa = doc.numplaca.toUpperCase();
  const fechaExpedicion = parseFecha(doc.fechaexpedicionmanifiesto);

  // Validate Vehicle (Auto-Assignment Flow)
  let vehiculoAsignado = false;
  let esMonitoreable = false;
  let motivoNoMonitoreable = null;

  // 1. Check if already assigned locally
  if (placasAsignadas.has(placa)) {
    vehiculoAsignado = true;

    // Verify monitoring status
    const detalle = await cellviClient.getVehiculoByPlacaDetallado(placa);
    if (detalle && detalle.monitoreado) {
      esMonitoreable = true;
    } else {
      motivoNoMonitoreable = "Vehicle assigned but not monitored";
    }
  } else {
    // 2. Not assigned. Search globally for Auto-Assignment
    const vehiculoGlobal = await cellviAdminClient.buscarVehiculoGlobal(placa);

    if (vehiculoGlobal) {
      // Exist in platform. Attempt Auto-Assign.
      logger.info(
        `Auto-Assigning vehicle ${placa} (ID: ${vehiculoGlobal.id}) to RNDC user...`
      );

      const asignacion = await cellviAdminClient.asignarVehiculo(
        vehiculoGlobal.id
      );

      if (asignacion.success) {
        vehiculoAsignado = true;
        placasAsignadas.add(placa); // Update local cache

        if (vehiculoGlobal.monitoreado) {
          esMonitoreable = true;
          logger.info(`${placa} Auto-assigned and ready for monitoring`);
        } else {
          motivoNoMonitoreable = "Vehicle exists but is not monitored";
        }
      } else {
        motivoNoMonitoreable = `Auto-assignment failed: ${asignacion.error}`;
        logger.error(`Auto-assign failure ${placa}: ${asignacion.error}`);
      }
    } else {
      // Does not exist in platform
      motivoNoMonitoreable = "Vehicle does not exist in Cellvi";
      stats.vehiculoNoAsignado++;
    }
  }

  // Parse and cleanup control points
  let puntosControl = [];
  if (doc.puntoscontrol && doc.puntoscontrol.puntocontrol) {
    const puntos = Array.isArray(doc.puntoscontrol.puntocontrol)
      ? doc.puntoscontrol.puntocontrol
      : [doc.puntoscontrol.puntocontrol];

    // Detect and remove duplicates
    const puntosLimpios = eliminarPuntosDuplicados(puntos);

    if (puntosLimpios.length < puntos.length) {
      const duplicados = puntos.length - puntosLimpios.length;
      stats.puntosDuplicados += duplicados;
      logger.debug(
        `Manifest ${numManifiesto}: ${duplicados} duplicate points removed`
      );
    }

    puntosControl = puntosLimpios.map((p) => ({
      codigoPunto: parseInt(p.codpuntocontrol),
      codigoMunicipio: p.codmunicipio,
      direccion: p.direccion,
      latitud: parseFloat(p.latitud),
      longitud: parseFloat(p.longitud),
      radio: 300,
      fechaCita: parseFecha(p.fechacita),
      horaCita: p.horacita,
      tiempoPactado: parseInt(p.tiempopactado || 0),
      estado: "pendiente",
      ajuste: p.ajuste === "1",
    }));
  }

  // Save or Update Manifest
  const resultado = await Manifiesto.findOneAndUpdate(
    { ingresoidManifiesto: ingresoid },
    {
      numManifiesto,
      nitEmpresaTransporte: doc.numnitempresatransporte,
      placa,
      fechaExpedicion,
      vehiculoAsignado,
      esMonitoreable,
      motivoNoMonitoreable,
      estado: "activo", // Always save as active initially
      puntosControl,
      datosOriginales: doc,
    },
    { upsert: true, new: true, rawResult: true }
  );

  const accion = resultado.lastErrorObject.upserted ? "New" : "Updated";
  const monitoreo = esMonitoreable
    ? "MONITORABLE"
    : `NOT MONITORABLE (${motivoNoMonitoreable})`;

  logger.info(
    `${accion}: ${numManifiesto} (${placa}) - ${puntosControl.length} points - ${monitoreo}`
  );

  return {
    ...resultado.lastErrorObject,
    esMonitoreable,
  };
}

/**
 * Remove duplicate control points.
 * Keeps only the last point for each unique code.
 */
function eliminarPuntosDuplicados(puntos) {
  const puntosMap = new Map();

  // Keep the last occurrence of each point code
  puntos.forEach((punto) => {
    const codigo = punto.codpuntocontrol;
    puntosMap.set(codigo, punto);
  });

  // Convert to array and sort by code
  return Array.from(puntosMap.values()).sort(
    (a, b) => parseInt(a.codpuntocontrol) - parseInt(b.codpuntocontrol)
  );
}

function parseFecha(fechaStr) {
  if (!fechaStr) return null;
  const [dia, mes, anio] = fechaStr.split("/");
  return new Date(`${anio}-${mes}-${dia}`);
}

const init = () => {
  // Execute every 15 minutes
  cron.schedule("*/15 * * * *", () => {
    logger.info("Cron Trigger: Manifest Synchronization");
    syncManifiestos();
  });

  logger.info("Worker started: Manifest Synchronization");

  // Execute immediately if connected
  if (mongoose.connection.readyState === 1) {
    syncManifiestos();
  } else {
    mongoose.connection.once("open", () => {
      syncManifiestos();
    });
  }
};

module.exports = { syncManifiestos, init };
