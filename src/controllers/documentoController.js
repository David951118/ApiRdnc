const Documento = require("../models/Documento");

// Subir Documento (Simulado Metadata por ahora)
exports.upload = async (req, res) => {
  try {
    // Aquí iría la lógica de S3 o Multer
    const documento = new Documento(req.body);
    documento.subidoPor = req.user ? req.user._id : null;
    await documento.save();
    res.status(201).json(documento);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Listar documentos de una entidad
exports.getByEntity = async (req, res) => {
  try {
    const { entidadId } = req.params;
    const documentos = await Documento.find({ entidadId }).sort({
      fechaVencimiento: 1,
    });
    res.json(documentos);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Documento.findByIdAndUpdate(id, req.body, { new: true });
    if (!doc)
      return res.status(404).json({ message: "Documento no encontrado" });
    res.json(doc);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    await Documento.findByIdAndDelete(id);
    res.json({ message: "Documento eliminado" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
