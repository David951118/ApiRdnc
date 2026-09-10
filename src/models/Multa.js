const mongoose = require("mongoose");
const { Schema } = mongoose;
const Counter = require("./Counter");

/**
 * Multa / comparendo de tránsito.
 *
 * Registra la infracción (vehículo, conductor, autoridad, valor, fotos) y, si
 * la autoridad inmovilizó el vehículo, el ciclo de la inmovilización:
 *
 *   INMOVILIZADO → CORRECCION_SUBIDA → LEVANTADA
 *
 * Mientras la inmovilización esté vigente el vehículo sale de operación
 * (Vehiculo.estado = "INMOVILIZADO"): no admite preoperacionales ni viajes y
 * descuenta disponibilidad de flota. El estado de la multa en sí (pago) es
 * independiente: PENDIENTE → PAGADA | IMPUGNADA | ANULADA.
 *
 * El costo total (valor + grúa + patios) se suma a los KPIs como gasto del
 * vehículo, junto con mantenimiento y combustible.
 */

const ArchivoSchema = new Schema(
  {
    url: { type: String, required: true },
    key: { type: String, required: true }, // S3 key para poder borrarlo
    nombre: String,
    mimeType: String,
    tamano: Number,
    subidoPor: String,
    fecha: { type: Date, default: Date.now },
  },
  { _id: true },
);

const MULTA_ESTADOS = ["PENDIENTE", "PAGADA", "IMPUGNADA", "ANULADA"];
const INMOVILIZACION_ESTADOS = [
  "NO_APLICA",
  "INMOVILIZADO",
  "CORRECCION_SUBIDA",
  "LEVANTADA",
];
const RESPONSABLES = ["EMPRESA", "CONDUCTOR", "PROPIETARIO"];

const MultaSchema = new Schema(
  {
    numero: { type: String, unique: true }, // MUL-2026-0001 (auto en pre-save)

    vehiculo: {
      type: Schema.Types.ObjectId,
      ref: "Vehiculo",
      required: true,
      index: true,
    },
    placa: { type: String, uppercase: true }, // denormalizado
    empresa: { type: Schema.Types.ObjectId, ref: "Empresa", default: null },

    // Conductor: si está en la plataforma se referencia el Tercero; si no,
    // se guardan sus datos sueltos para no perder la trazabilidad.
    conductor: { type: Schema.Types.ObjectId, ref: "Tercero", default: null },
    conductorRegistrado: { type: Boolean, default: false },
    conductorNoRegistrado: {
      nombres: String,
      apellidos: String,
      tipoId: String,
      identificacion: String,
      telefono: String,
      licencia: String,
    },

    // Datos de la infracción
    fecha: { type: Date, required: true, index: true }, // fecha/hora de la infracción
    numeroComparendo: { type: String, trim: true },
    codigoInfraccion: { type: String, trim: true, uppercase: true }, // ej. C02, D02
    descripcion: { type: String, required: true },
    autoridad: { type: String, trim: true }, // Secretaría de Movilidad, Policía de Tránsito...
    agente: { type: String, trim: true },
    ciudad: { type: String, trim: true },
    lugar: { type: String, trim: true },

    // Dinero
    valor: { type: Number, required: true, min: 0 },
    fechaLimitePago: Date,
    responsable: { type: String, enum: RESPONSABLES, default: "EMPRESA" },
    estado: {
      type: String,
      enum: MULTA_ESTADOS,
      default: "PENDIENTE",
      index: true,
    },
    pago: {
      valorPagado: { type: Number, default: 0, min: 0 },
      fechaPago: Date,
      comprobante: { type: ArchivoSchema, default: null },
      observaciones: String,
      registradoPor: String,
    },
    impugnacion: {
      motivo: String,
      fecha: Date,
      registradoPor: String,
    },
    anulacion: {
      motivo: String,
      fecha: Date,
      registradoPor: String,
    },

    // Evidencia de la multa (foto del comparendo, del vehículo, etc.)
    fotos: [ArchivoSchema],

    // Inmovilización del vehículo por la autoridad
    inmovilizacion: {
      aplica: { type: Boolean, default: false },
      estado: {
        type: String,
        enum: INMOVILIZACION_ESTADOS,
        default: "NO_APLICA",
        index: true,
      },
      fechaInicio: Date,
      patio: String, // patios / parqueadero donde quedó el vehículo
      motivo: String,
      costoGrua: { type: Number, default: 0, min: 0 },
      costoPatios: { type: Number, default: 0, min: 0 },
      // Estado del vehículo antes de inmovilizarlo, para restaurarlo al levantar
      estadoVehiculoAnterior: String,
      // Corrección subida (por el conductor o por administración) para
      // demostrar que la causa de la inmovilización quedó resuelta
      correccion: {
        descripcion: String,
        evidencias: [ArchivoSchema],
        fecha: Date,
        subidoPor: String,
        subidoPorNombre: String,
      },
      fechaLevantamiento: Date,
      levantadaPor: String,
      observacionesLevantamiento: String,
      // true si se levantó sin corrección (decisión administrativa)
      levantadaForzada: { type: Boolean, default: false },
    },

    // valor + grúa + patios (calculado en pre-save; es lo que suma a los KPIs)
    costoTotal: { type: Number, default: 0 },

    observaciones: String,

    registradoPor: String,
    registradoPorNombre: String,
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

MultaSchema.index({ empresa: 1, estado: 1 });
MultaSchema.index({ vehiculo: 1, fecha: -1 });
MultaSchema.index({ conductor: 1 });

MultaSchema.pre("save", async function () {
  if (this.isNew && !this.numero) {
    const anio = new Date().getFullYear();
    const seq = await Counter.getNextSequence(`multa:${anio}`);
    this.numero = `MUL-${anio}-${String(seq).padStart(4, "0")}`;
  }
  const inm = this.inmovilizacion || {};
  this.costoTotal =
    (this.valor || 0) + (inm.costoGrua || 0) + (inm.costoPatios || 0);
});

/** true si la inmovilización sigue vigente (el vehículo no debe operar) */
MultaSchema.methods.inmovilizacionVigente = function () {
  return (
    this.inmovilizacion?.aplica &&
    ["INMOVILIZADO", "CORRECCION_SUBIDA"].includes(this.inmovilizacion.estado) &&
    this.estado !== "ANULADA" &&
    !this.deletedAt
  );
};

MultaSchema.methods.softDelete = function (userId) {
  this.deletedAt = new Date();
  this.deletedBy = userId || null;
  return this.save();
};

MultaSchema.methods.restore = function () {
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

MultaSchema.statics.MULTA_ESTADOS = MULTA_ESTADOS;
MultaSchema.statics.INMOVILIZACION_ESTADOS = INMOVILIZACION_ESTADOS;
MultaSchema.statics.RESPONSABLES = RESPONSABLES;
/** Estados de inmovilización que mantienen al vehículo fuera de operación */
MultaSchema.statics.INMOVILIZACION_ACTIVA = ["INMOVILIZADO", "CORRECCION_SUBIDA"];

const Multa = mongoose.model("Multa", MultaSchema);

module.exports = Multa;
