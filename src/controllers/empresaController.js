const Empresa = require("../models/Empresa");
const logger = require("../config/logger");

// Crear Empresa (Solo ADMIN)
exports.create = async (req, res) => {
  try {
    const empresa = new Empresa(req.body);
    await empresa.save();
    res.status(201).json({ success: true, data: empresa });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Ya existe una empresa con ese NIT.",
      });
    }
    logger.error(`Error creando empresa: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

// Listar empresas (Solo ADMIN — con soft-delete excluido por defecto)
exports.getAll = async (req, res) => {
  try {
    const { page = 1, limit = 50, search, includeDeleted = false } = req.query;
    const query = {};

    if (!includeDeleted || includeDeleted === "false") {
      query.deletedAt = null;
    }

    if (search) {
      query.$or = [
        { razonSocial: new RegExp(search, "i") },
        { nit: new RegExp(search, "i") },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const empresas = await Empresa.find(query)
      .limit(parseInt(limit))
      .skip(skip)
      .sort({ razonSocial: 1 })
      .lean();

    const total = await Empresa.countDocuments(query);

    res.json({
      success: true,
      data: empresas,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error(`Error listando empresas: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Obtener una empresa por ID
exports.getOne = async (req, res) => {
  try {
    const empresa = await Empresa.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!empresa)
      return res
        .status(404)
        .json({ success: false, message: "Empresa no encontrada" });
    res.json({ success: true, data: empresa });
  } catch (error) {
    logger.error(`Error obteniendo empresa: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Actualizar empresa
exports.update = async (req, res) => {
  try {
    const empresa = await Empresa.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!empresa)
      return res
        .status(404)
        .json({ success: false, message: "Empresa no encontrada" });

    Object.assign(empresa, req.body);
    await empresa.save();
    res.json({ success: true, data: empresa });
  } catch (error) {
    logger.error(`Error actualizando empresa: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

// Soft Delete
exports.softDelete = async (req, res) => {
  try {
    const empresa = await Empresa.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!empresa)
      return res
        .status(404)
        .json({ success: false, message: "Empresa no encontrada" });

    await empresa.softDelete(req.user?.userId || null);
    res.json({
      success: true,
      message: "Empresa eliminada temporalmente",
      data: empresa,
    });
  } catch (error) {
    logger.error(`Error soft-delete empresa: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Restaurar
exports.restore = async (req, res) => {
  try {
    const empresa = await Empresa.findById(req.params.id);
    if (!empresa)
      return res
        .status(404)
        .json({ success: false, message: "Empresa no encontrada" });
    if (!empresa.deletedAt)
      return res
        .status(400)
        .json({ success: false, message: "La empresa no está eliminada" });

    await empresa.restore();
    res.json({ success: true, message: "Empresa restaurada", data: empresa });
  } catch (error) {
    logger.error(`Error restaurando empresa: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Hard Delete (Solo ADMIN)
exports.hardDelete = async (req, res) => {
  try {
    const empresa = await Empresa.findByIdAndDelete(req.params.id);
    if (!empresa)
      return res
        .status(404)
        .json({ success: false, message: "Empresa no encontrada" });
    res.json({ success: true, message: "Empresa eliminada permanentemente" });
  } catch (error) {
    logger.error(`Error hard-delete empresa: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};
