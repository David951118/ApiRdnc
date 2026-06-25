const CargaCombustible = require("../models/CargaCombustible");
const logger = require("../config/logger");

/**
 * Servicio de rendimiento de combustible (método tanque a tanque).
 *
 * Para una secuencia de tanqueos de un vehículo ordenados por kilometraje:
 *   tramoKm        = km[i] - km[i-1]
 *   rendimiento[i] = tramoKm / galones[i]   (km por galón del tramo recorrido)
 *
 * El primer tanqueo no tiene tramo previo → rendimientoTramo = null.
 * Solo se consideran tramos cuyo tanqueo cierra con tanque lleno (tanqueLleno),
 * que es la condición para que el método sea válido.
 */

/**
 * Calcula y persiste el rendimiento del tramo de un tanqueo recién creado,
 * y reconcilia el siguiente tanqueo si lo hubiera (porque al insertar uno
 * intermedio cambian los tramos vecinos).
 */
async function recalcularRendimiento(vehiculoId) {
  const tanqueos = await CargaCombustible.find({
    vehiculo: vehiculoId,
    deletedAt: null,
  })
    .sort({ kmTanqueo: 1, fecha: 1 })
    .select("kmTanqueo galones tanqueLleno rendimientoTramo");

  let anterior = null;
  for (const t of tanqueos) {
    let rendimiento = null;
    if (anterior && t.tanqueLleno && t.galones > 0) {
      const tramoKm = t.kmTanqueo - anterior.kmTanqueo;
      if (tramoKm > 0) {
        rendimiento = Math.round((tramoKm / t.galones) * 100) / 100;
      }
    }
    if (t.rendimientoTramo !== rendimiento) {
      t.rendimientoTramo = rendimiento;
      await t.save();
    }
    anterior = t;
  }
}

/**
 * Resumen de rendimiento y costo de combustible por vehículo en un periodo.
 * @param {Object} filtro - { empresa?, vehiculo?, desde?, hasta? }
 * @returns {Array} [{ vehiculo, placa, tanqueos, galonesTotal, costoTotal,
 *                     kmRecorridos, rendimientoPromedio, costoPorKm }]
 */
async function resumenPorVehiculo(filtro = {}) {
  const match = { deletedAt: null };
  if (filtro.empresa) match.empresa = filtro.empresa;
  if (filtro.vehiculo) match.vehiculo = filtro.vehiculo;
  if (filtro.desde || filtro.hasta) {
    match.fecha = {};
    if (filtro.desde) match.fecha.$gte = new Date(filtro.desde);
    if (filtro.hasta) match.fecha.$lte = new Date(filtro.hasta);
  }

  const tanqueos = await CargaCombustible.find(match)
    .sort({ vehiculo: 1, kmTanqueo: 1 })
    .populate("vehiculo", "placa")
    .lean();

  // Agrupar por vehículo
  const porVehiculo = new Map();
  for (const t of tanqueos) {
    const vid = t.vehiculo?._id?.toString() || "sin_vehiculo";
    if (!porVehiculo.has(vid)) {
      porVehiculo.set(vid, {
        vehiculo: t.vehiculo?._id || null,
        placa: t.vehiculo?.placa || t.placa || null,
        tanqueos: 0,
        galonesTotal: 0,
        costoTotal: 0,
        kmRecorridos: 0, // suma de tramos válidos
        galonesEnTramos: 0,
      });
    }
    const acc = porVehiculo.get(vid);
    acc.tanqueos++;
    acc.galonesTotal += t.galones || 0;
    acc.costoTotal += t.costoTotal || 0;
    // rendimientoTramo persistido implica que hubo tramo válido
    if (t.rendimientoTramo != null && t.galones > 0) {
      acc.kmRecorridos += t.rendimientoTramo * t.galones;
      acc.galonesEnTramos += t.galones;
    }
  }

  return Array.from(porVehiculo.values()).map((v) => {
    const rendimientoPromedio =
      v.galonesEnTramos > 0
        ? Math.round((v.kmRecorridos / v.galonesEnTramos) * 100) / 100
        : null;
    const costoPorKm =
      v.kmRecorridos > 0
        ? Math.round((v.costoTotal / v.kmRecorridos) * 100) / 100
        : null;
    return {
      vehiculo: v.vehiculo,
      placa: v.placa,
      tanqueos: v.tanqueos,
      galonesTotal: Math.round(v.galonesTotal * 100) / 100,
      costoTotal: v.costoTotal,
      kmRecorridos: Math.round(v.kmRecorridos),
      rendimientoPromedio, // km/galón
      costoPorKm, // $/km de combustible
    };
  });
}

module.exports = { recalcularRendimiento, resumenPorVehiculo };
