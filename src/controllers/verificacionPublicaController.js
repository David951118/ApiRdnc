const Preoperacional = require("../models/Preoperacional");
const ContratoFuec = require("../models/ContratoFUEC");
const Empresa = require("../models/Empresa");
const logger = require("../config/logger");

/**
 * GET /api/verificar/preoperacional/:codigoPublico
 * Endpoint PÚBLICO - sin autenticación.
 * Retorna datos de verificación de una inspección preoperacional.
 * Incrementa contadorQR en cada consulta.
 */
exports.verificarPreoperacional = async (req, res) => {
  try {
    const { codigoPublico } = req.params;

    if (!codigoPublico || codigoPublico.length !== 32) {
      return res.status(400).json({
        success: false,
        message: "Código de verificación inválido",
      });
    }

    // Incrementar contador atómicamente y obtener el documento completo
    const preop = await Preoperacional.findOneAndUpdate(
      { codigoPublico, deletedAt: null },
      { $inc: { contadorQR: 1 } },
      { new: true },
    )
      .populate(
        "vehiculo",
        "placa numeroInterno marca linea modelo empresaAfiliadora",
      )
      .populate("conductor", "nombres apellidos identificacion")
      .lean();

    if (!preop) {
      return res.status(404).json({
        success: false,
        message: "Registro de preoperacional no encontrado",
      });
    }

    // Obtener empresa desde el vehículo
    let empresa = null;
    if (preop.vehiculo?.empresaAfiliadora) {
      empresa = await Empresa.findOne({
        _id: preop.vehiculo.empresaAfiliadora,
        deletedAt: null,
      })
        .select("razonSocial nit branding")
        .lean();
    }

    res.json({
      success: true,
      tipo: "PREOPERACIONAL",
      data: {
        fecha: preop.fecha,
        estadoGeneral: preop.estadoGeneral,
        kilometraje: preop.kilometraje,
        vehiculo: preop.vehiculo
          ? {
              placa: preop.vehiculo.placa,
              numeroInterno: preop.vehiculo.numeroInterno,
              marca: preop.vehiculo.marca,
              linea: preop.vehiculo.linea,
              modelo: preop.vehiculo.modelo,
            }
          : null,
        conductor: preop.conductor
          ? {
              nombres: preop.conductor.nombres,
              apellidos: preop.conductor.apellidos,
              identificacion: preop.conductor.identificacion,
            }
          : null,
        empresa: empresa
          ? {
              razonSocial: empresa.razonSocial,
              nit: empresa.nit,
              branding: empresa.branding,
            }
          : null,
        // Inspección completa por secciones (estado, observaciones, fotoUrl)
        seccionDelantera: preop.seccionDelantera,
        seccionMedia: preop.seccionMedia,
        seccionTrasera: preop.seccionTrasera,
        // Firma
        firmadoCheck: preop.firmadoCheck || false,
        firmaConductorUrl: preop.firmaConductorUrl || null,
        contadorQR: preop.contadorQR,
        creadoEn: preop.createdAt,
      },
    });
  } catch (error) {
    logger.error(`Error verificación pública preoperacional: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

/**
 * GET /api/verificar/contrato/:codigoPublico
 * Endpoint PÚBLICO - sin autenticación.
 * Retorna datos de verificación de un contrato FUEC.
 * Incrementa contadorQR en cada consulta.
 */
exports.verificarContrato = async (req, res) => {
  try {
    const { codigoPublico } = req.params;

    if (!codigoPublico || codigoPublico.length !== 32) {
      return res.status(400).json({
        success: false,
        message: "Código de verificación inválido",
      });
    }

    // Incrementar contador atómicamente y obtener el documento
    const contrato = await ContratoFuec.findOneAndUpdate(
      { qrCodeData: codigoPublico, deletedAt: null },
      { $inc: { contadorQR: 1 } },
      { new: true },
    )
      .populate(
        "vehiculo",
        "placa numeroInterno marca linea modelo capacidadPasajeros empresaAfiliadora",
      )
      .populate("conductorPrincipal", "nombres apellidos")
      .populate("contratante", "razonSocial nombres apellidos")
      .populate("ruta", "nombre origen destino recorrido")
      .lean();

    if (!contrato) {
      return res.status(404).json({
        success: false,
        message: "Contrato FUEC no encontrado",
      });
    }

    // Obtener empresa desde el vehículo
    let empresa = null;
    if (contrato.vehiculo?.empresaAfiliadora) {
      empresa = await Empresa.findOne({
        _id: contrato.vehiculo.empresaAfiliadora,
        deletedAt: null,
      })
        .select("razonSocial nit contacto representanteLegal branding")
        .lean();
    }

    res.json({
      success: true,
      tipo: "CONTRATO_FUEC",
      data: {
        consecutivo: contrato.consecutivo,
        numeroFUEC: contrato.numeroFUEC,
        anio: contrato.anio,
        estado: contrato.estado,
        objetoContrato: contrato.objetoContrato,
        origen: contrato.origen,
        destino: contrato.destino,
        vigenciaInicio: contrato.vigenciaInicio,
        vigenciaFin: contrato.vigenciaFin,
        vehiculo: contrato.vehiculo
          ? {
              placa: contrato.vehiculo.placa,
              numeroInterno: contrato.vehiculo.numeroInterno,
              marca: contrato.vehiculo.marca,
              linea: contrato.vehiculo.linea,
              modelo: contrato.vehiculo.modelo,
              capacidadPasajeros: contrato.vehiculo.capacidadPasajeros,
            }
          : null,
        conductorPrincipal: contrato.conductorPrincipal
          ? {
              nombres: contrato.conductorPrincipal.nombres,
              apellidos: contrato.conductorPrincipal.apellidos,
            }
          : null,
        contratante: contrato.contratante
          ? {
              razonSocial: contrato.contratante.razonSocial,
              nombres: contrato.contratante.nombres,
              apellidos: contrato.contratante.apellidos,
            }
          : null,
        ruta: contrato.ruta
          ? {
              nombre: contrato.ruta.nombre,
              origen: contrato.ruta.origen,
              destino: contrato.ruta.destino,
              recorrido: contrato.ruta.recorrido,
            }
          : null,
        empresa: empresa
          ? {
              razonSocial: empresa.razonSocial,
              nit: empresa.nit,
              contacto: empresa.contacto,
              representanteLegal: empresa.representanteLegal,
              branding: empresa.branding,
            }
          : null,
        datosSnapshot: contrato.datosSnapshot,
        contadorQR: contrato.contadorQR,
        creadoEn: contrato.createdAt,
      },
    });
  } catch (error) {
    logger.error(`Error verificación pública contrato: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};
