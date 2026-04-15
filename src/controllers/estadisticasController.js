const Empresa = require("../models/Empresa");
const Vehiculo = require("../models/Vehiculo");
const Tercero = require("../models/Tercero");
const ContratoFuec = require("../models/ContratoFUEC");
const Preoperacional = require("../models/Preoperacional");
const Documento = require("../models/Documento");
const logger = require("../config/logger");

// Helper de roles inline
function getRoles(req) {
  const rolesNormalized = (req.user?.roles || []).map((r) =>
    r.replace("ROLE_", "").toUpperCase(),
  );
  return {
    isAdmin: rolesNormalized.includes("ADMIN"),
    isClienteAdmin: rolesNormalized.includes("CLIENTE_ADMIN"),
  };
}

/**
 * GET /api/estadisticas/empresa/:empresaId
 * Resumen completo de la empresa para dashboard
 */
exports.getEmpresaResumen = async (req, res) => {
  try {
    const { empresaId } = req.params;
    const { isAdmin } = getRoles(req);

    // Seguridad: CLIENTE_ADMIN solo puede ver su propia empresa
    if (!isAdmin && req.user?.empresaId?.toString() !== empresaId) {
      return res.status(403).json({
        success: false,
        message: "No tiene permisos para ver estadísticas de esta empresa",
      });
    }

    // Verificar empresa existe
    const empresa = await Empresa.findOne({
      _id: empresaId,
      deletedAt: null,
    }).lean();
    if (!empresa) {
      return res
        .status(404)
        .json({ success: false, message: "Empresa no encontrada" });
    }

    // === VEHÍCULOS ===
    const totalVehiculos = await Vehiculo.countDocuments({
      empresaAfiliadora: empresaId,
      deletedAt: null,
    });
    const vehiculosPorEstado = await Vehiculo.aggregate([
      { $match: { empresaAfiliadora: empresa._id, deletedAt: null } },
      { $group: { _id: "$estado", total: { $sum: 1 } } },
    ]);

    // === TERCEROS ===
    const totalTerceros = await Tercero.countDocuments({
      empresa: empresaId,
      deletedAt: null,
    });
    const tercerosPorRol = await Tercero.aggregate([
      { $match: { empresa: empresa._id, deletedAt: null } },
      { $unwind: "$roles" },
      { $group: { _id: "$roles", total: { $sum: 1 } } },
    ]);

    // Conteos específicos de interés
    const totalConductores = await Tercero.countDocuments({
      empresa: empresaId,
      roles: "CONDUCTOR",
      deletedAt: null,
    });
    const totalPropietarios = await Tercero.countDocuments({
      empresa: empresaId,
      roles: "PROPIETARIO",
      deletedAt: null,
    });
    const totalAdministrativos = await Tercero.countDocuments({
      empresa: empresaId,
      roles: "ADMINISTRATIVO",
      deletedAt: null,
    });

    // === CONTRATOS FUEC ===
    // Buscar IDs de vehículos de esta empresa primero
    const vehiculosIds = await Vehiculo.find({
      empresaAfiliadora: empresaId,
      deletedAt: null,
    })
      .select("_id")
      .lean()
      .then((v) => v.map((x) => x._id));

    const totalContratos = await ContratoFuec.countDocuments({
      vehiculo: { $in: vehiculosIds },
      deletedAt: null,
    });
    const contratosPorEstado = await ContratoFuec.aggregate([
      { $match: { vehiculo: { $in: vehiculosIds }, deletedAt: null } },
      { $group: { _id: "$estado", total: { $sum: 1 } } },
    ]);

    // Contratos activos y vigentes (vigenciaFin >= hoy)
    const hoy = new Date();
    const contratosVigentes = await ContratoFuec.countDocuments({
      vehiculo: { $in: vehiculosIds },
      deletedAt: null,
      estado: "ACTIVO",
      vigenciaFin: { $gte: hoy },
    });

    // === PREOPERACIONALES ===
    const totalPreoperacionales = await Preoperacional.countDocuments({
      vehiculo: { $in: vehiculosIds },
      deletedAt: null,
    });
    const preoperacionalesAprobados = await Preoperacional.countDocuments({
      vehiculo: { $in: vehiculosIds },
      deletedAt: null,
      estadoGeneral: "APROBADO",
    });
    const preoperacionalesConNovedad = await Preoperacional.countDocuments({
      vehiculo: { $in: vehiculosIds },
      deletedAt: null,
      estadoGeneral: "CON_NOVEDAD",
    });
    const preoperacionalesRechazados = await Preoperacional.countDocuments({
      vehiculo: { $in: vehiculosIds },
      deletedAt: null,
      estadoGeneral: "RECHAZADO",
    });

    // Preoperacionales del mes actual
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const preoperacionalesMesActual = await Preoperacional.countDocuments({
      vehiculo: { $in: vehiculosIds },
      deletedAt: null,
      fecha: { $gte: inicioMes },
    });

    // === DOCUMENTOS ===
    const terceroIds = await Tercero.find({
      empresa: empresaId,
      deletedAt: null,
    })
      .select("_id")
      .lean()
      .then((t) => t.map((x) => x._id));

    const docOrConditions = [
      { entidadModelo: "Vehiculo", entidadId: { $in: vehiculosIds } },
      { entidadModelo: "Tercero", entidadId: { $in: terceroIds } },
      { entidadModelo: "Empresa", entidadId: empresa._id },
      { "entidadesAsociadas.entidadId": { $in: vehiculosIds } },
    ];

    // Calcular en tiempo real por fechaVencimiento
    const hoyDoc = new Date();
    hoyDoc.setHours(0, 0, 0, 0);
    const en30Dias = new Date(hoyDoc);
    en30Dias.setDate(en30Dias.getDate() + 30);

    const docBase = { deletedAt: null, $or: docOrConditions };

    const [totalDocumentos, documentosVencidos, documentosPorVencer] =
      await Promise.all([
        Documento.countDocuments(docBase),
        Documento.countDocuments({
          ...docBase,
          fechaVencimiento: { $lt: hoyDoc },
          estado: { $nin: ["HISTORICO", "RECHAZADO"] },
        }),
        Documento.countDocuments({
          ...docBase,
          fechaVencimiento: { $gte: hoyDoc, $lte: en30Dias },
          estado: { $nin: ["HISTORICO", "RECHAZADO"] },
        }),
      ]);

    res.json({
      success: true,
      data: {
        empresa: {
          _id: empresa._id,
          razonSocial: empresa.razonSocial,
          nit: empresa.nit,
        },
        vehiculos: {
          total: totalVehiculos,
          porEstado: Object.fromEntries(
            vehiculosPorEstado.map((e) => [e._id || "SIN_ESTADO", e.total]),
          ),
        },
        terceros: {
          total: totalTerceros,
          conductores: totalConductores,
          propietarios: totalPropietarios,
          administrativos: totalAdministrativos,
          porRol: Object.fromEntries(
            tercerosPorRol.map((e) => [e._id || "SIN_ROL", e.total]),
          ),
        },
        contratos: {
          total: totalContratos,
          vigentes: contratosVigentes,
          porEstado: Object.fromEntries(
            contratosPorEstado.map((e) => [e._id || "SIN_ESTADO", e.total]),
          ),
        },
        preoperacionales: {
          total: totalPreoperacionales,
          aprobados: preoperacionalesAprobados,
          conNovedad: preoperacionalesConNovedad,
          rechazados: preoperacionalesRechazados,
          esteMes: preoperacionalesMesActual,
        },
        documentos: {
          total: totalDocumentos,
          vencidos: documentosVencidos,
          porVencer: documentosPorVencer,
          vigentes: totalDocumentos - documentosVencidos - documentosPorVencer,
        },
        generadoEn: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error(`Error generando estadísticas: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/estadisticas/global
 * Resumen global del sistema (Solo ADMIN)
 */
exports.getGlobal = async (req, res) => {
  try {
    const [
      totalEmpresas,
      totalVehiculos,
      totalTerceros,
      totalContratos,
      totalPreoperacionales,
      totalDocumentos,
    ] = await Promise.all([
      Empresa.countDocuments({ deletedAt: null }),
      Vehiculo.countDocuments({ deletedAt: null }),
      Tercero.countDocuments({ deletedAt: null }),
      ContratoFuec.countDocuments({ deletedAt: null }),
      Preoperacional.countDocuments({ deletedAt: null }),
      Documento.countDocuments({ deletedAt: null }),
    ]);

    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    const [preoperacionalesMes, contratosPorEstado, vehiculosPorEstado] =
      await Promise.all([
        Preoperacional.countDocuments({
          deletedAt: null,
          fecha: { $gte: inicioMes },
        }),
        ContratoFuec.aggregate([
          { $match: { deletedAt: null } },
          { $group: { _id: "$estado", total: { $sum: 1 } } },
        ]),
        Vehiculo.aggregate([
          { $match: { deletedAt: null } },
          { $group: { _id: "$estado", total: { $sum: 1 } } },
        ]),
      ]);

    res.json({
      success: true,
      data: {
        empresas: totalEmpresas,
        vehiculos: {
          total: totalVehiculos,
          porEstado: Object.fromEntries(
            vehiculosPorEstado.map((e) => [e._id || "SIN_ESTADO", e.total]),
          ),
        },
        terceros: totalTerceros,
        contratos: {
          total: totalContratos,
          porEstado: Object.fromEntries(
            contratosPorEstado.map((e) => [e._id || "SIN_ESTADO", e.total]),
          ),
        },
        preoperacionales: {
          total: totalPreoperacionales,
          esteMes: preoperacionalesMes,
        },
        documentos: totalDocumentos,
        generadoEn: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error(`Error generando estadísticas globales: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/estadisticas/documentos
 * Resumen de documentos: total, vigentes, por vencer, vencidos
 * ADMIN: todos los documentos del sistema
 * CLIENTE_ADMIN: solo documentos de su empresa
 */
exports.getDocumentosResumen = async (req, res) => {
  try {
    const { isAdmin, isClienteAdmin } = getRoles(req);

    let baseQuery = { deletedAt: null };

    // CLIENTE_ADMIN: filtrar solo documentos de su empresa
    if (!isAdmin && isClienteAdmin) {
      const empresaId = req.user?.empresaId;
      if (!empresaId) {
        return res.json({
          success: true,
          data: { total: 0, vigentes: 0, porVencer: 0, vencidos: 0 },
        });
      }

      const vehiculosIds = await Vehiculo.find({
        empresaAfiliadora: empresaId,
        deletedAt: null,
      })
        .select("_id")
        .lean()
        .then((v) => v.map((x) => x._id));

      const terceroIds = await Tercero.find({
        empresa: empresaId,
        deletedAt: null,
      })
        .select("_id")
        .lean()
        .then((t) => t.map((x) => x._id));

      baseQuery.$or = [
        { entidadModelo: "Vehiculo", entidadId: { $in: vehiculosIds } },
        { entidadModelo: "Tercero", entidadId: { $in: terceroIds } },
        { entidadModelo: "Empresa", entidadId: empresaId },
        { "entidadesAsociadas.entidadId": { $in: vehiculosIds } },
      ];
    }

    // Calcular en tiempo real por fechaVencimiento (no depender del campo estado
    // que puede estar desactualizado entre ejecuciones del cron)
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const en30Dias = new Date(hoy);
    en30Dias.setDate(en30Dias.getDate() + 30);

    const [total, vencidos, porVencer, vigentes, sinVencimiento] =
      await Promise.all([
        Documento.countDocuments(baseQuery),
        Documento.countDocuments({
          ...baseQuery,
          fechaVencimiento: { $lt: hoy },
          estado: { $nin: ["HISTORICO", "RECHAZADO"] },
        }),
        Documento.countDocuments({
          ...baseQuery,
          fechaVencimiento: { $gte: hoy, $lte: en30Dias },
          estado: { $nin: ["HISTORICO", "RECHAZADO"] },
        }),
        Documento.countDocuments({
          ...baseQuery,
          fechaVencimiento: { $gt: en30Dias },
          estado: { $nin: ["HISTORICO", "RECHAZADO"] },
        }),
        Documento.countDocuments({
          ...baseQuery,
          fechaVencimiento: null,
        }),
      ]);

    res.json({
      success: true,
      data: { total, vigentes, porVencer, vencidos, sinVencimiento },
    });
  } catch (error) {
    logger.error(`Error generando estadísticas de documentos: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};
