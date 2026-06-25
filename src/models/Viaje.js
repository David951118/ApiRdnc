const mongoose = require("mongoose");
const { Schema } = mongoose;
const Counter = require("./Counter");

/**
 * Viaje - Bitácora de operación logística
 *
 * Unifica tres requerimientos de la operación logística:
 *   - Asignación de vehículos:  relación vehículo–conductor–ruta
 *   - Bitácora de operación:    km inicio/fin, entregas, incidencias
 *   - Control de cargas y peso: pesoCargaKg + bandera de sobrecarga
 *
 * Ciclo de vida: PROGRAMADO → EN_CURSO → FINALIZADO (o CANCELADO)
 * Km recorrido y duración se calculan al finalizar.
 */
const EntregaSchema = new Schema(
  {
    cliente: String,
    direccion: String,
    horaProgramada: Date,
    horaEntrega: Date,
    estado: {
      type: String,
      enum: ["PENDIENTE", "ENTREGADA", "FALLIDA", "PARCIAL"],
      default: "PENDIENTE",
    },
    observacion: String,
  },
  { _id: true },
);

const IncidenciaSchema = new Schema(
  {
    tipo: {
      type: String,
      enum: ["MECANICA", "TRAFICO", "ACCIDENTE", "CLIMA", "SEGURIDAD", "OTRO"],
      default: "OTRO",
    },
    descripcion: { type: String, required: true },
    hora: { type: Date, default: Date.now },
  },
  { _id: true },
);

const ViajeSchema = new Schema(
  {
    numero: { type: String, unique: true }, // VJ-2026-0001

    vehiculo: {
      type: Schema.Types.ObjectId,
      ref: "Vehiculo",
      required: true,
      index: true,
    },
    placa: { type: String, uppercase: true },
    conductor: {
      type: Schema.Types.ObjectId,
      ref: "Tercero",
      required: true,
      index: true,
    },
    ruta: { type: Schema.Types.ObjectId, ref: "Ruta" },

    // Origen/destino (si no hay ruta de catálogo)
    origen: String,
    destino: String,

    estado: {
      type: String,
      enum: ["PROGRAMADO", "EN_CURSO", "FINALIZADO", "CANCELADO"],
      default: "PROGRAMADO",
      index: true,
    },

    // Tiempos
    fechaProgramada: Date,
    fechaSalida: Date,
    fechaLlegada: Date,
    duracionMinutos: Number, // calculado al finalizar

    // Kilometraje
    kmInicio: Number,
    kmFin: Number,
    kmRecorrido: Number, // calculado: kmFin - kmInicio

    // Control de carga y peso
    carga: {
      pesoKg: Number,
      descripcion: String,
      sobrecarga: { type: Boolean, default: false }, // calculado vs vehículo
      excesoKg: Number, // cuánto se pasó del tope (si sobrecarga)
    },

    entregas: [EntregaSchema],
    incidencias: [IncidenciaSchema],
    observaciones: String,

    // Multi-tenancy y trazabilidad
    empresa: { type: Schema.Types.ObjectId, ref: "Empresa", default: null },
    creadoPor: String,
    historial: [
      {
        fecha: { type: Date, default: Date.now },
        usuario: String,
        accion: String,
        detalle: String,
      },
    ],

    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },
  },
  { timestamps: true },
);

ViajeSchema.index({ empresa: 1, estado: 1 });
ViajeSchema.index({ vehiculo: 1, fechaSalida: -1 });

ViajeSchema.pre("save", async function () {
  if (this.isNew && !this.numero) {
    const anio = new Date().getFullYear();
    const seq = await Counter.getNextSequence(`viaje:${anio}`);
    this.numero = `VJ-${anio}-${String(seq).padStart(4, "0")}`;
  }

  // Km recorrido
  if (this.kmInicio != null && this.kmFin != null) {
    this.kmRecorrido = Math.max(0, this.kmFin - this.kmInicio);
  }

  // Duración
  if (this.fechaSalida && this.fechaLlegada) {
    this.duracionMinutos = Math.max(
      0,
      Math.round((this.fechaLlegada - this.fechaSalida) / 60000),
    );
  }
});

ViajeSchema.methods.softDelete = function (userId) {
  this.deletedAt = new Date();
  this.deletedBy = userId || null;
  return this.save();
};

ViajeSchema.methods.restore = function () {
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

const Viaje = mongoose.model("Viaje", ViajeSchema);

module.exports = Viaje;
