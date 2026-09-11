const Viaje = require("../models/Viaje");
const CargaCombustible = require("../models/CargaCombustible");
const Vehiculo = require("../models/Vehiculo");
const Tercero = require("../models/Tercero");
const Ruta = require("../models/Ruta");
const combustibleService = require("../services/combustibleService");
const {
  tieneAccesoVehiculo,
  getVehiculoScope,
} = require("../services/vehiculoAccessService");
const { KM_MAXIMO_PLAUSIBLE } = require("../services/kilometrajeService");
const logger = require("../config/logger");

// Roles de gestión (admin de plataforma o de la empresa): los únicos que pueden
// corregir un viaje ya finalizado. El conductor edita su bitácora solo mientras
// el viaje está abierto.
function esGestion(req) {
  const roles = (req.user.roles || []).map((r) =>
    r.replace("ROLE_", "").toUpperCase(),
  );
  return roles.some((r) => ["ADMIN", "SUPER_ADMIN", "CLIENTE_ADMIN"].includes(r));
}

// Campos que acepta PUT /viajes/:id según el estado. Los datos de ejecución
// (salida, llegada, km fin) solo existen desde que el viaje arranca o termina;
// aceptarlos antes dejaría, p. ej., un viaje PROGRAMADO con km recorrido.
const CAMPOS_VIAJE_BASE = [
  "conductor",
  "ruta",
  "origen",
  "destino",
  "fechaProgramada",
  "kmInicio",
  "carga",
  "entregas",
  "incidencias",
  "observaciones",
];
const CAMPOS_VIAJE_POR_ESTADO = {
  PROGRAMADO: CAMPOS_VIAJE_BASE,
  EN_CURSO: [...CAMPOS_VIAJE_BASE, "fechaSalida"],
  FINALIZADO: [...CAMPOS_VIAJE_BASE, "fechaSalida", "fechaLlegada", "kmFin"],
  // CANCELADO: no se edita
};

const fmtFechaHoraCo = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  dateStyle: "short",
  timeStyle: "short",
});
// Fechas "solo día" (fecha programada): el front las envía como "YYYY-MM-DD" y
// quedan guardadas como medianoche UTC, así que se muestran por su día UTC
// (en hora Bogotá saldrían un día antes).
const fmtFechaCo = new Intl.DateTimeFormat("es-CO", {
  timeZone: "UTC",
  dateStyle: "short",
});
function fechaTexto(valor, conHora) {
  if (!valor) return "—";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return String(valor);
  return conHora ? fmtFechaHoraCo.format(d) : fmtFechaCo.format(d);
}
function nombreTercero(t) {
  if (!t) return "—";
  const nombre = [t.nombres, t.apellidos].filter(Boolean).join(" ") || String(t._id);
  return t.identificacion ? `${nombre} (${t.identificacion})` : nombre;
}

/**
 * Tras corregir el km final de un viaje FINALIZADO deja coherente el odómetro
 * del vehículo (al finalizar se había fijado en kmFin como fuente MANUAL):
 *  - si el nuevo km fin supera el odómetro, lo adelanta (igual que al finalizar);
 *  - si el odómetro había quedado fijado por el km fin anterior de ESTE viaje
 *    (mismo valor y fuente MANUAL) y el nuevo es menor, lo baja: así una
 *    corrección de digitación no deja un kilometraje inflado que dispare
 *    mantenimientos absurdos.
 * @returns {{anterior:number|null, nuevo:number}|null} ajuste aplicado
 */
async function ajustarOdometroTrasCorreccion(viaje, kmFinAnterior) {
  const vehiculoId = viaje.vehiculo?._id || viaje.vehiculo;
  const vehiculo = await Vehiculo.findById(vehiculoId).select(
    "placa kilometrajeActual fuenteKilometraje",
  );
  if (!vehiculo || viaje.kmFin == null) return null;

  const actual = vehiculo.kilometrajeActual;
  let nuevo = null;
  if (typeof actual === "number" && viaje.kmFin > actual) {
    nuevo = viaje.kmFin;
  } else if (
    typeof actual === "number" &&
    kmFinAnterior != null &&
    actual === kmFinAnterior &&
    vehiculo.fuenteKilometraje === "MANUAL" &&
    viaje.kmFin < actual
  ) {
    nuevo = viaje.kmFin;
  }
  if (nuevo == null) return null;

  await Vehiculo.updateOne(
    { _id: vehiculo._id },
    {
      $set: {
        kilometrajeActual: nuevo,
        ultimaActualizacionKm: new Date(),
        fuenteKilometraje: "MANUAL",
      },
    },
  );
  logger.info(
    `Odómetro de ${vehiculo.placa} ajustado de ${actual} a ${nuevo} km por corrección del viaje ${viaje.numero}`,
  );
  return { anterior: actual, nuevo };
}

function esAdmin(req) {
  return (req.user.roles || []).some((r) =>
    ["ROLE_ADMIN", "ROLE_SUPER_ADMIN", "ADMIN", "SUPER_ADMIN"].includes(r),
  );
}

// Roles con visibilidad amplia (empresa) sobre tanqueos. El "cliente final"
// (CLIENTE/USER/PROPIETARIO) queda fuera y solo ve los de sus propios vehículos.
function tieneLecturaAmplia(req) {
  const roles = (req.user.roles || []).map((r) =>
    r.replace("ROLE_", "").toUpperCase(),
  );
  return roles.some((r) =>
    ["ADMIN", "SUPER_ADMIN", "CLIENTE_ADMIN", "AUDITOR", "CONDUCTOR"].includes(r),
  );
}

function scopeEmpresa(req, filtro = {}) {
  if (!esAdmin(req) && req.user.empresaId) {
    filtro.empresa = req.user.empresaId;
  }
  return filtro;
}

function registrarHistorial(viaje, req, accion, detalle = "") {
  viaje.historial.push({ usuario: req.user.username, accion, detalle });
}

/**
 * Evalúa sobrecarga comparando el peso de carga contra el tope del vehículo.
 * Usa pesoMaximoKg si existe, si no capacidadCargaKg.
 */
function evaluarSobrecarga(carga, vehiculo) {
  if (!carga) return carga;
  const tope = vehiculo?.pesoMaximoKg || vehiculo?.capacidadCargaKg || null;
  // Sin peso no hay sobrecarga: así al quitar el peso en una edición no queda
  // la bandera vieja encendida.
  if (carga.pesoKg != null && tope && carga.pesoKg > tope) {
    carga.sobrecarga = true;
    carga.excesoKg = carga.pesoKg - tope;
  } else {
    carga.sobrecarga = false;
    carga.excesoKg = 0;
  }
  return carga;
}

// ═══════════════════ VIAJES (asignación + bitácora) ═══════════════════

exports.crearViaje = async (req, res) => {
  try {
    const vehiculo = await Vehiculo.findOne({
      _id: req.body.vehiculo,
      deletedAt: null,
    });
    if (!vehiculo)
      return res
        .status(404)
        .json({ success: false, message: "Vehículo no encontrado" });

    // Retenido por la autoridad (multa con inmovilización vigente): no se
    // programan viajes hasta que se levante la inmovilización.
    if (vehiculo.estado === "INMOVILIZADO") {
      return res.status(409).json({
        success: false,
        code: "VEHICULO_INMOVILIZADO",
        message:
          "El vehículo está inmovilizado por una multa y no puede ser asignado a viajes hasta levantar la inmovilización.",
      });
    }

    const viaje = new Viaje({
      ...req.body,
      placa: vehiculo.placa,
      empresa: vehiculo.empresaAfiliadora || null,
      creadoPor: req.user.username,
    });

    if (viaje.carga) evaluarSobrecarga(viaje.carga, vehiculo);
    registrarHistorial(viaje, req, "CREADO");

    await viaje.save();
    res.status(201).json({
      success: true,
      data: viaje,
      alertaSobrecarga: viaje.carga?.sobrecarga || false,
    });
  } catch (error) {
    logger.error(`Error creando viaje: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listarViajes = async (req, res) => {
  try {
    const { estado, vehiculo, conductor, desde, hasta, page = 1, limit = 25 } =
      req.query;

    const filtro = scopeEmpresa(req, { deletedAt: null });
    if (estado) filtro.estado = estado;
    if (vehiculo) filtro.vehiculo = vehiculo;
    if (conductor) filtro.conductor = conductor;
    if (desde || hasta) {
      filtro.fechaProgramada = {};
      if (desde) filtro.fechaProgramada.$gte = new Date(desde);
      if (hasta) filtro.fechaProgramada.$lte = new Date(hasta);
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const [viajes, total] = await Promise.all([
      Viaje.find(filtro)
        .populate("vehiculo", "placa")
        .populate("conductor", "nombres apellidos")
        .populate("ruta", "nombre origen destino")
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Viaje.countDocuments(filtro),
    ]);

    res.json({
      success: true,
      data: viajes,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    logger.error(`Error listando viajes: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.obtenerViaje = async (req, res) => {
  try {
    const viaje = await Viaje.findOne(
      scopeEmpresa(req, { _id: req.params.id, deletedAt: null }),
    )
      .populate("vehiculo", "placa marca linea pesoMaximoKg capacidadCargaKg")
      .populate("conductor", "nombres apellidos identificacion")
      .populate("ruta", "nombre origen destino distanciaKm")
      .lean();

    if (!viaje)
      return res
        .status(404)
        .json({ success: false, message: "Viaje no encontrado" });

    res.json({ success: true, data: viaje });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.actualizarViaje = async (req, res) => {
  try {
    const viaje = await Viaje.findOne(
      scopeEmpresa(req, { _id: req.params.id, deletedAt: null }),
    ).populate("vehiculo", "pesoMaximoKg capacidadCargaKg");
    if (!viaje)
      return res
        .status(404)
        .json({ success: false, message: "Viaje no encontrado" });

    const editables = CAMPOS_VIAJE_POR_ESTADO[viaje.estado];
    if (!editables) {
      return res.status(400).json({
        success: false,
        message: `No se puede modificar un viaje ${viaje.estado}`,
      });
    }

    // Un viaje cerrado es un registro de la bitácora (alimenta KPIs y el
    // odómetro del vehículo): solo lo corrige la gestión, no el conductor.
    if (viaje.estado === "FINALIZADO" && !esGestion(req)) {
      return res.status(403).json({
        success: false,
        message: "Solo un administrador puede corregir un viaje finalizado",
      });
    }

    const noPermitidos = Object.keys(req.body).filter(
      (c) => !editables.includes(c),
    );
    if (noPermitidos.length) {
      return res.status(400).json({
        success: false,
        message: `Los campos ${noPermitidos.join(", ")} no se pueden modificar en un viaje ${viaje.estado}`,
      });
    }

    // Valores resultantes: lo que llega en el body pisa lo guardado
    const resultante = (campo) =>
      req.body[campo] !== undefined ? req.body[campo] : viaje[campo];
    const kmInicio = resultante("kmInicio");
    const kmFin = resultante("kmFin");
    const fechaSalida = resultante("fechaSalida");
    const fechaLlegada = resultante("fechaLlegada");

    for (const [etiqueta, valor] of [
      ["kilometraje inicial", kmInicio],
      ["kilometraje final", kmFin],
    ]) {
      if (valor != null && valor > KM_MAXIMO_PLAUSIBLE) {
        return res.status(400).json({
          success: false,
          message: `El ${etiqueta} (${valor}) supera el máximo razonable (${KM_MAXIMO_PLAUSIBLE.toLocaleString("es-CO")} km). Revise la digitación.`,
        });
      }
    }
    if (viaje.estado === "FINALIZADO") {
      if (kmFin == null) {
        return res.status(400).json({
          success: false,
          message: "Un viaje finalizado debe conservar el kilometraje final",
        });
      }
      if (!fechaSalida || !fechaLlegada) {
        return res.status(400).json({
          success: false,
          message:
            "Un viaje finalizado debe conservar las fechas de salida y de llegada",
        });
      }
    }
    if (kmInicio != null && kmFin != null && kmFin < kmInicio) {
      return res.status(400).json({
        success: false,
        message: `El kilometraje final (${kmFin}) no puede ser menor al inicial (${kmInicio})`,
      });
    }
    if (
      fechaSalida &&
      fechaLlegada &&
      new Date(fechaLlegada) < new Date(fechaSalida)
    ) {
      return res.status(400).json({
        success: false,
        message: "La fecha de llegada no puede ser anterior a la fecha de salida",
      });
    }

    // Conductor: debe existir y no estar en papelera
    let conductorNuevo = null;
    let conductorAnterior = null;
    const cambiaConductor =
      req.body.conductor !== undefined &&
      String(req.body.conductor) !== String(viaje.conductor);
    if (cambiaConductor) {
      [conductorNuevo, conductorAnterior] = await Promise.all([
        Tercero.findOne({ _id: req.body.conductor, deletedAt: null }).select(
          "nombres apellidos identificacion",
        ),
        Tercero.findById(viaje.conductor).select(
          "nombres apellidos identificacion",
        ),
      ]);
      if (!conductorNuevo) {
        return res
          .status(404)
          .json({ success: false, message: "Conductor no encontrado" });
      }
    }

    // Trazabilidad: qué cambió (antes → después) queda en el historial
    const kmFinAnterior = viaje.kmFin;
    const cambios = [];
    const distinto = (a, b) => String(a ?? "") !== String(b ?? "");
    const distintaFecha = (a, b) =>
      (a ? new Date(a).getTime() : null) !== (b ? new Date(b).getTime() : null);

    if (cambiaConductor) {
      cambios.push(
        `conductor: ${nombreTercero(conductorAnterior)} → ${nombreTercero(conductorNuevo)}`,
      );
    }
    for (const campo of ["origen", "destino", "observaciones"]) {
      if (req.body[campo] !== undefined && distinto(viaje[campo], req.body[campo]))
        cambios.push(`${campo}: ${viaje[campo] || "—"} → ${req.body[campo] || "—"}`);
    }
    if (req.body.ruta !== undefined && distinto(viaje.ruta, req.body.ruta)) {
      const ids = [viaje.ruta, req.body.ruta].filter(Boolean);
      const rutas = ids.length
        ? await Ruta.find({ _id: { $in: ids } }).select("nombre").lean()
        : [];
      const nombreRuta = (id) =>
        id
          ? rutas.find((r) => String(r._id) === String(id))?.nombre || String(id)
          : "sin ruta";
      cambios.push(`ruta: ${nombreRuta(viaje.ruta)} → ${nombreRuta(req.body.ruta)}`);
    }
    for (const campo of ["kmInicio", "kmFin"]) {
      if (req.body[campo] !== undefined && distinto(viaje[campo], req.body[campo]))
        cambios.push(`${campo}: ${viaje[campo] ?? "—"} → ${req.body[campo] ?? "—"}`);
    }
    if (
      req.body.fechaProgramada !== undefined &&
      distintaFecha(viaje.fechaProgramada, req.body.fechaProgramada)
    )
      cambios.push(
        `fecha programada: ${fechaTexto(viaje.fechaProgramada)} → ${fechaTexto(req.body.fechaProgramada)}`,
      );
    for (const [campo, etiqueta] of [
      ["fechaSalida", "salida"],
      ["fechaLlegada", "llegada"],
    ]) {
      if (req.body[campo] !== undefined && distintaFecha(viaje[campo], req.body[campo]))
        cambios.push(
          `${etiqueta}: ${fechaTexto(viaje[campo], true)} → ${fechaTexto(req.body[campo], true)}`,
        );
    }
    if (req.body.carga !== undefined) {
      const antes = viaje.carga?.pesoKg ?? null;
      const despues = req.body.carga?.pesoKg ?? null;
      if (distinto(antes, despues)) cambios.push(`carga: ${antes ?? "—"} kg → ${despues ?? "—"} kg`);
      else if (distinto(viaje.carga?.descripcion, req.body.carga?.descripcion))
        cambios.push("descripción de carga actualizada");
    }
    if (req.body.entregas !== undefined) cambios.push("entregas actualizadas");
    if (req.body.incidencias !== undefined) cambios.push("incidencias actualizadas");

    editables.forEach((campo) => {
      if (req.body[campo] !== undefined) viaje[campo] = req.body[campo];
    });

    if (req.body.carga) evaluarSobrecarga(viaje.carga, viaje.vehiculo);
    registrarHistorial(
      viaje,
      req,
      viaje.estado === "FINALIZADO" ? "CORREGIDO" : "ACTUALIZADO",
      cambios.length ? cambios.join("; ") : "Sin cambios en los datos",
    );

    await viaje.save(); // pre-save recalcula kmRecorrido y duración

    // El cierre había fijado el odómetro del vehículo en el km fin: si se corrige,
    // el odómetro debe seguirlo (ver ajustarOdometroTrasCorreccion).
    let odometro = null;
    if (
      viaje.estado === "FINALIZADO" &&
      req.body.kmFin !== undefined &&
      viaje.kmFin !== kmFinAnterior
    ) {
      odometro = await ajustarOdometroTrasCorreccion(viaje, kmFinAnterior);
    }

    res.json({
      success: true,
      data: viaje,
      alertaSobrecarga: viaje.carga?.sobrecarga || false,
      odometro,
    });
  } catch (error) {
    logger.error(`Error actualizando viaje: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.iniciarViaje = async (req, res) => {
  try {
    const viaje = await Viaje.findOne({ _id: req.params.id, deletedAt: null });
    if (!viaje)
      return res
        .status(404)
        .json({ success: false, message: "Viaje no encontrado" });

    if (viaje.estado !== "PROGRAMADO") {
      return res.status(400).json({
        success: false,
        message: `No se puede iniciar un viaje ${viaje.estado}`,
      });
    }

    if (req.body.kmInicio != null && req.body.kmInicio > KM_MAXIMO_PLAUSIBLE) {
      return res.status(400).json({
        success: false,
        message: `El kilometraje inicial (${req.body.kmInicio}) supera el máximo razonable (${KM_MAXIMO_PLAUSIBLE.toLocaleString("es-CO")} km). Revise la digitación.`,
      });
    }

    if (req.body.kmInicio != null) viaje.kmInicio = req.body.kmInicio;
    viaje.estado = "EN_CURSO";
    viaje.fechaSalida = req.body.fechaSalida || new Date();
    registrarHistorial(viaje, req, "INICIADO", `Km inicio: ${viaje.kmInicio}`);

    await viaje.save();
    res.json({ success: true, data: viaje });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.finalizarViaje = async (req, res) => {
  try {
    const viaje = await Viaje.findOne({ _id: req.params.id, deletedAt: null });
    if (!viaje)
      return res
        .status(404)
        .json({ success: false, message: "Viaje no encontrado" });

    if (viaje.estado !== "EN_CURSO") {
      return res.status(400).json({
        success: false,
        message: `Solo se puede finalizar un viaje EN_CURSO (actual: ${viaje.estado})`,
      });
    }

    if (req.body.kmFin == null) {
      return res.status(400).json({
        success: false,
        message: "Debe indicar el kilometraje final del viaje",
      });
    }

    // Un km imposible (p. ej. un cero de más) inflaría el odómetro del vehículo
    // y dispararía mantenimientos absurdos: se rechaza en el cierre, no después.
    if (req.body.kmFin > KM_MAXIMO_PLAUSIBLE) {
      return res.status(400).json({
        success: false,
        message: `El kilometraje final (${req.body.kmFin}) supera el máximo razonable (${KM_MAXIMO_PLAUSIBLE.toLocaleString("es-CO")} km). Revise la digitación.`,
      });
    }

    // El km final no puede ser menor al inicial (evita errores de digitación que
    // antes registraban un recorrido de 0 km en silencio).
    if (viaje.kmInicio != null && req.body.kmFin < viaje.kmInicio) {
      return res.status(400).json({
        success: false,
        message: `El kilometraje final (${req.body.kmFin}) no puede ser menor al inicial (${viaje.kmInicio})`,
      });
    }

    viaje.kmFin = req.body.kmFin;
    viaje.fechaLlegada = req.body.fechaLlegada || new Date();
    viaje.estado = "FINALIZADO";
    if (req.body.observaciones) viaje.observaciones = req.body.observaciones;
    if (req.body.entregas) viaje.entregas = req.body.entregas;
    registrarHistorial(
      viaje,
      req,
      "FINALIZADO",
      `Km fin: ${viaje.kmFin} (recorrido pendiente de cálculo)`,
    );

    await viaje.save(); // pre-save calcula kmRecorrido y duración

    // Actualizar km del vehículo como fuente MANUAL (el viaje confirma el odómetro)
    await Vehiculo.updateOne(
      { _id: viaje.vehiculo, kilometrajeActual: { $lt: viaje.kmFin } },
      {
        $set: {
          kilometrajeActual: viaje.kmFin,
          ultimaActualizacionKm: new Date(),
          fuenteKilometraje: "MANUAL",
        },
      },
    );

    res.json({ success: true, data: viaje });
  } catch (error) {
    logger.error(`Error finalizando viaje: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.cancelarViaje = async (req, res) => {
  try {
    const viaje = await Viaje.findOne(
      scopeEmpresa(req, { _id: req.params.id, deletedAt: null }),
    );
    if (!viaje)
      return res
        .status(404)
        .json({ success: false, message: "Viaje no encontrado" });

    if (viaje.estado === "FINALIZADO") {
      return res.status(400).json({
        success: false,
        message: "No se puede cancelar un viaje finalizado",
      });
    }

    viaje.estado = "CANCELADO";
    registrarHistorial(viaje, req, "CANCELADO", req.body.motivo || "");
    await viaje.save();
    res.json({ success: true, data: viaje });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ═══════════════════ COMBUSTIBLE ═══════════════════

exports.registrarTanqueo = async (req, res) => {
  try {
    const vehiculo = await Vehiculo.findOne({
      _id: req.body.vehiculo,
      deletedAt: null,
    });
    if (!vehiculo)
      return res
        .status(404)
        .json({ success: false, message: "Vehículo no encontrado" });

    // El cliente final / conductor solo puede registrar tanqueos de sus propios
    // vehículos. Admin y cliente_admin pasan por su alcance natural (todos / empresa).
    const acceso = await tieneAccesoVehiculo(req, vehiculo._id);
    if (!acceso)
      return res.status(403).json({
        success: false,
        message: "No tiene permiso para registrar tanqueos de este vehículo",
      });

    const carga = new CargaCombustible({
      ...req.body,
      placa: vehiculo.placa,
      empresa: vehiculo.empresaAfiliadora || null,
      registradoPor: req.user.username,
    });
    await carga.save();

    // Recalcular rendimiento de la serie del vehículo
    await combustibleService.recalcularRendimiento(vehiculo._id);

    const actualizado = await CargaCombustible.findById(carga._id).lean();
    res.status(201).json({ success: true, data: actualizado });
  } catch (error) {
    logger.error(`Error registrando tanqueo: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listarTanqueos = async (req, res) => {
  try {
    const {
      vehiculo,
      desde,
      hasta,
      page = 1,
      limit = 50,
      onlyDeleted,
      soloEliminadas,
    } = req.query;

    // Papelera: ver solo tanqueos eliminados (exclusivo del admin de plataforma).
    const verEliminadas =
      esAdmin(req) &&
      (onlyDeleted === "true" || soloEliminadas === "true");

    const filtro = scopeEmpresa(req, {});
    filtro.deletedAt = verEliminadas ? { $ne: null } : null;
    if (vehiculo) filtro.vehiculo = vehiculo;
    if (desde || hasta) {
      filtro.fecha = {};
      if (desde) filtro.fecha.$gte = new Date(desde);
      if (hasta) filtro.fecha.$lte = new Date(hasta);
    }

    // El cliente final solo ve tanqueos de sus propios vehículos. La propiedad del
    // vehículo es el guard real; quitamos el filtro de empresa porque empresaId puede
    // no ser un Empresa real (en algunos terceros cae al _id del propio tercero) y
    // dejaría fuera sus propios registros (cuya empresa es la afiliadora del vehículo).
    if (!tieneLecturaAmplia(req)) {
      delete filtro.empresa;
      if (vehiculo) {
        const ok = await tieneAccesoVehiculo(req, vehiculo);
        if (!ok)
          return res.json({ success: true, data: [], total: 0, page: 1, pages: 0 });
      } else {
        const scope = await getVehiculoScope(req);
        if (scope._id === null)
          return res.json({ success: true, data: [], total: 0, page: 1, pages: 0 });
        if (scope._id) filtro.vehiculo = scope._id;
      }
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));

    const [tanqueos, total] = await Promise.all([
      CargaCombustible.find(filtro)
        .populate("vehiculo", "placa")
        .populate("conductor", "nombres apellidos")
        .sort({ fecha: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      CargaCombustible.countDocuments(filtro),
    ]);

    res.json({
      success: true,
      data: tanqueos,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    logger.error(`Error listando tanqueos: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.actualizarTanqueo = async (req, res) => {
  try {
    const carga = await CargaCombustible.findOne(
      scopeEmpresa(req, { _id: req.params.id, deletedAt: null }),
    );
    if (!carga)
      return res
        .status(404)
        .json({ success: false, message: "Tanqueo no encontrado" });

    const editables = [
      "conductor",
      "viaje",
      "fecha",
      "kmTanqueo",
      "galones",
      "costoTotal",
      "costoPorGalon",
      "tipoCombustible",
      "estacion",
      "tanqueLleno",
    ];
    editables.forEach((campo) => {
      if (req.body[campo] !== undefined) carga[campo] = req.body[campo];
    });
    await carga.save();

    // Recalcular rendimiento de la serie del vehículo (km/galón depende del tramo)
    await combustibleService.recalcularRendimiento(carga.vehiculo);

    const actualizado = await CargaCombustible.findById(carga._id)
      .populate("vehiculo", "placa")
      .populate("conductor", "nombres apellidos")
      .lean();
    res.json({ success: true, data: actualizado });
  } catch (error) {
    logger.error(`Error actualizando tanqueo: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.eliminarTanqueo = async (req, res) => {
  try {
    const carga = await CargaCombustible.findOne(
      scopeEmpresa(req, { _id: req.params.id, deletedAt: null }),
    );
    if (!carga)
      return res
        .status(404)
        .json({ success: false, message: "Tanqueo no encontrado" });

    await carga.softDelete(req.user.userId);
    // Al quitar un tanqueo de la serie cambian los tramos tanque-a-tanque del vehículo.
    await combustibleService.recalcularRendimiento(carga.vehiculo);
    res.json({ success: true, message: "Tanqueo eliminado" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/operacion/combustible/:id/restore
 * Restaura un tanqueo de la papelera (solo admin). Recalcula el rendimiento de la
 * serie porque reaparece un tramo entre tanqueos.
 */
exports.restaurarTanqueo = async (req, res) => {
  try {
    const carga = await CargaCombustible.findOne({
      _id: req.params.id,
      deletedAt: { $ne: null },
    });
    if (!carga)
      return res
        .status(404)
        .json({ success: false, message: "Tanqueo no encontrado en la papelera" });

    carga.deletedAt = null;
    carga.deletedBy = null;
    await carga.save();
    await combustibleService.recalcularRendimiento(carga.vehiculo);
    res.json({ success: true, message: "Tanqueo restaurado", data: carga });
  } catch (error) {
    logger.error(`Error restaurando tanqueo: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE /api/operacion/combustible/:id/hard
 * Borra definitivamente un tanqueo (solo admin) y recalcula el rendimiento.
 */
exports.eliminarTanqueoDefinitivo = async (req, res) => {
  try {
    const carga = await CargaCombustible.findById(req.params.id);
    if (!carga)
      return res
        .status(404)
        .json({ success: false, message: "Tanqueo no encontrado" });

    const vehiculoId = carga.vehiculo;
    await CargaCombustible.deleteOne({ _id: carga._id });
    await combustibleService.recalcularRendimiento(vehiculoId);
    res.json({ success: true, message: "Tanqueo eliminado definitivamente" });
  } catch (error) {
    logger.error(`Error en borrado definitivo de tanqueo: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/operacion/combustible/rendimiento?vehiculo=&desde=&hasta=
 * Resumen de rendimiento (km/galón) y costo por km de combustible por vehículo.
 */
exports.rendimientoCombustible = async (req, res) => {
  try {
    const resumen = await combustibleService.resumenPorVehiculo({
      empresa: esAdmin(req) ? null : req.user.empresaId,
      vehiculo: req.query.vehiculo || null,
      desde: req.query.desde,
      hasta: req.query.hasta,
    });

    res.json({ success: true, data: resumen });
  } catch (error) {
    logger.error(`Error calculando rendimiento: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};
