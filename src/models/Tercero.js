const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Tercero - Colección Unificada
 */
const TerceroSchema = new Schema(
  {
    // Identificación Base
    identificacion: { type: String, required: true, index: true }, // CC o NIT (no único, puede repetirse por empresa)
    tipoId: {
      type: String,
      required: true,
      enum: ["CC", "NIT", "CE", "PEP", "PASAPORTE"],
    },

    // Relación con Empresa (Multi-tenancy)
    empresa: {
      type: Schema.Types.ObjectId,
      ref: "Empresa",
      index: true,
    },

    // Link con Usuario Cellvi (Login)
    usuarioCellvi: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      index: true,
    },

    // Datos Personales / Empresariales
    nombres: String, // Para persona natural
    apellidos: String, // Para persona natural
    razonSocial: String, // Para empresa

    fotoUrl: String,

    // Roles que cumple en el sistema (Puede tener varios)
    roles: [
      {
        type: String,
        enum: [
          "CONDUCTOR",
          "PROPIETARIO",
          "CLIENTE",
          "ADMINISTRATIVO",
          "PROVEEDOR",
        ],
        required: true,
      },
    ],

    // Datos de Contacto General
    contacto: {
      direccion: String,
      ciudad: String,
      telefono: String,
      email: String,
    },

    estado: {
      type: String,
      enum: ["ACTIVO", "INACTIVO", "BLOQUEADO"],
      default: "ACTIVO",
    },

    // === SECCIÓN CONDUCTOR (Datos operativos, no documentales) ===
    datosConductor: {
      tipoSangre: String,
    },

    // === SECCIÓN PROPIETARIO ===
    datosPropietario: {
      observaciones: String,
    },

    // === SECCIÓN CLIENTE ===
    datosCliente: {
      sector: String, // ej: Salud, Turismo, Escolar
    },

    // === SECCIÓN ADMINISTRATIVO ===
    datosAdministrativo: {
      celular: String, // Contacto individual del administrativo
      cargo: String,
      area: String,
      fechaIngreso: Date,
    },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// Índices
// Para terceros asociados a empresa: combinación única de identificacion + empresa
TerceroSchema.index(
  { identificacion: 1, empresa: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { empresa: { $exists: true, $ne: null } },
  },
);

// Para terceros independientes: identificacion única global
TerceroSchema.index(
  { identificacion: 1 },
  {
    unique: true,
    partialFilterExpression: { empresa: { $exists: false } },
  },
);

TerceroSchema.index({ roles: 1 });
TerceroSchema.index({ empresa: 1 });

TerceroSchema.methods.softDelete = function (userId) {
  this.deletedAt = new Date();
  this.deletedBy = userId || null;
  return this.save();
};

TerceroSchema.methods.restore = function () {
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

const Tercero = mongoose.model("Tercero", TerceroSchema);

module.exports = Tercero;
