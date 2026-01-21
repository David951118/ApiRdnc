const mongoose = require("mongoose");

/**
 * Modelo para Registro de Novedades de Monitoreo de Manifiesto (RNMM)
 * Reporta eventos que impiden el envío de RMM
 */
const registroRNMMSchema = new mongoose.Schema(
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
    },

    // Datos para RNDC
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

    // Código de novedad (según manual RNDC)
    codigoNovedad: {
      type: Number,
      required: true,
      enum: [1, 2, 3, 4, 5],
      comment:
        "1:No apareció, 2:Placa no registrada, 3:Suspendido, 4:Unidad fallando, 5:Sin relación NIT",
    },

    // Descripción de la novedad
    descripcionNovedad: {
      type: String,
    },

    // Estado del reporte
    estado: {
      type: String,
      enum: ["pendiente", "enviando", "reportado", "vencido", "error"],
      default: "pendiente",
      index: true,
    },

    // Control de envío
    fechaCita: {
      type: Date,
      required: true,
      comment: "Fecha/hora de la cita del punto de control",
    },
    fechaLimiteReporte: {
      type: Date,
      required: true,
      index: true,
      comment: "fechaCita + 36 horas",
    },
    intentos: {
      type: Number,
      default: 0,
    },
    ultimoIntento: Date,

    // Respuesta RNDC
    radicadoRNDC: {
      type: String,
      comment: "ingresoid devuelto por RNDC",
    },
    errorMensaje: String,

    // Metadata
    motivoDetallado: {
      type: String,
      comment: "Explicación detallada de por qué se generó la novedad",
    },
  },
  {
    timestamps: true,
  },
);

// Índices
registroRNMMSchema.index({ estado: 1, fechaLimiteReporte: 1 });
registroRNMMSchema.index({ codigoNovedad: 1, estado: 1 });
registroRNMMSchema.index({ radicadoRNDC: 1 });
registroRNMMSchema.index({ ingresoidManifiesto: 1, codigoPuntoControl: 1 });

// Método para verificar si está en ventana de envío (24-36h después de cita)
registroRNMMSchema.methods.estaEnVentanaEnvio = function () {
  const ahora = new Date();
  const limite24h = new Date(this.fechaCita.getTime() + 24 * 60 * 60 * 1000);
  const limite36h = new Date(this.fechaCita.getTime() + 36 * 60 * 60 * 1000);

  return ahora >= limite24h && ahora <= limite36h;
};

module.exports = mongoose.model("RegistroRNMM", registroRNMMSchema);
