const PlanMantenimiento = require("../models/PlanMantenimiento");
const OrdenTrabajo = require("../models/OrdenTrabajo");
const Vehiculo = require("../models/Vehiculo");
const alertasService = require("../services/alertasMantenimientoService");
const { getVehiculoScope } = require("../services/vehiculoAccessService");
const logger = require("../config/logger");

/** true si el usuario es ADMIN global */
function esAdmin(req) {
  return (req.user.roles || []).some((r) =>
    ["ROLE_ADMIN", "ROLE_SUPER_ADMIN", "ADMIN", "SUPER_ADMIN"].includes(r),
  );
}

/** true si el usuario es MECANICO sin rol administrativo */
function esMecanicoSolo(req) {
  const roles = (req.user.roles || []).map((r) =>
    r.replace("ROLE_", "").toUpperCase(),
  );
  return (
    roles.includes("MECANICO") &&
    !roles.includes("ADMIN") &&
    !roles.includes("SUPER_ADMIN") &&
    !roles.includes("CLIENTE_ADMIN")
  );
}

/**
 * true si el usuario es un conductor/cliente "puro" (ve solo el mantenimiento de
 * SUS vehículos): tiene rol de lectura conductor y NO es admin/cliente_admin/mecánico/auditor.
 */
function esConductorSolo(req) {
  const roles = (req.user.roles || []).map((r) =>
    r.replace("ROLE_", "").toUpperCase(),
  );
  const amplio = roles.some((r) =>
    ["ADMIN", "SUPER_ADMIN", "CLIENTE_ADMIN", "MECANICO", "AUDITOR"].includes(r),
  );
  return !amplio;
}

/** Filtro de empresa para usuarios no-admin */
function scopeEmpresa(req, filtro = {}) {
  if (!esAdmin(req) && req.user.empresaId) {
    filtro.empresa = req.user.empresaId;
  }
  return filtro;
}

function registrarHistorial(ot, req, accion, detalle = "") {
  ot.historial.push({
    usuario: req.user.username,
    accion,
    detalle,
  });
}

// ═══════════════════ PLANES DE MANTENIMIENTO ═══════════════════

exports.crearPlan = async (req, res) => {
  try {
    const plan = new PlanMantenimiento({
      ...req.body,
      empresa: esAdmin(req) ? req.body.empresa || null : req.user.empresaId,
      creadoPor: req.user.username,
    });
    await plan.save();
    res.status(201).json({ success: true, data: plan });
  } catch (error) {
    logger.error(`Error creando plan de mantenimiento: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listarPlanes = async (req, res) => {
  try {
    const filtro = { deletedAt: null };
    if (req.query.activo) filtro.activo = req.query.activo === "true";
    if (!esAdmin(req) && req.user.empresaId) {
      filtro.$or = [{ empresa: req.user.empresaId }, { empresa: null }];
    }

    const planes = await PlanMantenimiento.find(filtro)
      .populate("vehiculos", "placa claseVehiculo")
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: planes });
  } catch (error) {
    logger.error(`Error listando planes: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.obtenerPlan = async (req, res) => {
  try {
    const plan = await PlanMantenimiento.findOne(
      scopeEmpresa(req, { _id: req.params.id, deletedAt: null }),
    )
      .populate("vehiculos", "placa claseVehiculo")
      .lean();

    if (!plan)
      return res
        .status(404)
        .json({ success: false, message: "Plan no encontrado" });

    res.json({ success: true, data: plan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.actualizarPlan = async (req, res) => {
  try {
    const plan = await PlanMantenimiento.findOneAndUpdate(
      scopeEmpresa(req, { _id: req.params.id, deletedAt: null }),
      { $set: req.body },
      { new: true, runValidators: true },
    );

    if (!plan)
      return res
        .status(404)
        .json({ success: false, message: "Plan no encontrado" });

    res.json({ success: true, data: plan });
  } catch (error) {
    logger.error(`Error actualizando plan: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.eliminarPlan = async (req, res) => {
  try {
    const plan = await PlanMantenimiento.findOne(
      scopeEmpresa(req, { _id: req.params.id, deletedAt: null }),
    );
    if (!plan)
      return res
        .status(404)
        .json({ success: false, message: "Plan no encontrado" });

    await plan.softDelete(req.user.userId);
    res.json({ success: true, message: "Plan eliminado" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ═══════════════════ ÓRDENES DE TRABAJO ═══════════════════

exports.crearOrden = async (req, res) => {
  try {
    const vehiculo = await Vehiculo.findOne({
      _id: req.body.vehiculo,
      deletedAt: null,
    });
    if (!vehiculo)
      return res
        .status(404)
        .json({ success: false, message: "Vehículo no encontrado" });

    const ot = new OrdenTrabajo({
      ...req.body,
      placa: vehiculo.placa,
      empresa: vehiculo.empresaAfiliadora || null,
      creadoPor: req.user.username,
    });
    registrarHistorial(ot, req, "CREADA", req.body.descripcion);

    // Un mecánico que crea una OT sin indicar mecánico queda auto-asignado
    if (!ot.mecanico && esMecanicoSolo(req) && req.user.terceroId) {
      ot.mecanico = req.user.terceroId;
    }

    // Si nace asignada a un mecánico
    if (ot.mecanico) {
      ot.estado = "ASIGNADA";
      registrarHistorial(ot, req, "ASIGNADA", `Mecánico: ${ot.mecanico}`);
    }

    await ot.save();
    res.status(201).json({ success: true, data: ot });
  } catch (error) {
    logger.error(`Error creando orden de trabajo: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listarOrdenes = async (req, res) => {
  try {
    const {
      estado,
      tipo,
      vehiculo,
      mecanico,
      search,
      page = 1,
      limit = 25,
    } = req.query;

    const filtro = scopeEmpresa(req, { deletedAt: null });
    if (estado) filtro.estado = estado;
    if (tipo) filtro.tipo = tipo;
    if (vehiculo) filtro.vehiculo = vehiculo;
    if (mecanico) filtro.mecanico = mecanico;

    // Búsqueda libre: número de OT, placa, descripción, taller o actividad.
    // Se resuelve en la base para que alcance a todas las páginas.
    if (search && String(search).trim()) {
      const termino = String(search).trim();
      const rx = new RegExp(termino.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filtro.$or = [
        { numero: rx },
        { placa: rx },
        { descripcion: rx },
        { taller: rx },
        { "actividades.descripcion": rx },
        { planItemNombre: rx },
      ];
    }

    // El MECANICO ve todas las OTs de su empresa (scopeEmpresa ya acota el filtro);
    // puede seguir filtrando por mecánico con el query param.

    // Un CONDUCTOR/cliente solo ve las OTs de sus propios vehículos
    if (esConductorSolo(req)) {
      const scope = await getVehiculoScope(req);
      if (scope._id === null) {
        return res.json({ success: true, data: [], total: 0, page: 1, pages: 0 });
      }
      if (scope._id) filtro.vehiculo = scope._id;
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const [ordenes, total] = await Promise.all([
      OrdenTrabajo.find(filtro)
        .populate("vehiculo", "placa claseVehiculo")
        .populate("mecanico", "nombres apellidos")
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      OrdenTrabajo.countDocuments(filtro),
    ]);

    res.json({
      success: true,
      data: ordenes,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    logger.error(`Error listando órdenes: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.obtenerOrden = async (req, res) => {
  try {
    const ot = await OrdenTrabajo.findOne(
      scopeEmpresa(req, { _id: req.params.id, deletedAt: null }),
    )
      .populate("vehiculo", "placa claseVehiculo marca linea")
      .populate("mecanico", "nombres apellidos identificacion")
      .populate("plan", "nombre")
      .lean();

    if (!ot)
      return res
        .status(404)
        .json({ success: false, message: "Orden no encontrada" });

    res.json({ success: true, data: ot });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.actualizarOrden = async (req, res) => {
  try {
    const ot = await OrdenTrabajo.findOne(
      scopeEmpresa(req, { _id: req.params.id, deletedAt: null }),
    );
    if (!ot)
      return res
        .status(404)
        .json({ success: false, message: "Orden no encontrada" });

    if (["CERRADA", "ANULADA"].includes(ot.estado)) {
      return res.status(400).json({
        success: false,
        message: `No se puede modificar una orden ${ot.estado}`,
      });
    }

    // Campos editables mientras la OT está abierta
    const editables = [
      "descripcion",
      "prioridad",
      "taller",
      "fechaProgramada",
      "actividades",
      "repuestos",
      "manoDeObra",
      "kilometraje",
    ];
    editables.forEach((campo) => {
      if (req.body[campo] !== undefined) ot[campo] = req.body[campo];
    });

    registrarHistorial(ot, req, "ACTUALIZADA");
    await ot.save();
    res.json({ success: true, data: ot });
  } catch (error) {
    logger.error(`Error actualizando orden: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.asignarOrden = async (req, res) => {
  try {
    const { mecanico, taller, fechaProgramada } = req.body;
    const ot = await OrdenTrabajo.findOne(
      scopeEmpresa(req, { _id: req.params.id, deletedAt: null }),
    );
    if (!ot)
      return res
        .status(404)
        .json({ success: false, message: "Orden no encontrada" });

    if (["CERRADA", "ANULADA"].includes(ot.estado)) {
      return res.status(400).json({
        success: false,
        message: `No se puede asignar una orden ${ot.estado}`,
      });
    }

    if (mecanico !== undefined) ot.mecanico = mecanico;
    if (taller !== undefined) ot.taller = taller;
    if (fechaProgramada !== undefined) ot.fechaProgramada = fechaProgramada;
    ot.estado = "ASIGNADA";
    registrarHistorial(ot, req, "ASIGNADA", taller || "");

    await ot.save();
    res.json({ success: true, data: ot });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.iniciarOrden = async (req, res) => {
  try {
    const ot = await OrdenTrabajo.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!ot)
      return res
        .status(404)
        .json({ success: false, message: "Orden no encontrada" });

    if (!["ABIERTA", "ASIGNADA"].includes(ot.estado)) {
      return res.status(400).json({
        success: false,
        message: `No se puede iniciar una orden ${ot.estado}`,
      });
    }

    ot.estado = "EN_PROCESO";
    registrarHistorial(ot, req, "INICIADA");
    await ot.save();
    res.json({ success: true, data: ot });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.cerrarOrden = async (req, res) => {
  try {
    const ot = await OrdenTrabajo.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!ot)
      return res
        .status(404)
        .json({ success: false, message: "Orden no encontrada" });

    if (["CERRADA", "ANULADA"].includes(ot.estado)) {
      return res.status(400).json({
        success: false,
        message: `La orden ya está ${ot.estado}`,
      });
    }

    // El cierre exige el kilometraje: es el baseline del próximo ciclo preventivo
    const kilometraje = req.body.kilometraje ?? ot.kilometraje;
    if (kilometraje == null) {
      return res.status(400).json({
        success: false,
        message:
          "Debe indicar el kilometraje del vehículo para cerrar la orden",
      });
    }

    // Actualizar detalle final si viene en el cierre
    ["actividades", "repuestos", "manoDeObra", "taller"].forEach((campo) => {
      if (req.body[campo] !== undefined) ot[campo] = req.body[campo];
    });

    ot.kilometraje = kilometraje;
    ot.estado = "CERRADA";
    ot.fechaCierre = new Date();
    ot.observacionesCierre = req.body.observacionesCierre || "";
    registrarHistorial(ot, req, "CERRADA", ot.observacionesCierre);

    await ot.save();

    // Descontar del inventario los repuestos ligados al catálogo (kardex)
    const inventarioService = require("../services/inventarioService");
    await inventarioService.consumirRepuestosDeOT(ot, req.user.username);

    // Actualizar resumen del vehículo (compatibilidad con historial embebido)
    await Vehiculo.updateOne(
      { _id: ot.vehiculo },
      {
        $push: {
          mantenimientos: {
            fecha: ot.fechaCierre,
            tipo: ot.tipo,
            descripcion: `${ot.numero}: ${ot.descripcion}`,
            kilometraje: ot.kilometraje,
            taller: ot.taller,
          },
        },
      },
    );

    res.json({ success: true, data: ot });
  } catch (error) {
    logger.error(`Error cerrando orden: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.anularOrden = async (req, res) => {
  try {
    const ot = await OrdenTrabajo.findOne(
      scopeEmpresa(req, { _id: req.params.id, deletedAt: null }),
    );
    if (!ot)
      return res
        .status(404)
        .json({ success: false, message: "Orden no encontrada" });

    if (ot.estado === "CERRADA") {
      return res.status(400).json({
        success: false,
        message: "No se puede anular una orden cerrada",
      });
    }

    ot.estado = "ANULADA";
    registrarHistorial(ot, req, "ANULADA", req.body.motivo || "");
    await ot.save();
    res.json({ success: true, data: ot });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE /api/mantenimiento/ordenes/:id
 * Eliminar una orden de trabajo. Disponible para ADMIN/SUPER_ADMIN y para el
 * CLIENTE_ADMIN dentro de su empresa (scopeEmpresa). A diferencia de anular
 * —que deja la orden a la vista con su historial—, esto la retira del módulo
 * y no se puede deshacer desde la plataforma.
 */
exports.eliminarOrden = async (req, res) => {
  try {
    // scopeEmpresa: el CLIENTE_ADMIN solo alcanza las OTs de su propia empresa.
    const ot = await OrdenTrabajo.findOne(
      scopeEmpresa(req, { _id: req.params.id, deletedAt: null }),
    );
    if (!ot)
      return res
        .status(404)
        .json({ success: false, message: "Orden no encontrada" });

    registrarHistorial(ot, req, "ELIMINADA", req.body?.motivo || "");
    await ot.softDelete(req.user.userId);

    logger.info(
      `OT ${ot.consecutivo || ot._id} eliminada por ${req.user?.username || req.user?.userId}`,
    );
    res.json({ success: true, message: "Orden de trabajo eliminada" });
  } catch (error) {
    logger.error(`Error eliminando orden: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ═══════════════════ ALERTAS ═══════════════════

/**
 * GET /api/mantenimiento/alertas
 * Query: ?vehiculo=<id> &todas=true (incluye estado OK) &rapido=true (sin Cellvi)
 */
exports.alertas = async (req, res) => {
  try {
    let alertas = await alertasService.calcularAlertas({
      empresaId: esAdmin(req) ? null : req.user.empresaId,
      vehiculoId: req.query.vehiculo || null,
      soloAccionables: req.query.todas !== "true",
      consultarCellvi: req.query.rapido !== "true",
    });

    // El conductor/cliente solo ve las alertas de sus propios vehículos
    if (esConductorSolo(req)) {
      const scope = await getVehiculoScope(req);
      if (scope._id === null) {
        alertas = [];
      } else if (scope._id && scope._id.$in) {
        const permitidos = new Set(scope._id.$in.map((id) => id.toString()));
        alertas = alertas.filter((a) => permitidos.has(String(a.vehiculo.id)));
      }
    }

    res.json({
      success: true,
      total: alertas.length,
      resumen: {
        vencidos: alertas.filter((a) => a.estado === "VENCIDO").length,
        proximos: alertas.filter((a) => a.estado === "PROXIMO").length,
        sinHistorial: alertas.filter((a) => a.estado === "SIN_HISTORIAL")
          .length,
      },
      data: alertas,
    });
  } catch (error) {
    logger.error(`Error calculando alertas: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ═══════════════════ HISTORIAL Y COSTOS ═══════════════════

/**
 * GET /api/mantenimiento/historial/:vehiculoId
 * Historial técnico completo + costos por año separando mano de obra y repuestos.
 * Query: ?anio=2026 filtra un año específico
 */
exports.historialVehiculo = async (req, res) => {
  try {
    const filtro = {
      vehiculo: req.params.vehiculoId,
      estado: "CERRADA",
      deletedAt: null,
    };

    if (req.query.anio) {
      const anio = parseInt(req.query.anio);
      filtro.fechaCierre = {
        $gte: new Date(anio, 0, 1),
        $lt: new Date(anio + 1, 0, 1),
      };
    }

    const ordenes = await OrdenTrabajo.find(filtro)
      .populate("mecanico", "nombres apellidos")
      .sort({ fechaCierre: -1 })
      .lean();

    // Costos agrupados por año
    const costosPorAnio = {};
    for (const ot of ordenes) {
      const anio = ot.fechaCierre
        ? new Date(ot.fechaCierre).getFullYear()
        : "SIN_FECHA";
      if (!costosPorAnio[anio]) {
        costosPorAnio[anio] = {
          ordenes: 0,
          preventivos: 0,
          correctivos: 0,
          costoManoDeObra: 0,
          costoRepuestos: 0,
          costoTotal: 0,
        };
      }
      const acc = costosPorAnio[anio];
      acc.ordenes++;
      if (ot.tipo === "PREVENTIVO") acc.preventivos++;
      else acc.correctivos++;
      acc.costoManoDeObra += ot.manoDeObra?.costo || 0;
      acc.costoRepuestos += ot.costoRepuestos || 0;
      acc.costoTotal += ot.costoTotal || 0;
    }

    res.json({
      success: true,
      data: { ordenes, costosPorAnio },
    });
  } catch (error) {
    logger.error(`Error consultando historial: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};
