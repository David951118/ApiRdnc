const authService = require("../services/authService");
const logger = require("../config/logger");

/**
 * Middleware de autenticación
 * Valida el token JWT y carga la sesión del usuario
 */
async function authenticate(req, res, next) {
  try {
    // Extraer token del header Authorization
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: "Token no proporcionado",
        message: "Debe incluir el header Authorization: Bearer <token>",
      });
    }

    // Formato esperado: "Bearer <token>"
    const parts = authHeader.split(" ");

    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return res.status(401).json({
        success: false,
        error: "Formato de token inválido",
        message: 'Formato esperado: "Authorization: Bearer <token>"',
      });
    }

    const token = parts[1];

    // Validar token y obtener sesión
    const session = await authService.validateToken(token);

    if (!session) {
      return res.status(401).json({
        success: false,
        error: "Token inválido o expirado",
        message: "Por favor, inicie sesión nuevamente",
      });
    }

    // Adjuntar datos del usuario y sesión al request
    req.user = {
      username: session.username,
      userId: session.userData.userId,
      roles: session.userData.roles,
    };

    req.session = {
      id: session._id,
      cellviToken: session.cellviToken,
      vehiculosPermitidos: session.vehiculosPermitidos,
      expiresAt: session.expiresAt,
    };

    // Continuar con la petición
    next();
  } catch (error) {
    logger.error(`Error en middleware de autenticación: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Error interno del servidor",
    });
  }
}

/**
 * Middleware opcional de autenticación
 * Si hay token, lo valida. Si no hay, continúa sin user
 */
async function optionalAuthenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      // No hay token, continuar sin autenticación
      return next();
    }

    const parts = authHeader.split(" ");

    if (parts.length === 2 && parts[0] === "Bearer") {
      const token = parts[1];
      const session = await authService.validateToken(token);

      if (session) {
        req.user = {
          username: session.username,
          userId: session.userData.userId,
          roles: session.userData.roles,
        };

        req.session = {
          id: session._id,
          cellviToken: session.cellviToken,
          vehiculosPermitidos: session.vehiculosPermitidos,
          expiresAt: session.expiresAt,
        };
      }
    }

    next();
  } catch (error) {
    logger.error(
      `Error en middleware opcional de autenticación: ${error.message}`,
    );
    next(); // Continuar aunque haya error
  }
}

/**
 * Middleware para verificar permisos sobre un vehículo
 * Debe usarse DESPUÉS del middleware authenticate
 */
function requireVehicleAccess(vehicleField = "placa") {
  return (req, res, next) => {
    try {
      if (!req.session || !req.session.vehiculosPermitidos) {
        return res.status(403).json({
          success: false,
          error: "Acceso denegado",
          message: "No tiene permisos para este recurso",
        });
      }

      // Obtener placa de params, query o body
      const placa =
        req.params[vehicleField] ||
        req.query[vehicleField] ||
        req.body[vehicleField];

      if (!placa) {
        // Si no se especifica placa, permitir (el filtrado se hará en el controlador)
        return next();
      }

      // Verificar si el usuario tiene acceso a este vehículo
      const hasAccess = req.session.vehiculosPermitidos.some(
        (v) => v.placa.toUpperCase() === placa.toUpperCase(),
      );

      if (!hasAccess) {
        logger.warn(
          `Usuario ${req.user.username} intentó acceder a vehículo ${placa} sin permisos`,
        );

        return res.status(403).json({
          success: false,
          error: "Acceso denegado",
          message: `No tiene permisos para el vehículo ${placa}`,
        });
      }

      next();
    } catch (error) {
      logger.error(`Error en middleware de permisos: ${error.message}`);

      return res.status(500).json({
        success: false,
        error: "Error interno del servidor",
      });
    }
  };
}

module.exports = {
  authenticate,
  optionalAuthenticate,
  requireVehicleAccess,
};
