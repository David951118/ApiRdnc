const Joi = require("joi");

const createEmpresa = Joi.object({
  nit: Joi.string().required().trim().messages({
    "string.empty": "El NIT es obligatorio",
  }),
  razonSocial: Joi.string().required().trim().messages({
    "string.empty": "La Razón Social es obligatoria",
  }),
  nombreComercial: Joi.string().allow("", null),

  contacto: Joi.object({
    direccion: Joi.string().allow("", null),
    ciudad: Joi.string().allow("", null),
    telefono: Joi.string().allow("", null),
    email: Joi.string().email().allow("", null),
    sitioWeb: Joi.string().uri().allow("", null),
  }),

  representanteLegal: Joi.object({
    nombres: Joi.string(),
    apellidos: Joi.string(),
    cedula: Joi.string(),
  }),

  estado: Joi.string()
    .valid("ACTIVA", "INACTIVA", "SUSPENDIDA")
    .default("ACTIVA"),

  tipoEmpresa: Joi.string()
    .valid("TRANSPORTADORA", "CLIENTE_CORPORATIVO", "PROVEEDOR")
    .default("TRANSPORTADORA"),

  branding: Joi.object({
    colorPrimary:     Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).allow("", null),
    colorPrimaryDark: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).allow("", null),
    colorAccent:      Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).allow("", null),
    logoKey:          Joi.string().allow("", null),
    eslogan:          Joi.string().allow("", null),
  }),
});

const updateEmpresa = createEmpresa.fork(["nit", "razonSocial"], (schema) =>
  schema.optional(),
);

module.exports = {
  createEmpresa,
  updateEmpresa,
};
