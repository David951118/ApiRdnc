const mongoose = require("mongoose");

/**
 * Modelo para configuración del sistema
 */
const configuracionSchema = new mongoose.Schema(
  {
    clave: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    valor: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    descripcion: String,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Configuracion", configuracionSchema);
