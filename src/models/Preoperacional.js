const mongoose = require("mongoose");
const { Schema } = mongoose;

const ItemRevisionSchema = new Schema(
  {
    estado: {
      type: String,
      enum: ["OK", "FALLA", "NO_APLICA"],
      required: true,
    },
    observaciones: String,
    fotoUrl: String, // Evidencia del fallo o estado
  },
  { _id: false },
);

const PreoperacionalSchema = new Schema(
  {
    vehiculo: { type: Schema.Types.ObjectId, ref: "Vehiculo", required: true },
    conductor: { type: Schema.Types.ObjectId, ref: "Tercero", required: true }, // Quien realiza
    fecha: { type: Date, default: Date.now },
    kilometraje: Number,

    // División por Secciones Físicas
    seccionDelantera: {
      luces: ItemRevisionSchema,
      direccionalesDelanteros: ItemRevisionSchema,
      limpiabrisas: ItemRevisionSchema, // Todo parabrisas
      espejosRetrovisores: ItemRevisionSchema,
      liquidos: ItemRevisionSchema,
      llantaDelanteraDerecha: ItemRevisionSchema,
      llantaDelanteraIzquierda: ItemRevisionSchema,
      bocina: ItemRevisionSchema,
      frenos: ItemRevisionSchema,
    },

    seccionMedia: {
      tablero: ItemRevisionSchema,
      timon: ItemRevisionSchema,
      cinturones: ItemRevisionSchema,
      pedales: ItemRevisionSchema,
      frenoMano: ItemRevisionSchema,
      bateria: ItemRevisionSchema,
      kitCarretera: ItemRevisionSchema,
      reflectivos: ItemRevisionSchema,
    },

    seccionTrasera: {
      stop: ItemRevisionSchema,
      llantasRepuesto: ItemRevisionSchema,
      equipoCarretera: ItemRevisionSchema,
      llantaTraseraDerecha: ItemRevisionSchema,
      llantaTraseraIzquierda: ItemRevisionSchema,
      direccionalesTraseros: ItemRevisionSchema,
      placa: ItemRevisionSchema,
    },

    // Resultado Global
    estadoGeneral: {
      type: String,
      enum: ["APROBADO", "RECHAZADO"],
      required: true,
    },
    firmadoCheck: Boolean,
    firmaConductorUrl: String,

    // Soft Delete
    deletedAt: { type: Date, default: null },
    eliminadoPor: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

PreoperacionalSchema.index({ vehiculo: 1, fecha: -1 });
PreoperacionalSchema.index({ conductor: 1, fecha: -1 });
PreoperacionalSchema.index({ deletedAt: 1 });

PreoperacionalSchema.methods.softDelete = async function (userId) {
  this.deletedAt = new Date();
  this.eliminadoPor = userId;
  return await this.save();
};

PreoperacionalSchema.methods.restore = async function () {
  this.deletedAt = null;
  this.eliminadoPor = null;
  return await this.save();
};

PreoperacionalSchema.query.notDeleted = function () {
  return this.where({ deletedAt: null });
};

const Preoperacional = mongoose.model("Preoperacional", PreoperacionalSchema);

module.exports = Preoperacional;
