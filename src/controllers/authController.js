const authService = require("../services/authService");
const logger = require("../config/logger");

/**
 * Iniciar sesión
 */
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: "Faltan credenciales",
        message: "Debe proporcionar username y password",
      });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers["user-agent"] || "";

    const result = await authService.login(
      username,
      password,
      ipAddress,
      userAgent,
    );

    if (!result.success) {
      return res.status(401).json(result);
    }

    res.json(result);
  } catch (error) {
    logger.error(`Error en auth.login: ${error.message}`);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
    });
  }
};

/**
 * Renovar token
 */
exports.refreshToken = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader.split(" ")[1];

    const result = await authService.refreshToken(token);

    if (!result.success) {
      return res.status(401).json(result);
    }

    res.json(result);
  } catch (error) {
    logger.error(`Error en auth.refreshToken: ${error.message}`);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
    });
  }
};

/**
 * Cerrar sesión
 */
exports.logout = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader.split(" ")[1];

    const result = await authService.logout(token);

    res.json(result);
  } catch (error) {
    logger.error(`Error en auth.logout: ${error.message}`);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
    });
  }
};

/**
 * Obtener datos del usuario actual
 */
exports.getMe = (req, res) => {
  try {
    res.json({
      success: true,
      user: req.user,
      session: {
        expiresAt: req.session.expiresAt,
        vehiculos: req.session.vehiculosPermitidos.map((v) => ({
          id: v.vehiculoId,
          placa: v.placa,
        })),
      },
    });
  } catch (error) {
    logger.error(`Error en auth.getMe: ${error.message}`);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
    });
  }
};

/**
 * Validar token
 */
exports.validateToken = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.json({ success: true, valid: false });
    }

    const parts = authHeader.split(" ");

    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return res.json({ success: true, valid: false });
    }

    const token = parts[1];
    const session = await authService.validateToken(token);

    res.json({
      success: true,
      valid: session !== null,
      expiresAt: session ? session.expiresAt : null,
    });
  } catch (error) {
    logger.error(`Error en auth.validateToken: ${error.message}`);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
    });
  }
};
