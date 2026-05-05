const mongoose = require("mongoose");
const { Schema } = mongoose;

const MarcaGPSSchema = new Schema(
  {
    nombre: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
    },
    descripcion: { type: String, trim: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },
  },
  { timestamps: true },
);

MarcaGPSSchema.methods.softDelete = function (userId) {
  this.deletedAt = new Date();
  this.deletedBy = userId || null;
  return this.save();
};

MarcaGPSSchema.methods.restore = function () {
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

module.exports = mongoose.model("MarcaGPS", MarcaGPSSchema);
