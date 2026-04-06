const Tercero = require("../models/Tercero");
const ContratoFuec = require("../models/ContratoFUEC");
const { deleteDocumentosWithS3, cleanEntidadesAsociadas } = require("../helpers/cascadeDelete");
const s3Service = require("../services/s3Service");
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
 * Generar presigned URL para subir foto de perfil
 * POST /api/terceros/foto/presigned-url
 * Body: { fileName, mimeType }
 */
exports.getFotoPresignedUrl = async (req, res) => {
  try {
    const { fileName, mimeType } = req.body;

    if (!fileName || !mimeType) {
      return res.status(400).json({
        success: false,
        message: "fileName y mimeType son obligatorios",
      });
    }

    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(mimeType)) {
      return res.status(400).json({
        success: false,
        message: "Solo se permiten imágenes (jpeg, png, webp)",
      });
    }

    const data = await s3Service.generatePresignedUrl({
      fileName,
      mimeType,
      folder: "fotos-perfil",
    });

    res.json({ success: true, data });
  } catch (error) {
    logger.error(`Error generando presigned URL para foto: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Actualizar foto de perfil de un tercero
 * PUT /api/terceros/:id/foto
 * Body: { url, key }
 * Elimina la foto anterior de S3 si existe.
 */
exports.updateFoto = async (req, res) => {
  try {
    const { id } = req.params;
    const { url, key } = req.body;

    if (!url || !key) {
      return res.status(400).json({
        success: false,
        message: "url y key son obligatorios",
      });
    }

    const tercero = await Tercero.findOne({ _id: id, deletedAt: null });
    if (!tercero) {
      return res
        .status(404)
        .json({ success: false, message: "Tercero no encontrado" });
    }

    // Eliminar foto anterior de S3 si existe
    if (tercero.foto?.key) {
      try {
        await s3Service.deleteObject(tercero.foto.key);
      } catch (err) {
        logger.warn(`No se pudo eliminar foto anterior de S3: ${err.message}`);
      }
    }

    tercero.foto = { url, key };
    await tercero.save();

    res.json({ success: true, data: tercero });
  } catch (error) {
    logger.error(`Error actualizando foto: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { isAdmin, isClienteAdmin } = getRoles(req);
    const newRoles = req.body.roles || [];

    if (isClienteAdmin && !isAdmin) {
      const forbiddenRoles = ["ADMINISTRATIVO", "ADMIN", "CLIENTE_ADMIN"];
      const hasForbidden = newRoles.some((r) => forbiddenRoles.includes(r));
      if (hasForbidden) {
        return res.status(403).json({
          success: false,
          message:
            "Como Cliente Admin no puede crear roles Administrativos o de Admin.",
        });
      }
    }

    const tercero = new Tercero(req.body);

    if (isClienteAdmin && !isAdmin && req.user.empresaId) {
      tercero.empresa = req.user.empresaId;
    }

    await tercero.save();
    res.status(201).json({ success: true, data: tercero });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Ya existe un tercero con esa identificación en esta empresa.",
      });
    }
    logger.error(`Error creando tercero: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search,
      rol,
      includeDeleted = false,
    } = req.query;
    const { isAdmin, isClienteAdmin } = getRoles(req);
    const query = {};

    if (!includeDeleted || includeDeleted === "false") {
      query.deletedAt = null;
    }

    if (!isAdmin) {
      if (isClienteAdmin && req.user.empresaId) {
        query.empresa = req.user.empresaId;
      } else {
        // CLIENTE normal: solo se ve a sí mismo
        query._id = req.user.terceroId || undefined;
        if (!req.user.terceroId) {
          query.usuarioCellvi = req.user.username;
        }
      }
    }

    if (search) {
      query.$or = [
        { nombres: new RegExp(search, "i") },
        { apellidos: new RegExp(search, "i") },
        { identificacion: new RegExp(search, "i") },
        { razonSocial: new RegExp(search, "i") },
      ];
    }
    if (rol) {
      query.roles = rol;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const terceros = await Tercero.find(query)
      .limit(parseInt(limit))
      .skip(skip)
      .lean();

    const total = await Tercero.countDocuments(query);

    res.json({
      success: true,
      data: terceros,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error(`Error listando terceros: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Listado resumido para selectores (Solo ADMIN / CLIENTE_ADMIN)
exports.getList = async (req, res) => {
  try {
    const { page = 1, limit = 50, search, includeDeleted = false } = req.query;
    const { isAdmin, isClienteAdmin } = getRoles(req);
    const query = {};

    if (!includeDeleted || includeDeleted === "false") {
      query.deletedAt = null;
    }

    if (!isAdmin && isClienteAdmin && req.user.empresaId) {
      query.empresa = req.user.empresaId;
    }

    if (search) {
      query.$or = [
        { nombres: new RegExp(search, "i") },
        { apellidos: new RegExp(search, "i") },
        { identificacion: new RegExp(search, "i") },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const terceros = await Tercero.find(query)
      .select("nombres apellidos identificacion")
      .limit(parseInt(limit))
      .skip(skip)
      .sort({ nombres: 1 })
      .lean();

    const total = await Tercero.countDocuments(query);

    res.json({
      success: true,
      data: terceros,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error(`Error listando terceros (resumen): ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    const { id } = req.params;
    let tercero;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      tercero = await Tercero.findOne({ _id: id, deletedAt: null });
    } else {
      tercero = await Tercero.findOne({ identificacion: id, deletedAt: null });
    }

    if (!tercero)
      return res
        .status(404)
        .json({ success: false, message: "Tercero no encontrado" });
    res.json({ success: true, data: tercero });
  } catch (error) {
    logger.error(`Error obteniendo tercero: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getByEmpresa = async (req, res) => {
  try {
    const { empresaId } = req.params;
    const { isAdmin } = getRoles(req);

    if (!isAdmin && req.user.empresaId?.toString() !== empresaId) {
      return res.status(403).json({
        success: false,
        message: "No tiene permisos para ver datos de esta empresa.",
      });
    }

    const terceros = await Tercero.find({
      empresa: empresaId,
      deletedAt: null,
    });
    res.json({ success: true, data: terceros });
  } catch (error) {
    logger.error(`Error getByEmpresa: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getByUsuarioCellvi = async (req, res) => {
  try {
    const { usuarioCellvi } = req.params;
    const { isAdmin } = getRoles(req);

    if (!isAdmin && req.user.username !== usuarioCellvi) {
      return res.status(403).json({
        success: false,
        message: "No tiene permiso para consultar este usuario.",
      });
    }

    const tercero = await Tercero.findOne({ usuarioCellvi, deletedAt: null });
    if (!tercero)
      return res
        .status(404)
        .json({ success: false, message: "Usuario no encontrado" });

    res.json({ success: true, data: tercero });
  } catch (error) {
    logger.error(`Error getByUsuarioCellvi: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { isAdmin, isClienteAdmin } = getRoles(req);

    const tercero = await Tercero.findOne({ _id: id, deletedAt: null });
    if (!tercero)
      return res
        .status(404)
        .json({ success: false, message: "Tercero no encontrado" });

    if (isClienteAdmin && !isAdmin) {
      const protectedRoles = ["ADMIN", "ADMINISTRATIVO", "CLIENTE_ADMIN"];
      const isProtected = tercero.roles.some((r) => protectedRoles.includes(r));
      if (isProtected) {
        return res.status(403).json({
          success: false,
          message: "No tiene permisos para editar este perfil de usuario.",
        });
      }
    }

    Object.assign(tercero, req.body);
    await tercero.save();
    res.json({ success: true, data: tercero });
  } catch (error) {
    logger.error(`Error actualizando tercero: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

// Soft Delete
exports.softDelete = async (req, res) => {
  try {
    const { id } = req.params;
    const { isAdmin, isClienteAdmin } = getRoles(req);

    const tercero = await Tercero.findOne({ _id: id, deletedAt: null });
    if (!tercero)
      return res
        .status(404)
        .json({ success: false, message: "Tercero no encontrado" });

    if (isClienteAdmin && !isAdmin) {
      const protectedRoles = ["ADMIN", "ADMINISTRATIVO", "CLIENTE_ADMIN"];
      const isProtected = tercero.roles.some((r) => protectedRoles.includes(r));
      if (isProtected) {
        return res.status(403).json({
          success: false,
          message: "No tiene permisos para eliminar este perfil de usuario.",
        });
      }
    }

    await tercero.softDelete(req.user?.userId || null);
    res.json({
      success: true,
      message: "Tercero eliminado temporalmente",
      data: tercero,
    });
  } catch (error) {
    logger.error(`Error soft-delete tercero: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Restaurar
exports.restore = async (req, res) => {
  try {
    const tercero = await Tercero.findById(req.params.id);
    if (!tercero)
      return res
        .status(404)
        .json({ success: false, message: "Tercero no encontrado" });
    if (!tercero.deletedAt)
      return res
        .status(400)
        .json({ success: false, message: "El tercero no está eliminado" });

    await tercero.restore();
    res.json({ success: true, message: "Tercero restaurado", data: tercero });
  } catch (error) {
    logger.error(`Error restaurando tercero: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Hard Delete con cascada (Solo ADMIN)
exports.hardDelete = async (req, res) => {
  try {
    const terceroId = req.params.id;
    const tercero = await Tercero.findById(terceroId);
    if (!tercero)
      return res
        .status(404)
        .json({ success: false, message: "Tercero no encontrado" });

    // Validar: bloquear si es contratante o conductor en contratos activos
    const contratosActivos = await ContratoFuec.countDocuments({
      $or: [
        { contratante: terceroId },
        { conductorPrincipal: terceroId },
        { conductoresAuxiliares: terceroId },
      ],
      estado: { $in: ["ACTIVO", "GENERADO"] },
      deletedAt: null,
    });
    if (contratosActivos > 0) {
      return res.status(409).json({
        success: false,
        message: `No se puede eliminar: el tercero tiene ${contratosActivos} contrato(s) activo(s). Anúlelos primero.`,
      });
    }

    // 0. Eliminar foto de perfil de S3
    if (tercero.foto?.key) {
      try {
        await s3Service.deleteObject(tercero.foto.key);
      } catch (err) {
        logger.warn(`No se pudo eliminar foto de perfil de S3: ${err.message}`);
      }
    }

    // 1. Hard delete documentos directos + limpiar S3
    await deleteDocumentosWithS3({
      entidadId: terceroId,
      entidadModelo: "Tercero",
    });

    // 2. Limpiar de entidadesAsociadas en otros documentos
    await cleanEntidadesAsociadas([tercero._id], "Tercero");

    // 3. NO borrar preoperacionales — pertenecen al vehículo

    // 4. Hard delete el tercero
    await tercero.deleteOne();

    logger.info(`Hard delete tercero ${tercero.nombres} ${tercero.apellidos} (${terceroId}) con cascada`);
    res.json({ success: true, message: "Tercero y documentos asociados eliminados permanentemente" });
  } catch (error) {
    logger.error(`Error hard-delete tercero: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};
