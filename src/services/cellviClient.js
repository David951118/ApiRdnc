const axios = require("axios");
const axiosRetry = require("axios-retry").default;
const config = require("../config/env");
const logger = require("../config/logger");

class CellviClient {
  constructor() {
    this.baseURL = config.cellvi.apiUrl;
    this.username = config.cellvi.username;
    this.password = config.cellvi.password;
    this.token = null;
    this.tokenExpiry = null;

    // Crear instancia de axios con configuración base
    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      timeout: 45000, // Aumentado de 30s a 45s para producción
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Configurar retries para errores de red (socket hang up, timeout, etc)
    axiosRetry(this.axiosInstance, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        return (
          axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          error.code === "ECONNABORTED" ||
          error.code === "ECONNRESET" || // Socket hang up
          (error.response && error.response.status >= 500)
        );
      },
      onRetry: (retryCount, error, requestConfig) => {
        logger.warn(
          `Reintentando Cellvi API (${retryCount}/3): ${error.message}`,
        );
      },
    });

    // Interceptor para agregar token automáticamente
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        // Si el token está vencido o no existe, renovar
        if (!this.token || this.isTokenExpired()) {
          await this.authenticate();
        }

        // Agregar token al header (excepto para /auth/login)
        if (config.url !== "/api/login_check" && this.token) {
          config.headers.Authorization = `Bearer ${this.token}`;
        }

        return config;
      },
      (error) => {
        return Promise.reject(error);
      },
    );

    // Interceptor para manejar respuestas 401 (token expirado)
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // Si recibimos 401 y no hemos reintentado, autenticar de nuevo
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            await this.authenticate();
            originalRequest.headers.Authorization = `Bearer ${this.token}`;
            return this.axiosInstance(originalRequest);
          } catch (authError) {
            return Promise.reject(authError);
          }
        }

        return Promise.reject(error);
      },
    );
  }

  /**
   * Autenticarse en Cellvi API
   */
  async authenticate() {
    try {
      logger.info("Autenticando en Cellvi");

      const response = await axios.post(
        `${this.baseURL}/api/login_check`,
        {
          username: this.username,
          password: this.password,
        },
        {
          timeout: 30000,
          headers: { "Content-Type": "application/json" },
        },
      );

      // Extraer token de la respuesta
      this.token =
        response.data.token || response.data.access_token || response.data.jwt;

      if (!this.token) {
        throw new Error("No se recibió token en la respuesta");
      }

      // Calcular expiración (asumiendo 1 hora)
      const expiresIn = response.data.expires_in || 3600;
      this.tokenExpiry = Date.now() + expiresIn * 1000;

      logger.info("✅ Autenticado exitosamente en Cellvi");
      logger.debug(`Token expira en ${expiresIn} segundos`);

      return true;
    } catch (error) {
      logger.error(`❌ Error autenticando en Cellvi: ${error.message}`);

      if (error.response) {
        logger.error(`Status: ${error.response.status}`);
        logger.error(`Data: ${JSON.stringify(error.response.data)}`);
      }

      this.token = null;
      this.tokenExpiry = null;
      throw error;
    }
  }

  /**
   * Verificar si el token está expirado
   */
  isTokenExpired() {
    if (!this.tokenExpiry) return true;

    // Considerar expirado 5 minutos antes para renovar proactivamente
    const bufferTime = 5 * 60 * 1000;
    return Date.now() >= this.tokenExpiry - bufferTime;
  }

  /**
   * Forzar renovación de token
   */
  async refreshToken() {
    this.token = null;
    this.tokenExpiry = null;
    return await this.authenticate();
  }

  /**
   * Obtener todos los vehículos del usuario
   * GET /cellvi/movil/v3/vehiculos/usuario
   * Retorna: [{ id: 4237, placa: "GTY872" }, ...]
   */
  async getVehiculosUsuario() {
    try {
      logger.debug("Consultando vehículos del usuario");

      const response = await this.axiosInstance.get(
        "/cellvi/movil/v3/vehiculos/usuario",
      );

      let vehiculos = response.data;

      if (!Array.isArray(vehiculos)) {
        // En algunos casos la API devuelve { data: [...] } o estructura diferente
        if (vehiculos && Array.isArray(vehiculos.data)) {
          vehiculos = vehiculos.data;
        } else {
          logger.warn(
            `Respuesta inesperada de vehículos (no es array): ${typeof vehiculos}`,
          );
          return [];
        }
      }
      logger.debug(`✅ ${vehiculos.length} vehículos obtenidos`);

      return vehiculos;
    } catch (error) {
      logger.error(`Error consultando vehículos: ${error.message}`);
      return [];
    }
  }

  /**
   * Obtener última posición de un vehículo por ID
   * GET /cellvi/vehiculo/v2/{vehiculoId}/get_last_position
   * Retorna: { id, evento, latitud, longitud, velocidad, momento, variables, sentido }
   */
  async getPosicionVehiculo(vehiculoId) {
    try {
      logger.debug(`Consultando posición del vehículo ID: ${vehiculoId}`);

      const response = await this.axiosInstance.get(
        `/cellvi/vehiculo/v2/${vehiculoId}/get_last_position`,
      );

      const posicion = response.data;

      // Normalizar respuesta
      return {
        id: posicion.id,
        lat: posicion.latitud,
        lng: posicion.longitud,
        velocidad: posicion.velocidad,
        momento: posicion.momento,
        sentido: posicion.sentido,
        evento: posicion.evento,
        variables: posicion.variables,
      };
    } catch (error) {
      logger.error(
        `Error consultando posición vehículo ${vehiculoId}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Obtener vehículo por placa
   * Busca en la lista de vehículos del usuario
   */
  async getVehiculoByPlaca(placa) {
    try {
      logger.debug(`Buscando vehículo con placa: ${placa}`);

      const vehiculos = await this.getVehiculosUsuario();
      const vehiculo = vehiculos.find(
        (v) => v.placa.toUpperCase() === placa.toUpperCase(),
      );

      if (vehiculo) {
        logger.debug(`✅ Vehículo encontrado: ID ${vehiculo.id}`);
        return vehiculo;
      }

      logger.warn(`⚠️  No se encontró vehículo con placa ${placa}`);
      return null;
    } catch (error) {
      logger.error(`Error buscando vehículo por placa: ${error.message}`);
      return null;
    }
  }

  /**
   * Obtener información detallada de vehículo por placa
   * GET /cellvi/vehiculo/filter/{placa}/list
   * Retorna: [{ vehiculo_id, vehiculo_placa, vehiculo_monitoreado, propietario_nombre, ... }]
   */
  async getVehiculoByPlacaDetallado(placa) {
    try {
      logger.debug(`Consultando vehículo detallado: ${placa}`);

      const response = await this.axiosInstance.get(
        `/cellvi/vehiculo/filter/${placa.toUpperCase()}/list`,
      );

      const vehiculos = response.data || [];

      if (vehiculos.length === 0) {
        logger.debug(`⚠️  Vehículo ${placa} no existe en la plataforma`);
        return null;
      }

      // Tomar el primer resultado (debería ser único por placa)
      const vehiculo = vehiculos[0];

      logger.debug(
        `✅ Vehículo ${placa}: ${
          vehiculo.vehiculo_monitoreado ? "MONITOREADO" : "NO MONITOREADO"
        }`,
      );

      return {
        id: vehiculo.vehiculo_id,
        placa: vehiculo.vehiculo_placa,
        monitoreado: vehiculo.vehiculo_monitoreado,
        esMaquina: vehiculo.vehiculo_es_maquina,
        propietario: {
          id: vehiculo.propietario_id,
          nombre: vehiculo.propietario_nombre,
          apellido: vehiculo.propietario_apellido,
        },
      };
    } catch (error) {
      if (error.response?.status === 404) {
        logger.debug(`Vehículo ${placa} no encontrado (404)`);
        return null;
      }

      logger.error(
        `Error consultando vehículo detallado ${placa}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Obtener última posición de un vehículo por placa
   * Combina getVehiculoByPlaca + getPosicionVehiculo
   */
  async getPosicionByPlaca(placa) {
    try {
      const vehiculo = await this.getVehiculoByPlaca(placa);

      if (!vehiculo) {
        return null;
      }

      const posicion = await this.getPosicionVehiculo(vehiculo.id);

      if (posicion) {
        // Agregar placa a la respuesta
        posicion.placa = vehiculo.placa;
      }

      return posicion;
    } catch (error) {
      logger.error(
        `Error consultando posición por placa ${placa}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Health check de la API Cellvi
   */
  async healthCheck() {
    try {
      // Intentar obtener vehículos como health check
      const vehiculos = await this.getVehiculosUsuario();
      return vehiculos !== null;
    } catch (error) {
      logger.error(`Cellvi API health check falló: ${error.message}`);
      return false;
    }
  }
}

// Exportar instancia singleton
module.exports = new CellviClient();
