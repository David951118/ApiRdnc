const axios = require("axios");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const UserSession = require("../models/UserSession");
const config = require("../config/env");
const logger = require("../config/logger");

/**
 * Servicio de autenticación de usuarios
 * Maneja login, logout, y validación de sesiones
 */
class AuthService {
  constructor() {
    this.cellviApiUrl = config.cellvi.apiUrl;
    // Secret para firmar JWTs (usar variable de entorno en producción)
    this.jwtSecret =
      process.env.JWT_SECRET || "CHANGE_THIS_SECRET_IN_PRODUCTION";
    this.sessionDuration = 30; // minutos
  }

  /**
   * Autenticar usuario con Cellvi y crear sesión
   * @param {string} username - Usuario de Cellvi
   * @param {string} password - Contraseña de Cellvi
   * @param {string} ipAddress - IP del cliente
   * @param {string} userAgent - User Agent del cliente
   * @returns {Object} { success, token, expiresAt, user }
   */
  async login(username, password, ipAddress, userAgent) {
    try {
      logger.info(`Intento de login: ${username}`);

      // 1. Autenticar contra Cellvi
      const cellviResponse = await axios.post(
        `${this.cellviApiUrl}/api/login_check`,
        { username, password },
        {
          timeout: 30000,
          headers: { "Content-Type": "application/json" },
        },
      );

      const cellviData = cellviResponse.data.data || {};
      const cellviToken =
        cellviResponse.data.token ||
        cellviResponse.data.access_token ||
        cellviResponse.data.jwt;

      if (!cellviToken) {
        throw new Error("No se recibió token de Cellvi");
      }

      // 2. Obtener información del usuario
      // Si la respuesta de login ya trae los datos, usarlos. Si no, consultarlos.
      let userInfo = {};

      if (cellviData.username) {
        userInfo = {
          userId: cellviData.username, // Usamos username como ID si no viene ID explícito
          username: cellviData.username,
          email: "", // El login no suele devolver email, no es crítico
          roles: cellviData.roles || [],
          persona: cellviData.persona || "",
        };
      } else {
        userInfo = await this._getUserInfo(cellviToken);
      }

      // 3. Obtener vehículos asignados al usuario
      const vehiculos = await this._getVehiculosUsuario(cellviToken);

      logger.info(
        `Usuario ${username} autenticado. Vehículos: ${vehiculos.length}`,
      );

      // 4. Crear token JWT propio del API RNDC
      const expiresAt = new Date(Date.now() + this.sessionDuration * 60 * 1000);

      const payload = {
        username: username,
        userId: userInfo.userId,
        roles: userInfo.roles || [],
        exp: Math.floor(expiresAt.getTime() / 1000),
      };

      const rndcToken = jwt.sign(payload, this.jwtSecret);

      // 5. Crear hash del token para almacenamiento
      const tokenHash = this._hashToken(rndcToken);

      // 6. Invalidar sesiones anteriores del mismo usuario
      await UserSession.deleteMany({ username });

      // 7. Guardar sesión en DB
      const session = new UserSession({
        username,
        tokenHash,
        cellviToken,
        userData: {
          userId: userInfo.userId,
          username: username,
          email: userInfo.email || "",
          roles: userInfo.roles || [],
          persona: userInfo.persona || "", // Guardar nombre persona
        },
        vehiculosPermitidos: vehiculos.map((v) => ({
          vehiculoId: v.id,
          placa: v.placa,
        })),
        expiresAt,
        lastActivity: new Date(),
        ipAddress,
        userAgent,
      });

      await session.save();

      logger.info(`✅ Sesión creada para ${username} hasta ${expiresAt}`);

      return {
        success: true,
        token: rndcToken,
        expiresAt: expiresAt.toISOString(),
        user: {
          username,
          userId: userInfo.userId,
          persona: userInfo.persona || "", // Incluir nombre persona
          roles: userInfo.roles || [],
          vehiculos: vehiculos.map((v) => ({ id: v.id, placa: v.placa })),
        },
      };
    } catch (error) {
      logger.error(`Error en login para ${username}: ${error.message}`);

      if (error.response) {
        logger.error(`Status: ${error.response.status}`);
        logger.error(`Data: ${JSON.stringify(error.response.data)}`);
      }

      // Si es error de autenticación de Cellvi
      if (error.response?.status === 401) {
        return {
          success: false,
          error: "Credenciales inválidas",
        };
      }

      return {
        success: false,
        error: error.message || "Error al autenticar",
      };
    }
  }

  /**
   * Validar token y obtener sesión activa
   * @param {string} token - Token JWT del API RNDC
   * @returns {Object} Sesión activa o null
   */
  async validateToken(token) {
    try {
      // 1. Verificar firma del JWT
      const decoded = jwt.verify(token, this.jwtSecret);

      // 2. Buscar sesión en DB
      const tokenHash = this._hashToken(token);
      const session = await UserSession.findOne({
        tokenHash,
        expiresAt: { $gt: new Date() },
      });

      if (!session) {
        logger.warn(`Token válido pero sesión no encontrada o expirada`);
        return null;
      }

      // 3. Actualizar última actividad
      session.lastActivity = new Date();
      await session.save();

      return session;
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        logger.debug("Token expirado");
      } else if (error.name === "JsonWebTokenError") {
        logger.warn("Token inválido");
      } else {
        logger.error(`Error validando token: ${error.message}`);
      }

      return null;
    }
  }

  /**
   * Renovar sesión
   * @param {string} token - Token actual
   * @returns {Object} { success, token, expiresAt }
   */
  async refreshToken(token) {
    try {
      const session = await this.validateToken(token);

      if (!session) {
        return { success: false, error: "Sesión inválida o expirada" };
      }

      // Renovar expiración
      await session.renovar(this.sessionDuration);

      // Crear nuevo token (opcional, o puedes reutilizar el mismo)
      const expiresAt = session.expiresAt;
      const payload = {
        username: session.username,
        userId: session.userData.userId,
        exp: Math.floor(expiresAt.getTime() / 1000),
      };

      const newToken = jwt.sign(payload, this.jwtSecret);
      const tokenHash = this._hashToken(newToken);

      // Actualizar hash en sesión
      session.tokenHash = tokenHash;
      await session.save();

      logger.info(`Sesión renovada para ${session.username}`);

      return {
        success: true,
        token: newToken,
        expiresAt: expiresAt.toISOString(),
      };
    } catch (error) {
      logger.error(`Error renovando token: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cerrar sesión
   * @param {string} token - Token a invalidar
   */
  async logout(token) {
    try {
      const tokenHash = this._hashToken(token);
      const result = await UserSession.deleteOne({ tokenHash });

      if (result.deletedCount > 0) {
        logger.info("Sesión cerrada correctamente");
        return { success: true };
      }

      return { success: false, error: "Sesión no encontrada" };
    } catch (error) {
      logger.error(`Error en logout: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Limpiar sesiones expiradas (ejecutar periódicamente)
   */
  async cleanExpiredSessions() {
    try {
      const result = await UserSession.deleteMany({
        expiresAt: { $lt: new Date() },
      });

      if (result.deletedCount > 0) {
        logger.info(`${result.deletedCount} sesiones expiradas eliminadas`);
      }

      return result.deletedCount;
    } catch (error) {
      logger.error(`Error limpiando sesiones: ${error.message}`);
      return 0;
    }
  }

  /**
   * Obtener información del usuario desde Cellvi
   * @private
   */
  async _getUserInfo(cellviToken) {
    try {
      // Intentar obtener perfil de usuario
      // Ajusta el endpoint según tu API de Cellvi
      const response = await axios.get(
        `${this.cellviApiUrl}/api/user/profile`,
        {
          headers: { Authorization: `Bearer ${cellviToken}` },
          timeout: 10000,
        },
      );

      return {
        userId: response.data.id || response.data.user_id,
        email: response.data.email,
        roles: response.data.roles || [],
      };
    } catch (error) {
      // Si falla, retornar info básica
      logger.warn(`No se pudo obtener perfil de usuario: ${error.message}`);
      return {
        userId: null,
        email: null,
        roles: [],
      };
    }
  }

  /**
   * Obtener vehículos del usuario desde Cellvi
   * @private
   */
  async _getVehiculosUsuario(cellviToken) {
    try {
      const response = await axios.get(
        `${this.cellviApiUrl}/cellvi/movil/v3/vehiculos/usuario`,
        {
          headers: { Authorization: `Bearer ${cellviToken}` },
          timeout: 15000,
        },
      );

      return response.data || [];
    } catch (error) {
      logger.error(`Error obteniendo vehículos: ${error.message}`);
      return [];
    }
  }

  /**
   * Crear hash del token para almacenamiento
   * @private
   */
  _hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
  }
}

module.exports = new AuthService();
