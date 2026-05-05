const mongoose = require("mongoose");
const { Schema } = mongoose;

const CiudadGPSSchema = new Schema(
  {
    nombre: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
    },
    departamento: { type: String, trim: true, uppercase: true },
    // La central de inventario (Pasto) es marcada con esCentral=true.
    // Solo debe existir una ciudad central; eso se asegura con un índice parcial único.
    esCentral: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },
  },
  { timestamps: true },
);

CiudadGPSSchema.index(
  { esCentral: 1 },
  {
    unique: true,
    partialFilterExpression: { esCentral: true },
  },
);

CiudadGPSSchema.methods.softDelete = function (userId) {
  this.deletedAt = new Date();
  this.deletedBy = userId || null;
  return this.save();
};

CiudadGPSSchema.methods.restore = function () {
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

module.exports = mongoose.model("CiudadGPS", CiudadGPSSchema);
