const mongoose = require("mongoose");
const { Schema } = mongoose;

const ModeloGPSSchema = new Schema(
  {
    marca: {
      type: Schema.Types.ObjectId,
      ref: "MarcaGPS",
      required: true,
    },
    nombre: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    descripcion: { type: String, trim: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },
  },
  { timestamps: true },
);

// Una marca no puede tener dos modelos con el mismo nombre.
ModeloGPSSchema.index({ marca: 1, nombre: 1 }, { unique: true });

ModeloGPSSchema.methods.softDelete = function (userId) {
  this.deletedAt = new Date();
  this.deletedBy = userId || null;
  return this.save();
};

ModeloGPSSchema.methods.restore = function () {
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

module.exports = mongoose.model("ModeloGPS", ModeloGPSSchema);
