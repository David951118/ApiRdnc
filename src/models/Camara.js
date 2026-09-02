const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Inventario de cámaras de la empresa.
 *
 * Estados:
 *  - EN_EMPRESA: en bodega/oficinas de la empresa, disponible.
 *  - INSTALADA:  saliente — instalada en un vehículo o sitio (ver `instaladaEn`).
 *  - DESCARTADA: dañada / fuera de servicio definitivo.
 *
 * Al retirar una cámara instalada vuelve a EN_EMPRESA y en el historial queda
 * de dónde se retiró y el motivo; si luego se instala en otra parte, queda
 * también registrado dónde se reinstaló.
 */
const ESTADOS_CAMARA = ["EN_EMPRESA", "INSTALADA", "DESCARTADA"];

const ACCIONES_CAMARA = [
  "CREADA", // Cámara registrada en el inventario
  "INSTALADA", // Instalada en un vehículo o sitio
  "RETIRADA", // Retirada de su instalación → vuelve a la empresa
  "DESCARTADA", // Fuera de servicio definitivo
  "REINGRESADA", // Descartada por error → vuelve a la empresa
  "ACTUALIZADA", // Edición de datos
];

const HistorialCamaraSchema = new Schema(
  {
    accion: { type: String, enum: ACCIONES_CAMARA, required: true },
    estadoAnterior: { type: String, enum: ESTADOS_CAMARA },
    estadoNuevo: { type: String, enum: ESTADOS_CAMARA },
    // Dónde estaba / a dónde va (placa de vehículo o descripción del sitio)
    ubicacionAnterior: { type: String, trim: true },
    ubicacionNueva: { type: String, trim: true },
    motivo: { type: String, trim: true },
    usuario: String, // userId del admin que ejecutó
    fecha: { type: Date, default: Date.now },
    observaciones: String,
  },
  { _id: true },
);

const CamaraSchema = new Schema(
  {
    marca: {
      type: Schema.Types.ObjectId,
      ref: "MarcaCamara",
      required: true,
    },
    modelo: {
      type: Schema.Types.ObjectId,
      ref: "ModeloCamara",
      required: true,
    },
    serial: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    condicion: {
      type: String,
      enum: ["NUEVA", "SEGUNDA"],
      default: "NUEVA",
    },
    estado: {
      type: String,
      enum: ESTADOS_CAMARA,
      default: "EN_EMPRESA",
    },
    // Instalación actual (si estado === INSTALADA)
    instaladaEn: {
      tipo: { type: String, enum: ["VEHICULO", "SITIO"], default: "VEHICULO" },
      placa: { type: String, trim: true, uppercase: true },
      descripcion: { type: String, trim: true }, // sitio, cliente, sede, etc.
    },
    fechaInstalacion: Date,
    fechaRetiro: Date,
    observaciones: String,

    historial: [HistorialCamaraSchema],

    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },
  },
  { timestamps: true },
);

CamaraSchema.index({ estado: 1 });
CamaraSchema.index({ "instaladaEn.placa": 1 });

CamaraSchema.methods.softDelete = function (userId) {
  this.deletedAt = new Date();
  this.deletedBy = userId || null;
  return this.save();
};

CamaraSchema.methods.restore = function () {
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

module.exports = mongoose.model("Camara", CamaraSchema);
module.exports.ESTADOS_CAMARA = ESTADOS_CAMARA;
