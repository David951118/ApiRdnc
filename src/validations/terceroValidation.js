const Joi = require("joi");

const createTercero = Joi.object({
  // Identificación Base (SIEMPRE PERSONAL)
  identificacion: Joi.string().required().trim().messages({
    "string.empty": "La identificación es obligatoria",
  }),

  // TipoId: Si tiene empresa, NO puede ser NIT
  tipoId: Joi.string()
    .valid("CC", "NIT", "CE", "PEP", "PASAPORTE")
    .required()
    .messages({ "any.only": "Tipo de ID inválido" }),

  usuarioCellvi: Joi.string().trim().allow("", null),

  empresa: Joi.string().allow(null), // ObjectId como string

  // Persona natural (CC/CE/PEP/PASAPORTE) → nombres + apellidos obligatorios
  // Persona jurídica (NIT) → opcionales (puede ser empresa cliente/proveedor)
  nombres: Joi.string()
    .trim()
    .when("tipoId", {
      is: Joi.valid("CC", "CE", "PEP", "PASAPORTE"),
      then: Joi.required(),
      otherwise: Joi.optional().allow("", null),
    })
    .messages({
      "any.required": "Nombres son obligatorios para personas naturales",
    }),

  apellidos: Joi.string()
    .trim()
    .when("tipoId", {
      is: Joi.valid("CC", "CE", "PEP", "PASAPORTE"),
      then: Joi.required(),
      otherwise: Joi.optional().allow("", null),
    })
    .messages({
      "any.required": "Apellidos son obligatorios para personas naturales",
    }),

  // Persona jurídica (NIT) → razonSocial obligatoria
  razonSocial: Joi.string()
    .trim()
    .when("tipoId", {
      is: "NIT",
      then: Joi.required().messages({
        "any.required": "Razón Social es obligatoria para NIT",
      }),
      otherwise: Joi.optional().allow("", null),
    }),

  foto: Joi.object({
    url: Joi.string().uri().required(),
    key: Joi.string().required(),
  }).allow(null),

  // Roles
  roles: Joi.array()
    .items(
      Joi.string().valid(
        "CONDUCTOR",
        "PROPIETARIO",
        "CLIENTE",
        "ADMINISTRATIVO",
        "PROVEEDOR",
      ),
    )
    .min(1)
    .required()
    .messages({
      "array.min": "Debe asignar al menos un rol",
    }),

  // Contacto (simplificado para datos personales si hay empresa)
  contacto: Joi.object({
    direccion: Joi.string().allow("", null),
    ciudad: Joi.string().allow("", null),
    telefono: Joi.string().allow("", null),
    email: Joi.string().email().allow("", null),
  }),

  estado: Joi.string()
    .valid("ACTIVO", "INACTIVO", "BLOQUEADO")
    .default("ACTIVO"),

  // Secciones Específicas
  datosConductor: Joi.object({
    tipoSangre: Joi.string(),
  }).allow(null),

  datosPropietario: Joi.object({
    observaciones: Joi.string().allow("", null),
  }).allow(null),

  datosCliente: Joi.object({
    sector: Joi.string(),
  }).allow(null),

  datosAdministrativo: Joi.object({
    celular: Joi.string(),
    cargo: Joi.string(),
    area: Joi.string(),
    fechaIngreso: Joi.date(),
  }).allow(null),
});

const updateTercero = createTercero.fork(
  ["identificacion", "tipoId", "roles"],
  (schema) => schema.optional(),
);

module.exports = {
  createTercero,
  updateTercero,
};
