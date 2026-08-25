const mongoose = require("mongoose");

/**
 * Publicación para redes sociales generada desde /rndc/estudio.
 * El admin ingresa tema + texto + fotos; Gemini compone la imagen en formato
 * Instagram (1080x1080) y el caption. La publicación en la red es manual:
 * el admin descarga la imagen y copia el caption.
 */
const publicacionSocialSchema = new mongoose.Schema(
  {
    tema: { type: String, required: true, trim: true },
    texto: { type: String, default: "" },

    // Fotos originales que subió el admin (S3)
    fotos: [
      {
        key: String,
        url: String,
      },
    ],

    // Imagen final compuesta por Gemini (S3)
    imagenGenerada: {
      key: { type: String, default: "" },
      url: { type: String, default: "" },
    },

    caption: { type: String, default: "" },
    red: { type: String, enum: ["INSTAGRAM"], default: "INSTAGRAM" },

    estado: {
      type: String,
      enum: ["GENERADA", "PUBLICADA"],
      default: "GENERADA",
      index: true,
    },

    modeloImagen: { type: String, default: "" },
    modeloTexto: { type: String, default: "" },

    // userId de Cellvi (string, no ObjectId)
    creadoPor: { type: String, default: "" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("PublicacionSocial", publicacionSocialSchema);
