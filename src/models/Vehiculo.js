const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Vehículo
 * Hoja de vida técnica y legal del activo.
 */
const VehiculoSchema = new Schema(
  {
    placa: { type: String, unique: true, required: true, uppercase: true }, // ID Principal
    numeroInterno: { type: String, unique: true, required: true },
    marca: { type: String, required: true }, // viene de cellvi
    linea: { type: String, required: true }, // viene de cellvi
    modelo: { type: Number, required: true }, // viene de cellvi
    color: { type: String, required: true }, // viene de cellvi
    idCellvi: { type: String, required: true }, // viene de cellvi

    claseVehiculo: { type: String, required: true }, // Sin enum: acepta cualquier valor (ej. "CAMIONETA - VAN")

    edad: { type: Number }, // Opcional: se calcula en pre-save como año actual - modelo si no se envía
    modalidad: { type: String, default: "ESPECIAL" },

    combustible: {
      type: String,
      required: true,
      enum: ["GASOLINA", "DIESEL", "GAS", "HIBRIDO", "ELECTRICO"],
    },

    // Identificación Técnica
    motor: { type: String, required: true }, // viene de cellvi
    chasis: { type: String, required: true }, // viene de cellvi
    cilindraje: { type: String, required: true }, // viene de cellvi
    capacidadPasajeros: { type: Number, required: true },
    fechaMatricula: { type: Date, required: true },

    // Capacidad de carga (operación logística / distribución)
    // Se usan para detectar sobrecarga en la bitácora de viajes.
    capacidadCargaKg: { type: Number }, // carga útil recomendada
    pesoMaximoKg: { type: Number }, // tope técnico/legal (PBV - tara)

    // Propiedad
    propietario: { type: Schema.Types.ObjectId, ref: "Tercero" },
    // Conductores adicionales asignados al vehículo (más allá del propietario).
    // El propietario y estos conductores pueden crear preoperacionales y ver el vehículo.
    conductoresAsignados: [{ type: Schema.Types.ObjectId, ref: "Tercero" }],
    // Empresa a la que está afiliado el vehículo
    // Ahora se referencia por ID de Empresa para permitir asociación fuerte
    empresaAfiliadora: { type: Schema.Types.ObjectId, ref: "Empresa" },
    fechaAfiliacion: Date,

    // Estado Operativo
    estado: {
      type: String,
      enum: ["ACTIVO", "MANTENIMIENTO", "INACTIVO", "RETIRADO"],
      default: "ACTIVO",
    },
    kilometrajeActual: Number, // Sync con GPSCellvi
    ultimaActualizacionKm: Date,
    // Origen del último kilometraje guardado (ver services/kilometrajeService.js)
    fuenteKilometraje: {
      type: String,
      enum: ["CELLVI_GPS", "PREOPERACIONAL", "MANUAL"],
      default: null,
    },
    // Km de referencia para el PRIMER mantenimiento cuando aún no hay OT cerrada.
    // Se toma una "foto" del km actual la primera vez que el vehículo se evalúa
    // contra un plan, para que el primer servicio programado sea kmBase + intervalo
    // (p. ej. vehículo que ingresa a 4.000 km con plan cada 5.000 → primer servicio
    // a 9.000). Sin esta ancla, la meta se movería con el odómetro y nunca vencería.
    kilometrajeBaseMantenimiento: { type: Number, default: null },
    fechaBaseMantenimiento: { type: Date, default: null },

    // Historial de Mantenimientos (Resumen)
    mantenimientos: [
      {
        fecha: Date,
        tipo: { type: String, enum: ["PREVENTIVO", "CORRECTIVO"] },
        descripcion: String,
        kilometraje: Number,
        taller: String,
      },
    ],
    // Preoperacional extra habilitada por admin para hoy
    preoperacionalExtraHabilitada: {
      fecha: Date, // Fecha para la cual se habilitó (solo ese día)
      habilitadoPor: String, // userId del admin que habilitó
      motivo: String,
    },

    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },
  },
  { timestamps: true },
);

// Calcular edad a partir del año del modelo si no se envía
VehiculoSchema.pre("save", async function () {
  if (this.modelo != null && (this.edad == null || this.edad === undefined)) {
    this.edad = new Date().getFullYear() - this.modelo;
  }
});

VehiculoSchema.methods.softDelete = function (userId) {
  this.deletedAt = new Date();
  this.deletedBy = userId || null;
  return this.save();
};

VehiculoSchema.methods.restore = function () {
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

const Vehiculo = mongoose.model("Vehiculo", VehiculoSchema);

module.exports = Vehiculo;
