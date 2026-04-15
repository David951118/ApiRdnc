const Joi = require("joi");

// Ítem de revisión (común a todas las secciones del vehículo)
const itemRevision = Joi.object({
  estado: Joi.string()
    .valid("BUENO", "REGULAR", "MALO")
    .required()
    .messages({
      "any.only": "estado debe ser BUENO, REGULAR o MALO",
      "any.required": "El estado del ítem es obligatorio",
    }),
  observaciones: Joi.string().allow("", null),
  fotoUrl: Joi.string().uri().allow("", null),
});

// Sección conductor (condiciones de salud y aptitud)
const seccionConductor = Joi.object({
  horasSueno: Joi.number().min(0).max(24).allow(null),
  selfieUrl: Joi.string().uri().allow("", null),
  selfieFecha: Joi.date().allow(null),
  estadoSalud: Joi.string().valid("BUENO", "REGULAR", "MALO").allow(null),
  estadoSaludObservaciones: Joi.string().allow("", null),
  tomaMedicamentos: Joi.boolean().default(false),
  medicamentosDetalle: Joi.string().allow("", null),
  consumoSustancias: Joi.boolean().default(false),
  sustanciasDetalle: Joi.string().allow("", null),
}).optional();

// Sección delantera
const seccionDelantera = Joi.object({
  luces: itemRevision,
  direccionalesDelanteros: itemRevision,
  limpiabrisas: itemRevision,
  parabrisas: itemRevision,
  espejosRetrovisores: itemRevision,
  liquidos: itemRevision,
  llantaDelanteraDerecha: itemRevision,
  llantaDelanteraIzquierda: itemRevision,
  bocina: itemRevision,
  frenos: itemRevision,
}).optional();

// Sección media
const seccionMedia = Joi.object({
  tablero: itemRevision,
  timon: itemRevision,
  cinturones: itemRevision,
  pedales: itemRevision,
  frenoMano: itemRevision,
  bateria: itemRevision,
  kitPrimerosAuxilios: itemRevision,
  reflectivos: itemRevision,
}).optional();

// Sección trasera
const seccionTrasera = Joi.object({
  stop: itemRevision,
  llantasRepuesto: itemRevision,
  equipoCarretera: itemRevision,
  llantaTraseraDerecha: itemRevision,
  llantaTraseraIzquierda: itemRevision,
  direccionalesTraseros: itemRevision,
  placa: itemRevision,
  extintor: itemRevision,
  herramienta: itemRevision,
}).optional();

const createPreoperacional = Joi.object({
  vehiculo: Joi.string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      "string.pattern.base": "ID de vehículo inválido (ObjectId 24 caracteres)",
      "any.required": "El vehículo es obligatorio",
    }),

  conductor: Joi.string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      "string.pattern.base": "ID de conductor (tercero) inválido",
      "any.required": "El conductor es obligatorio",
    }),

  fecha: Joi.date().optional(),
  kilometraje: Joi.number().min(0).allow(null),

  seccionConductor,
  seccionDelantera,
  seccionMedia,
  seccionTrasera,

  // estadoGeneral se calcula automáticamente en el pre-save
  estadoGeneral: Joi.string()
    .valid("APROBADO", "NOVEDAD", "RECHAZADO")
    .optional(),

  firmadoCheck: Joi.boolean().optional(),
  firmaConductorUrl: Joi.string().uri().allow("", null).optional(),
});

const updatePreoperacional = createPreoperacional.fork(
  ["vehiculo", "conductor"],
  (schema) => schema.optional(),
);

module.exports = {
  createPreoperacional,
  updatePreoperacional,
};
