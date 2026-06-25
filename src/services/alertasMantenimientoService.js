const PlanMantenimiento = require("../models/PlanMantenimiento");
const OrdenTrabajo = require("../models/OrdenTrabajo");
const Vehiculo = require("../models/Vehiculo");
const kilometrajeService = require("./kilometrajeService");
const logger = require("../config/logger");

/**
 * Servicio de alertas de mantenimiento preventivo.
 *
 * Para cada plan activo × vehículo alcanzado × ítem del plan:
 *   1. Busca la última OT CERRADA de ese ítem (baseline de km y fecha).
 *   2. Resuelve el km actual del vehículo (kilometrajeService).
 *   3. Calcula km/días restantes contra el intervalo del ítem.
 *
 * Estados de alerta:
 *   VENCIDO       → ya se pasó el intervalo (km o días)
 *   PROXIMO       → dentro del umbral de anticipación
 *   OK            → aún no toca
 *   SIN_HISTORIAL → nunca se ha registrado una OT cerrada de ese ítem
 *                   (hay que hacer el primer registro para iniciar el ciclo)
 */

/**
 * Resuelve los vehículos alcanzados por un plan.
 */
async function vehiculosDelPlan(plan) {
  if (plan.aplicaTodos) {
    const filtro = { deletedAt: null, estado: { $ne: "RETIRADO" } };
    if (plan.empresa) filtro.empresaAfiliadora = plan.empresa;
    return Vehiculo.find(filtro).lean();
  }

  const condiciones = [];
  if (plan.vehiculos?.length) condiciones.push({ _id: { $in: plan.vehiculos } });
  if (plan.claseVehiculo)
    condiciones.push({ claseVehiculo: plan.claseVehiculo });

  if (!condiciones.length) return [];

  const filtro = {
    $or: condiciones,
    deletedAt: null,
    estado: { $ne: "RETIRADO" },
  };
  // Multi-tenancy: un plan de una empresa solo alcanza vehículos de esa empresa
  // (clase o lista específica). Los planes globales (empresa=null, ADMIN) no se acotan.
  if (plan.empresa) filtro.empresaAfiliadora = plan.empresa;

  return Vehiculo.find(filtro).lean();
}

/**
 * Evalúa un ítem del plan para un vehículo.
 */
function evaluarItem(item, ultimaOT, kmActual, hoy) {
  const resultado = {
    item: item.nombre,
    itemId: item._id,
    intervaloKm: item.intervaloKm || null,
    intervaloDias: item.intervaloDias || null,
    ultimoServicio: ultimaOT
      ? { fecha: ultimaOT.fechaCierre, kilometraje: ultimaOT.kilometraje, ot: ultimaOT.numero }
      : null,
    kmActual,
    kmRestantes: null,
    diasRestantes: null,
    sinHistorial: false,
    estimado: false,
    estado: "OK",
  };

  if (!ultimaOT) {
    resultado.estado = "SIN_HISTORIAL";
    resultado.sinHistorial = true;
    // No hay OT de referencia (baseline). Estimamos el km restante asumiendo que el
    // servicio se realiza en múltiplos del intervalo desde 0 km; así se muestra un
    // número útil y se avisa cuando se acerca, aunque falte registrar la primera OT.
    if (item.intervaloKm && kmActual != null && kmActual > 0) {
      resultado.kmRestantes = item.intervaloKm - (kmActual % item.intervaloKm);
      resultado.estimado = true;
      if (resultado.kmRestantes <= (item.umbralAlertaKm || 500)) {
        resultado.estado = "PROXIMO";
      }
    }
    return resultado;
  }

  let vencido = false;
  let proximo = false;

  // Evaluación por kilometraje
  if (item.intervaloKm && kmActual != null && ultimaOT.kilometraje != null) {
    const proximoKm = ultimaOT.kilometraje + item.intervaloKm;
    resultado.kmRestantes = proximoKm - kmActual;
    if (resultado.kmRestantes <= 0) vencido = true;
    else if (resultado.kmRestantes <= (item.umbralAlertaKm || 500))
      proximo = true;
  }

  // Evaluación por tiempo
  if (item.intervaloDias && ultimaOT.fechaCierre) {
    const proximaFecha = new Date(ultimaOT.fechaCierre);
    proximaFecha.setDate(proximaFecha.getDate() + item.intervaloDias);
    resultado.diasRestantes = Math.ceil(
      (proximaFecha - hoy) / (1000 * 60 * 60 * 24),
    );
    if (resultado.diasRestantes <= 0) vencido = true;
    else if (resultado.diasRestantes <= (item.umbralAlertaDias || 15))
      proximo = true;
  }

  resultado.estado = vencido ? "VENCIDO" : proximo ? "PROXIMO" : "OK";
  return resultado;
}

/**
 * Calcula las alertas de mantenimiento.
 * @param {Object} opts
 * @param {string} [opts.empresaId] - limitar a una empresa (scope CLIENTE_ADMIN)
 * @param {string} [opts.vehiculoId] - limitar a un vehículo
 * @param {boolean} [opts.soloAccionables] - excluir estado OK (default true)
 * @param {boolean} [opts.consultarCellvi] - resolver km vía Cellvi (default true;
 *        false usa solo kilometrajeActual guardado — más rápido para listados)
 */
async function calcularAlertas(opts = {}) {
  const {
    empresaId = null,
    vehiculoId = null,
    soloAccionables = true,
    consultarCellvi = true,
  } = opts;

  const filtroPlanes = { activo: true, deletedAt: null };
  if (empresaId) {
    filtroPlanes.$or = [{ empresa: empresaId }, { empresa: null }];
  }

  const planes = await PlanMantenimiento.find(filtroPlanes).lean();
  const hoy = new Date();
  const alertas = [];
  // Cache de km por vehículo para no consultar Cellvi más de una vez
  const kmCache = new Map();

  for (const plan of planes) {
    let vehiculos = await vehiculosDelPlan(plan);
    if (vehiculoId) {
      vehiculos = vehiculos.filter((v) => v._id.toString() === vehiculoId);
    }
    if (empresaId) {
      vehiculos = vehiculos.filter(
        (v) =>
          !v.empresaAfiliadora ||
          v.empresaAfiliadora.toString() === empresaId.toString(),
      );
    }

    for (const vehiculo of vehiculos) {
      const vId = vehiculo._id.toString();

      // Km actual (con cache)
      if (!kmCache.has(vId)) {
        if (consultarCellvi) {
          try {
            const km = await kilometrajeService.resolverKilometraje(vehiculo);
            kmCache.set(vId, km.kilometraje);
          } catch (e) {
            logger.error(
              `[AlertasMant] Error km ${vehiculo.placa}: ${e.message}`,
            );
            kmCache.set(vId, vehiculo.kilometrajeActual || null);
          }
        } else {
          kmCache.set(vId, vehiculo.kilometrajeActual || null);
        }
      }
      const kmActual = kmCache.get(vId);

      for (const item of plan.items) {
        // Última OT cerrada de este ítem para este vehículo
        const ultimaOT = await OrdenTrabajo.findOne({
          vehiculo: vehiculo._id,
          // El ítem queda cubierto si la OT lo enlaza como planItemNombre o lo
          // incluye como actividad (una OT puede cumplir varios ítems del plan).
          $or: [
            { planItemNombre: item.nombre },
            { "actividades.descripcion": item.nombre },
          ],
          estado: "CERRADA",
          deletedAt: null,
        })
          .sort({ fechaCierre: -1 })
          .select("numero fechaCierre kilometraje")
          .lean();

        const evaluacion = evaluarItem(item, ultimaOT, kmActual, hoy);

        if (soloAccionables && evaluacion.estado === "OK") continue;

        alertas.push({
          plan: { id: plan._id, nombre: plan.nombre },
          vehiculo: {
            id: vehiculo._id,
            placa: vehiculo.placa,
            claseVehiculo: vehiculo.claseVehiculo,
          },
          ...evaluacion,
        });
      }
    }
  }

  // Orden: VENCIDO primero, luego PROXIMO, luego SIN_HISTORIAL
  const peso = { VENCIDO: 0, PROXIMO: 1, SIN_HISTORIAL: 2, OK: 3 };
  alertas.sort((a, b) => peso[a.estado] - peso[b.estado]);

  return alertas;
}

module.exports = { calcularAlertas };
