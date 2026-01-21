const RegistroRNMM = require("../models/RegistroRNMM");
const RNDCClient = require("./rndcClient");
const logger = require("../config/logger");

/**
 * Servicio para gestionar Registro de Novedades de Monitoreo de Manifiesto (RNMM)
 * Códigos de novedad según manual RNDC:
 * 1: Vehículo no apareció en ventana de tolerancia
 * 2: Placa no registrada en EMF
 * 3: Vehículo suspendido/desactivado
 * 4: Unidad remota fallando
 * 5: Sin relación con empresa de transporte (NIT)
 */
class RNMMService {
  /**
   * Crear registro de novedad
   */
  async crearNovedad(datos) {
    const {
      manifiestoId,
      puntoControlId,
      ingresoidManifiesto,
      numPlaca,
      codigoPuntoControl,
      codigoNovedad,
      fechaCita,
      motivoDetallado,
    } = datos;

    try {
      // Calcular fecha límite de reporte (36h después de cita)
      const fechaLimiteReporte = new Date(
        fechaCita.getTime() + 36 * 60 * 60 * 1000,
      );

      // Obtener descripción de la novedad
      const descripcionNovedad = this._getDescripcionNovedad(codigoNovedad);

      const rnmm = new RegistroRNMM({
        manifiestoId,
        puntoControlId,
        ingresoidManifiesto,
        numPlaca,
        codigoPuntoControl,
        codigoNovedad,
        descripcionNovedad,
        fechaCita,
        fechaLimiteReporte,
        motivoDetallado,
        estado: "pendiente",
      });

      await rnmm.save();

      logger.info(
        `RNMM creado: ${ingresoidManifiesto} - Punto ${codigoPuntoControl} - Código ${codigoNovedad}`,
      );

      return rnmm;
    } catch (error) {
      logger.error(`Error creando RNMM: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reportar novedad al RNDC
   */
  async reportarNovedad(rnmmId) {
    try {
      const rnmm = await RegistroRNMM.findById(rnmmId);

      if (!rnmm) {
        throw new Error("RNMM no encontrado");
      }

      // Verificar que esté en ventana de envío (24-36h)
      if (!rnmm.estaEnVentanaEnvio()) {
        const ahora = new Date();
        const limite24h = new Date(
          rnmm.fechaCita.getTime() + 24 * 60 * 60 * 1000,
        );

        if (ahora < limite24h) {
          logger.warn(
            `RNMM ${rnmmId} aún no está en ventana de envío (debe esperar 24h)`,
          );
          return { success: false, error: "Fuera de ventana de envío" };
        }
      }

      // Marcar como enviando
      rnmm.estado = "enviando";
      rnmm.intentos++;
      rnmm.ultimoIntento = new Date();
      await rnmm.save();

      // Preparar datos para RNDC
      const username = process.env.RNDC_USERNAME;
      const password = process.env.RNDC_PASSWORD;
      const nitGPS = process.env.RNDC_NIT_GPS;

      const rndcClient = new RNDCClient(username, password);

      const datos = {
        numidgps: nitGPS,
        ingresoidmanifiesto: rnmm.ingresoidManifiesto,
        numplaca: rnmm.numPlaca,
        codpuntocontrol: rnmm.codigoPuntoControl,
        codnovedad: rnmm.codigoNovedad,
      };

      logger.info(
        `Reportando RNMM: ${rnmm.ingresoidManifiesto} - Código ${rnmm.codigoNovedad}`,
      );

      // Enviar al RNDC (Proceso 46)
      const response = await rndcClient.registrarRNMM(datos);

      if (response.success) {
        rnmm.estado = "reportado";
        rnmm.radicadoRNDC = response.radicado;
        await rnmm.save();

        logger.info(
          `RNMM reportado exitosamente - Radicado: ${response.radicado}`,
        );

        return { success: true, radicado: response.radicado };
      } else {
        rnmm.estado = "error";
        rnmm.errorMensaje = response.error;
        await rnmm.save();

        logger.error(`Error reportando RNMM: ${response.error}`);

        return { success: false, error: response.error };
      }
    } catch (error) {
      logger.error(`Excepción reportando RNMM: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtener descripción legible de código de novedad
   * @private
   */
  _getDescripcionNovedad(codigo) {
    const descripciones = {
      1: "Vehículo no apareció en ventana de tolerancia",
      2: "Placa no registrada en EMF",
      3: "Vehículo suspendido o desactivado",
      4: "Unidad remota funcionando mal",
      5: "Sin relación con empresa de transporte (NIT)",
    };

    return descripciones[codigo] || "Novedad desconocida";
  }

  /**
   * Obtener estadísticas de RNMM
   */
  async getEstadisticas(fechaInicio, fechaFin) {
    try {
      const filtro = {};

      if (fechaInicio && fechaFin) {
        filtro.createdAt = {
          $gte: new Date(fechaInicio),
          $lte: new Date(fechaFin),
        };
      }

      const total = await RegistroRNMM.countDocuments(filtro);
      const pendientes = await RegistroRNMM.countDocuments({
        ...filtro,
        estado: "pendiente",
      });
      const reportados = await RegistroRNMM.countDocuments({
        ...filtro,
        estado: "reportado",
      });
      const errores = await RegistroRNMM.countDocuments({
        ...filtro,
        estado: "error",
      });

      // Por código de novedad
      const porCodigo = await RegistroRNMM.aggregate([
        { $match: filtro },
        {
          $group: {
            _id: "$codigoNovedad",
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      return {
        total,
        pendientes,
        reportados,
        errores,
        porCodigo,
      };
    } catch (error) {
      logger.error(`Error obteniendo estadísticas RNMM: ${error.message}`);
      return null;
    }
  }
}

module.exports = new RNMMService();
