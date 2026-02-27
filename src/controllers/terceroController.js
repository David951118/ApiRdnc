const Tercero = require("../models/Tercero");
const logger = require("../config/logger");

// Helper de roles inline
function getRoles(req) {
  const rolesUpper = (req.user?.roles || []).map((r) => r.toUpperCase());
  return {
    isAdmin: rolesUpper.includes("ADMIN"),
    isClienteAdmin: rolesUpper.includes("CLIENTE_ADMIN"),
  };
}

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

// Hard Delete (Solo ADMIN)
exports.hardDelete = async (req, res) => {
  try {
    const tercero = await Tercero.findByIdAndDelete(req.params.id);
    if (!tercero)
      return res
        .status(404)
        .json({ success: false, message: "Tercero no encontrado" });
    res.json({ success: true, message: "Tercero eliminado permanentemente" });
  } catch (error) {
    logger.error(`Error hard-delete tercero: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};
