const mongoose = require("mongoose");
const { Schema } = mongoose;

const ESTADOS_EQUIPO = [
  "DISPONIBLE", // En la central (Pasto), listo para enviar.
  "EN_TRANSITO", // Enviado, en camino al técnico (pendiente confirmación de recepción).
  "EN_POSESION_TECNICO", // Recibido por el técnico, pendiente instalar.
  "INSTALADO", // En uso (instalado en un vehículo).
  "EN_REVISION", // Retirado del vehículo, pendiente revisión del jefe de red.
  "EN_GARANTIA", // Enviado al proveedor por garantía (fuera del inventario).
  "DEVUELTO_CLIENTE", // Equipo PROPIO devuelto al cliente (sale del inventario operativo).
  "RETIRADO", // Descartado / fuera de servicio.
];

const TIPOS_PROPIEDAD = ["PROPIO", "COMODATO"];

const CONDICIONES = ["NUEVO", "SEGUNDA"];

const HistorialMovimientoSchema = new Schema(
  {
    accion: {
      type: String,
      enum: [
        "CREADO", // Equipo nuevo recibido en central
        "RECIBIDO_SEGUNDA", // Equipo de segunda comprado/recibido
        "ENVIADO", // Enviado desde central a una sede
        "RECIBIDO_TECNICO", // Técnico confirmó recepción del equipo
        "INSTALADO",
        "RETIRADO",
        "REVISADO_REUSAR",
        "REVISADO_DEVOLVER",
        "ENVIADO_GARANTIA", // Sale del inventario hacia el proveedor
        "RECIBIDO_GARANTIA", // Vuelve del proveedor al inventario central
        "DESCARTADO",
        "ACTUALIZADO",
        "REGISTRADO_ACTIVIDAD", // Participó como instalado o retirado en una ActividadGPS
        "DEVUELTO_AL_CLIENTE", // Sale del inventario porque era propiedad del cliente
      ],
      required: true,
    },
    estadoAnterior: { type: String, enum: ESTADOS_EQUIPO },
    estadoNuevo: { type: String, enum: ESTADOS_EQUIPO },
    ciudadOrigen: { type: Schema.Types.ObjectId, ref: "CiudadGPS" },
    ciudadDestino: { type: Schema.Types.ObjectId, ref: "CiudadGPS" },
    tecnicoAnterior: { type: Schema.Types.ObjectId, ref: "TecnicoGPS" },
    tecnicoNuevo: { type: Schema.Types.ObjectId, ref: "TecnicoGPS" },
    usuario: String, // userId del admin que ejecutó
    fecha: { type: Date, default: Date.now },
    observaciones: String,
  },
  { _id: true },
);

const EquipoGPSSchema = new Schema(
  {
    marca: {
      type: Schema.Types.ObjectId,
      ref: "MarcaGPS",
      required: true,
    },
    modelo: {
      type: Schema.Types.ObjectId,
      ref: "ModeloGPS",
      required: true,
    },
    imei: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    serial: { type: String, trim: true },
    idEquipo: { type: String, trim: true }, // ID interno opcional
    condicion: {
      type: String,
      enum: CONDICIONES,
      default: "NUEVO",
      required: true,
    },
    // Marca si el equipo, originalmente NUEVO, ha sido restaurado al menos una vez.
    // Útil para distinguir "nuevos sin estrenar" vs "nuevos que ya rotaron".
    yaUsado: { type: Boolean, default: false },
    estado: {
      type: String,
      enum: ESTADOS_EQUIPO,
      default: "DISPONIBLE",
    },
    // Ubicación actual (siempre apunta a una ciudad)
    ciudad: {
      type: Schema.Types.ObjectId,
      ref: "CiudadGPS",
      required: true,
    },
    // Técnico que tiene posesión actual del equipo (si aplica)
    tecnico: { type: Schema.Types.ObjectId, ref: "TecnicoGPS" },
    // Vehículo en el que está instalado (si aplica)
    vehiculoInstalado: { type: Schema.Types.ObjectId, ref: "Vehiculo" },
    placaInstalada: { type: String, trim: true, uppercase: true },
    lineaSim: { type: String, trim: true },
    numeroSim: { type: String, trim: true },
    // Propiedad del equipo: PROPIO del cliente o COMODATO de Asegurar Ltda.
    tipoPropiedad: {
      type: String,
      enum: TIPOS_PROPIEDAD,
      default: "COMODATO",
    },
    propietarioNombre: { type: String, trim: true, default: "ASEGURAR LTDA" },
    fechaInstalacion: Date,
    fechaRetiro: Date,
    observaciones: String,

    historial: [HistorialMovimientoSchema],

    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },
  },
  { timestamps: true },
);

EquipoGPSSchema.index({ estado: 1, ciudad: 1 });
EquipoGPSSchema.index({ tecnico: 1 });
EquipoGPSSchema.index({ "historial.fecha": 1, "historial.accion": 1 });

EquipoGPSSchema.statics.ESTADOS = ESTADOS_EQUIPO;
EquipoGPSSchema.statics.CONDICIONES = CONDICIONES;
EquipoGPSSchema.statics.TIPOS_PROPIEDAD = TIPOS_PROPIEDAD;

EquipoGPSSchema.methods.softDelete = function (userId) {
  this.deletedAt = new Date();
  this.deletedBy = userId || null;
  return this.save();
};

EquipoGPSSchema.methods.restore = function () {
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

module.exports = mongoose.model("EquipoGPS", EquipoGPSSchema);
