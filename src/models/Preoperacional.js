const mongoose = require("mongoose");
const crypto = require("crypto");
const { Schema } = mongoose;

const ItemRevisionSchema = new Schema(
  {
    estado: {
      type: String,
      enum: ["OK", "FALLA", "NO_APLICA"],
      required: true,
    },
    observaciones: String,
    fotoUrl: String, // Evidencia del fallo o estado
  },
  { _id: false },
);

const NovedadSchema = new Schema(
  {
    item: { type: String, required: true }, // Ej: "seccionDelantera.limpiabrisas"
    descripcion: String, // Descripción del fallo original
    fotoFalla: String, // Foto original de la falla
    fotoCorreccion: String, // Foto subida al corregir
    fechaLimite: { type: Date, required: true }, // Fecha máxima para corregir (creación + 15 días)
    resuelta: { type: Boolean, default: false },
    fechaResolucion: Date,
    resueltaPor: String, // userId que resolvió
  },
  { _id: true },
);

const PreoperacionalSchema = new Schema(
  {
    vehiculo: { type: Schema.Types.ObjectId, ref: "Vehiculo", required: true },
    conductor: { type: Schema.Types.ObjectId, ref: "Tercero", required: true }, // Quien realiza
    codigoPublico: { type: String, unique: true, sparse: true }, // Token para verificación QR
    contadorQR: { type: Number, default: 0 }, // Veces que se ha consultado el QR
    fecha: { type: Date, default: Date.now },
    kilometraje: Number,

    // División por Secciones Físicas
    seccionDelantera: {
      luces: ItemRevisionSchema,
      direccionalesDelanteros: ItemRevisionSchema,
      limpiabrisas: ItemRevisionSchema, // Todo parabrisas
      espejosRetrovisores: ItemRevisionSchema,
      liquidos: ItemRevisionSchema,
      llantaDelanteraDerecha: ItemRevisionSchema,
      llantaDelanteraIzquierda: ItemRevisionSchema,
      bocina: ItemRevisionSchema,
      frenos: ItemRevisionSchema,
    },

    seccionMedia: {
      tablero: ItemRevisionSchema,
      timon: ItemRevisionSchema,
      cinturones: ItemRevisionSchema,
      pedales: ItemRevisionSchema,
      frenoMano: ItemRevisionSchema,
      bateria: ItemRevisionSchema,
      kitCarretera: ItemRevisionSchema,
      reflectivos: ItemRevisionSchema,
    },

    seccionTrasera: {
      stop: ItemRevisionSchema,
      llantasRepuesto: ItemRevisionSchema,
      equipoCarretera: ItemRevisionSchema,
      llantaTraseraDerecha: ItemRevisionSchema,
      llantaTraseraIzquierda: ItemRevisionSchema,
      direccionalesTraseros: ItemRevisionSchema,
      placa: ItemRevisionSchema,
    },

    // Resultado Global
    estadoGeneral: {
      type: String,
      enum: ["APROBADO", "NOVEDAD", "RECHAZADO"],
      default: "APROBADO",
    },

    // Novedades (items con FALLA que requieren corrección)
    novedades: [NovedadSchema],
    fechaLimiteNovedades: Date, // Fecha máxima global (creación + 15 días)

    firmadoCheck: Boolean,
    firmaConductorUrl: String,

    // Soft Delete
    deletedAt: { type: Date, default: null },
    eliminadoPor: { type: String },
  },
  { timestamps: true },
);

PreoperacionalSchema.index({ vehiculo: 1, fecha: -1 });
PreoperacionalSchema.index({ conductor: 1, fecha: -1 });
PreoperacionalSchema.index({ deletedAt: 1 });
PreoperacionalSchema.index({ estadoGeneral: 1, fechaLimiteNovedades: 1 }); // Para cron y consultas de novedades

// Auto-generar codigoPublico y detectar fallas al crear
PreoperacionalSchema.pre("save", async function () {
  if (this.isNew) {
    if (!this.codigoPublico) {
      this.codigoPublico = crypto.randomBytes(16).toString("hex");
    }

    // Auto-detectar items con FALLA y generar novedades
    const secciones = ["seccionDelantera", "seccionMedia", "seccionTrasera"];
    const novedadesDetectadas = [];
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() + 15);

    for (const seccion of secciones) {
      const datos = this[seccion];
      if (!datos) continue;
      for (const [item, valor] of Object.entries(datos.toObject ? datos.toObject() : datos)) {
        if (valor && valor.estado === "FALLA") {
          novedadesDetectadas.push({
            item: `${seccion}.${item}`,
            descripcion: valor.observaciones || `Falla en ${item}`,
            fotoFalla: valor.fotoUrl || null,
            fechaLimite,
            resuelta: false,
          });
        }
      }
    }

    if (novedadesDetectadas.length > 0) {
      this.novedades = novedadesDetectadas;
      this.fechaLimiteNovedades = fechaLimite;
      this.estadoGeneral = "NOVEDAD";
    } else {
      this.estadoGeneral = "APROBADO";
    }
  }
});

PreoperacionalSchema.methods.softDelete = async function (userId) {
  this.deletedAt = new Date();
  this.eliminadoPor = userId;
  return await this.save();
};

PreoperacionalSchema.methods.restore = async function () {
  this.deletedAt = null;
  this.eliminadoPor = null;
  return await this.save();
};

PreoperacionalSchema.query.notDeleted = function () {
  return this.where({ deletedAt: null });
};

const Preoperacional = mongoose.model("Preoperacional", PreoperacionalSchema);

module.exports = Preoperacional;
