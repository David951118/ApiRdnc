const mongoose = require("mongoose");
const { Schema } = mongoose;
const Counter = require("./Counter");

/**
 * OrdenTrabajo (OT)
 * Ciclo de vida del mantenimiento preventivo y correctivo:
 *   ABIERTA → ASIGNADA → EN_PROCESO → CERRADA (o ANULADA)
 *
 * Reemplaza al array embebido Vehiculo.mantenimientos como historial técnico:
 * registra actividades, repuestos, mano de obra, taller y costos.
 */
const OrdenTrabajoSchema = new Schema(
  {
    numero: { type: String, unique: true }, // OT-2026-0001 (auto en pre-save)

    vehiculo: {
      type: Schema.Types.ObjectId,
      ref: "Vehiculo",
      required: true,
      index: true,
    },
    // Denormalizado para multi-tenancy y reportes
    placa: { type: String, uppercase: true },
    empresa: { type: Schema.Types.ObjectId, ref: "Empresa", default: null },

    tipo: {
      type: String,
      enum: ["PREVENTIVO", "CORRECTIVO"],
      required: true,
    },
    origen: {
      type: String,
      enum: ["ALERTA_PLAN", "NOVEDAD_PREOPERACIONAL", "MANUAL", "MIGRACION"],
      default: "MANUAL",
    },
    // Si nace de un plan preventivo: referencia al plan y al ítem que la originó
    plan: { type: Schema.Types.ObjectId, ref: "PlanMantenimiento" },
    planItemId: Schema.Types.ObjectId,
    planItemNombre: String, // ej: ACEITE MOTOR (para buscar historial por ítem)

    estado: {
      type: String,
      enum: ["ABIERTA", "ASIGNADA", "EN_PROCESO", "CERRADA", "ANULADA"],
      default: "ABIERTA",
      index: true,
    },
    prioridad: {
      type: String,
      enum: ["BAJA", "MEDIA", "ALTA", "URGENTE"],
      default: "MEDIA",
    },

    descripcion: { type: String, required: true },
    kilometraje: Number, // km del vehículo al ejecutar el trabajo

    // Asignación
    mecanico: { type: Schema.Types.ObjectId, ref: "Tercero" }, // tercero con rol MECANICO
    taller: String,
    fechaProgramada: Date,
    fechaCierre: Date,

    // Detalle del trabajo
    actividades: [
      {
        descripcion: { type: String, required: true },
        completada: { type: Boolean, default: false },
      },
    ],
    repuestos: [
      {
        nombre: { type: String, required: true },
        cantidad: { type: Number, default: 1, min: 0 },
        costoUnitario: { type: Number, default: 0, min: 0 },
        // Si referencia un repuesto del inventario, al cerrar la OT se
        // descuenta el stock automáticamente (SALIDA en el kardex)
        repuestoId: { type: Schema.Types.ObjectId, ref: "Repuesto" },
      },
    ],
    manoDeObra: {
      horas: { type: Number, default: 0, min: 0 },
      costo: { type: Number, default: 0, min: 0 },
    },
    // Calculados en pre-save: repuestos + mano de obra
    costoRepuestos: { type: Number, default: 0 },
    costoTotal: { type: Number, default: 0 },

    observacionesCierre: String,

    // Trazabilidad propia de la OT
    creadoPor: String,
    historial: [
      {
        fecha: { type: Date, default: Date.now },
        usuario: String,
        accion: String, // CREADA, ASIGNADA, INICIADA, CERRADA, ANULADA, ACTUALIZADA
        detalle: String,
      },
    ],

    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },
  },
  { timestamps: true },
);

OrdenTrabajoSchema.index({ empresa: 1, estado: 1 });
OrdenTrabajoSchema.index({ vehiculo: 1, planItemNombre: 1, estado: 1 });
OrdenTrabajoSchema.index({ fechaCierre: -1 });

// Consecutivo OT-<año>-<seq> y costos calculados
OrdenTrabajoSchema.pre("save", async function () {
  if (this.isNew && !this.numero) {
    const anio = new Date().getFullYear();
    const seq = await Counter.getNextSequence(`ordenTrabajo:${anio}`);
    this.numero = `OT-${anio}-${String(seq).padStart(4, "0")}`;
  }

  this.costoRepuestos = (this.repuestos || []).reduce(
    (sum, r) => sum + (r.cantidad || 0) * (r.costoUnitario || 0),
    0,
  );
  this.costoTotal = this.costoRepuestos + (this.manoDeObra?.costo || 0);
});

OrdenTrabajoSchema.methods.softDelete = function (userId) {
  this.deletedAt = new Date();
  this.deletedBy = userId || null;
  return this.save();
};

OrdenTrabajoSchema.methods.restore = function () {
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

const OrdenTrabajo = mongoose.model("OrdenTrabajo", OrdenTrabajoSchema);

module.exports = OrdenTrabajo;
