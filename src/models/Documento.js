const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Documento
 * Repositorio centralizado de soportes digitales con control de vigencia.
 * Polimórfico: Sirve para Vehículos (SOAT) y Terceros (Licencias).
 */
const DocumentoSchema = new Schema(
  {
    // ¿A quién pertenece este documento?
    entidadId: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: "entidadModelo",
    },
    entidadModelo: {
      type: String,
      required: true,
      enum: ["Vehiculo", "Tercero"],
    },

    // Tipo de Documento
    tipoDocumento: {
      type: String,
      required: true,
      enum: [
        // Vehículos
        "SOAT",
        "TECNOMECANICA",
        "POLIZA_RCE", // Contractual
        "POLIZA_RCC", // Extracontractual
        "TARJETA_OPERACION",
        "TARJETA_PROPIEDAD",
        "REVISION_PREVENTIVA",
        // Personas (Conductores)
        "LICENCIA_CONDUCCION",
        "CEDULA",
        "ARL",
        "EPS",
        "FONDO_PENSIONES",
        "EXAMEN_MEDICO",
        "CAPACITACION_PESV",
        // Contratos
        "CONTRATO_CLIENTE",
        "RUT",
        "CAMARA_COMERCIO",
        "OTROS",
      ],
    },

    // Metadatos
    numero: { type: String, trim: true }, // Nro de póliza, licencia, etc.
    entidadEmisora: { type: String, trim: true }, // Seguros Bolivar, CDA X, EPS Y

    // Vigencia (Vital para Semáforo)
    fechaExpedicion: Date,
    fechaVencimiento: { type: Date, index: true },

    // Archivo Físico
    archivo: {
      url: { type: String, required: true }, // URL pública/firmada
      key: { type: String }, // ID en S3/MinIO
      mimeType: String,
      nombreOriginal: String,
      pesoBytes: Number,
    },

    // Estado
    estado: {
      type: String,
      enum: ["VIGENTE", "POR_VENCER", "VENCIDO", "HISTORICO", "RECHAZADO"],
      default: "VIGENTE",
    },

    observaciones: String,

    // Auditoría
    subidoPor: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// Índices para búsquedas rápidas
DocumentoSchema.index({ entidadId: 1, tipoDocumento: 1 }); // "Dame el SOAT del carro X"
DocumentoSchema.index({ fechaVencimiento: 1 }); // "Dame lo que vence mañana"
DocumentoSchema.index({ estado: 1 });

const Documento = mongoose.model("Documento", DocumentoSchema);

module.exports = Documento;
