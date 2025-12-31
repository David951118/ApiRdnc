const mongoose = require("mongoose");

/**
 * Schema para puntos de control (embebido en Manifiesto)
 */
const puntoControlSchema = new mongoose.Schema({
  // Datos RNDC2
  codigoPunto: {
    type: Number,
    required: true,
    comment: "1=cargue, 2+=descargue",
  },
  codigoMunicipio: String,
  direccion: String,
  latitud: {
    type: Number,
    required: true,
  },
  longitud: {
    type: Number,
    required: true,
  },
  radio: {
    type: Number,
    default: 300,
    comment: "Radio de geocerca en metros",
  },

  // Cita
  fechaCita: Date,
  horaCita: String,
  tiempoPactado: {
    type: Number,
    default: 0,
    comment: "Tiempo pactado en minutos",
  },

  // Estado
  estado: {
    type: String,
    enum: ["pendiente", "en_punto", "completado", "vencido"],
    default: "pendiente",
  },

  // Ajustes
  ajuste: {
    type: Boolean,
    default: false,
    comment: "Si el RNDC envió <ajuste>1</ajuste>",
  },

  // Eventos detectados - LLEGADA
  fechaHoraLlegada: Date,
  latitudLlegada: Number,
  longitudLlegada: Number,

  // Eventos detectados - SALIDA
  fechaHoraSalida: Date,
  latitudSalida: Number,
  longitudSalida: Number,

  // Sin salida (72h)
  sinSalida: {
    type: Boolean,
    default: false,
  },

  // RMM asociado
  rmmId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RegistroRMM",
  },
  radicadoRNDC: String,
});

/**
 * Modelo para manifiestos sincronizados desde RNDC2
 */
const manifiestoSchema = new mongoose.Schema(
  {
    // IDs RNDC2
    ingresoidManifiesto: {
      type: String,
      required: true,
      unique: true,
      index: true,
      comment: "Llave única del RNDC",
    },
    numManifiesto: {
      type: String,
      required: true,
    },

    // Empresa de transporte
    nitEmpresaTransporte: {
      type: String,
      required: true,
    },

    // Vehículo
    placa: {
      type: String,
      required: true,
      index: true,
      uppercase: true,
    },

    // Fechas
    fechaExpedicion: Date,

    // Validación y clasificación
    vehiculoAsignado: {
      type: Boolean,
      default: false,
      comment: "Si el vehículo está asignado al usuario RNDC en Cellvi",
    },
    esMonitoreable: {
      type: Boolean,
      default: false,
      comment: "Si el manifiesto puede ser monitoreado",
    },
    motivoNoMonitoreable: {
      type: String,
      comment: "Razón por la cual no es monitoreable",
    },

    // Estado del manifiesto
    estado: {
      type: String,
      enum: ["activo", "completado", "anulado"],
      default: "activo",
      index: true,
    },

    // Puntos de control
    puntosControl: [puntoControlSchema],

    // Datos originales del RNDC
    datosOriginales: mongoose.Schema.Types.Mixed,
  },
  {
    timestamps: true,
  }
);

// Índices compuestos
manifiestoSchema.index({ placa: 1, estado: 1 });
manifiestoSchema.index({ estado: 1, createdAt: -1 });
manifiestoSchema.index({ "puntosControl.estado": 1 });

module.exports = mongoose.model("Manifiesto", manifiestoSchema);
