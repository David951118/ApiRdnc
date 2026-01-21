const express = require("express");
const router = express.Router();
const authService = require("../services/authService");
const { authenticate } = require("../middleware/auth");
const logger = require("../config/logger");

/**
 * POST /api/auth/login
 * Autenticar usuario y crear sesión
 *
 * Body: { username, password }
 * Response: { success, token, expiresAt, user }
 */
router.post("/login", async (req, res) => {
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
    logger.error(`Error en /auth/login: ${error.message}`);

    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
    });
  }
});

/**
 * POST /api/auth/refresh
 * Renovar token de sesión
 *
 * Headers: Authorization: Bearer <token>
 * Response: { success, token, expiresAt }
 */
router.post("/refresh", authenticate, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader.split(" ")[1];

    const result = await authService.refreshToken(token);

    if (!result.success) {
      return res.status(401).json(result);
    }

    res.json(result);
  } catch (error) {
    logger.error(`Error en /auth/refresh: ${error.message}`);

    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
    });
  }
});

/**
 * POST /api/auth/logout
 * Cerrar sesión
 *
 * Headers: Authorization: Bearer <token>
 * Response: { success }
 */
router.post("/logout", authenticate, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader.split(" ")[1];

    const result = await authService.logout(token);

    res.json(result);
  } catch (error) {
    logger.error(`Error en /auth/logout: ${error.message}`);

    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
    });
  }
});

/**
 * GET /api/auth/me
 * Obtener información del usuario actual
 *
 * Headers: Authorization: Bearer <token>
 * Response: { success, user, session }
 */
router.get("/me", authenticate, (req, res) => {
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
    logger.error(`Error en /auth/me: ${error.message}`);

    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
    });
  }
});

/**
 * GET /api/auth/validate
 * Validar si el token sigue siendo válido
 *
 * Headers: Authorization: Bearer <token>
 * Response: { success, valid }
 */
router.get("/validate", async (req, res) => {
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
    logger.error(`Error en /auth/validate: ${error.message}`);

    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
    });
  }
});

module.exports = router;
