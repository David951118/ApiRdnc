const Empresa = require("../models/Empresa");
const Vehiculo = require("../models/Vehiculo");
const Tercero = require("../models/Tercero");
const ContratoFuec = require("../models/ContratoFUEC");
const Preoperacional = require("../models/Preoperacional");
const Ruta = require("../models/Ruta");
const { deleteDocumentosWithS3, cleanEntidadesAsociadas } = require("../helpers/cascadeDelete");
const logger = require("../config/logger");

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

    const { branding, ...rest } = req.body;
    Object.assign(empresa, rest);
    if (branding) {
      empresa.branding = { ...empresa.branding?.toObject?.() ?? empresa.branding, ...branding };
    }
    await empresa.save();
    res.json({ success: true, data: empresa });
  } catch (error) {
    logger.error(`Error actualizando empresa: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
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
