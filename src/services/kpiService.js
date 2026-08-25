const mongoose = require("mongoose");
const Vehiculo = require("../models/Vehiculo");
const OrdenTrabajo = require("../models/OrdenTrabajo");
const CargaCombustible = require("../models/CargaCombustible");
const Viaje = require("../models/Viaje");
const Preoperacional = require("../models/Preoperacional");
const { rangoDias } = require("../utils/rangoFechas");

/**
 * Servicio de KPIs gerenciales (requerimiento d).
 *
 * Calcula los indicadores del dashboard gerencial:
 *   - costo por km (mantenimiento + combustible / km recorridos)
 *   - disponibilidad de flota (% no en mantenimiento)
 *   - % preventivo vs correctivo
 *   - ranking de vehículos más costosos
 *
 * Todos los métodos aceptan { empresaId, desde, hasta }.
 */

// Los días sueltos ("2026-08-25") se anclan al calendario colombiano para que
// el "hasta" incluya ese día completo (ver utils/rangoFechas.js).
function rangoFechas(desde, hasta) {
  return rangoDias(desde, hasta);
}

function toObjectId(id) {
  return new mongoose.Types.ObjectId(id);
}

/**
 * Costos de mantenimiento (OTs cerradas) por vehículo en el periodo.
 * @returns Map<vehiculoId, { costoTotal, preventivos, correctivos, ordenes }>
 */
async function costosMantenimientoPorVehiculo({ empresaId, desde, hasta }) {
  const match = { estado: "CERRADA", deletedAt: null };
  if (empresaId) match.empresa = toObjectId(empresaId);
  const r = rangoFechas(desde, hasta);
  if (r) match.fechaCierre = r;

  const datos = await OrdenTrabajo.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$vehiculo",
        costoTotal: { $sum: "$costoTotal" },
        costoManoDeObra: { $sum: "$manoDeObra.costo" },
        costoRepuestos: { $sum: "$costoRepuestos" },
        ordenes: { $sum: 1 },
        preventivos: {
          $sum: { $cond: [{ $eq: ["$tipo", "PREVENTIVO"] }, 1, 0] },
        },
        correctivos: {
          $sum: { $cond: [{ $eq: ["$tipo", "CORRECTIVO"] }, 1, 0] },
        },
      },
    },
  ]);

  const mapa = new Map();
  for (const d of datos) {
    mapa.set(d._id.toString(), {
      costoTotal: d.costoTotal,
      costoManoDeObra: d.costoManoDeObra,
      costoRepuestos: d.costoRepuestos,
      ordenes: d.ordenes,
      preventivos: d.preventivos,
      correctivos: d.correctivos,
    });
  }
  return mapa;
}

/**
 * Costos de combustible y km recorridos por vehículo en el periodo.
 * @returns Map<vehiculoId, { costoCombustible, kmRecorridos }>
 */
async function combustibleYKmPorVehiculo({ empresaId, desde, hasta }) {
  // Combustible
  const matchComb = { deletedAt: null };
  if (empresaId) matchComb.empresa = toObjectId(empresaId);
  const rc = rangoFechas(desde, hasta);
  if (rc) matchComb.fecha = rc;

  const combustible = await CargaCombustible.aggregate([
    { $match: matchComb },
    {
      $group: {
        _id: "$vehiculo",
        costoCombustible: { $sum: "$costoTotal" },
        // km recorridos por tramos válidos (rendimientoTramo * galones)
        kmCombustible: {
          $sum: {
            $cond: [
              { $ne: ["$rendimientoTramo", null] },
              { $multiply: ["$rendimientoTramo", "$galones"] },
              0,
            ],
          },
        },
      },
    },
  ]);

  // Km recorridos por viajes finalizados (fuente más confiable si existe)
  const matchViaje = { estado: "FINALIZADO", deletedAt: null };
  if (empresaId) matchViaje.empresa = toObjectId(empresaId);
  const rv = rangoFechas(desde, hasta);
  if (rv) matchViaje.fechaLlegada = rv;

  const viajes = await Viaje.aggregate([
    { $match: matchViaje },
    { $group: { _id: "$vehiculo", kmViajes: { $sum: "$kmRecorrido" } } },
  ]);

  const mapa = new Map();
  for (const c of combustible) {
    mapa.set(c._id.toString(), {
      costoCombustible: c.costoCombustible,
      kmRecorridos: Math.round(c.kmCombustible),
    });
  }
  // Preferir km de viajes cuando exista
  for (const v of viajes) {
    const key = v._id.toString();
    const actual = mapa.get(key) || { costoCombustible: 0, kmRecorridos: 0 };
    if (v.kmViajes > 0) actual.kmRecorridos = v.kmViajes;
    mapa.set(key, actual);
  }
  return mapa;
}

/**
 * Ranking de vehículos por costo total (mantenimiento + combustible) y costo/km.
 */
async function rankingVehiculos(opts = {}) {
  const [mant, comb] = await Promise.all([
    costosMantenimientoPorVehiculo(opts),
    combustibleYKmPorVehiculo(opts),
  ]);

  const filtroVeh = { deletedAt: null };
  if (opts.empresaId) filtroVeh.empresaAfiliadora = toObjectId(opts.empresaId);
  const vehiculos = await Vehiculo.find(filtroVeh)
    .select("placa marca linea estado")
    .lean();

  const ranking = vehiculos.map((v) => {
    const id = v._id.toString();
    const m = mant.get(id) || {
      costoTotal: 0,
      costoManoDeObra: 0,
      costoRepuestos: 0,
      ordenes: 0,
      preventivos: 0,
      correctivos: 0,
    };
    const c = comb.get(id) || { costoCombustible: 0, kmRecorridos: 0 };
    const costoTotal = m.costoTotal + c.costoCombustible;
    const costoPorKm =
      c.kmRecorridos > 0
        ? Math.round((costoTotal / c.kmRecorridos) * 100) / 100
        : null;

    return {
      vehiculo: v._id,
      placa: v.placa,
      marca: v.marca,
      linea: v.linea,
      estado: v.estado,
      costoMantenimiento: m.costoTotal,
      costoManoDeObra: m.costoManoDeObra,
      costoRepuestos: m.costoRepuestos,
      costoCombustible: c.costoCombustible,
      costoTotal,
      kmRecorridos: c.kmRecorridos,
      costoPorKm,
      ordenes: m.ordenes,
      preventivos: m.preventivos,
      correctivos: m.correctivos,
    };
  });

  ranking.sort((a, b) => b.costoTotal - a.costoTotal);
  return ranking;
}

/**
 * KPIs gerenciales consolidados.
 */
async function kpisGerenciales(opts = {}) {
  const ranking = await rankingVehiculos(opts);

  // Disponibilidad de flota
  const filtroVeh = { deletedAt: null };
  if (opts.empresaId) filtroVeh.empresaAfiliadora = toObjectId(opts.empresaId);
  const [totalFlota, enMantenimiento] = await Promise.all([
    Vehiculo.countDocuments(filtroVeh),
    Vehiculo.countDocuments({ ...filtroVeh, estado: "MANTENIMIENTO" }),
  ]);
  const disponibles = totalFlota - enMantenimiento;
  const disponibilidad =
    totalFlota > 0 ? Math.round((disponibles / totalFlota) * 1000) / 10 : null;

  // % preventivo vs correctivo (sumado sobre el ranking)
  const totalPreventivos = ranking.reduce((s, v) => s + v.preventivos, 0);
  const totalCorrectivos = ranking.reduce((s, v) => s + v.correctivos, 0);
  const totalOTs = totalPreventivos + totalCorrectivos;
  const pctPreventivo =
    totalOTs > 0 ? Math.round((totalPreventivos / totalOTs) * 1000) / 10 : null;

  // Costo total y costo por km global
  const costoTotalFlota = ranking.reduce((s, v) => s + v.costoTotal, 0);
  const kmTotalFlota = ranking.reduce((s, v) => s + v.kmRecorridos, 0);
  const costoPorKmGlobal =
    kmTotalFlota > 0
      ? Math.round((costoTotalFlota / kmTotalFlota) * 100) / 100
      : null;

  return {
    flota: {
      total: totalFlota,
      disponibles,
      enMantenimiento,
      disponibilidad, // %
    },
    mantenimiento: {
      preventivos: totalPreventivos,
      correctivos: totalCorrectivos,
      totalOrdenes: totalOTs,
      pctPreventivo, // %
      pctCorrectivo: pctPreventivo != null ? Math.round((100 - pctPreventivo) * 10) / 10 : null,
    },
    costos: {
      costoTotalFlota,
      kmTotalFlota,
      costoPorKmGlobal, // $/km
    },
    rankingVehiculos: ranking,
  };
}

module.exports = {
  kpisGerenciales,
  rankingVehiculos,
  costosMantenimientoPorVehiculo,
  combustibleYKmPorVehiculo,
};
