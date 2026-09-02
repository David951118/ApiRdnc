const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Snapshot diario del odómetro de cada vehículo.
 *
 * Un worker (workers/kilometrajeDiario.js) captura una vez al día el
 * kilometraje resuelto (Cellvi GPS → preoperacional → manual) y lo guarda por
 * día calendario colombiano. Con dos snapshots se obtiene el recorrido REAL
 * del vehículo en cualquier rango (odómetro final - inicial), sin depender de
 * las rutas: cubre también lo que el vehículo se mueve por fuera de ellas.
 */
const KilometrajeDiarioSchema = new Schema(
  {
    vehiculo: {
      type: Schema.Types.ObjectId,
      ref: "Vehiculo",
      required: true,
    },
    placa: { type: String, trim: true, uppercase: true },
    // Día calendario en zona America/Bogota, formato "YYYY-MM-DD"
    fecha: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    kilometraje: { type: Number, required: true, min: 0 },
    fuente: {
      type: String,
      enum: ["CELLVI_GPS", "PREOPERACIONAL", "MANUAL"],
      required: true,
    },
    capturadoEn: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// Un snapshot por vehículo por día (el worker hace upsert: la última captura
// del día es la que queda).
KilometrajeDiarioSchema.index({ vehiculo: 1, fecha: 1 }, { unique: true });
KilometrajeDiarioSchema.index({ fecha: 1 });

module.exports = mongoose.model("KilometrajeDiario", KilometrajeDiarioSchema);
