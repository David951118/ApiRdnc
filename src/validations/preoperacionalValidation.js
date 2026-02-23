const Joi = require("joi");

// Ítem de revisión (común a todas las secciones)
const itemRevision = Joi.object({
  estado: Joi.string()
    .valid("OK", "FALLA", "NO_APLICA")
    .required()
    .messages({
      "any.only": "estado debe ser OK, FALLA o NO_APLICA",
      "any.required": "El estado del ítem es obligatorio",
    }),
  observaciones: Joi.string().allow("", null),
  fotoUrl: Joi.string().uri().allow("", null),
});

// Sección delantera
const seccionDelantera = Joi.object({
  luces: itemRevision,
  direccionalesDelanteros: itemRevision,
  limpiabrisas: itemRevision,
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
  kitCarretera: itemRevision,
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

  seccionDelantera,
  seccionMedia,
  seccionTrasera,

  estadoGeneral: Joi.string()
    .valid("APROBADO", "RECHAZADO")
    .required()
    .messages({
      "any.only": "estadoGeneral debe ser APROBADO o RECHAZADO",
      "any.required": "El estado general es obligatorio",
    }),

  firmadoCheck: Joi.boolean().optional(),
  firmaConductorUrl: Joi.string().uri().allow("", null).optional(),
});

const updatePreoperacional = createPreoperacional.fork(
  ["vehiculo", "conductor", "estadoGeneral"],
  (schema) => schema.optional(),
);

module.exports = {
  createPreoperacional,
  updatePreoperacional,
};
