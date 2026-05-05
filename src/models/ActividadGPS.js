const mongoose = require("mongoose");
const { Schema } = mongoose;

const TIPOS_ACTIVIDAD = [
  "INSTALACION_NUEVA",
  "HOMOLOGACION",
  "CAMBIO_2G_4G",
  "CAMBIO_CON_COSTO",
  "CAMBIO_SIN_COSTO",
  "CAMBIO_COMODATO",
  "PRUEBAS",
  "GARANTIA",
  "EQUIPO_DANADO", // Retiro definitivo del equipo retirado (descartado)
];

// Tipos de actividad que requieren registrar un equipo retirado
const REQUIEREN_RETIRO = new Set([
  "CAMBIO_2G_4G",
  "CAMBIO_CON_COSTO",
  "CAMBIO_SIN_COSTO",
  "CAMBIO_COMODATO",
  "GARANTIA",
  "PRUEBAS",
  "EQUIPO_DANADO",
]);

const ActividadGPSSchema = new Schema(
  {
    tipoActividad: {
      type: String,
      enum: TIPOS_ACTIVIDAD,
      required: true,
    },
    tecnico: {
      type: Schema.Types.ObjectId,
      ref: "TecnicoGPS",
      required: true,
    },
    ciudad: {
      type: Schema.Types.ObjectId,
      ref: "CiudadGPS",
      required: true,
    },

    // Quién registra la actividad (admin logueado)
    registradoPor: {
      userId: { type: String }, // req.user.userId (id Cellvi)
      username: { type: String }, // req.user.username
    },

    // Equipo que se instala
    equipoInstalado: { type: Schema.Types.ObjectId, ref: "EquipoGPS" },

    // Equipo que se retira (en cambios)
    equipoRetirado: { type: Schema.Types.ObjectId, ref: "EquipoGPS" },
    equipoRetiradoExistia: { type: Boolean, default: true },

    // Datos del vehículo donde se instala
    placaInstalada: { type: String, trim: true, uppercase: true },
    vehiculo: { type: Schema.Types.ObjectId, ref: "Vehiculo" },
    lineaSim: { type: String, trim: true },
    numeroSim: { type: String, trim: true },

    // Propiedad del equipo INSTALADO
    tipoPropiedad: {
      type: String,
      enum: ["PROPIO", "COMODATO"],
      required: true,
    },
    propietarioNombre: { type: String, trim: true, required: true },

    // Destino del equipo retirado (calculado por el controlador)
    destinoEquipoRetirado: {
      type: String,
      enum: ["AL_CLIENTE", "AL_CENTRO", "DESCARTADO"],
      default: null,
    },

    fechaActividad: { type: Date, default: Date.now },
    observaciones: String,

    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },
  },
  { timestamps: true },
);

ActividadGPSSchema.index({ tipoActividad: 1, fechaActividad: -1 });
ActividadGPSSchema.index({ tecnico: 1, fechaActividad: -1 });
ActividadGPSSchema.index({ ciudad: 1, fechaActividad: -1 });
ActividadGPSSchema.index({ equipoInstalado: 1 });
ActividadGPSSchema.index({ equipoRetirado: 1 });
ActividadGPSSchema.index({ placaInstalada: 1 });

ActividadGPSSchema.statics.TIPOS = TIPOS_ACTIVIDAD;
ActividadGPSSchema.statics.REQUIEREN_RETIRO = REQUIEREN_RETIRO;

ActividadGPSSchema.methods.softDelete = function (userId) {
  this.deletedAt = new Date();
  this.deletedBy = userId || null;
  return this.save();
};

module.exports = mongoose.model("ActividadGPS", ActividadGPSSchema);
