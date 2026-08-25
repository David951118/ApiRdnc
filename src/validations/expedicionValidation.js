const Joi = require("joi");

/**
 * Validaciones del módulo de EXPEDICIÓN RNDC.
 *
 * `variables` es un objeto plano {VARIABLE_DICCIONARIO: valor} — el
 * diccionario de datos del RNDC es extenso y cambia por resolución, así que
 * se valida forma (escalares) y las claves obligatorias del flujo, dejando
 * el resto flexible. El RNDC hace la validación de fondo y devuelve el error.
 */

const objectId = Joi.string().hex().length(24);

// Escalares únicamente (nada de objetos/arrays inyectados en el XML)
const variablesPlanas = Joi.object().pattern(
  Joi.string()
    .pattern(/^[A-Za-z0-9_]+$/)
    .max(60),
  Joi.alternatives().try(Joi.string().max(500), Joi.number(), Joi.boolean()),
);

const credencial = Joi.object({
  empresa: objectId.optional(), // solo la usa el ADMIN de plataforma
  nitEmpresaTransporte: Joi.string()
    .pattern(/^\d{6,15}$/)
    .required(),
  usuarioWS: Joi.string().min(3).max(100).required(),
  password: Joi.string().min(4).max(100).required(),
  modoPruebas: Joi.boolean().default(true),
});

const tercero = Joi.object({
  empresa: objectId.optional(),
  variables: variablesPlanas
    .keys({
      CODTIPOIDTERCERO: Joi.string().required(),
      NUMIDTERCERO: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
    })
    .required(),
});

const vehiculo = Joi.object({
  empresa: objectId.optional(),
  variables: variablesPlanas
    .keys({
      NUMPLACA: Joi.string().required(),
    })
    .required(),
});

const remesa = Joi.object({
  empresa: objectId.optional(),
  consecutivoRemesa: Joi.string().max(30).required(),
  variables: variablesPlanas.required(),
});

const manifiesto = Joi.object({
  empresa: objectId.optional(),
  numManifiestoCarga: Joi.string().max(30).required(),
  consecutivosRemesas: Joi.array()
    .items(Joi.string().max(30))
    .min(1)
    .required(),
  variables: variablesPlanas.required(),
});

const anulacion = Joi.object({
  empresa: objectId.optional(),
  motivo: Joi.string().min(5).max(300).required(),
});

// Cumplido (procesos 5/6): fechas/horas reales, cantidades, etc. del
// diccionario RNDC — flexible como remesa/manifiesto.
const cumplido = Joi.object({
  empresa: objectId.optional(),
  variables: variablesPlanas.required(),
});

module.exports = {
  credencial,
  tercero,
  vehiculo,
  remesa,
  manifiesto,
  anulacion,
  cumplido,
};
