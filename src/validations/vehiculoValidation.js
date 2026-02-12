const Joi = require("joi");

const createVehiculo = Joi.object({
  // Identificación
  placa: Joi.string().required(),
  numeroInterno: Joi.string().required(),
  idCellvi: Joi.string()
    .required()
    .messages({
      "any.required": "El ID de Cellvi es obligatorio para sincronización",
    }),

  // Características
  marca: Joi.string().required(),
  linea: Joi.string().required(),
  modelo: Joi.number().integer().min(1900).max(2100).required(),
  color: Joi.string().required(),
  claseVehiculo: Joi.string().required(),
  carroceria: Joi.string().default("CERRADA"),
  modalidad: Joi.string().default("ESPECIAL"),
  combustible: Joi.string()
    .valid("GASOLINA", "DIESEL", "GAS", "HIBRIDO", "ELECTRICO")
    .required(),

  // Técnica
  motor: Joi.string().required(),
  chasis: Joi.string().required(),
  cilindraje: Joi.string().allow("", null),
  capacidadPasajeros: Joi.number().min(1).required(),
  fechaMatricula: Joi.date().required(),

  // Relaciones
  propietario: Joi.string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .message("ID de propietario inválido"), // Mongo ID
  // ID de la empresa afiliadora (referencia a Empresa)
  empresaAfiliadora: Joi.string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .message("ID de empresa afiliadora inválido"),
  fechaAfiliacion: Joi.date(),

  estado: Joi.string().valid("ACTIVO", "MANTENIMIENTO", "INACTIVO", "RETIRADO"),
  kilometrajeActual: Joi.number().default(0),
});

const updateVehiculo = createVehiculo.fork(
  ["placa", "idCellvi", "motor", "chasis"],
  (schema) => schema.optional(),
);

module.exports = {
  createVehiculo,
  updateVehiculo,
};
