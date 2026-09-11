const mongoose = require("mongoose");
const Vehiculo = require("../models/Vehiculo");
const OrdenTrabajo = require("../models/OrdenTrabajo");
const CargaCombustible = require("../models/CargaCombustible");
const Viaje = require("../models/Viaje");
const Preoperacional = require("../models/Preoperacional");
const Multa = require("../models/Multa");
const KilometrajeDiario = require("../models/KilometrajeDiario");
const { rangoDias } = require("../utils/rangoFechas");

/**
 * Fuente del kilometraje con que se calcula el costo por km:
 *   - VIAJES   (default): km recorridos de los viajes FINALIZADOS del periodo
 *                (si un vehículo no tiene viajes, se estima por combustible).
 *   - ODOMETRO: recorrido REAL según los snapshots diarios del odómetro
 *                (KilometrajeDiario); cubre lo que el vehículo se mueve por
 *                fuera de los viajes registrados.
 */
function normalizarFuenteKm(valor) {
  return String(valor || "VIAJES").toUpperCase() === "ODOMETRO"
    ? "ODOMETRO"
    : "VIAJES";
}

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
 * Km recorridos REALES por vehículo según el odómetro: suma de los incrementos
 * positivos entre snapshots diarios consecutivos dentro del rango (misma regla
 * que el análisis por vehículo y /telemetria/recorrido-flota). Los días se
 * comparan como texto "YYYY-MM-DD" (así los guarda el worker).
 * @returns Map<vehiculoId, kmOdometro>
 */
async function kmOdometroPorVehiculo({ empresaId, desde, hasta }) {
  const match = {};
  const d = desde ? String(desde).slice(0, 10) : null;
  const h = hasta ? String(hasta).slice(0, 10) : null;
  if (d || h) {
    match.fecha = {};
    if (d) match.fecha.$gte = d;
    if (h) match.fecha.$lte = h;
  }
  if (empresaId) {
    const ids = await Vehiculo.find({
      empresaAfiliadora: toObjectId(empresaId),
      deletedAt: null,
    })
      .select("_id")
      .lean();
    match.vehiculo = { $in: ids.map((v) => v._id) };
  }

  const snapshots = await KilometrajeDiario.find(match)
    .sort({ vehiculo: 1, fecha: 1 })
    .select("vehiculo fecha kilometraje")
    .lean();

  const mapa = new Map();
  let vehiculoPrev = null;
  let kmPrev = null;
  for (const s of snapshots) {
    const key = String(s.vehiculo);
    if (key !== vehiculoPrev) {
      vehiculoPrev = key;
      kmPrev = s.kilometraje;
      if (!mapa.has(key)) mapa.set(key, 0);
      continue;
    }
    const delta = s.kilometraje - kmPrev;
    if (delta > 0) mapa.set(key, mapa.get(key) + delta);
    kmPrev = s.kilometraje;
  }
  for (const [key, km] of mapa) mapa.set(key, Math.round(km));
  return mapa;
}

/**
 * Costos de combustible y km recorridos por vehículo en el periodo.
 * `kmRecorridos` sale de la fuente elegida (ver normalizarFuenteKm); se
 * devuelven además `kmViajes` y `kmOdometro` para poder compararlos.
 * @returns Map<vehiculoId, { costoCombustible, kmRecorridos, kmViajes, kmOdometro }>
 */
async function combustibleYKmPorVehiculo({ empresaId, desde, hasta, fuenteKm }) {
  const fuente = normalizarFuenteKm(fuenteKm);
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

  const [viajes, odometro] = await Promise.all([
    Viaje.aggregate([
      { $match: matchViaje },
      { $group: { _id: "$vehiculo", kmViajes: { $sum: "$kmRecorrido" } } },
    ]),
    kmOdometroPorVehiculo({ empresaId, desde, hasta }),
  ]);

  const mapa = new Map();
  const entrada = (key) => {
    if (!mapa.has(key)) {
      mapa.set(key, {
        costoCombustible: 0,
        kmCombustible: 0,
        kmViajes: 0,
        kmOdometro: 0,
        kmRecorridos: 0,
      });
    }
    return mapa.get(key);
  };
  for (const c of combustible) {
    const e = entrada(c._id.toString());
    e.costoCombustible = c.costoCombustible;
    e.kmCombustible = Math.round(c.kmCombustible);
  }
  for (const v of viajes) entrada(v._id.toString()).kmViajes = v.kmViajes || 0;
  for (const [key, km] of odometro) entrada(key).kmOdometro = km;

  for (const e of mapa.values()) {
    if (fuente === "ODOMETRO") {
      e.kmRecorridos = e.kmOdometro;
    } else {
      // Preferir km de viajes cuando exista; si no, la estimación por combustible
      e.kmRecorridos = e.kmViajes > 0 ? e.kmViajes : e.kmCombustible;
    }
    delete e.kmCombustible;
  }
  return mapa;
}

/**
 * Multas por vehículo en el periodo (por fecha de la infracción). Se excluyen
 * las anuladas. costoMultas = valor + grúa + patios.
 * @returns Map<vehiculoId, { costoMultas, multas, inmovilizaciones }>
 */
async function multasPorVehiculo({ empresaId, desde, hasta }) {
  const match = { deletedAt: null, estado: { $ne: "ANULADA" } };
  if (empresaId) match.empresa = toObjectId(empresaId);
  const r = rangoFechas(desde, hasta);
  if (r) match.fecha = r;

  const datos = await Multa.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$vehiculo",
        costoMultas: { $sum: "$costoTotal" },
        valorMultas: { $sum: "$valor" },
        multas: { $sum: 1 },
        inmovilizaciones: {
          $sum: { $cond: ["$inmovilizacion.aplica", 1, 0] },
        },
      },
    },
  ]);

  const mapa = new Map();
  for (const d of datos) {
    mapa.set(d._id.toString(), {
      costoMultas: d.costoMultas,
      valorMultas: d.valorMultas,
      multas: d.multas,
      inmovilizaciones: d.inmovilizaciones,
    });
  }
  return mapa;
}

/**
 * Ranking de vehículos por costo total (mantenimiento + combustible + multas)
 * y costo/km.
 */
async function rankingVehiculos(opts = {}) {
  const [mant, comb, mul] = await Promise.all([
    costosMantenimientoPorVehiculo(opts),
    combustibleYKmPorVehiculo(opts),
    multasPorVehiculo(opts),
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
    const c = comb.get(id) || {
      costoCombustible: 0,
      kmRecorridos: 0,
      kmViajes: 0,
      kmOdometro: 0,
    };
    const u = mul.get(id) || {
      costoMultas: 0,
      valorMultas: 0,
      multas: 0,
      inmovilizaciones: 0,
    };
    const costoTotal = m.costoTotal + c.costoCombustible + u.costoMultas;
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
      costoMultas: u.costoMultas,
      multas: u.multas,
      inmovilizaciones: u.inmovilizaciones,
      costoTotal,
      kmRecorridos: c.kmRecorridos, // según la fuente elegida
      kmViajes: c.kmViajes,
      kmOdometro: c.kmOdometro,
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
  const [totalFlota, enMantenimiento, inmovilizados] = await Promise.all([
    Vehiculo.countDocuments(filtroVeh),
    Vehiculo.countDocuments({ ...filtroVeh, estado: "MANTENIMIENTO" }),
    Vehiculo.countDocuments({ ...filtroVeh, estado: "INMOVILIZADO" }),
  ]);
  // Un vehículo inmovilizado por la autoridad tampoco está disponible
  const disponibles = totalFlota - enMantenimiento - inmovilizados;
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
  const costoMantenimientoFlota = ranking.reduce((s, v) => s + v.costoMantenimiento, 0);
  const costoCombustibleFlota = ranking.reduce((s, v) => s + v.costoCombustible, 0);
  const costoMultasFlota = ranking.reduce((s, v) => s + v.costoMultas, 0);
  const kmTotalFlota = ranking.reduce((s, v) => s + v.kmRecorridos, 0);
  const kmViajesFlota = ranking.reduce((s, v) => s + v.kmViajes, 0);
  const kmOdometroFlota = ranking.reduce((s, v) => s + v.kmOdometro, 0);
  const costoPorKmGlobal =
    kmTotalFlota > 0
      ? Math.round((costoTotalFlota / kmTotalFlota) * 100) / 100
      : null;

  // Multas del periodo (conteo por estado) para el tablero
  const matchMultas = { deletedAt: null };
  if (opts.empresaId) matchMultas.empresa = toObjectId(opts.empresaId);
  const rm = rangoFechas(opts.desde, opts.hasta);
  if (rm) matchMultas.fecha = rm;
  const multasEstado = await Multa.aggregate([
    { $match: matchMultas },
    { $group: { _id: "$estado", cantidad: { $sum: 1 }, valor: { $sum: "$valor" } } },
  ]);
  const me = Object.fromEntries(multasEstado.map((x) => [x._id, x]));
  const totalMultas = ranking.reduce((s, v) => s + v.multas, 0);
  const totalInmovilizaciones = ranking.reduce((s, v) => s + v.inmovilizaciones, 0);

  return {
    fuenteKm: normalizarFuenteKm(opts.fuenteKm),
    flota: {
      total: totalFlota,
      disponibles,
      enMantenimiento,
      inmovilizados,
      disponibilidad, // %
    },
    multas: {
      total: totalMultas, // sin anuladas
      pendientes: me.PENDIENTE?.cantidad || 0,
      impugnadas: me.IMPUGNADA?.cantidad || 0,
      pagadas: me.PAGADA?.cantidad || 0,
      anuladas: me.ANULADA?.cantidad || 0,
      valorPorPagar: (me.PENDIENTE?.valor || 0) + (me.IMPUGNADA?.valor || 0),
      costoTotal: costoMultasFlota, // valor + grúa + patios
      inmovilizaciones: totalInmovilizaciones,
      vehiculosInmovilizados: inmovilizados,
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
      costoMantenimientoFlota,
      costoCombustibleFlota,
      costoMultasFlota,
      kmTotalFlota, // según fuenteKm
      kmViajesFlota,
      kmOdometroFlota,
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
  kmOdometroPorVehiculo,
  multasPorVehiculo,
  normalizarFuenteKm,
};
