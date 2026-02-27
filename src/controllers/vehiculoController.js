const Vehiculo = require("../models/Vehiculo");
const { getVehicleScope } = require("../utils/dataScope");
const logger = require("../config/logger");

// Crear Vehículo (ADMIN o CLIENTE_ADMIN)
exports.create = async (req, res) => {
  try {
    const vehiculo = new Vehiculo(req.body);
    await vehiculo.save();
    res.status(201).json({ success: true, data: vehiculo });
  } catch (error) {
    logger.error(`Error creando vehículo: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

// Listar (scope de seguridad + soft-delete excluido por defecto)
exports.getAll = async (req, res) => {
  try {
    const { page = 1, limit = 50, placa, includeDeleted = false } = req.query;

    const scopeQuery = getVehicleScope(req);
    const conditions = [];

    if (Object.keys(scopeQuery).length > 0) {
      conditions.push(scopeQuery);
    }
    if (!includeDeleted || includeDeleted === "false") {
      conditions.push({ deletedAt: null });
    }
    if (placa) {
      conditions.push({ placa: new RegExp(placa, "i") });
    }

    const query = conditions.length > 0 ? { $and: conditions } : {};

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const vehiculos = await Vehiculo.find(query)
      .limit(parseInt(limit))
      .skip(skip)
      .populate("propietario", "nombres apellidos razonSocial identificacion")
      .lean();

    const total = await Vehiculo.countDocuments(query);

    res.json({
      success: true,
      data: vehiculos,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error(`Error listando vehículos: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Obtener uno por ID o Placa
exports.getOne = async (req, res) => {
  try {
    const { id } = req.params;
    let vehiculo;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      vehiculo = await Vehiculo.findOne({ _id: id, deletedAt: null }).populate(
        "propietario",
      );
    } else {
      vehiculo = await Vehiculo.findOne({
        placa: id.toUpperCase(),
        deletedAt: null,
      }).populate("propietario");
    }

    if (!vehiculo)
      return res
        .status(404)
        .json({ success: false, message: "Vehículo no encontrado" });
    res.json({ success: true, data: vehiculo });
  } catch (error) {
    logger.error(`Error obteniendo vehículo: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Actualizar
exports.update = async (req, res) => {
  try {
    const vehiculo = await Vehiculo.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!vehiculo)
      return res
        .status(404)
        .json({ success: false, message: "Vehículo no encontrado" });

    Object.assign(vehiculo, req.body);
    await vehiculo.save();
    res.json({ success: true, data: vehiculo });
  } catch (error) {
    logger.error(`Error actualizando vehículo: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

// Soft Delete
exports.softDelete = async (req, res) => {
  try {
    const vehiculo = await Vehiculo.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!vehiculo)
      return res
        .status(404)
        .json({ success: false, message: "Vehículo no encontrado" });

    await vehiculo.softDelete(req.user?.userId || null);
    res.json({
      success: true,
      message: "Vehículo eliminado temporalmente",
      data: vehiculo,
    });
  } catch (error) {
    logger.error(`Error soft-delete vehículo: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Restaurar
exports.restore = async (req, res) => {
  try {
    const vehiculo = await Vehiculo.findById(req.params.id);
    if (!vehiculo)
      return res
        .status(404)
        .json({ success: false, message: "Vehículo no encontrado" });
    if (!vehiculo.deletedAt)
      return res
        .status(400)
        .json({ success: false, message: "El vehículo no está eliminado" });

    await vehiculo.restore();
    res.json({ success: true, message: "Vehículo restaurado", data: vehiculo });
  } catch (error) {
    logger.error(`Error restaurando vehículo: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Hard Delete (Solo ADMIN)
exports.hardDelete = async (req, res) => {
  try {
    const vehiculo = await Vehiculo.findByIdAndDelete(req.params.id);
    if (!vehiculo)
      return res
        .status(404)
        .json({ success: false, message: "Vehículo no encontrado" });
    res.json({ success: true, message: "Vehículo eliminado permanentemente" });
  } catch (error) {
    logger.error(`Error hard-delete vehículo: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};
