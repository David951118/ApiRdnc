const logger = require("../config/logger");

const errorHandler = (err, req, res, next) => {
  // Loggear el error completo en el servidor
  logger.error("Error no controlado:", {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    body: req.body,
  });

  // Errores de Mongoose (Validación de BD)
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((val) => val.message);
    return res.status(400).json({
      success: false,
      error: "Error de Validación de Datos",
      details: messages,
    });
  }

  // Errores de Mongoose (Duplicados)
  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      error: "Registro Duplicado",
      message: `El valor ingresado ya existe en el sistema`,
    });
  }

  // Error por defecto
  const status = err.status || 500;
  const message = err.message || "Error Interno del Servidor";

  res.status(status).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

module.exports = errorHandler;
