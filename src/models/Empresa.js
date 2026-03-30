const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Empresa - Entidad Organizacional
 * Representa la compañía de transporte o cliente corporativo
 */
const EmpresaSchema = new Schema(
  {
    nit: {
      type: String,
      required: true,
      unique: true,
    },
    razonSocial: {
      type: String,
      required: true,
    },
    nombreComercial: String,

    contacto: {
      direccion: String,
      ciudad: String,
      telefono: String,
      email: String,
      sitioWeb: String,
    },

    representanteLegal: {
      nombres: String,
      apellidos: String,
      cedula: String,
    },

    estado: {
      type: String,
      enum: ["ACTIVA", "INACTIVA", "SUSPENDIDA"],
      default: "ACTIVA",
    },

    // Branding
    branding: {
      colorPrimary:     { type: String, default: "#0B5EA8" },
      colorPrimaryDark: { type: String, default: "#0A2E52" },
      colorAccent:      { type: String, default: "#FFD400" },
      logoKey:          { type: String, default: "asegurar" },
      eslogan:          { type: String, default: "Defensa Predictiva 24/7" },
    },

    // Datos adicionales
    tipoEmpresa: {
      type: String,
      enum: ["TRANSPORTADORA", "CLIENTE_CORPORATIVO", "PROVEEDOR"],
      default: "TRANSPORTADORA",
    },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },
  },
  { timestamps: true },
);

// nit ya tiene índice por unique+index en el schema
EmpresaSchema.index({ razonSocial: 1 });

EmpresaSchema.methods.softDelete = function (userId) {
  this.deletedAt = new Date();
  this.deletedBy = userId || null;
  return this.save();
};

EmpresaSchema.methods.restore = function () {
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

const Empresa = mongoose.model("Empresa", EmpresaSchema);

module.exports = Empresa;
