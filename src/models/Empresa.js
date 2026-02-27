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
      index: true,
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

    // Datos adicionales
    tipoEmpresa: {
      type: String,
      enum: ["TRANSPORTADORA", "CLIENTE_CORPORATIVO", "PROVEEDOR"],
      default: "TRANSPORTADORA",
    },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

EmpresaSchema.index({ nit: 1 });
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
