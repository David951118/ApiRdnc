const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * MovimientoInventario - Kardex de repuestos
 * Toda variación de stock queda registrada aquí:
 *   ENTRADA → compra / devolución (stock += cantidad)
 *   SALIDA  → consumo, normalmente ligado a una Orden de Trabajo (stock -= cantidad)
 *   AJUSTE  → corrección de inventario físico (stock = cantidad)
 */
const MovimientoInventarioSchema = new Schema(
  {
    repuesto: {
      type: Schema.Types.ObjectId,
      ref: "Repuesto",
      required: true,
      index: true,
    },
    tipo: {
      type: String,
      enum: ["ENTRADA", "SALIDA", "AJUSTE"],
      required: true,
    },
    cantidad: { type: Number, required: true, min: 0 },
    costoUnitario: { type: Number, default: 0 },

    // Kardex: stock antes y después del movimiento
    stockAnterior: Number,
    stockNuevo: Number,

    // Trazabilidad del consumo
    ordenTrabajo: { type: Schema.Types.ObjectId, ref: "OrdenTrabajo" },
    vehiculo: { type: Schema.Types.ObjectId, ref: "Vehiculo", index: true },
    placa: { type: String, uppercase: true },

    motivo: String,
    usuario: String,

    // Multi-tenancy
    empresa: { type: Schema.Types.ObjectId, ref: "Empresa", default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

MovimientoInventarioSchema.index({ createdAt: -1 });
MovimientoInventarioSchema.index({ vehiculo: 1, tipo: 1, createdAt: -1 });

const MovimientoInventario = mongoose.model(
  "MovimientoInventario",
  MovimientoInventarioSchema,
);

module.exports = MovimientoInventario;
