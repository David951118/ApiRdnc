const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Counter - Secuencias auto-incrementales atómicas.
 * Cada documento representa un contador identificado por `_id` (string key).
 * Ejemplo keys:
 *   "preop:VEHICULO_ID"  -> consecutivo por vehículo
 */
const CounterSchema = new Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

/**
 * Incrementa y retorna el siguiente valor del contador.
 * @param {string} counterKey - Identificador del contador
 * @returns {Promise<number>} El nuevo valor secuencial
 */
CounterSchema.statics.getNextSequence = async function (counterKey) {
  const counter = await this.findOneAndUpdate(
    { _id: counterKey },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );
  return counter.seq;
};

const Counter = mongoose.model("Counter", CounterSchema);

module.exports = Counter;
