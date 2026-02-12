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

    // Propiedad
    propietario: { type: Schema.Types.ObjectId, ref: "Tercero" },
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
  },
  { timestamps: true },
);

// Calcular edad a partir del año del modelo si no se envía
VehiculoSchema.pre("save", async function () {
  if (this.modelo != null && (this.edad == null || this.edad === undefined)) {
    this.edad = new Date().getFullYear() - this.modelo;
  }
});

const Vehiculo = mongoose.model("Vehiculo", VehiculoSchema);

module.exports = Vehiculo;
