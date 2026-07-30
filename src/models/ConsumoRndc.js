const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Contador mensual de operaciones de expedición RNDC por empresa —
 * base de la monetización (pago por uso / bolsas / planes).
 *
 * Solo se incrementa cuando el RNDC devuelve radicado (ingresoid):
 * los errores y reintentos NUNCA se cuentan.
 */
const ConsumoRndcSchema = new Schema(
  {
    empresa: {
      type: Schema.Types.ObjectId,
      ref: "Empresa",
      required: true,
    },
    // Periodo de facturación "AAAA-MM"
    periodo: { type: String, required: true },

    manifiestosExpedidos: { type: Number, default: 0 },
    remesasExpedidas: { type: Number, default: 0 },
    anulaciones: { type: Number, default: 0 },
    cumplidos: { type: Number, default: 0 },

    // Solo cuenta operaciones de PRODUCCION; las de pruebas van aparte
    manifiestosPruebas: { type: Number, default: 0 },
    remesasPruebas: { type: Number, default: 0 },

    // Cupo del plan (null = sin límite / pago por uso puro).
    // El middleware de cupo está listo pero solo actúa si se define.
    cupoManifiestos: { type: Number, default: null },
  },
  { timestamps: true },
);

ConsumoRndcSchema.index({ empresa: 1, periodo: 1 }, { unique: true });

/**
 * Incrementa un contador del periodo actual de forma atómica.
 * @param {ObjectId} empresaId
 * @param {string} campo - manifiestosExpedidos | remesasExpedidas | anulaciones | cumplidos | manifiestosPruebas | remesasPruebas
 * @param {number} n
 */
ConsumoRndcSchema.statics.incrementar = function (empresaId, campo, n = 1) {
  const ahora = new Date();
  const periodo = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;
  return this.findOneAndUpdate(
    { empresa: empresaId, periodo },
    { $inc: { [campo]: n } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
};

module.exports = mongoose.model("ConsumoRndc", ConsumoRndcSchema);
