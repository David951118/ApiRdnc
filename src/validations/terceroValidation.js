const Joi = require("joi");

// Perfiles que inician sesión en la plataforma y por tanto deben quedar
// enlazados a un usuario de Cellvi. El API no lo exige para CLIENTE ni
// PROPIETARIO porque el módulo FUEC crea contratantes sin usuario; la regla de
// negocio más estricta ("todos menos el proveedor") la aplica el formulario de
// Usuarios del front PESV (requiereUsuarioCellvi en RolesMultiSelect.tsx).
const ROLES_CON_ACCESO_CELLVI = ["CONDUCTOR", "ADMINISTRATIVO", "MECANICO"];

const MSG_USUARIO_CELLVI =
  "Usuario Cellvi es obligatorio para conductores, administrativos, mecánicos y roles de acceso al sistema";

const USUARIO_CELLVI_OBLIGATORIO = Joi.string()
  .trim()
  .invalid("", null)
  .required()
  .messages({
    "any.required": MSG_USUARIO_CELLVI,
    "any.invalid": MSG_USUARIO_CELLVI,
    "string.empty": MSG_USUARIO_CELLVI,
  });

const createTercero = Joi.object({
  // Identificación Base (SIEMPRE PERSONAL)
  identificacion: Joi.string().required().trim().messages({
    "string.empty": "La identificación es obligatoria",
  }),

  // Tipo de documento: NIT para persona jurídica (empresa cliente/proveedor),
  // los demás para persona natural.
  tipoId: Joi.string()
    .valid("CC", "NIT", "CE", "PEP", "PASAPORTE")
    .required()
    .messages({ "any.only": "Tipo de ID inválido" }),

  // Enlace con el login de Cellvi. Solo es obligatorio si el tercero tiene un
  // perfil que inicia sesión (ROLES_CON_ACCESO_CELLVI) o un rol de acceso
  // local (rolesSistema). Si llega vacío, el modelo lo deja sin definir para
  // que el índice único sparse no choque entre terceros sin usuario.
  usuarioCellvi: Joi.string()
    .trim()
    .allow("", null)
    .when("roles", {
      is: Joi.array()
        .has(Joi.valid(...ROLES_CON_ACCESO_CELLVI))
        .required(),
      then: USUARIO_CELLVI_OBLIGATORIO,
    })
    .when("rolesSistema", {
      is: Joi.array().min(1).required(),
      then: USUARIO_CELLVI_OBLIGATORIO,
    }),

  empresa: Joi.string().allow(null), // ObjectId como string

  // Persona natural (CC/CE/PEP/PASAPORTE) → nombres + apellidos obligatorios
  // Persona jurídica (NIT) → opcionales (puede ser empresa cliente/proveedor)
  nombres: Joi.string()
    .trim()
    .when("tipoId", {
      // .required(): si tipoId no viene (update parcial) no se exigen
      is: Joi.valid("CC", "CE", "PEP", "PASAPORTE").required(),
      then: Joi.required(),
      otherwise: Joi.optional().allow("", null),
    })
    .messages({
      "any.required": "Nombres son obligatorios para personas naturales",
    }),

  apellidos: Joi.string()
    .trim()
    .when("tipoId", {
      // .required(): si tipoId no viene (update parcial) no se exigen
      is: Joi.valid("CC", "CE", "PEP", "PASAPORTE").required(),
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
        "MECANICO",
      ),
    )
    .min(1)
    .required()
    .messages({
      "array.min": "Debe asignar al menos un rol",
    }),

  // Roles de acceso locales (se suman a los de Cellvi al hacer login)
  rolesSistema: Joi.array()
    .items(Joi.string().valid("ROLE_MECANICO", "ROLE_AUDITOR"))
    .optional(),

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
  ROLES_CON_ACCESO_CELLVI,
};
