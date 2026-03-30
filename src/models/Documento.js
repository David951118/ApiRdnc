const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Documento
 * Repositorio centralizado de soportes digitales con control de vigencia.
 * Polimórfico: Sirve para Vehículos, Terceros y Empresas.
 * Soporta asociación multi-entidad vía entidadesAsociadas.
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
      enum: ["Vehiculo", "Tercero", "Empresa"],
    },

    // Entidades adicionales asociadas a este documento
    // Ejemplo: Una POLIZA_RCE de la Empresa que cubre múltiples Vehículos
    entidadesAsociadas: [
      {
        entidadId: {
          type: Schema.Types.ObjectId,
          required: true,
          refPath: "entidadesAsociadas.entidadModelo",
        },
        entidadModelo: {
          type: String,
          required: true,
          enum: ["Vehiculo", "Tercero", "Empresa"],
        },
      },
    ],

    // Tipo de Documento
    tipoDocumento: {
      type: String,
      required: true,
      enum: [
        // Vehículos
        "SOAT",
        "TECNOMECANICA",
        "POLIZA_RCE",
        "POLIZA_RCC",
        "TARJETA_OPERACION",
        "TARJETA_PROPIEDAD",
        "REVISION_PREVENTIVA",
        // Terceros (Conductores/Personas)
        "LICENCIA_CONDUCCION",
        "CEDULA",
        "ARL",
        "EPS",
        "CAJA_COMPENSACION",
        "FONDO_PENSIONES",
        "EXAMEN_MEDICO",
        "CAPACITACION_PESV",
        // Empresa
        "CONTRATO_CLIENTE",
        "CAMARA_COMERCIO",
        // Compartidos
        "RUT",
        "OTROS",
      ],
    },

    // Metadatos
    numero: { type: String, trim: true }, // Nro de póliza, licencia, etc.
    entidadEmisora: { type: String, trim: true }, // Seguros Bolivar, CDA X, EPS Y

    // Vigencia (Vital para Semáforo)
    fechaExpedicion: Date,
    fechaVencimiento: { type: Date },

    // Archivo Físico (frente / principal)
    archivo: {
      url: { type: String, required: true },
      key: { type: String },
      mimeType: String,
      nombreOriginal: String,
      pesoBytes: Number,
    },

    // Archivo reverso / segunda página (opcional, ej: cédula reverso)
    archivoReverso: {
      url: { type: String },
      key: { type: String },
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
    // Se almacena el identificador/username del usuario que sube el documento
    // (viene de req.user.userId / username, no de la colección User local)
    subidoPor: { type: String },

    // Soft Delete
    deletedAt: { type: Date, default: null },
    // Identificador del usuario que eliminó el documento (username/userId)
    eliminadoPor: { type: String },
  },
  { timestamps: true },
);

// Índices para búsquedas rápidas
DocumentoSchema.index({ entidadId: 1, tipoDocumento: 1 }); // "Dame el SOAT del carro X"
DocumentoSchema.index({ fechaVencimiento: 1 }); // "Dame lo que vence mañana"
DocumentoSchema.index({ estado: 1 });
DocumentoSchema.index({ deletedAt: 1 }); // Para filtrar documentos eliminados
DocumentoSchema.index({ "entidadesAsociadas.entidadId": 1 }); // "Documentos asociados al vehículo X"

// Hook pre-save: Calcular estado automáticamente según fechaVencimiento
DocumentoSchema.pre("save", async function () {
  if (this.fechaVencimiento && !this.isModified("estado")) {
    const hoy = new Date();
    const vencimiento = new Date(this.fechaVencimiento);
    const diasRestantes = Math.ceil((vencimiento - hoy) / (1000 * 60 * 60 * 24));

    if (diasRestantes < 0) {
      this.estado = "VENCIDO";
    } else if (diasRestantes <= 30) {
      this.estado = "POR_VENCER";
    } else {
      this.estado = "VIGENTE";
    }
  }
});

// Método para soft delete
DocumentoSchema.methods.softDelete = async function (userId) {
  this.deletedAt = new Date();
  this.eliminadoPor = userId;
  return await this.save();
};

// Método para restaurar
DocumentoSchema.methods.restore = async function () {
  this.deletedAt = null;
  this.eliminadoPor = null;
  return await this.save();
};

// Scope por defecto: excluir eliminados
DocumentoSchema.query.notDeleted = function () {
  return this.where({ deletedAt: null });
};

const Documento = mongoose.model("Documento", DocumentoSchema);

module.exports = Documento;