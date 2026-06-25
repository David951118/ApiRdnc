const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Punto de una ruta (parada / waypoint ordenado).
 * lat/lng son opcionales: una ruta puede tener solo nombres de lugares,
 * y opcionalmente coordenadas si se ubicaron en el mapa.
 */
const PuntoRutaSchema = new Schema(
  {
    orden: { type: Number, default: 0 },
    nombre: { type: String, required: true, trim: true }, // Ej: "Pasto, Nariño"
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
  },
  { _id: false },
);

// Coordenada simple (extremo de un tramo)
const CoordSchema = new Schema(
  {
    nombre: { type: String, trim: true },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
  },
  { _id: false },
);

/**
 * Tramo de la ruta: un trayecto origen → destino con su distancia aproximada.
 * Ej: { origen: Pasto, destino: Ipiales, distanciaKm: 80 }
 */
const TramoRutaSchema = new Schema(
  {
    orden: { type: Number, default: 0 },
    origen: { type: CoordSchema, required: true },
    destino: { type: CoordSchema, required: true },
    distanciaKm: { type: Number, default: null },
  },
  { _id: false },
);

/**
 * Ruta
 * Catálogo de trayectos estándar para FUEC.
 */
const RutaSchema = new Schema(
  {
    nombre: { type: String, trim: true }, // Ej: "BOGOTA - MEDELLIN"
    origen: { type: String, required: true, trim: true }, // Municipio
    destino: { type: String, required: true, trim: true }, // Municipio

    // Tramos de la ruta (origen → destino con distancia aproximada por segmento).
    tramos: { type: [TramoRutaSchema], default: [] },

    // Puntos ordenados derivados de los tramos (para mapa/compatibilidad).
    puntos: { type: [PuntoRutaSchema], default: [] },

    // Descripción detallada del recorrido (para FUEC). Si no se envía se deriva
    // de los nombres de los puntos.
    recorrido: { type: String },

    distanciaKm: Number,
    duracionEstimadaHoras: Number,

    // Ruta marcada como favorita para reusarla rápido.
    favorita: { type: Boolean, default: false },

    // Si es una ruta frecuente de un contrato específico
    contratoAsociado: { type: String }, // Opcional

    activo: { type: Boolean, default: true },
    empresa: { type: Schema.Types.ObjectId, ref: "Empresa", index: true },
    creadoPor: { type: String },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },
  },
  { timestamps: true },
);

RutaSchema.index({ origen: 1, destino: 1 });

RutaSchema.methods.softDelete = function (userId) {
  this.deletedAt = new Date();
  this.deletedBy = userId || null;
  return this.save();
};

RutaSchema.methods.restore = function () {
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

const Ruta = mongoose.model("Ruta", RutaSchema);

module.exports = Ruta;
