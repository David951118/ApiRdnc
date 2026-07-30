const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Remesa Terrestre de Carga expedida (o por expedir) ante el RNDC
 * mediante el proceso 3 del Web Service, en nombre de una empresa de
 * transporte cliente.
 *
 * Estados: BORRADOR → RADICADA → CUMPLIDA / ANULADA
 */
const RemesaExpedidaSchema = new Schema(
  {
    empresa: {
      type: Schema.Types.ObjectId,
      ref: "Empresa",
      required: true,
      index: true,
    },

    consecutivoRemesa: { type: String, required: true },

    estado: {
      type: String,
      enum: ["BORRADOR", "RADICADA", "CUMPLIDA", "ANULADA"],
      default: "BORRADOR",
      index: true,
    },

    // Variables del diccionario RNDC enviadas (sin credenciales)
    datos: { type: Schema.Types.Mixed, default: {} },

    // Radicación en el RNDC
    ingresoid: String,
    fechaRadicacion: Date,
    ambiente: { type: String, enum: ["PRUEBAS", "PRODUCCION"], default: "PRUEBAS" },

    // Cumplido (proceso 5)
    ingresoidCumplido: String,
    fechaCumplido: Date,

    // Anulación (proceso 9)
    fechaAnulacion: Date,
    motivoAnulacion: String,

    // Último error devuelto por el RNDC (para reintentar desde el front)
    ultimoError: String,

    creadoPor: { type: Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

RemesaExpedidaSchema.index(
  { empresa: 1, consecutivoRemesa: 1 },
  { unique: true },
);

module.exports = mongoose.model("RemesaExpedida", RemesaExpedidaSchema);
