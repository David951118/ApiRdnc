const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * CargaCombustible - Tanqueos
 * Cada registro es un tanqueo. El rendimiento (km/galón) se calcula con el
 * método "tanque a tanque" en el servicio de operación, ordenando los tanqueos
 * de un vehículo por kilometraje.
 */
const CargaCombustibleSchema = new Schema(
  {
    vehiculo: {
      type: Schema.Types.ObjectId,
      ref: "Vehiculo",
      required: true,
      index: true,
    },
    placa: { type: String, uppercase: true },
    conductor: { type: Schema.Types.ObjectId, ref: "Tercero" },
    viaje: { type: Schema.Types.ObjectId, ref: "Viaje" }, // opcional

    fecha: { type: Date, default: Date.now, index: true },
    kmTanqueo: { type: Number, required: true }, // odómetro al tanquear

    galones: { type: Number, required: true, min: 0 },
    costoTotal: { type: Number, default: 0, min: 0 },
    costoPorGalon: { type: Number, default: 0, min: 0 },

    tipoCombustible: {
      type: String,
      enum: ["GASOLINA", "DIESEL", "GAS"],
    },
    estacion: String, // estación de servicio
    tanqueLleno: { type: Boolean, default: true }, // necesario para rendimiento tanque-a-tanque

    // Rendimiento del tramo desde el tanqueo anterior (km/galón), calculado y
    // guardado al registrar para consultas rápidas. Null en el primer tanqueo.
    rendimientoTramo: Number,

    empresa: { type: Schema.Types.ObjectId, ref: "Empresa", default: null },
    registradoPor: String,

    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },
  },
  { timestamps: true },
);

CargaCombustibleSchema.index({ vehiculo: 1, kmTanqueo: 1 });

CargaCombustibleSchema.pre("save", function () {
  // Derivar costo por galón si solo viene el total
  if (this.costoTotal > 0 && this.galones > 0 && !this.costoPorGalon) {
    this.costoPorGalon = Math.round(this.costoTotal / this.galones);
  }
  if (this.costoPorGalon > 0 && this.galones > 0 && !this.costoTotal) {
    this.costoTotal = Math.round(this.costoPorGalon * this.galones);
  }
});

CargaCombustibleSchema.methods.softDelete = function (userId) {
  this.deletedAt = new Date();
  this.deletedBy = userId || null;
  return this.save();
};

const CargaCombustible = mongoose.model(
  "CargaCombustible",
  CargaCombustibleSchema,
);

module.exports = CargaCombustible;
