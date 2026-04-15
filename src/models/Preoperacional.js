const mongoose = require("mongoose");
const crypto = require("crypto");
const { Schema } = mongoose;

const ItemRevisionSchema = new Schema(
  {
    estado: {
      type: String,
      enum: ["BUENO", "REGULAR", "MALO"],
      required: true,
    },
    observaciones: String,
    fotoUrl: String,
    fotoKey: String, // S3 key para poder eliminar al validar corrección
  },
  { _id: false },
);

/**
 * Anotación: Comentario de texto accesible por todos los roles con acceso al vehículo.
 * Tipos:
 *   GENERAL     → comentario libre del usuario
 *   VALIDACION  → generada automáticamente al validar una corrección (preserva fotos)
 *   REVISION    → anotación de supervisión
 */
const AnotacionSchema = new Schema(
  {
    texto: { type: String, required: true },
    tipo: {
      type: String,
      enum: ["GENERAL", "VALIDACION", "REVISION"],
      default: "GENERAL",
    },
    autor: String, // userId
    autorNombre: String, // Nombre/username para display
    rol: String, // Rol del autor al momento de crear
    fecha: { type: Date, default: Date.now },

    // Si la anotación vino de una validación de corrección:
    novedadOrigenId: Schema.Types.ObjectId,
    itemOrigen: String, // Ej: "seccionDelantera.frenos"
    fotoFalla: String, // URL preservada de la foto de falla original
    fotoCorreccion: String, // URL preservada de la foto de corrección
  },
  { _id: true, timestamps: true },
);

const HistorialAccionSchema = new Schema(
  {
    accion: {
      type: String,
      enum: [
        "CREADA",
        "CORRECCION_SUBIDA",
        "VALIDADA",
        "RECHAZADA",
        "PLAZO_EXTENDIDO",
        "COMENTARIO",
      ],
      required: true,
    },
    usuario: String, // userId de quien hizo la acción
    fecha: { type: Date, default: Date.now },
    detalle: String, // comentario, motivo de rechazo, días extra, etc.
  },
  { _id: false },
);

const NovedadSchema = new Schema(
  {
    item: { type: String, required: true }, // Ej: "seccionDelantera.frenos"
    tipo: {
      type: String,
      enum: ["MALO", "REGULAR", "SUENO"],
      required: true,
    },
    descripcion: String,
    fotoFalla: String,
    fotoFallaKey: String, // S3 key para poder eliminar al validar
    fotoCorreccion: String,
    fotoCorreccionKey: String, // S3 key opcional
    fechaLimite: { type: Date, required: true },
    requiereCorreccion: { type: Boolean, default: true }, // false para SUENO (no se puede corregir)

    // Estado del ciclo de corrección
    estadoCorreccion: {
      type: String,
      enum: ["PENDIENTE", "EN_REVISION", "VALIDADA", "RECHAZADA"],
      default: "PENDIENTE",
    },
    resuelta: { type: Boolean, default: false }, // true solo cuando está VALIDADA

    // Conductor que subió la corrección
    fechaResolucion: Date,
    resueltaPor: String,

    // Admin que validó la corrección
    validadaPor: String,
    fechaValidacion: Date,
    observacionesValidacion: String,

    // Admin que rechazó la corrección
    rechazadaPor: String,
    fechaRechazo: Date,
    motivoRechazo: String,

    // Historial completo de acciones sobre esta novedad
    historial: [HistorialAccionSchema],
  },
  { _id: true },
);

const PreoperacionalSchema = new Schema(
  {
    vehiculo: {
      type: Schema.Types.ObjectId,
      ref: "Vehiculo",
      required: true,
    },
    conductor: {
      type: Schema.Types.ObjectId,
      ref: "Tercero",
      required: true,
    },
    codigoPublico: { type: String, unique: true, sparse: true },
    contadorQR: { type: Number, default: 0 },
    fecha: { type: Date, default: Date.now },
    kilometraje: Number,
    creadoPor: String, // userId de quien creó la preoperacional

    // ═══ SECCIÓN CONDUCTOR (condiciones de salud y aptitud) ═══
    seccionConductor: {
      horasSueno: { type: Number }, // Horas de sueño antes del turno
      selfieUrl: String, // Foto selfie del conductor
      selfieFecha: Date, // Fecha/hora en que se tomó la selfie
      estadoSalud: {
        type: String,
        enum: ["BUENO", "REGULAR", "MALO"],
      },
      estadoSaludObservaciones: String, // Si REGULAR o MALO, explicar
      tomaMedicamentos: { type: Boolean, default: false },
      medicamentosDetalle: String, // Cuál medicamento
      consumoSustancias: { type: Boolean, default: false }, // Alcohol, drogas, etc.
      sustanciasDetalle: String,
    },

    // ═══ SECCIÓN DELANTERA ═══
    seccionDelantera: {
      luces: ItemRevisionSchema,
      direccionalesDelanteros: ItemRevisionSchema,
      limpiabrisas: ItemRevisionSchema,
      parabrisas: ItemRevisionSchema,
      espejosRetrovisores: ItemRevisionSchema,
      liquidos: ItemRevisionSchema,
      llantaDelanteraDerecha: ItemRevisionSchema,
      llantaDelanteraIzquierda: ItemRevisionSchema,
      bocina: ItemRevisionSchema,
      frenos: ItemRevisionSchema,
    },

    // ═══ SECCIÓN MEDIA ═══
    seccionMedia: {
      tablero: ItemRevisionSchema,
      timon: ItemRevisionSchema,
      cinturones: ItemRevisionSchema,
      pedales: ItemRevisionSchema,
      frenoMano: ItemRevisionSchema,
      bateria: ItemRevisionSchema,
      kitPrimerosAuxilios: ItemRevisionSchema,
      reflectivos: ItemRevisionSchema,
    },

    // ═══ SECCIÓN TRASERA ═══
    seccionTrasera: {
      stop: ItemRevisionSchema,
      llantasRepuesto: ItemRevisionSchema,
      equipoCarretera: ItemRevisionSchema,
      llantaTraseraDerecha: ItemRevisionSchema,
      llantaTraseraIzquierda: ItemRevisionSchema,
      direccionalesTraseros: ItemRevisionSchema,
      placa: ItemRevisionSchema,
      extintor: ItemRevisionSchema,
      herramienta: ItemRevisionSchema,
    },

    // ═══ RESULTADO GLOBAL ═══
    estadoGeneral: {
      type: String,
      enum: ["APROBADO", "NOVEDAD", "RECHAZADO"],
      default: "APROBADO",
    },

    // Novedades (items con MALO, REGULAR o sueño insuficiente)
    novedades: [NovedadSchema],
    fechaLimiteNovedades: Date,

    // Anotaciones accesibles por todos los roles con acceso al vehículo
    anotaciones: [AnotacionSchema],

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
PreoperacionalSchema.index({ estadoGeneral: 1, fechaLimiteNovedades: 1 });

// Auto-generar codigoPublico y detectar novedades al crear
PreoperacionalSchema.pre("save", async function () {
  if (this.isNew) {
    if (!this.codigoPublico) {
      this.codigoPublico = crypto.randomBytes(16).toString("hex");
    }

    const novedadesDetectadas = [];
    const ahora = new Date();

    // 1. Revisar secciones del vehículo
    const secciones = ["seccionDelantera", "seccionMedia", "seccionTrasera"];
    for (const seccion of secciones) {
      const datos = this[seccion];
      if (!datos) continue;
      for (const [item, valor] of Object.entries(
        datos.toObject ? datos.toObject() : datos,
      )) {
        if (!valor || !valor.estado) continue;

        if (valor.estado === "MALO") {
          // MALO → 15 días para corregir
          const fechaLimite = new Date(ahora);
          fechaLimite.setDate(fechaLimite.getDate() + 15);
          novedadesDetectadas.push({
            item: `${seccion}.${item}`,
            tipo: "MALO",
            descripcion: valor.observaciones || `Falla en ${item}`,
            fotoFalla: valor.fotoUrl || null,
            fotoFallaKey: valor.fotoKey || null,
            fechaLimite,
            resuelta: false,
            requiereCorreccion: true,
          });
        } else if (valor.estado === "REGULAR") {
          // REGULAR → 30 días para revisión
          const fechaLimite = new Date(ahora);
          fechaLimite.setDate(fechaLimite.getDate() + 30);
          novedadesDetectadas.push({
            item: `${seccion}.${item}`,
            tipo: "REGULAR",
            descripcion:
              valor.observaciones || `Revisión pronta requerida en ${item}`,
            fotoFalla: valor.fotoUrl || null,
            fotoFallaKey: valor.fotoKey || null,
            fechaLimite,
            resuelta: false,
            requiereCorreccion: true,
          });
        }
      }
    }

    // 2. Revisar condiciones del conductor
    const sc = this.seccionConductor;
    if (sc) {
      // Sueño < 8 horas → novedad sin corrección
      if (sc.horasSueno != null && sc.horasSueno < 8) {
        novedadesDetectadas.push({
          item: "seccionConductor.horasSueno",
          tipo: "SUENO",
          descripcion: `Conductor reporta ${sc.horasSueno} horas de sueño (mínimo 8)`,
          fechaLimite: ahora, // Sin plazo, es inmediato
          resuelta: false,
          requiereCorreccion: false, // No se puede corregir
        });
      }

      // Consumo de sustancias → novedad grave
      if (sc.consumoSustancias) {
        novedadesDetectadas.push({
          item: "seccionConductor.consumoSustancias",
          tipo: "MALO",
          descripcion: `Conductor reporta consumo de sustancias: ${sc.sustanciasDetalle || "No especificado"}`,
          fechaLimite: ahora,
          resuelta: false,
          requiereCorreccion: false,
        });
      }

      // Estado de salud MALO → novedad
      if (sc.estadoSalud === "MALO") {
        novedadesDetectadas.push({
          item: "seccionConductor.estadoSalud",
          tipo: "MALO",
          descripcion:
            sc.estadoSaludObservaciones || "Conductor en mal estado de salud",
          fechaLimite: ahora,
          resuelta: false,
          requiereCorreccion: false,
        });
      }
    }

    // 3. Determinar estado general y fecha límite
    if (novedadesDetectadas.length > 0) {
      // Agregar entrada inicial al historial de cada novedad
      for (const n of novedadesDetectadas) {
        n.estadoCorreccion = "PENDIENTE";
        n.historial = [
          {
            accion: "CREADA",
            usuario: this.creadoPor || null,
            fecha: ahora,
            detalle: n.descripcion,
          },
        ];
      }
      this.novedades = novedadesDetectadas;
      this.estadoGeneral = "NOVEDAD";

      // La fecha límite global es la más lejana de todas las novedades corregibles
      const fechasCorregibles = novedadesDetectadas
        .filter((n) => n.requiereCorreccion)
        .map((n) => n.fechaLimite);
      this.fechaLimiteNovedades =
        fechasCorregibles.length > 0
          ? new Date(Math.max(...fechasCorregibles))
          : ahora;
    } else {
      this.estadoGeneral = "APROBADO";
    }
  }
});

PreoperacionalSchema.methods.softDelete = async function (userId) {
  this.deletedAt = new Date();
  this.eliminadoPor = userId;
  return await this.save({ validateBeforeSave: false });
};

PreoperacionalSchema.methods.restore = async function () {
  this.deletedAt = null;
  this.eliminadoPor = null;
  return await this.save({ validateBeforeSave: false });
};

PreoperacionalSchema.query.notDeleted = function () {
  return this.where({ deletedAt: null });
};

const Preoperacional = mongoose.model("Preoperacional", PreoperacionalSchema);

module.exports = Preoperacional;
