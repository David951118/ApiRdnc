const Documento = require("../models/Documento");
const Vehiculo = require("../models/Vehiculo");
const Tercero = require("../models/Tercero");
const logger = require("../config/logger");

/**
 * Helper: Obtener scope de documentos según rol del usuario
 */
async function getDocumentScope(req) {
  const roles = req.user?.roles || [];
  const isAdmin = roles.some(
    (r) =>
      r.toUpperCase().includes("ADMIN") &&
      !r.toUpperCase().includes("CLIENT"),
  );
  const isSuperAdmin = roles.some((r) => r.toUpperCase().includes("SUPER"));
  const isClienteAdmin = roles.some(
    (r) => r.toUpperCase().includes("CLIENT") && r.toUpperCase().includes("ADMIN"),
  );

  // ADMIN o SUPER_ADMIN: Ven todo
  if (isAdmin || isSuperAdmin) {
    return {};
  }

  // CLIENTE_ADMIN: Solo documentos de su empresa
  if (isClienteAdmin) {
    const empresaId = req.user?.empresaId;
    if (!empresaId) {
      return { _id: null }; // No tiene empresa, no ve nada
    }

    // Buscar todos los vehículos y terceros de esta empresa
    const vehiculos = await Vehiculo.find({ empresaAfiliadora: empresaId })
      .select("_id")
      .lean();
    const terceros = await Tercero.find({ empresa: empresaId })
      .select("_id")
      .lean();

    const vehiculoIds = vehiculos.map((v) => v._id);
    const terceroIds = terceros.map((t) => t._id);

    return {
      $or: [
        { entidadModelo: "Vehiculo", entidadId: { $in: vehiculoIds } },
        { entidadModelo: "Tercero", entidadId: { $in: terceroIds } },
      ],
    };
  }

  // CLIENTE normal: Solo sus propios documentos (tercero asociado a su usuario)
  const terceroId = req.user?.terceroId;
  if (!terceroId) {
    return { _id: null }; // No tiene tercero asociado, no ve nada
  }

  return {
    entidadModelo: "Tercero",
    entidadId: terceroId,
  };
}

/**
 * Crear documento
 */
exports.upload = async (req, res) => {
  try {
    const { entidadId, entidadModelo } = req.body;

    // 1. Validar que la entidad existe
    let entidad;
    if (entidadModelo === "Vehiculo") {
      entidad = await Vehiculo.findById(entidadId);
      if (!entidad) {
        return res.status(404).json({
          success: false,
          message: "Vehículo no encontrado",
        });
      }

      // Verificar acceso al vehículo
      const roles = req.user?.roles || [];
      const isAdmin = roles.some(
        (r) =>
          r.toUpperCase().includes("ADMIN") &&
          !r.toUpperCase().includes("CLIENT"),
      );

      if (!isAdmin) {
        const vehiculosPermitidos = req.session?.vehiculosPermitidos || [];
        const tieneAcceso = vehiculosPermitidos.some(
          (v) => v.placa === entidad.placa || v.vehiculoId == entidadId,
        );

        if (!tieneAcceso) {
          return res.status(403).json({
            success: false,
            message: "No tiene permisos para crear documentos de este vehículo",
          });
        }
      }
    } else if (entidadModelo === "Tercero") {
      entidad = await Tercero.findById(entidadId);
      if (!entidad) {
        return res.status(404).json({
          success: false,
          message: "Tercero no encontrado",
        });
      }

      // Verificar acceso al tercero
      const roles = req.user?.roles || [];
      const isAdmin = roles.some(
        (r) =>
          r.toUpperCase().includes("ADMIN") &&
          !r.toUpperCase().includes("CLIENT"),
      );
      const isClienteAdmin = roles.some(
        (r) => r.toUpperCase().includes("CLIENT") && r.toUpperCase().includes("ADMIN"),
      );

      if (!isAdmin && !isClienteAdmin) {
        // Cliente normal solo puede crear documentos de sí mismo
        if (req.user?.terceroId?.toString() !== entidadId.toString()) {
          return res.status(403).json({
            success: false,
            message: "No tiene permisos para crear documentos de este tercero",
          });
        }
      } else if (isClienteAdmin) {
        // Cliente admin solo puede crear documentos de terceros de su empresa
        if (entidad.empresa?.toString() !== req.user?.empresaId?.toString()) {
          return res.status(403).json({
            success: false,
            message: "No tiene permisos para crear documentos de terceros fuera de su empresa",
          });
        }
      }
    }

    // 2. Crear documento
    const documento = new Documento(req.body);
    documento.subidoPor = req.user?.userId || null;

    // El estado se calcula automáticamente en el pre-save hook según fechaVencimiento
    await documento.save();

    res.status(201).json({
      success: true,
      data: documento,
    });
  } catch (error) {
    logger.error(`Error creando documento: ${error.message}`);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Listar documentos con filtros según rol
 */
exports.getAll = async (req, res) => {
  try {
    const {
      entidadId,
      entidadModelo,
      tipoDocumento,
      estado,
      page = 1,
      limit = 50,
      includeDeleted = false,
    } = req.query;

    // Construir query base
    const query = {};

    // Aplicar scope según rol
    const scope = await getDocumentScope(req);
    if (Object.keys(scope).length > 0) {
      Object.assign(query, scope);
    }

    // Filtros opcionales
    if (entidadId) {
      query.entidadId = entidadId;
    }
    if (entidadModelo) {
      query.entidadModelo = entidadModelo;
    }
    if (tipoDocumento) {
      query.tipoDocumento = tipoDocumento;
    }
    if (estado) {
      query.estado = estado;
    }

    // Soft delete: por defecto excluir eliminados
    if (!includeDeleted || includeDeleted === "false") {
      query.deletedAt = null;
    }

    // Ejecutar consulta con paginación
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const documentos = await Documento.find(query)
      .sort({ fechaVencimiento: 1 })
      .limit(parseInt(limit))
      .skip(skip)
      .populate("entidadId", "placa nombres apellidos razonSocial")
      .populate("subidoPor", "username")
      .lean();

    const total = await Documento.countDocuments(query);

    res.json({
      success: true,
      data: documentos,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error(`Error listando documentos: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Listar documentos de una entidad específica
 */
exports.getByEntity = async (req, res) => {
  try {
    const { entidadId } = req.params;
    const { includeDeleted = false } = req.query;

    const query = { entidadId, deletedAt: includeDeleted === "true" ? { $ne: null } : null };

    // Verificar acceso según rol
    const scope = await getDocumentScope(req);
    if (Object.keys(scope).length > 0) {
      // Verificar que la entidad está en el scope
      const tieneAcceso = await Documento.findOne({ ...query, ...scope });
      if (!tieneAcceso && scope._id === null) {
        return res.status(403).json({
          success: false,
          message: "No tiene permisos para ver documentos de esta entidad",
        });
      }
    }

    const documentos = await Documento.find(query)
      .sort({ fechaVencimiento: 1 })
      .populate("subidoPor", "username")
      .lean();

    res.json({
      success: true,
      data: documentos,
    });
  } catch (error) {
    logger.error(`Error obteniendo documentos por entidad: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Obtener un documento por ID
 */
exports.getOne = async (req, res) => {
  try {
    const { id } = req.params;
    const documento = await Documento.findOne({
      _id: id,
      deletedAt: null,
    })
      .populate("entidadId")
      .populate("subidoPor", "username")
      .lean();

    if (!documento) {
      return res.status(404).json({
        success: false,
        message: "Documento no encontrado",
      });
    }

    // Verificar acceso según rol
    const scope = await getDocumentScope(req);
    if (Object.keys(scope).length > 0) {
      const tieneAcceso = await Documento.findOne({
        _id: id,
        ...scope,
      });
      if (!tieneAcceso && scope._id === null) {
        return res.status(403).json({
          success: false,
          message: "No tiene permisos para ver este documento",
        });
      }
    }

    res.json({
      success: true,
      data: documento,
    });
  } catch (error) {
    logger.error(`Error obteniendo documento: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Actualizar documento
 */
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const documento = await Documento.findOne({ _id: id, deletedAt: null });

    if (!documento) {
      return res.status(404).json({
        success: false,
        message: "Documento no encontrado",
      });
    }

    // Verificar acceso
    const scope = await getDocumentScope(req);
    if (Object.keys(scope).length > 0) {
      const tieneAcceso = await Documento.findOne({ _id: id, ...scope });
      if (!tieneAcceso && scope._id === null) {
        return res.status(403).json({
          success: false,
          message: "No tiene permisos para editar este documento",
        });
      }
    }

    // Actualizar (el estado se recalcula automáticamente si cambia fechaVencimiento)
    Object.assign(documento, req.body);
    await documento.save();

    res.json({
      success: true,
      data: documento,
    });
  } catch (error) {
    logger.error(`Error actualizando documento: ${error.message}`);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Soft Delete (eliminación temporal)
 */
exports.softDelete = async (req, res) => {
  try {
    const { id } = req.params;
    const documento = await Documento.findOne({ _id: id, deletedAt: null });

    if (!documento) {
      return res.status(404).json({
        success: false,
        message: "Documento no encontrado",
      });
    }

    // Verificar acceso
    const scope = await getDocumentScope(req);
    if (Object.keys(scope).length > 0) {
      const tieneAcceso = await Documento.findOne({ _id: id, ...scope });
      if (!tieneAcceso && scope._id === null) {
        return res.status(403).json({
          success: false,
          message: "No tiene permisos para eliminar este documento",
        });
      }
    }

    await documento.softDelete(req.user?.userId || null);

    res.json({
      success: true,
      message: "Documento eliminado temporalmente",
      data: documento,
    });
  } catch (error) {
    logger.error(`Error eliminando documento (soft): ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Hard Delete (eliminación definitiva) - Solo ADMIN
 */
exports.hardDelete = async (req, res) => {
  try {
    const roles = req.user?.roles || [];
    const isAdmin = roles.some(
      (r) =>
        r.toUpperCase().includes("ADMIN") &&
        !r.toUpperCase().includes("CLIENT"),
    );
    const isSuperAdmin = roles.some((r) => r.toUpperCase().includes("SUPER"));

    if (!isAdmin && !isSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: "Solo administradores pueden eliminar documentos permanentemente",
      });
    }

    const { id } = req.params;
    const documento = await Documento.findByIdAndDelete(id);

    if (!documento) {
      return res.status(404).json({
        success: false,
        message: "Documento no encontrado",
      });
    }

    res.json({
      success: true,
      message: "Documento eliminado permanentemente",
    });
  } catch (error) {
    logger.error(`Error eliminando documento (hard): ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Restaurar documento eliminado (soft delete)
 */
exports.restore = async (req, res) => {
  try {
    const { id } = req.params;
    const documento = await Documento.findById(id);

    if (!documento) {
      return res.status(404).json({
        success: false,
        message: "Documento no encontrado",
      });
    }

    if (!documento.deletedAt) {
      return res.status(400).json({
        success: false,
        message: "El documento no está eliminado",
      });
    }

    // Verificar acceso
    const scope = await getDocumentScope(req);
    if (Object.keys(scope).length > 0) {
      const tieneAcceso = await Documento.findOne({ _id: id, ...scope });
      if (!tieneAcceso && scope._id === null) {
        return res.status(403).json({
          success: false,
          message: "No tiene permisos para restaurar este documento",
        });
      }
    }

    await documento.restore();

    res.json({
      success: true,
      message: "Documento restaurado",
      data: documento,
    });
  } catch (error) {
    logger.error(`Error restaurando documento: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
