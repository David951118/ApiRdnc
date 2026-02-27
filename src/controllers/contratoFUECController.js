const ContratoFuec = require("../models/ContratoFUEC");
const Vehiculo = require("../models/Vehiculo");
const logger = require("../config/logger");

function getRoles(req) {
  const rolesUpper = (req.user?.roles || []).map((r) => r.toUpperCase());
  return {
    isAdmin: rolesUpper.includes("ADMIN"),
    isClienteAdmin: rolesUpper.includes("CLIENTE_ADMIN"),
  };
}

// Helper: obtener IDs de vehiculos permitidos para no-admins
async function getVehiculosScope(req) {
  const permitidos = req.session?.vehiculosPermitidos || [];
  if (!permitidos.length) return null; // sin acceso
  const placas = permitidos.map((v) => v.placa);
  const vehiculos = await Vehiculo.find({ placa: { $in: placas } })
    .select("_id")
    .lean();
  return vehiculos.map((v) => v._id);
}

// Crear Contrato (ADMIN o CLIENTE_ADMIN)
exports.create = async (req, res) => {
  try {
    const { isAdmin, isClienteAdmin } = getRoles(req);
    if (!isAdmin && !isClienteAdmin) {
      return res
        .status(403)
        .json({
          success: false,
          message: "No tiene permisos para generar contratos",
        });
    }

    const contrato = new ContratoFuec(req.body);
    contrato.creadoPor = req.user?.userId || null;
    await contrato.save();
    res.status(201).json({ success: true, data: contrato });
  } catch (error) {
    logger.error(`Error creando contrato: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

// Listar contratos
exports.getAll = async (req, res) => {
  try {
    const { page = 1, limit = 20, estado, includeDeleted = false } = req.query;
    const { isAdmin, isClienteAdmin } = getRoles(req);

    const query = {};

    if (!includeDeleted || includeDeleted === "false") {
      query.deletedAt = null;
    }

    if (!isAdmin) {
      if (isClienteAdmin && req.user.empresaId) {
        // CLIENTE_ADMIN: vehículos de su empresa
        const vehiculos = await Vehiculo.find({
          empresaAfiliadora: req.user.empresaId,
        })
          .select("_id")
          .lean();
        query.vehiculo = { $in: vehiculos.map((v) => v._id) };
      } else {
        // CLIENTE normal: solo sus vehículos permitidos
        const ids = await getVehiculosScope(req);
        if (!ids || ids.length === 0) {
          return res.json({
            success: true,
            data: [],
            pagination: { page: 1, limit: parseInt(limit), total: 0, pages: 0 },
          });
        }
        query.vehiculo = { $in: ids };
      }
    }

    if (estado) query.estado = estado;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const contratos = await ContratoFuec.find(query)
      .sort({ consecutivo: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .populate("contratante", "razonSocial nombres apellidos")
      .populate("vehiculo", "placa numeroInterno")
      .populate("conductorPrincipal", "nombres apellidos")
      .lean();

    const total = await ContratoFuec.countDocuments(query);

    res.json({
      success: true,
      data: contratos,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error(`Error listando contratos: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Obtener uno por ID
exports.getOne = async (req, res) => {
  try {
    const { isAdmin, isClienteAdmin } = getRoles(req);

    const contrato = await ContratoFuec.findOne({
      _id: req.params.id,
      deletedAt: null,
    })
      .populate("contratante")
      .populate("vehiculo")
      .populate("conductorPrincipal")
      .populate("conductoresAuxiliares")
      .populate("ruta");

    if (!contrato)
      return res
        .status(404)
        .json({ success: false, message: "Contrato no encontrado" });

    if (!isAdmin) {
      if (isClienteAdmin) {
        // Verificar que el vehículo pertenece a su empresa
        if (
          contrato.vehiculo?.empresaAfiliadora?.toString() !==
          req.user.empresaId?.toString()
        ) {
          return res
            .status(403)
            .json({
              success: false,
              message: "No tiene acceso a este contrato",
            });
        }
      } else {
        // CLIENTE: verificar contra sus vehículos permitidos
        const permitidos = req.session?.vehiculosPermitidos || [];
        const tieneAcceso = permitidos.some(
          (v) => v.placa === contrato.vehiculo?.placa,
        );
        if (!tieneAcceso)
          return res
            .status(403)
            .json({
              success: false,
              message: "No tiene acceso a este contrato",
            });
      }
    }

    res.json({ success: true, data: contrato });
  } catch (error) {
    logger.error(`Error obteniendo contrato: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Actualizar (ADMIN o CLIENTE_ADMIN)
exports.update = async (req, res) => {
  try {
    const { isAdmin, isClienteAdmin } = getRoles(req);
    if (!isAdmin && !isClienteAdmin)
      return res
        .status(403)
        .json({
          success: false,
          message: "No tiene permisos para editar contratos",
        });

    const contrato = await ContratoFuec.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!contrato)
      return res
        .status(404)
        .json({ success: false, message: "Contrato no encontrado" });

    Object.assign(contrato, req.body);
    await contrato.save();
    res.json({ success: true, data: contrato });
  } catch (error) {
    logger.error(`Error actualizando contrato: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

// Soft Delete (ADMIN o CLIENTE_ADMIN)
exports.softDelete = async (req, res) => {
  try {
    const { isAdmin, isClienteAdmin } = getRoles(req);
    if (!isAdmin && !isClienteAdmin)
      return res
        .status(403)
        .json({
          success: false,
          message: "No tiene permisos para eliminar contratos",
        });

    const contrato = await ContratoFuec.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!contrato)
      return res
        .status(404)
        .json({ success: false, message: "Contrato no encontrado" });

    await contrato.softDelete(req.user?.userId || null);
    res.json({
      success: true,
      message: "Contrato eliminado temporalmente",
      data: contrato,
    });
  } catch (error) {
    logger.error(`Error soft-delete contrato: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Restaurar (ADMIN o CLIENTE_ADMIN)
exports.restore = async (req, res) => {
  try {
    const { isAdmin, isClienteAdmin } = getRoles(req);
    if (!isAdmin && !isClienteAdmin)
      return res
        .status(403)
        .json({
          success: false,
          message: "No tiene permisos para restaurar contratos",
        });

    const contrato = await ContratoFuec.findById(req.params.id);
    if (!contrato)
      return res
        .status(404)
        .json({ success: false, message: "Contrato no encontrado" });
    if (!contrato.deletedAt)
      return res
        .status(400)
        .json({ success: false, message: "El contrato no está eliminado" });

    await contrato.restore();
    res.json({ success: true, message: "Contrato restaurado", data: contrato });
  } catch (error) {
    logger.error(`Error restaurando contrato: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Hard Delete (Solo ADMIN)
exports.hardDelete = async (req, res) => {
  try {
    const contrato = await ContratoFuec.findByIdAndDelete(req.params.id);
    if (!contrato)
      return res
        .status(404)
        .json({ success: false, message: "Contrato no encontrado" });
    res.json({ success: true, message: "Contrato eliminado permanentemente" });
  } catch (error) {
    logger.error(`Error hard-delete contrato: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};
