const axios = require("axios");
const config = require("../config/env");
const logger = require("../config/logger");

/**
 * Cliente para operaciones administrativas en Cellvi
 * Requiere usuario con permisos de administrador
 */
class CellviAdminClient {
  constructor() {
    this.baseURL = config.cellvi.apiUrl;
    this.username = config.cellvi.adminUsername;
    this.password = config.cellvi.adminPassword;
    this.token = null;
    this.tokenExpiry = null;

    // ID del usuario RNDC en Cellvi (siempre 3502)
    this.RNDC_USER_ID = 3502;

    // Crear instancia de axios
    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Interceptor para agregar token
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        if (!this.token || this.isTokenExpired()) {
          await this.authenticate();
        }

        if (config.url !== "/api/login_check" && this.token) {
          config.headers.Authorization = `Bearer ${this.token}`;
        }

        return config;
      },
      (error) => Promise.reject(error)
    );

    // Interceptor para manejar 401
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

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
      }
    );
  }

  /**
   * Autenticarse con usuario admin
   */
  async authenticate() {
    try {
      logger.info("Autenticando en Cellvi (Admin)");

      const response = await axios.post(
        `${this.baseURL}/api/login_check`,
        {
          username: this.username,
          password: this.password,
        },
        {
          timeout: 30000,
          headers: { "Content-Type": "application/json" },
        }
      );

      this.token =
        response.data.token || response.data.access_token || response.data.jwt;

      if (!this.token) {
        throw new Error("No se recibió token en la respuesta");
      }

      const expiresIn = response.data.expires_in || 3600;
      this.tokenExpiry = Date.now() + expiresIn * 1000;

      logger.info("✅ Autenticado exitosamente en Cellvi (Admin)");

      return true;
    } catch (error) {
      logger.error(`❌ Error autenticando admin: ${error.message}`);
      this.token = null;
      this.tokenExpiry = null;
      throw error;
    }
  }

  isTokenExpired() {
    if (!this.tokenExpiry) return true;
    const bufferTime = 5 * 60 * 1000;
    return Date.now() >= this.tokenExpiry - bufferTime;
  }

  /**
   * Obtener vehículos asignados al usuario RNDC
   * Usa las credenciales del usuario RNDC para obtener su propia lista
   */
  async getVehiculosUsuarioRNDC() {
    try {
      logger.debug("Consultando vehículos del usuario RNDC (token usuario)");

      // Importar aquí para evitar problemas de orden de carga si hubiera
      const cellviClient = require("./cellviClient");
      const vehiculos = await cellviClient.getVehiculosUsuario();

      logger.info(`Usuario RNDC tiene ${vehiculos.length} vehículos asignados`);
      return vehiculos;
    } catch (error) {
      logger.error(`Error consultando vehículos RNDC: ${error.message}`);
      return [];
    }
  }

  /**
   * Actualizar vehículos del usuario RNDC
   * POST /seguridad/usuario/update_vehiculos
   * Body: { id: 3502, vehiculos: [4237, 4210, ...] }
   */
  async updateVehiculosUsuarioRNDC(vehiculoIds) {
    try {
      logger.info(
        `Actualizando vehículos del usuario RNDC: ${vehiculoIds.length} vehículos`
      );

      const response = await this.axiosInstance.post(
        "/seguridad/usuario/update_vehiculos",
        {
          id: this.RNDC_USER_ID,
          vehiculos: vehiculoIds,
        }
      );

      logger.info("✅ Vehículos actualizados exitosamente");

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      logger.error(`❌ Error actualizando vehículos: ${error.message}`);

      if (error.response) {
        logger.error(`Status: ${error.response.status}`);
        logger.error(`Data: ${JSON.stringify(error.response.data)}`);
        logger.error(`Headers: ${JSON.stringify(error.response.headers)}`);
      }

      return {
        success: false,
        error: error.message,
        details: error.response?.data,
      };
    }
  }

  /**
   * Asignar un vehículo al usuario RNDC
   * Agrega el vehículo a la lista existente
   */
  async asignarVehiculo(vehiculoId) {
    try {
      // Obtener lista actual
      const vehiculosActuales = await this.getVehiculosUsuarioRNDC();
      const idsActuales = vehiculosActuales.map((v) => v.id || v.vehiculo_id);

      // Verificar si ya está asignado
      if (idsActuales.includes(vehiculoId)) {
        logger.info(`Vehículo ${vehiculoId} ya está asignado al usuario RNDC`);
        return { success: true, alreadyAssigned: true };
      }

      // Agregar nuevo vehículo
      const nuevaLista = [...idsActuales, vehiculoId];

      // Actualizar
      const resultado = await this.updateVehiculosUsuarioRNDC(nuevaLista);

      if (resultado.success) {
        logger.info(`✅ Vehículo ${vehiculoId} asignado al usuario RNDC`);
      }

      return resultado;
    } catch (error) {
      logger.error(`Error asignando vehículo ${vehiculoId}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Desasignar un vehículo del usuario RNDC
   * Remueve el vehículo de la lista
   */
  async desasignarVehiculo(vehiculoId) {
    try {
      // Obtener lista actual
      const vehiculosActuales = await this.getVehiculosUsuarioRNDC();
      const idsActuales = vehiculosActuales.map((v) => v.id || v.vehiculo_id);

      // Verificar si está asignado
      if (!idsActuales.includes(vehiculoId)) {
        logger.info(`Vehículo ${vehiculoId} no está asignado al usuario RNDC`);
        return { success: true, notAssigned: true };
      }

      // Remover vehículo
      const nuevaLista = idsActuales.filter((id) => id !== vehiculoId);

      // Actualizar
      const resultado = await this.updateVehiculosUsuarioRNDC(nuevaLista);

      if (resultado.success) {
        logger.info(`✅ Vehículo ${vehiculoId} desasignado del usuario RNDC`);
      }

      return resultado;
    } catch (error) {
      logger.error(
        `Error desasignando vehículo ${vehiculoId}: ${error.message}`
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * Asignar múltiples vehículos al usuario RNDC
   */
  async asignarVehiculos(vehiculoIds) {
    try {
      // Obtener lista actual
      const vehiculosActuales = await this.getVehiculosUsuarioRNDC();
      const idsActuales = vehiculosActuales.map((v) => v.id || v.vehiculo_id);

      // Combinar listas (sin duplicados)
      const nuevaLista = [...new Set([...idsActuales, ...vehiculoIds])];

      // Actualizar
      const resultado = await this.updateVehiculosUsuarioRNDC(nuevaLista);

      if (resultado.success) {
        const nuevos = nuevaLista.length - idsActuales.length;
        logger.info(`✅ ${nuevos} vehículos nuevos asignados al usuario RNDC`);
      }

      return resultado;
    } catch (error) {
      logger.error(`Error asignando vehículos: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
  /**
   * Buscar un vehículo en toda la plataforma (Global search)
   * GET /cellvi/vehiculo/filter/{placa}/list
   */
  async buscarVehiculoGlobal(placa) {
    try {
      logger.debug(`Buscando vehículo globalmente: ${placa}`);

      const response = await this.axiosInstance.get(
        `/cellvi/vehiculo/filter/${placa.toUpperCase()}/list`
      );

      const vehiculos = response.data || [];

      if (vehiculos.length === 0) {
        return null; // No existe en la plataforma
      }

      // Retornar el primero encontrado
      return {
        id: vehiculos[0].vehiculo_id,
        placa: vehiculos[0].vehiculo_placa,
        monitoreado: vehiculos[0].vehiculo_monitoreado,
      };
    } catch (error) {
      // Si es 404 real, retornamos null
      if (error.response?.status === 404) return null;

      logger.error(`Error buscando vehículo global ${placa}: ${error.message}`);
      return null;
    }
  }
}

// Exportar instancia singleton
module.exports = new CellviAdminClient();
