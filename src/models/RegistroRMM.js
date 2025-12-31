const mongoose = require("mongoose");

/**
 * Modelo para Registro de Monitoreo de Manifiesto (RMM)
 * Cola de reportes a enviar al RNDC2
 */
const registroRMMSchema = new mongoose.Schema(
  {
    // Relaciones
    manifiestoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Manifiesto",
      required: true,
      index: true,
    },
    puntoControlId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      comment: "ID del punto dentro del array puntosControl",
    },

    // Datos para RNDC2
    ingresoidManifiesto: {
      type: String,
      required: true,
    },
    numPlaca: {
      type: String,
      required: true,
      uppercase: true,
    },
    codigoPuntoControl: {
      type: Number,
      required: true,
    },

    // Ubicación y tiempo de LLEGADA
    latitudLlegada: {
      type: Number,
      required: true,
    },
    longitudLlegada: {
      type: Number,
      required: true,
    },
    fechaLlegada: {
      type: String,
      required: true,
      comment: "Formato DD/MM/YYYY",
    },
    horaLlegada: {
      type: String,
      required: true,
      comment: "Formato HH:MM",
    },

    // Ubicación y tiempo de SALIDA (opcional)
    latitudSalida: Number,
    longitudSalida: Number,
    fechaSalida: {
      type: String,
      comment: "Formato DD/MM/YYYY",
    },
    horaSalida: {
      type: String,
      comment: "Formato HH:MM",
    },

    // Sin salida (si aplica)
    sinSalida: {
      type: Boolean,
      default: false,
    },

    // Estado del reporte
    estado: {
      type: String,
      enum: ["pendiente", "enviando", "reportado", "vencido", "error"],
      default: "pendiente",
      index: true,
    },

    // Control de envío
    fechaLimiteReporte: {
      type: Date,
      required: true,
      index: true,
      comment: "fechaLlegada + 72 horas",
    },
    intentos: {
      type: Number,
      default: 0,
    },
    ultimoIntento: Date,

    // Respuesta RNDC
    radicadoRNDC: {
      type: String,
      comment: "ingresoid devuelto por RNDC2",
    },
    errorMensaje: String,
  },
  {
    timestamps: true,
  }
);

// Índices compuestos
registroRMMSchema.index({ estado: 1, fechaLimiteReporte: 1 });
registroRMMSchema.index({ estado: 1, intentos: 1 });
registroRMMSchema.index({ radicadoRNDC: 1 });

module.exports = mongoose.model("RegistroRMM", registroRMMSchema);
