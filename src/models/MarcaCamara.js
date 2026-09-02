const mongoose = require("mongoose");
const { Schema } = mongoose;

const MarcaCamaraSchema = new Schema(
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

MarcaCamaraSchema.methods.softDelete = function (userId) {
  this.deletedAt = new Date();
  this.deletedBy = userId || null;
  return this.save();
};

MarcaCamaraSchema.methods.restore = function () {
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

module.exports = mongoose.model("MarcaCamara", MarcaCamaraSchema);
