const Joi = require("joi");

// Tipos de documento para Vehículos
const tiposVehiculo = [
  "SOAT",
  "TECNOMECANICA",
  "POLIZA_RCE",
  "POLIZA_RCC",
  "TARJETA_OPERACION",
  "TARJETA_PROPIEDAD",
  "REVISION_PREVENTIVA",
];

// Tipos de documento para Terceros
const tiposTercero = [
  "LICENCIA_CONDUCCION",
  "CEDULA",
  "ARL",
  "EPS",
  "FONDO_PENSIONES",
  "EXAMEN_MEDICO",
  "CAPACITACION_PESV",
];

// Tipos para Contratos/Empresas
const tiposContrato = ["CONTRATO_CLIENTE", "RUT", "CAMARA_COMERCIO", "OTROS"];

// Todos los tipos válidos
const todosLosTipos = [...tiposVehiculo, ...tiposTercero, ...tiposContrato];

const createDocumento = Joi.object({
  entidadId: Joi.string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      "string.pattern.base": "ID de entidad inválido (debe ser ObjectId de 24 caracteres)",
      "any.required": "El ID de la entidad es obligatorio",
    }),

  entidadModelo: Joi.string()
    .valid("Vehiculo", "Tercero")
    .required()
    .messages({
      "any.only": "entidadModelo debe ser 'Vehiculo' o 'Tercero'",
      "any.required": "El modelo de entidad es obligatorio",
    }),

  tipoDocumento: Joi.string()
    .valid(...todosLosTipos)
    .required()
    .messages({
      "any.only": `tipoDocumento debe ser uno de: ${todosLosTipos.join(", ")}`,
      "any.required": "El tipo de documento es obligatorio",
    })
    .when("entidadModelo", {
      is: "Vehiculo",
      then: Joi.valid(...tiposVehiculo, ...tiposContrato).messages({
        "any.only": `Para Vehiculo, tipoDocumento debe ser: ${[...tiposVehiculo, ...tiposContrato].join(", ")}`,
      }),
      otherwise: Joi.valid(...tiposTercero, ...tiposContrato).messages({
        "any.only": `Para Tercero, tipoDocumento debe ser: ${[...tiposTercero, ...tiposContrato].join(", ")}`,
      }),
    }),

  numero: Joi.string().trim().allow("", null),

  entidadEmisora: Joi.string().trim().allow("", null),

  fechaExpedicion: Joi.date().allow(null),

  fechaVencimiento: Joi.date()
    .allow(null)
    .when("fechaExpedicion", {
      is: Joi.exist(),
      then: Joi.date().greater(Joi.ref("fechaExpedicion")).messages({
        "date.greater": "fechaVencimiento debe ser posterior a fechaExpedicion",
      }),
    }),

  archivo: Joi.object({
    url: Joi.string().uri().required().messages({
      "string.uri": "La URL del archivo debe ser una URL válida",
      "any.required": "La URL del archivo es obligatoria",
    }),
    key: Joi.string().allow("", null),
    mimeType: Joi.string().allow("", null),
    nombreOriginal: Joi.string().allow("", null),
    pesoBytes: Joi.number().min(0).allow(null),
  })
    .required()
    .messages({
      "any.required": "El objeto archivo es obligatorio",
    }),

  estado: Joi.string()
    .valid("VIGENTE", "POR_VENCER", "VENCIDO", "HISTORICO", "RECHAZADO")
    .default("VIGENTE"),

  observaciones: Joi.string().allow("", null),
});

const updateDocumento = createDocumento.fork(
  ["entidadId", "entidadModelo", "tipoDocumento", "archivo"],
  (schema) => schema.optional(),
);

module.exports = {
  createDocumento,
  updateDocumento,
};
