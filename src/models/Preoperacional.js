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
  },
  { timestamps: true },
);

const Preoperacional = mongoose.model("Preoperacional", PreoperacionalSchema);

module.exports = Preoperacional;
