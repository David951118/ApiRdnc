const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Manifiesto de Carga expedido (o por expedir) ante el RNDC mediante el
 * proceso 4 del Web Service, en nombre de una empresa de transporte cliente.
 *
 * Estados: BORRADOR → RADICADO → ACEPTADO → CUMPLIDO / ANULADO
 */
const ManifiestoExpedidoSchema = new Schema(
  {
    empresa: {
      type: Schema.Types.ObjectId,
      ref: "Empresa",
      required: true,
      index: true,
    },

    numManifiestoCarga: { type: String, required: true },

    estado: {
      type: String,
      enum: ["BORRADOR", "RADICADO", "ACEPTADO", "CUMPLIDO", "ANULADO"],
      default: "BORRADOR",
      index: true,
    },

    // Variables del diccionario RNDC enviadas (sin credenciales)
    datos: { type: Schema.Types.Mixed, default: {} },

    // Remesas asociadas (consecutivos enviados en REMESASMAN)
    remesas: [{ type: Schema.Types.ObjectId, ref: "RemesaExpedida" }],
    consecutivosRemesas: [String],

    // Radicación en el RNDC
    ingresoid: String,
    fechaRadicacion: Date,
    ambiente: { type: String, enum: ["PRUEBAS", "PRODUCCION"], default: "PRUEBAS" },

    // Aceptación electrónica (proceso 73)
    aceptacion: {
      fecha: Date,
      tipo: String, // T = titular, C = conductor
      observacion: String,
    },

    // Cumplido (proceso 6)
    ingresoidCumplido: String,
    fechaCumplido: Date,

    // Anulación (proceso 32)
    fechaAnulacion: Date,
    motivoAnulacion: String,

    ultimoError: String,

    creadoPor: { type: Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

ManifiestoExpedidoSchema.index(
  { empresa: 1, numManifiestoCarga: 1 },
  { unique: true },
);

module.exports = mongoose.model("ManifiestoExpedido", ManifiestoExpedidoSchema);
