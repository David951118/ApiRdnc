const Joi = require("joi");

// Tipos válidos por entidad
const tiposParaVehiculo = [
  "SOAT",
  "TECNOMECANICA",
  "POLIZA_RCE",
  "POLIZA_RCC",
  "TARJETA_OPERACION",
  "TARJETA_PROPIEDAD",
  "REVISION_PREVENTIVA",
  "OTROS",
];

const tiposParaTercero = [
  "LICENCIA_CONDUCCION",
  "CEDULA",
  "ARL",
  "EPS",
  "CAJA_COMPENSACION",
  "FONDO_PENSIONES",
  "EXAMEN_MEDICO",
  "CAPACITACION_PESV",
  "RUT",
  "OTROS",
];

const tiposParaEmpresa = [
  "CONTRATO_CLIENTE",
  "CAMARA_COMERCIO",
  "POLIZA_RCE",
  "POLIZA_RCC",
  "RUT",
  "OTROS",
];

// Todos los tipos válidos
const todosLosTipos = [
  ...new Set([...tiposParaVehiculo, ...tiposParaTercero, ...tiposParaEmpresa]),
];

const createDocumento = Joi.object({
  entidadId: Joi.string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      "string.pattern.base": "ID de entidad inválido (debe ser ObjectId de 24 caracteres)",
      "any.required": "El ID de la entidad es obligatorio",
    }),

  entidadModelo: Joi.string()
    .valid("Vehiculo", "Tercero", "Empresa")
    .required()
    .messages({
      "any.only": "entidadModelo debe ser 'Vehiculo', 'Tercero' o 'Empresa'",
      "any.required": "El modelo de entidad es obligatorio",
    }),

  tipoDocumento: Joi.string()
    .valid(...todosLosTipos)
    .required()
    .messages({
      "any.only": `tipoDocumento debe ser uno de: ${todosLosTipos.join(", ")}`,
      "any.required": "El tipo de documento es obligatorio",
    })
    .when("entidadModelo", [
      {
        is: "Vehiculo",
        then: Joi.valid(...tiposParaVehiculo).messages({
          "any.only": `Para Vehiculo, tipoDocumento debe ser: ${tiposParaVehiculo.join(", ")}`,
        }),
      },
      {
        is: "Tercero",
        then: Joi.valid(...tiposParaTercero).messages({
          "any.only": `Para Tercero, tipoDocumento debe ser: ${tiposParaTercero.join(", ")}`,
        }),
      },
      {
        is: "Empresa",
        then: Joi.valid(...tiposParaEmpresa).messages({
          "any.only": `Para Empresa, tipoDocumento debe ser: ${tiposParaEmpresa.join(", ")}`,
        }),
      },
    ]),

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

  archivoReverso: Joi.object({
    url: Joi.string().uri().required().messages({
      "string.uri": "La URL del archivo reverso debe ser una URL válida",
      "any.required": "La URL del archivo reverso es obligatoria",
    }),
    key: Joi.string().allow("", null),
    mimeType: Joi.string().allow("", null),
    nombreOriginal: Joi.string().allow("", null),
    pesoBytes: Joi.number().min(0).allow(null),
  })
    .optional()
    .allow(null),

  estado: Joi.string()
    .valid("VIGENTE", "POR_VENCER", "VENCIDO", "HISTORICO", "RECHAZADO")
    .default("VIGENTE"),

  observaciones: Joi.string().allow("", null),

  entidadesAsociadas: Joi.array()
    .items(
      Joi.object({
        entidadId: Joi.string()
          .regex(/^[0-9a-fA-F]{24}$/)
          .required()
          .messages({
            "string.pattern.base": "ID de entidad asociada inválido",
            "any.required": "El ID de la entidad asociada es obligatorio",
          }),
        entidadModelo: Joi.string()
          .valid("Vehiculo", "Tercero", "Empresa")
          .required()
          .messages({
            "any.only":
              "entidadModelo asociado debe ser 'Vehiculo', 'Tercero' o 'Empresa'",
            "any.required": "El modelo de entidad asociada es obligatorio",
          }),
      }),
    )
    .optional()
    .default([]),
});

const updateDocumento = createDocumento.fork(
  ["entidadId", "entidadModelo", "tipoDocumento", "archivo"],
  (schema) => schema.optional(),
);

module.exports = {
  createDocumento,
  updateDocumento,
};
