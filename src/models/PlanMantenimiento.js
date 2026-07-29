const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * PlanMantenimiento
 * Define los intervalos de mantenimiento preventivo y sus ítems
 * (llantas, pastillas, aceite, insumos propios de cada vehículo).
 *
 * Un plan aplica a:
 *  - vehículos específicos (campo vehiculos), y/o
 *  - una clase de vehículo (campo claseVehiculo), y/o
 *  - toda la flota (aplicaTodos)
 */
const ItemPlanSchema = new Schema(
  {
    nombre: { type: String, required: true }, // ej: ACEITE MOTOR, LLANTAS, PASTILLAS FRENO
    descripcion: String,
    // Intervalos: al menos uno de los dos. El que se cumpla primero dispara la alerta.
    intervaloKm: Number, // ej: cada 5000 km
    intervaloDias: Number, // ej: cada 180 días
    // Anticipación de la alerta (cuánto antes avisar)
    umbralAlertaKm: { type: Number, default: 500 },
    umbralAlertaDias: { type: Number, default: 15 },
    // Mantenimiento ÚNICO (one-shot): un solo servicio a un kilometraje objetivo
    // ABSOLUTO (ej. vehículo en 20.000 → servicio a los 27.000, solo esa vez).
    // Cuando unaVez=true se ignoran los intervalos y, una vez cerrada la OT del
    // ítem, no vuelve a generar alertas.
    unaVez: { type: Boolean, default: false },
    kmObjetivo: Number, // km absoluto del único servicio (solo si unaVez)
  },
  { _id: true },
);

const PlanMantenimientoSchema = new Schema(
  {
    nombre: { type: String, required: true },
    descripcion: String,

    // Alcance del plan
    vehiculos: [{ type: Schema.Types.ObjectId, ref: "Vehiculo" }],
    claseVehiculo: String, // ej: "CAMIONETA - VAN" (match contra Vehiculo.claseVehiculo)
    aplicaTodos: { type: Boolean, default: false },

    items: {
      type: [ItemPlanSchema],
      validate: [(v) => v.length > 0, "El plan debe tener al menos un ítem"],
    },

    // Multi-tenancy: empresa dueña del plan (null = global, solo ADMIN)
    empresa: { type: Schema.Types.ObjectId, ref: "Empresa", default: null },

    activo: { type: Boolean, default: true },
    creadoPor: String,

    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },
  },
  { timestamps: true },
);

PlanMantenimientoSchema.index({ empresa: 1, activo: 1 });

PlanMantenimientoSchema.methods.softDelete = function (userId) {
  this.deletedAt = new Date();
  this.deletedBy = userId || null;
  return this.save();
};

PlanMantenimientoSchema.methods.restore = function () {
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

const PlanMantenimiento = mongoose.model(
  "PlanMantenimiento",
  PlanMantenimientoSchema,
);

module.exports = PlanMantenimiento;
