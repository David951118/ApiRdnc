const Empresa = require("../models/Empresa");
const Vehiculo = require("../models/Vehiculo");
const Tercero = require("../models/Tercero");
const ContratoFuec = require("../models/ContratoFUEC");
const Preoperacional = require("../models/Preoperacional");
const Ruta = require("../models/Ruta");
const { deleteDocumentosWithS3, cleanEntidadesAsociadas } = require("../helpers/cascadeDelete");
const empresaAcceso = require("../services/empresaAccesoService");
const logger = require("../config/logger");

/**
 * Aplica un cambio de estado a la empresa con sus efectos:
 *  - registra historial y datos de la desactivación,
 *  - invalida el cache de empresas bloqueadas,
 *  - si deja de estar ACTIVA, cierra las sesiones de sus usuarios y de los
 *    vehículos afiliados (pierden acceso de inmediato; el login queda bloqueado).
 * @returns {Promise<{ sesionesCerradas: number, vehiculos: number, terceros: number }>}
 */
async function aplicarCambioEstado(empresa, nuevoEstado, motivo, req) {
  const usuario = req.user?.userId || req.user?.username || null;
  const bloquea = nuevoEstado !== "ACTIVA";

  empresa.estado = nuevoEstado;
  if (bloquea) {
    empresa.desactivacion = { fecha: new Date(), usuario, motivo: motivo || "" };
  } else {
    empresa.desactivacion = undefined;
  }
  await empresa.save();
  empresaAcceso.invalidarCache();

  let afectados = { sesionesCerradas: 0, ...(await empresaAcceso.alcanceEmpresa(empresa._id)) };
  if (bloquea) {
    afectados = await empresaAcceso.cerrarSesionesEmpresa(empresa._id);
  }

  empresa.historialEstado.push({
    estado: nuevoEstado,
    fecha: new Date(),
    usuario,
    motivo: motivo || "",
    sesionesCerradas: afectados.sesionesCerradas,
  });
  await empresa.save();

  logger.info(
    `Empresa ${empresa.razonSocial} (${empresa._id}) → ${nuevoEstado} por ${usuario}` +
      (bloquea ? `: ${afectados.sesionesCerradas} sesión(es) cerrada(s)` : ""),
  );
  return afectados;
}

// Crear Empresa (Solo ADMIN)
exports.create = async (req, res) => {
  try {
    const empresa = new Empresa(req.body);
    await empresa.save();
    res.status(201).json({ success: true, data: empresa });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Ya existe una empresa con ese NIT.",
      });
    }
    logger.error(`Error creando empresa: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

// Listar empresas (Solo ADMIN — con soft-delete excluido por defecto)
exports.getAll = async (req, res) => {
  try {
    const { page = 1, limit = 50, search, includeDeleted = false } = req.query;
    const query = {};

    if (!includeDeleted || includeDeleted === "false") {
      query.deletedAt = null;
    }

    if (search) {
      query.$or = [
        { razonSocial: new RegExp(search, "i") },
        { nit: new RegExp(search, "i") },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const empresas = await Empresa.find(query)
      .limit(parseInt(limit))
      .skip(skip)
      .sort({ razonSocial: 1 })
      .lean();

    const total = await Empresa.countDocuments(query);

    // Tamaño de la flota y usuarios por empresa (alcance de una desactivación)
    const ids = empresas.map((e) => e._id);
    if (ids.length > 0) {
      const [vehAgg, terAgg] = await Promise.all([
        Vehiculo.aggregate([
          { $match: { empresaAfiliadora: { $in: ids }, deletedAt: null } },
          { $group: { _id: "$empresaAfiliadora", total: { $sum: 1 } } },
        ]),
        Tercero.aggregate([
          { $match: { empresa: { $in: ids }, deletedAt: null } },
          { $group: { _id: "$empresa", total: { $sum: 1 } } },
        ]),
      ]);
      const vehPor = Object.fromEntries(vehAgg.map((x) => [String(x._id), x.total]));
      const terPor = Object.fromEntries(terAgg.map((x) => [String(x._id), x.total]));
      for (const e of empresas) {
        e.totalVehiculos = vehPor[String(e._id)] || 0;
        e.totalTerceros = terPor[String(e._id)] || 0;
      }
    }

    res.json({
      success: true,
      data: empresas,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error(`Error listando empresas: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Listar empresas resumido (Solo ADMIN — _id, nit, razonSocial)
exports.getList = async (req, res) => {
  try {
    const { page = 1, limit = 50, search, includeDeleted = false } = req.query;
    const query = {};

    if (!includeDeleted || includeDeleted === "false") {
      query.deletedAt = null;
    }

    if (search) {
      query.$or = [
        { razonSocial: new RegExp(search, "i") },
        { nit: new RegExp(search, "i") },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const empresas = await Empresa.find(query)
      .select("nit razonSocial")
      .limit(parseInt(limit))
      .skip(skip)
      .sort({ razonSocial: 1 })
      .lean();

    const total = await Empresa.countDocuments(query);

    res.json({
      success: true,
      data: empresas,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error(`Error listando empresas (resumen): ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Obtener una empresa por ID
exports.getOne = async (req, res) => {
  try {
    const empresa = await Empresa.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!empresa)
      return res
        .status(404)
        .json({ success: false, message: "Empresa no encontrada" });
    res.json({ success: true, data: empresa });
  } catch (error) {
    logger.error(`Error obteniendo empresa: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Actualizar empresa
exports.update = async (req, res) => {
  try {
    const empresa = await Empresa.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!empresa)
      return res
        .status(404)
        .json({ success: false, message: "Empresa no encontrada" });

    const { branding, estado, ...rest } = req.body;
    Object.assign(empresa, rest);
    if (branding) {
      empresa.branding = { ...empresa.branding?.toObject?.() ?? empresa.branding, ...branding };
    }
    await empresa.save();
    // Un cambio de estado por el PUT genérico aplica los mismos efectos que
    // PATCH /:id/estado (cierre de sesiones, historial).
    let afectados;
    if (estado && estado !== empresa.estado) {
      afectados = await aplicarCambioEstado(empresa, estado, req.body.motivo, req);
    }
    res.json({ success: true, data: empresa, afectados });
  } catch (error) {
    logger.error(`Error actualizando empresa: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

// Activar / desactivar empresa (Solo ADMIN)
// PATCH /empresas/:id/estado  { estado: ACTIVA|INACTIVA|SUSPENDIDA, motivo? }
exports.cambiarEstado = async (req, res) => {
  try {
    const { estado, motivo } = req.body;
    const empresa = await Empresa.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!empresa)
      return res
        .status(404)
        .json({ success: false, message: "Empresa no encontrada" });
    if (empresa.estado === estado) {
      return res.status(400).json({
        success: false,
        message: `La empresa ya está ${estado}`,
      });
    }

    const afectados = await aplicarCambioEstado(empresa, estado, motivo, req);
    const message =
      estado === "ACTIVA"
        ? `Empresa activada: sus ${afectados.vehiculos} vehículo(s) y ${afectados.terceros} usuario(s) recuperan el acceso`
        : `Empresa ${estado === "SUSPENDIDA" ? "suspendida" : "desactivada"}: ${afectados.vehiculos} vehículo(s) y ${afectados.terceros} usuario(s) sin acceso; ${afectados.sesionesCerradas} sesión(es) cerrada(s)`;

    res.json({ success: true, message, data: empresa, afectados });
  } catch (error) {
    logger.error(`Error cambiando estado de empresa: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

// Alcance de una desactivación (Solo ADMIN)
exports.alcance = async (req, res) => {
  try {
    const empresa = await Empresa.findOne({ _id: req.params.id, deletedAt: null })
      .select("estado razonSocial")
      .lean();
    if (!empresa)
      return res
        .status(404)
        .json({ success: false, message: "Empresa no encontrada" });
    const alcance = await empresaAcceso.alcanceEmpresa(empresa._id);
    res.json({ success: true, data: { ...alcance, estado: empresa.estado } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Soft Delete
exports.softDelete = async (req, res) => {
  try {
    const empresa = await Empresa.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!empresa)
      return res
        .status(404)
        .json({ success: false, message: "Empresa no encontrada" });

    await empresa.softDelete(req.user?.userId || null);
    res.json({
      success: true,
      message: "Empresa eliminada temporalmente",
      data: empresa,
    });
  } catch (error) {
    logger.error(`Error soft-delete empresa: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Restaurar
exports.restore = async (req, res) => {
  try {
    const empresa = await Empresa.findById(req.params.id);
    if (!empresa)
      return res
        .status(404)
        .json({ success: false, message: "Empresa no encontrada" });
    if (!empresa.deletedAt)
      return res
        .status(400)
        .json({ success: false, message: "La empresa no está eliminada" });

    await empresa.restore();
    res.json({ success: true, message: "Empresa restaurada", data: empresa });
  } catch (error) {
    logger.error(`Error restaurando empresa: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Hard Delete con cascada completa (Solo ADMIN)
exports.hardDelete = async (req, res) => {
  try {
    const empresaId = req.params.id;
    const empresa = await Empresa.findById(empresaId);
    if (!empresa)
      return res
        .status(404)
        .json({ success: false, message: "Empresa no encontrada" });

    // Obtener IDs de vehículos y terceros de la empresa
    const vehiculos = await Vehiculo.find({ empresaAfiliadora: empresaId }).select("_id").lean();
    const terceros = await Tercero.find({ empresa: empresaId }).select("_id").lean();
    const vehiculoIds = vehiculos.map((v) => v._id);
    const terceroIds = terceros.map((t) => t._id);

    // Validar: bloquear si tiene contratos activos
    if (vehiculoIds.length > 0) {
      const contratosActivos = await ContratoFuec.countDocuments({
        vehiculo: { $in: vehiculoIds },
        estado: { $in: ["ACTIVO", "GENERADO"] },
        deletedAt: null,
      });
      if (contratosActivos > 0) {
        return res.status(409).json({
          success: false,
          message: `No se puede eliminar: la empresa tiene ${contratosActivos} contrato(s) activo(s). Anúlelos primero.`,
        });
      }
    }

    // 1. Soft delete + anular contratos de los vehículos de la empresa
    if (vehiculoIds.length > 0) {
      await ContratoFuec.updateMany(
        { vehiculo: { $in: vehiculoIds }, deletedAt: null },
        { $set: { deletedAt: new Date(), deletedBy: req.user?.userId || null, estado: "ANULADO" } },
      );
    }

    // 2. Hard delete preoperacionales de los vehículos
    if (vehiculoIds.length > 0) {
      await Preoperacional.deleteMany({ vehiculo: { $in: vehiculoIds } });
    }

    // 3. Hard delete documentos de vehículos + S3
    if (vehiculoIds.length > 0) {
      await deleteDocumentosWithS3({
        entidadId: { $in: vehiculoIds },
        entidadModelo: "Vehiculo",
      });
    }

    // 4. Hard delete documentos de terceros + S3
    if (terceroIds.length > 0) {
      await deleteDocumentosWithS3({
        entidadId: { $in: terceroIds },
        entidadModelo: "Tercero",
      });
    }

    // 5. Hard delete documentos de la empresa directamente + S3
    await deleteDocumentosWithS3({
      entidadId: empresaId,
      entidadModelo: "Empresa",
    });

    // 6. Limpiar entidadesAsociadas que referencien vehículos/terceros de esta empresa
    if (vehiculoIds.length > 0) {
      await cleanEntidadesAsociadas(vehiculoIds, "Vehiculo");
    }
    if (terceroIds.length > 0) {
      await cleanEntidadesAsociadas(terceroIds, "Tercero");
    }
    await cleanEntidadesAsociadas([empresa._id], "Empresa");

    // 7. Hard delete rutas de la empresa
    await Ruta.deleteMany({ empresa: empresaId });

    // 8. Hard delete vehículos de la empresa
    if (vehiculoIds.length > 0) {
      await Vehiculo.deleteMany({ _id: { $in: vehiculoIds } });
    }

    // 9. Hard delete terceros de la empresa
    if (terceroIds.length > 0) {
      await Tercero.deleteMany({ _id: { $in: terceroIds } });
    }

    // 10. Hard delete la empresa
    await empresa.deleteOne();

    logger.info(`Hard delete empresa ${empresa.razonSocial} (${empresaId}): ${vehiculoIds.length} vehículos, ${terceroIds.length} terceros eliminados en cascada`);
    res.json({
      success: true,
      message: "Empresa y todos los datos asociados eliminados permanentemente",
      details: {
        vehiculos: vehiculoIds.length,
        terceros: terceroIds.length,
      },
    });
  } catch (error) {
    logger.error(`Error hard-delete empresa: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};
