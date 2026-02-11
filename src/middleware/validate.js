const Joi = require("joi");

/**
 * Middleware genérico para validar request body contra un esquema Joi
 * @param {Joi.ObjectSchema} schema
 */
const validate = (schema) => (req, res, next) => {
  if (!schema) return next();

  const { error, value } = schema.validate(req.body, {
    abortEarly: false, // Muestra todos los errores, no solo el primero
    stripUnknown: true, // Elimina campos que no estén en el esquema (Seguridad)
  });

  if (error) {
    const errorDetails = error.details.map((details) => ({
      field: details.path.join("."),
      message: details.message.replace(/"/g, ""),
    }));

    return res.status(400).json({
      success: false,
      error: "Error de Validación",
      details: errorDetails,
    });
  }

  // Reemplazamos req.body con los datos limpios y tipados
  req.body = value;
  next();
};

module.exports = validate;
