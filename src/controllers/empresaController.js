const Empresa = require("../models/Empresa");

// Crear Empresa (Solo ADMIN)
exports.create = async (req, res) => {
  try {
    const empresa = new Empresa(req.body);
    await empresa.save();
    res.status(201).json(empresa);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: "Duplicado",
        message: "Ya existe una empresa con ese NIT.",
      });
    }
    res.status(400).json({ message: error.message });
  }
};

// Listar todas las empresas
exports.getAll = async (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { razonSocial: new RegExp(search, "i") },
        { nit: new RegExp(search, "i") },
      ];
    }

    const empresas = await Empresa.find(query)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ razonSocial: 1 });

    const total = await Empresa.countDocuments(query);

    res.json({
      empresas,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener una empresa
exports.getOne = async (req, res) => {
  try {
    const empresa = await Empresa.findById(req.params.id);
    if (!empresa)
      return res.status(404).json({ message: "Empresa no encontrada" });
    res.json(empresa);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Actualizar empresa
exports.update = async (req, res) => {
  try {
    const empresa = await Empresa.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!empresa)
      return res.status(404).json({ message: "Empresa no encontrada" });
    res.json(empresa);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Eliminar empresa
exports.delete = async (req, res) => {
  try {
    const empresa = await Empresa.findByIdAndDelete(req.params.id);
    if (!empresa)
      return res.status(404).json({ message: "Empresa no encontrada" });
    res.json({ message: "Empresa eliminada correctamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
