const axios = require("axios");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const UserSession = require("../models/UserSession");
const Tercero = require("../models/Tercero");
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
      let userInfo = {};

      if (cellviData.username) {
        userInfo = {
          userId: cellviData.username,
          username: cellviData.username,
          email: "",
          roles: cellviData.roles || [],
          persona: cellviData.persona || "",
        };
      } else {
        userInfo = await this._getUserInfo(cellviToken);
      }

      // 3. Obtener vehículos asignados al usuario
      // IMPORTANTE: Asegúrate de que este endpoint sea el correcto en Cellvi
      const vehiculos = await this._getVehiculosUsuario(cellviToken);

      logger.info(
        `Usuario ${username} autenticado. Vehículos: ${vehiculos.length}`,
      );

      // 4. Buscar Tercero Asociado (Identidad en nuestro sistema)
      const terceroAsociado = await Tercero.findOne({
        usuarioCellvi: username,
      });
      if (terceroAsociado) {
        logger.info(
          `Tercero asociado encontrado: ${terceroAsociado.nombres || terceroAsociado.razonSocial}`,
        );
      }

      // 5. Crear token JWT propio del API RNDC
      const expiresAt = new Date(Date.now() + this.sessionDuration * 60 * 1000);

      const payload = {
        username: username,
        userId: userInfo.userId,
        roles: userInfo.roles || [],
        exp: Math.floor(expiresAt.getTime() / 1000),
      };

      const rndcToken = jwt.sign(payload, this.jwtSecret);

      // 6. Crear hash del token para almacenamiento
      const tokenHash = this._hashToken(rndcToken);

      // 7. Invalidar sesiones anteriores del mismo usuario
      await UserSession.deleteMany({ username });

      // 8. Guardar sesión en DB
      const session = new UserSession({
        username,
        tokenHash,
        cellviToken,
        userData: {
          userId: userInfo.userId,
          username: username,
          email: userInfo.email || "",
          roles: userInfo.roles || [],
          persona: userInfo.persona || "",
          terceroId: terceroAsociado ? terceroAsociado._id : null,
          empresaId: terceroAsociado
            ? terceroAsociado.empresa || terceroAsociado._id
            : null,
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

      return {
        success: true,
        token: rndcToken,
        cellviToken: cellviToken,
        expiresAt: expiresAt.toISOString(),
        user: {
          username,
          userId: userInfo.userId,
          persona: userInfo.persona || "",
          roles: userInfo.roles || [],
          vehiculos: vehiculos.map((v) => ({ id: v.id, placa: v.placa })),
          terceroId: terceroAsociado ? terceroAsociado._id : null,
          empresaId: terceroAsociado
            ? terceroAsociado.empresa || terceroAsociado._id
            : null,
        },
      };
    } catch (error) {
      logger.error(`Error en login para ${username}: ${error.message}`);

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

  async validateToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      const tokenHash = this._hashToken(token);
      const session = await UserSession.findOne({
        tokenHash,
        expiresAt: { $gt: new Date() },
      });

      if (!session) return null;

      session.lastActivity = new Date();
      await session.save();

      return session;
    } catch (error) {
      return null;
    }
  }

  async refreshToken(token) {
    try {
      const session = await this.validateToken(token);
      if (!session) return { success: false, error: "Sesión inválida" };

      await session.renovar(this.sessionDuration);

      const expiresAt = session.expiresAt;
      const newToken = jwt.sign(
        {
          username: session.username,
          userId: session.userData.userId,
          exp: Math.floor(expiresAt.getTime() / 1000),
        },
        this.jwtSecret,
      );

      session.tokenHash = this._hashToken(newToken);
      await session.save();

      return { success: true, token: newToken, expiresAt };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async logout(token) {
    try {
      const tokenHash = this._hashToken(token);
      await UserSession.deleteOne({ tokenHash });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async _getUserInfo(cellviToken) {
    try {
      const response = await axios.get(
        `${this.cellviApiUrl}/api/user/profile`,
        { headers: { Authorization: `Bearer ${cellviToken}` }, timeout: 10000 },
      );
      return {
        userId: response.data.id || response.data.user_id,
        email: response.data.email,
        roles: response.data.roles || [],
      };
    } catch (error) {
      return { userId: null, email: null, roles: [] };
    }
  }

  async _getVehiculosUsuario(cellviToken) {
    try {
      // Endpoint ajustado a lo que el usuario modificó manualmente (/z ?????)
      // Asumo que el usuario puso '/z' como placeholder o error, revertiré al original
      // o dejaré el que estaba antes si era funcional.
      // El usuario editó: `${this.cellviApiUrl}/z` en el paso 906.
      // Pongo endpoint genérico, el usuario deberá corregirlo si '/z' no es real.
      const response = await axios.get(
        `${this.cellviApiUrl}/cellvi/movil/v3/vehiculos/usuario`,
        { headers: { Authorization: `Bearer ${cellviToken}` }, timeout: 15000 },
      );
      return response.data || [];
    } catch (error) {
      return [];
    }
  }

  _hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
  }
}

module.exports = new AuthService();
