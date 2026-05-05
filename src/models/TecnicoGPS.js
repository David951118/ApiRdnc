const mongoose = require("mongoose");
const { Schema } = mongoose;

const TecnicoGPSSchema = new Schema(
  {
    nombres: { type: String, required: true, trim: true },
    apellidos: { type: String, required: true, trim: true },
    identificacion: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    telefono: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    ciudad: {
      type: Schema.Types.ObjectId,
      ref: "CiudadGPS",
      required: true,
    },
    estado: {
      type: String,
      enum: ["ACTIVO", "INACTIVO"],
      default: "ACTIVO",
    },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },
  },
  { timestamps: true },
);

TecnicoGPSSchema.index({ ciudad: 1, estado: 1 });

TecnicoGPSSchema.methods.softDelete = function (userId) {
  this.deletedAt = new Date();
  this.deletedBy = userId || null;
  return this.save();
};

TecnicoGPSSchema.methods.restore = function () {
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

module.exports = mongoose.model("TecnicoGPS", TecnicoGPSSchema);
