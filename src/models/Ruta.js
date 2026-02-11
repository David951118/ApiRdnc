const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Ruta
 * Catálogo de trayectos estándar para FUEC.
 */
const RutaSchema = new Schema(
  {
    nombre: { type: String, trim: true }, // Ej: "BOGOTA - MEDELLIN"
    origen: { type: String, required: true, trim: true }, // Municipio
    destino: { type: String, required: true, trim: true }, // Municipio

    // Descripción detallada del recorrido (Obligatorio en FUEC)
    // Ej: "Salir por Calle 80 - La Vega - Villeta - Guaduas..."
    recorrido: { type: String, required: true },

    distanciaKm: Number,
    duracionEstimadaHoras: Number,

    // Si es una ruta frecuente de un contrato específico
    contratoAsociado: { type: String }, // Opcional

    activo: { type: Boolean, default: true },
  },
  { timestamps: true },
);

RutaSchema.index({ origen: 1, destino: 1 });

const Ruta = mongoose.model("Ruta", RutaSchema);

module.exports = Ruta;
