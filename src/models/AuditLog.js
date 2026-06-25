const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * AuditLog - Trazabilidad transversal del sistema
 * Registra toda mutación (POST/PUT/PATCH/DELETE) exitosa sobre la API.
 * Lo escribe automáticamente el middleware auditLogger.
 */
const AuditLogSchema = new Schema(
  {
    // Quién
    username: { type: String, required: true, index: true },
    userId: String,
    roles: [String],
    empresaId: { type: Schema.Types.ObjectId, ref: "Empresa", index: true },

    // Qué
    accion: {
      type: String,
      enum: ["CREATE", "UPDATE", "DELETE", "HARD_DELETE", "RESTORE", "OTRO"],
      required: true,
      index: true,
    },
    entidad: { type: String, required: true, index: true }, // segmento de la ruta: vehiculos, documentos, etc.
    entidadId: String, // id del recurso afectado si viene en la URL

    // Cómo
    metodo: String, // POST, PUT, DELETE...
    ruta: String, // URL completa
    statusCode: Number,
    // Cuerpo de la petición sanitizado (sin passwords/tokens, truncado)
    payload: Schema.Types.Mixed,

    // Desde dónde
    ipAddress: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

AuditLogSchema.index({ createdAt: -1 });

const AuditLog = mongoose.model("AuditLog", AuditLogSchema);

module.exports = AuditLog;
