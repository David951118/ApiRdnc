const Preoperacional = require("../models/Preoperacional");
const Vehiculo = require("../models/Vehiculo");
const Tercero = require("../models/Tercero");
const logger = require("../config/logger");

/**
 * Scope de preoperacionales según rol:
 * - ADMIN/SUPER: todo
 * - CLIENTE_ADMIN: vehículos de su empresa
 * - CLIENTE: solo sus vehiculosPermitidos
 */
async function getPreoperacionalScope(req) {
  const rolesUpper = (req.user?.roles || []).map((r) => r.toUpperCase());
  const isAdmin = rolesUpper.includes("ADMIN");
  const isClienteAdmin = rolesUpper.includes("CLIENTE_ADMIN");

  if (isAdmin) {
    return {};
  }

  if (isClienteAdmin) {
    const empresaId = req.user?.empresaId;
    if (!empresaId) {
      return { vehiculo: null }; // no ve nada
    }
    const vehiculos = await Vehiculo.find({ empresaAfiliadora: empresaId })
      .select("_id")
      .lean();
    const vehiculoIds = vehiculos.map((v) => v._id);
    return { vehiculo: { $in: vehiculoIds } };
  }

  // CLIENTE: solo vehículos asignados (por placa)
  const permitidos = req.session?.vehiculosPermitidos || [];
  if (!permitidos.length) {
    return { vehiculo: null };
  }
  const placas = permitidos.map((v) => v.placa);
  const vehiculos = await Vehiculo.find({ placa: { $in: placas } })
    .select("_id")
    .lean();
  const vehiculoIds = vehiculos.map((v) => v._id);
  return { vehiculo: { $in: vehiculoIds } };
}

/**
 * Verificar si el usuario tiene acceso a un vehículo (por ID o por registro)
 */
async function tieneAccesoVehiculo(req, vehiculoId) {
  const scope = await getPreoperacionalScope(req);
  if (Object.keys(scope).length === 0) return true; // admin
  if (scope.vehiculo === null) return false;
  if (scope.vehiculo.$in) {
    const idStr = vehiculoId?.toString?.() || vehiculoId;
    return scope.vehiculo.$in.some((id) => id.toString() === idStr);
  }
  return scope.vehiculo.toString() === (vehiculoId?.toString?.() || vehiculoId);
}

/**
 * Crear preoperacional
 */
exports.create = async (req, res) => {
  try {
    const { vehiculo: vehiculoId, conductor: conductorId } = req.body;

    const vehiculo = await Vehiculo.findById(vehiculoId);
    if (!vehiculo) {
      return res.status(404).json({
        success: false,
        message: "Vehículo no encontrado",
      });
    }

    const conductor = await Tercero.findById(conductorId);
    if (!conductor) {
      return res.status(404).json({
        success: false,
        message: "Conductor (tercero) no encontrado",
      });
    }

    const tieneAcceso = await tieneAccesoVehiculo(req, vehiculoId);
    if (!tieneAcceso) {
      return res.status(403).json({
        success: false,
        message: "No tiene permisos para crear preoperacional de este vehículo",
      });
    }

    const check = new Preoperacional(req.body);
    await check.save();

    const populated = await Preoperacional.findById(check._id)
      .populate("vehiculo", "placa numeroInterno")
      .populate("conductor", "nombres apellidos");

    res.status(201).json({
      success: true,
      data: populated || check,
    });
  } catch (error) {
    logger.error(`Error creando preoperacional: ${error.message}`);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Listar preoperacionales con filtros (según scope del token)
 */
exports.getAll = async (req, res) => {
  try {
    const {
      vehiculoId,
      conductorId,
      estadoGeneral,
      fechaDesde,
      fechaHasta,
      page = 1,
      limit = 20,
      includeDeleted = false,
    } = req.query;

    const query = {};

    const scope = await getPreoperacionalScope(req);
    if (Object.keys(scope).length > 0) {
      Object.assign(query, scope);
    }
    if (scope.vehiculo === null) {
      return res.json({
        success: true,
        data: [],
        pagination: { page: 1, limit: parseInt(limit), total: 0, pages: 0 },
      });
    }

    if (vehiculoId) query.vehiculo = vehiculoId;
    if (conductorId) query.conductor = conductorId;
    if (estadoGeneral) query.estadoGeneral = estadoGeneral;

    if (fechaDesde || fechaHasta) {
      query.fecha = {};
      if (fechaDesde) query.fecha.$gte = new Date(fechaDesde);
      if (fechaHasta) query.fecha.$lte = new Date(fechaHasta);
    }

    if (!includeDeleted || includeDeleted === "false") {
      query.deletedAt = null;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const list = await Preoperacional.find(query)
      .sort({ fecha: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .populate("vehiculo", "placa numeroInterno")
      .populate("conductor", "nombres apellidos")
      .lean();

    const total = await Preoperacional.countDocuments(query);

    res.json({
      success: true,
      data: list,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error(`Error listando preoperacionales: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Listar por vehículo
 */
exports.getByVehiculo = async (req, res) => {
  try {
    const { vehiculoId } = req.params;
    const { page = 1, limit = 20, includeDeleted = false } = req.query;

    const tieneAcceso = await tieneAccesoVehiculo(req, vehiculoId);
    if (!tieneAcceso) {
      return res.status(403).json({
        success: false,
        message: "No tiene permisos para ver preoperacionales de este vehículo",
      });
    }

    const query = { vehiculo: vehiculoId };
    if (!includeDeleted || includeDeleted === "false") {
      query.deletedAt = null;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const checks = await Preoperacional.find(query)
      .sort({ fecha: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .populate("conductor", "nombres apellidos")
      .lean();

    res.json({
      success: true,
      data: checks,
    });
  } catch (error) {
    logger.error(`Error getByVehiculo preoperacional: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Obtener uno por ID
 */
exports.getOne = async (req, res) => {
  try {
    const { id } = req.params;
    const check = await Preoperacional.findOne({ _id: id, deletedAt: null })
      .populate("vehiculo")
      .populate("conductor");

    if (!check) {
      return res.status(404).json({
        success: false,
        message: "Preoperacional no encontrado",
      });
    }

    const vehiculoId = check.vehiculo?._id ?? check.vehiculo;
    const tieneAcceso = await tieneAccesoVehiculo(req, vehiculoId);
    if (!tieneAcceso) {
      return res.status(403).json({
        success: false,
        message: "Acceso denegado a este registro",
      });
    }

    res.json({
      success: true,
      data: check,
    });
  } catch (error) {
    logger.error(`Error getOne preoperacional: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Actualizar (cualquier usuario con acceso al vehículo del check)
 */
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const check = await Preoperacional.findOne({ _id: id, deletedAt: null });

    if (!check) {
      return res.status(404).json({
        success: false,
        message: "Preoperacional no encontrado",
      });
    }

    const tieneAcceso = await tieneAccesoVehiculo(req, check.vehiculo);
    if (!tieneAcceso) {
      return res.status(403).json({
        success: false,
        message: "No tiene permisos para editar este preoperacional",
      });
    }

    Object.assign(check, req.body);
    await check.save();

    const updated = await Preoperacional.findById(check._id)
      .populate("vehiculo", "placa numeroInterno")
      .populate("conductor", "nombres apellidos");

    res.json({
      success: true,
      data: updated || check,
    });
  } catch (error) {
    logger.error(`Error actualizando preoperacional: ${error.message}`);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Soft delete
 */
exports.softDelete = async (req, res) => {
  try {
    const { id } = req.params;
    const check = await Preoperacional.findOne({ _id: id, deletedAt: null });

    if (!check) {
      return res.status(404).json({
        success: false,
        message: "Preoperacional no encontrado",
      });
    }

    const tieneAcceso = await tieneAccesoVehiculo(req, check.vehiculo);
    if (!tieneAcceso) {
      return res.status(403).json({
        success: false,
        message: "No tiene permisos para eliminar este preoperacional",
      });
    }

    await check.softDelete(req.user?.userId || null);

    res.json({
      success: true,
      message: "Preoperacional eliminado temporalmente",
      data: check,
    });
  } catch (error) {
    logger.error(`Error soft delete preoperacional: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Restaurar
 */
exports.restore = async (req, res) => {
  try {
    const { id } = req.params;
    const check = await Preoperacional.findById(id);

    if (!check) {
      return res.status(404).json({
        success: false,
        message: "Preoperacional no encontrado",
      });
    }
    if (!check.deletedAt) {
      return res.status(400).json({
        success: false,
        message: "El preoperacional no está eliminado",
      });
    }

    const tieneAcceso = await tieneAccesoVehiculo(req, check.vehiculo);
    if (!tieneAcceso) {
      return res.status(403).json({
        success: false,
        message: "No tiene permisos para restaurar este preoperacional",
      });
    }

    await check.restore();

    res.json({
      success: true,
      message: "Preoperacional restaurado",
      data: check,
    });
  } catch (error) {
    logger.error(`Error restaurando preoperacional: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Hard delete (solo ADMIN)
 */
exports.hardDelete = async (req, res) => {
  try {
    const rolesUpper = (req.user?.roles || []).map((r) => r.toUpperCase());
    const isAdmin = rolesUpper.includes("ADMIN");

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message:
          "Solo administradores pueden eliminar preoperacionales permanentemente",
      });
    }

    const { id } = req.params;
    const check = await Preoperacional.findByIdAndDelete(id);

    if (!check) {
      return res.status(404).json({
        success: false,
        message: "Preoperacional no encontrado",
      });
    }

    res.json({
      success: true,
      message: "Preoperacional eliminado permanentemente",
    });
  } catch (error) {
    logger.error(`Error hard delete preoperacional: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
