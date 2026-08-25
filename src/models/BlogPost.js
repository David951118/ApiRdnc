const mongoose = require("mongoose");

/**
 * Entrada del blog de la página web de Asegurar.
 * Administrada únicamente por el rol ADMIN desde /rndc/estudio;
 * el sitio público la consume vía GET /api/contenido/blog/public.
 */
const blogPostSchema = new mongoose.Schema(
  {
    titulo: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    // Subtítulo / bajada de la noticia
    titulo2: { type: String, default: "" },
    // Resumen corto para la tarjeta del listado
    resumen: { type: String, default: "" },
    // Cuerpo en texto plano (respaldo / entrada del editor antes del diseño IA)
    cuerpo: { type: String, default: "" },
    // Contenido rico en bloques (el formato del renderizador del sitio):
    // { tipo: "parrafo"|"subtitulo"|"imagen"|"galeria"|"cita"|"datos"|"destacado"|"lista"|"link"|"pdf", ... }
    contenido: { type: [mongoose.Schema.Types.Mixed], default: [] },
    categoria: { type: String, default: "Noticias" },
    tags: { type: [String], default: [] },
    lectura: { type: String, default: "" },
    autor: { type: String, default: "Asegurar Ltda." },

    // Imagen de portada e imágenes adicionales (S3)
    portada: {
      key: { type: String, default: "" },
      url: { type: String, default: "" },
    },
    imagenes: [
      {
        key: String,
        url: String,
        alt: { type: String, default: "" },
      },
    ],

    estado: {
      type: String,
      enum: ["BORRADOR", "PUBLICADO"],
      default: "BORRADOR",
      index: true,
    },
    fechaPublicacion: { type: Date, default: null },

    // userId de Cellvi (string, no ObjectId)
    creadoPor: { type: String, default: "" },
    actualizadoPor: { type: String, default: "" },
  },
  { timestamps: true },
);

blogPostSchema.index({ estado: 1, fechaPublicacion: -1 });

module.exports = mongoose.model("BlogPost", blogPostSchema);
