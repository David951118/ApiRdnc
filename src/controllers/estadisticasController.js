const Empresa = require("../models/Empresa");
const Vehiculo = require("../models/Vehiculo");
const Tercero = require("../models/Tercero");
const ContratoFuec = require("../models/ContratoFUEC");
const Preoperacional = require("../models/Preoperacional");
const Documento = require("../models/Documento");
const logger = require("../config/logger");

/**
 * GET /api/estadisticas/empresa/:empresaId
 * Resumen completo de la empresa para dashboard
 */
exports.getEmpresaResumen = async (req, res) => {
  try {
    const { empresaId } = req.params;
    const rolesUpper = (req.user?.roles || []).map((r) => r.toUpperCase());
    const isAdmin = rolesUpper.includes("ADMIN");
    const isClienteAdmin = rolesUpper.includes("CLIENTE_ADMIN");

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

    const totalDocumentos = await Documento.countDocuments({
      deletedAt: null,
      $or: [
        { entidadModelo: "Vehiculo", entidadId: { $in: vehiculosIds } },
        { entidadModelo: "Tercero", entidadId: { $in: terceroIds } },
      ],
    });
    const documentosVencidos = await Documento.countDocuments({
      deletedAt: null,
      estado: "VENCIDO",
      $or: [
        { entidadModelo: "Vehiculo", entidadId: { $in: vehiculosIds } },
        { entidadModelo: "Tercero", entidadId: { $in: terceroIds } },
      ],
    });
    const documentosPorVencer = await Documento.countDocuments({
      deletedAt: null,
      estado: "POR_VENCER",
      $or: [
        { entidadModelo: "Vehiculo", entidadId: { $in: vehiculosIds } },
        { entidadModelo: "Tercero", entidadId: { $in: terceroIds } },
      ],
    });

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
