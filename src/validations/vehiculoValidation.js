const Joi = require("joi");

const createVehiculo = Joi.object({
  // Identificación
  placa: Joi.string()
    .pattern(/^[A-Za-z]{3}\d{3}$/)
    .uppercase()
    .required()
    .messages({
      "string.pattern.base": "La placa debe tener 3 letras y 3 números",
      "any.required": "La placa es obligatoria",
    }),
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
  claseVehiculo: Joi.string()
    .valid(
      "BUS",
      "BUSETA",
      "MICROBUS",
      "CAMIONETA",
      "AUTOMOVIL",
      "CAMION",
      "TRACTOCAMION",
    )
    .required(),
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
  empresaAfiliadora: Joi.string().default("ASEGURAR LTDA"),
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
