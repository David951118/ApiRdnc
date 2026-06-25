const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Repuesto - Catálogo e inventario de repuestos e insumos
 * El stock SOLO se modifica a través de MovimientoInventario
 * (entradas, salidas y ajustes), nunca editando este documento directo.
 */
const RepuestoSchema = new Schema(
  {
    codigo: { type: String, trim: true }, // referencia interna o del proveedor
    nombre: { type: String, required: true, trim: true },
    descripcion: String,
    categoria: {
      type: String,
      default: "OTROS", // ej: LLANTAS, FRENOS, LUBRICANTES, FILTROS, ELECTRICO
      uppercase: true,
    },
    unidad: {
      type: String,
      default: "UNIDAD", // UNIDAD, JUEGO, GALON, LITRO, METRO...
      uppercase: true,
    },

    stock: { type: Number, default: 0 },
    stockMinimo: { type: Number, default: 0 }, // dispara alerta de reposición
    costoUnitario: { type: Number, default: 0 }, // último costo de compra

    proveedor: { type: Schema.Types.ObjectId, ref: "Tercero" },

    // Multi-tenancy
    empresa: { type: Schema.Types.ObjectId, ref: "Empresa", default: null },

    activo: { type: Boolean, default: true },
    creadoPor: String,

    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },
  },
  { timestamps: true },
);

RepuestoSchema.index({ empresa: 1, nombre: 1 });
RepuestoSchema.index({ empresa: 1, codigo: 1 });

RepuestoSchema.methods.softDelete = function (userId) {
  this.deletedAt = new Date();
  this.deletedBy = userId || null;
  return this.save();
};

RepuestoSchema.methods.restore = function () {
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

const Repuesto = mongoose.model("Repuesto", RepuestoSchema);

module.exports = Repuesto;
