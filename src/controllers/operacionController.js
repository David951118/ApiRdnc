const Viaje = require("../models/Viaje");
const CargaCombustible = require("../models/CargaCombustible");
const Vehiculo = require("../models/Vehiculo");
const combustibleService = require("../services/combustibleService");
const {
  tieneAccesoVehiculo,
  getVehiculoScope,
} = require("../services/vehiculoAccessService");
const logger = require("../config/logger");

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
  if (!carga || carga.pesoKg == null) return carga;
  const tope = vehiculo.pesoMaximoKg || vehiculo.capacidadCargaKg || null;
  if (tope && carga.pesoKg > tope) {
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

    if (["FINALIZADO", "CANCELADO"].includes(viaje.estado)) {
      return res.status(400).json({
        success: false,
        message: `No se puede modificar un viaje ${viaje.estado}`,
      });
    }

    const editables = [
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
    editables.forEach((campo) => {
      if (req.body[campo] !== undefined) viaje[campo] = req.body[campo];
    });

    if (req.body.carga) evaluarSobrecarga(viaje.carga, viaje.vehiculo);
    registrarHistorial(viaje, req, "ACTUALIZADO");

    await viaje.save();
    res.json({
      success: true,
      data: viaje,
      alertaSobrecarga: viaje.carga?.sobrecarga || false,
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
