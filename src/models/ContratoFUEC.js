const mongoose = require("mongoose");
const crypto = require("crypto");
const { Schema } = mongoose;

/**
 * Contrato FUEC (Formulario Único de Extracto de Contrato)
 * Documento legal que habilita la operación del transporte especial.
 */
const ContratoFuecSchema = new Schema(
  {
    // Identificación
    consecutivo: { type: Number, unique: true, required: true }, // Ej: 450001
    anio: { type: Number, default: () => new Date().getFullYear() },
    numeroFUEC: { type: String, unique: true, sparse: true }, // Código largo de resolución

    // Relaciones (Quién viaja)
    contratante: {
      type: Schema.Types.ObjectId,
      ref: "Tercero",
      required: true,
    },
    vehiculo: { type: Schema.Types.ObjectId, ref: "Vehiculo", required: true },

    conductorPrincipal: {
      type: Schema.Types.ObjectId,
      ref: "Tercero",
      required: true,
    },
    conductoresAuxiliares: [{ type: Schema.Types.ObjectId, ref: "Tercero" }],

    ruta: { type: Schema.Types.ObjectId, ref: "Ruta" },

    // Trazabilidad de seguridad (Gatekeeper)
    preoperacionalVinculado: {
      type: Schema.Types.ObjectId,
      ref: "Preoperacional",
    },

    // Detalles del Servicio
    objetoContrato: { type: String, required: true }, // Ej: "TRANSPORTE DE EMPLEADOS"
    origen: { type: String, required: true },
    destino: { type: String, required: true },
    recorridoEspecifico: String, // Si difiere del de la Ruta base

    vigenciaInicio: { type: Date, required: true },
    vigenciaFin: { type: Date, required: true },

    // Responsables (Datos del Contratante al momento de generar)
    responsableContratante: {
      nombre: String,
      cedula: String,
      telefono: String,
    },

    // Estado del ciclo de vida
    estado: {
      type: String,
      enum: ["GENERADO", "ACTIVO", "FINALIZADO", "ANULADO"],
      default: "GENERADO",
    },

    // Archivos Generados
    pdfUrl: String,
    qrCodeData: { type: String, unique: true, sparse: true },
    contadorQR: { type: Number, default: 0 }, // Veces que se ha consultado el QR
    creadoPor: { type: String },

    // === SNAPSHOT LEGAL (INMUTABLE) ===
    // Guardamos los datos de las pólizas y licencias AL MOMENTO DE GENERAR.
    // Esto es crucial para defensa jurídica en caso de accidente.
    datosSnapshot: {
      soat: { numero: String, vigencia: Date, aseguradora: String },
      tecnomecanica: { numero: String, vigencia: Date, cda: String },
      rce: { numero: String, vigencia: Date, aseguradora: String }, // Contractual
      rcc: { numero: String, vigencia: Date, aseguradora: String }, // Extra
      tarjetaOperacion: { numero: String, vigencia: Date },
      licenciaConductor: { numero: String, vigencia: Date, categoria: String },
    },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },
  },
  { timestamps: true },
);

// Índices (consecutivo y qrCodeData ya tienen índice por unique en el schema)
ContratoFuecSchema.index({ vehiculo: 1, estado: 1 });
ContratoFuecSchema.index({ vigenciaInicio: 1, vigenciaFin: 1 });

// Auto-generar código público para verificación QR al crear
ContratoFuecSchema.pre("save", async function () {
  if (this.isNew && !this.qrCodeData) {
    this.qrCodeData = crypto.randomBytes(16).toString("hex");
  }
});

ContratoFuecSchema.methods.softDelete = function (userId) {
  this.deletedAt = new Date();
  this.deletedBy = userId || null;
  return this.save();
};

ContratoFuecSchema.methods.restore = function () {
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

const ContratoFuec = mongoose.model("ContratoFuec", ContratoFuecSchema);

module.exports = ContratoFuec;
