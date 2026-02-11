const Vehiculo = require("../models/Vehiculo");

// Crear Vehículo
exports.create = async (req, res) => {
  try {
    const vehiculo = new Vehiculo(req.body);
    await vehiculo.save();
    res.status(201).json(vehiculo);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const { getVehicleScope } = require("../utils/dataScope");

// Listar todos (con paginación opcional y Scope de seguridad)
exports.getAll = async (req, res) => {
  try {
    const { page = 1, limit = 50, placa } = req.query;

    // Obtener Scope de Seguridad (Filtro base)
    // Obtener Scope de Seguridad (Filtro base)
    const scopeQuery = getVehicleScope(req);

    // Construir consulta con $and para no sobreescribir filtros
    const conditions = [];

    // 1. Agregar restricción de seguridad obligatoria
    if (Object.keys(scopeQuery).length > 0) {
      conditions.push(scopeQuery);
    }

    // 2. Agregar filtro de usuario (si existe)
    if (placa) {
      conditions.push({ placa: new RegExp(placa, "i") });
    }

    // Consulta final para Mongo
    const query = conditions.length > 0 ? { $and: conditions } : {};

    const vehiculos = await Vehiculo.find(query)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate("propietario", "nombres apellidos razonSocial identificacion");

    const total = await Vehiculo.countDocuments(query);

    res.json({
      vehiculos,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener uno por ID o Placa
exports.getOne = async (req, res) => {
  try {
    const { id } = req.params;
    // Intentar buscar por ID de Mongo, si falla buscar por Placa
    let vehiculo;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      vehiculo = await Vehiculo.findById(id).populate("propietario");
    } else {
      vehiculo = await Vehiculo.findOne({ placa: id.toUpperCase() }).populate(
        "propietario",
      );
    }

    if (!vehiculo)
      return res.status(404).json({ message: "Vehículo no encontrado" });
    res.json(vehiculo);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Actualizar
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const vehiculo = await Vehiculo.findByIdAndUpdate(id, req.body, {
      new: true,
    });
    if (!vehiculo)
      return res.status(404).json({ message: "Vehículo no encontrado" });
    res.json(vehiculo);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Eliminar (Soft delete preferiblemente, pero aquí físico por ahora)
exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    const vehiculo = await Vehiculo.findByIdAndDelete(id);
    if (!vehiculo)
      return res.status(404).json({ message: "Vehículo no encontrado" });
    res.json({ message: "Vehículo eliminado correctamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
