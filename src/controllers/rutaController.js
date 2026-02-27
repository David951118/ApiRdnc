const Ruta = require("../models/Ruta");
const logger = require("../config/logger");

function getRoles(req) {
  const rolesUpper = (req.user?.roles || []).map((r) => r.toUpperCase());
  return {
    isAdmin: rolesUpper.includes("ADMIN"),
    isClienteAdmin: rolesUpper.includes("CLIENTE_ADMIN"),
  };
}

// Crear Ruta
exports.create = async (req, res) => {
  try {
    const { isAdmin, isClienteAdmin } = getRoles(req);
    const ruta = new Ruta(req.body);
    ruta.creadoPor = req.user?.userId || null;

    // Si es CLIENTE_ADMIN y no ADMIN, asociar a su empresa automáticamente
    if (isClienteAdmin && !isAdmin && req.user?.empresaId) {
      ruta.empresa = req.user.empresaId;
    }

    await ruta.save();
    res.status(201).json({ success: true, data: ruta });
  } catch (error) {
    logger.error(`Error creando ruta: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

// Listar rutas con scope
exports.getAll = async (req, res) => {
  try {
    const { page = 1, limit = 50, search, includeDeleted = false } = req.query;
    const { isAdmin, isClienteAdmin } = getRoles(req);
    const query = {};

    if (!includeDeleted || includeDeleted === "false") {
      query.deletedAt = null;
    }

    // CLIENTE_ADMIN solo ve las rutas de su empresa
    if (!isAdmin) {
      if (isClienteAdmin && req.user?.empresaId) {
        query.empresa = req.user.empresaId;
      } else {
        // CLIENTE normal: ve rutas activas de su empresa
        if (req.user?.empresaId) {
          query.empresa = req.user.empresaId;
        }
      }
    }

    if (search) {
      query.$or = [
        { nombre: new RegExp(search, "i") },
        { origen: new RegExp(search, "i") },
        { destino: new RegExp(search, "i") },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const rutas = await Ruta.find(query)
      .limit(parseInt(limit))
      .skip(skip)
      .sort({ origen: 1, destino: 1 })
      .lean();

    const total = await Ruta.countDocuments(query);

    res.json({
      success: true,
      data: rutas,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error(`Error listando rutas: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Obtener una ruta por ID
exports.getOne = async (req, res) => {
  try {
    const ruta = await Ruta.findOne({ _id: req.params.id, deletedAt: null });
    if (!ruta)
      return res
        .status(404)
        .json({ success: false, message: "Ruta no encontrada" });
    res.json({ success: true, data: ruta });
  } catch (error) {
    logger.error(`Error obteniendo ruta: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Actualizar ruta
exports.update = async (req, res) => {
  try {
    const ruta = await Ruta.findOne({ _id: req.params.id, deletedAt: null });
    if (!ruta)
      return res
        .status(404)
        .json({ success: false, message: "Ruta no encontrada" });

    Object.assign(ruta, req.body);
    await ruta.save();
    res.json({ success: true, data: ruta });
  } catch (error) {
    logger.error(`Error actualizando ruta: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

// Soft Delete
exports.softDelete = async (req, res) => {
  try {
    const ruta = await Ruta.findOne({ _id: req.params.id, deletedAt: null });
    if (!ruta)
      return res
        .status(404)
        .json({ success: false, message: "Ruta no encontrada" });

    await ruta.softDelete(req.user?.userId || null);
    res.json({
      success: true,
      message: "Ruta eliminada temporalmente",
      data: ruta,
    });
  } catch (error) {
    logger.error(`Error soft-delete ruta: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Restaurar
exports.restore = async (req, res) => {
  try {
    const ruta = await Ruta.findById(req.params.id);
    if (!ruta)
      return res
        .status(404)
        .json({ success: false, message: "Ruta no encontrada" });
    if (!ruta.deletedAt)
      return res
        .status(400)
        .json({ success: false, message: "La ruta no está eliminada" });

    await ruta.restore();
    res.json({ success: true, message: "Ruta restaurada", data: ruta });
  } catch (error) {
    logger.error(`Error restaurando ruta: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Hard Delete (Solo ADMIN)
exports.hardDelete = async (req, res) => {
  try {
    const ruta = await Ruta.findByIdAndDelete(req.params.id);
    if (!ruta)
      return res
        .status(404)
        .json({ success: false, message: "Ruta no encontrada" });
    res.json({ success: true, message: "Ruta eliminada permanentemente" });
  } catch (error) {
    logger.error(`Error hard-delete ruta: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};
