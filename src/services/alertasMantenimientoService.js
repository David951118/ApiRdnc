const PlanMantenimiento = require("../models/PlanMantenimiento");
const OrdenTrabajo = require("../models/OrdenTrabajo");
const Vehiculo = require("../models/Vehiculo");
const kilometrajeService = require("./kilometrajeService");
const { esKmPlausible } = kilometrajeService;
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
 * @param {number|null} kmBase - km de referencia del vehículo (kilometrajeBaseMantenimiento)
 *        usado como ancla del primer servicio cuando aún no hay OT cerrada.
 */
function evaluarItem(item, ultimaOT, kmActual, hoy, kmBase = null) {
  const resultado = {
    item: item.nombre,
    itemId: item._id,
    intervaloKm: item.intervaloKm || null,
    intervaloDias: item.intervaloDias || null,
    ultimoServicio: ultimaOT
      ? { fecha: ultimaOT.fechaCierre, kilometraje: ultimaOT.kilometraje, ot: ultimaOT.numero }
      : null,
    kmActual,
    proximoKm: null,
    kmRestantes: null,
    diasRestantes: null,
    sinHistorial: false,
    estimado: false,
    estado: "OK",
  };

  // ── Mantenimiento ÚNICO (one-shot) a un km objetivo absoluto ──
  // Ignora los intervalos. Si ya hay una OT cerrada del ítem, el servicio único
  // ya se hizo → OK definitivo (no vuelve a alertar). Si no, compara el km actual
  // contra el km objetivo.
  if (item.unaVez && item.kmObjetivo != null) {
    resultado.unaVez = true;
    resultado.kmObjetivo = item.kmObjetivo;
    if (ultimaOT) {
      resultado.estado = "OK";
      resultado.completado = true;
      return resultado;
    }
    resultado.proximoKm = item.kmObjetivo;
    if (kmActual != null) {
      resultado.kmRestantes = item.kmObjetivo - kmActual;
      if (resultado.kmRestantes <= 0) resultado.estado = "VENCIDO";
      else if (resultado.kmRestantes <= (item.umbralAlertaKm || 500))
        resultado.estado = "PROXIMO";
    }
    return resultado;
  }

  if (!ultimaOT) {
    resultado.estado = "SIN_HISTORIAL";
    resultado.sinHistorial = true;
    // No hay OT de referencia. El ancla es el km base del vehículo (foto del km al
    // ingresar al plan): el primer servicio va en kmBase + intervalo. Ej.: ingresa a
    // 4.000 con plan cada 5.000 → primer servicio a 9.000 (no a 5.000). Si por algún
    // motivo aún no hay km base, caemos al km actual como ancla para no romper.
    if (item.intervaloKm && kmActual != null && kmActual > 0) {
      const ancla = kmBase != null ? kmBase : kmActual;
      const proximoKm = ancla + item.intervaloKm;
      resultado.proximoKm = proximoKm;
      resultado.kmRestantes = proximoKm - kmActual;
      resultado.estimado = true;
      if (resultado.kmRestantes <= 0) resultado.estado = "VENCIDO";
      else if (resultado.kmRestantes <= (item.umbralAlertaKm || 500))
        resultado.estado = "PROXIMO";
    }
    return resultado;
  }

  let vencido = false;
  let proximo = false;

  // Evaluación por kilometraje
  if (item.intervaloKm && kmActual != null && ultimaOT.kilometraje != null) {
    const proximoKm = ultimaOT.kilometraje + item.intervaloKm;
    resultado.proximoKm = proximoKm;
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

      // Km base (ancla del primer mantenimiento sin historial). Se toma una sola
      // vez por vehículo: la primera vez que se evalúa y hay km válido. Idempotente
      // (solo escribe si aún está en null) para no correr la meta en cada consulta.
      let kmBase = vehiculo.kilometrajeBaseMantenimiento;
      // Una base fuera de rango (dato viejo mal digitado) se descarta: si se
      // conserva, el primer mantenimiento queda programado a cientos de miles
      // de km y la alerta nunca dispara.
      if (kmBase != null && !esKmPlausible(kmBase)) {
        logger.warn(
          `[AlertasMant] Km base implausible en ${vehiculo.placa} (${kmBase}); se recalcula`,
        );
        kmBase = null;
        await Vehiculo.updateOne(
          { _id: vehiculo._id },
          { $set: { kilometrajeBaseMantenimiento: null } },
        ).catch(() => {});
      }
      if (kmBase == null && kmActual != null && kmActual > 0) {
        kmBase = kmActual;
        vehiculo.kilometrajeBaseMantenimiento = kmBase;
        try {
          await Vehiculo.updateOne(
            { _id: vehiculo._id, kilometrajeBaseMantenimiento: null },
            {
              $set: {
                kilometrajeBaseMantenimiento: kmBase,
                fechaBaseMantenimiento: new Date(),
              },
            },
          );
        } catch (e) {
          logger.error(
            `[AlertasMant] No se pudo fijar km base ${vehiculo.placa}: ${e.message}`,
          );
        }
      }

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

        const evaluacion = evaluarItem(item, ultimaOT, kmActual, hoy, kmBase);

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

module.exports = { calcularAlertas, evaluarItem };
