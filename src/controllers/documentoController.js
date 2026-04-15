const Documento = require("../models/Documento");
const Vehiculo = require("../models/Vehiculo");
const Tercero = require("../models/Tercero");
const Empresa = require("../models/Empresa");
const logger = require("../config/logger");
const s3Service = require("../services/s3Service");

/**
 * Helper: Recalcula el estado de un documento según su fechaVencimiento.
 * Se usa después de queries .lean() donde el pre-save hook no aplica.
 * No modifica documentos con estado HISTORICO o RECHAZADO.
 */
function recalcularEstado(doc) {
  if (!doc || !doc.fechaVencimiento) return doc;
  if (doc.estado === "HISTORICO" || doc.estado === "RECHAZADO") return doc;

  const hoy = new Date();
  const vencimiento = new Date(doc.fechaVencimiento);
  const diasRestantes = Math.ceil((vencimiento - hoy) / (1000 * 60 * 60 * 24));

  if (diasRestantes < 0) {
    doc.estado = "VENCIDO";
  } else if (diasRestantes <= 30) {
    doc.estado = "POR_VENCER";
  } else {
    doc.estado = "VIGENTE";
  }
  return doc;
}

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
 * Helper: Obtener scope de documentos según rol del usuario
 */
async function getDocumentScope(req) {
  const { isAdmin, isClienteAdmin } = getRoles(req);

  // ADMIN: Ven todo
  if (isAdmin) {
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
        { entidadModelo: "Empresa", entidadId: empresaId },
        { "entidadesAsociadas.entidadId": { $in: vehiculoIds } },
      ],
    };
  }

  // CLIENTE normal: Solo sus propios documentos (tercero asociado a su usuario) y de sus vehiculos permitidos
  const terceroId = req.user?.terceroId;
  const permitidos = req.session?.vehiculosPermitidos || [];
  const placas = permitidos.map((v) => v.placa);

  const $or = [];
  if (terceroId) {
    $or.push({ entidadModelo: "Tercero", entidadId: terceroId });
  }

  if (placas.length > 0) {
    const vehiculosPermitidosDb = await Vehiculo.find({
      placa: { $in: placas },
    })
      .select("_id")
      .lean();
    const vehiculoPermitidosIds = vehiculosPermitidosDb.map((v) => v._id);
    if (vehiculoPermitidosIds.length > 0) {
      $or.push({
        entidadModelo: "Vehiculo",
        entidadId: { $in: vehiculoPermitidosIds },
      });
      $or.push({
        "entidadesAsociadas.entidadId": { $in: vehiculoPermitidosIds },
      });
    }
  }

  if ($or.length === 0) {
    return { _id: null }; // No tiene tercero asociado ni vehiculos, no ve nada
  }

  return { $or };
}

/**
 * Crear documento
 */
exports.upload = async (req, res) => {
  try {
    const { entidadId, entidadModelo } = req.body;

    const { isAdmin, isClienteAdmin } = getRoles(req);

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

      // ADMIN y CLIENTE_ADMIN pueden crear docs de cualquier vehículo (de su empresa)
      if (!isAdmin && !isClienteAdmin) {
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
            message:
              "No tiene permisos para crear documentos de terceros fuera de su empresa",
          });
        }
      }
    } else if (entidadModelo === "Empresa") {
      entidad = await Empresa.findById(entidadId);
      if (!entidad) {
        return res.status(404).json({
          success: false,
          message: "Empresa no encontrada",
        });
      }

      // Solo ADMIN y CLIENTE_ADMIN de esa empresa pueden crear docs de empresa
      if (!isAdmin && isClienteAdmin) {
        if (req.user?.empresaId?.toString() !== entidadId.toString()) {
          return res.status(403).json({
            success: false,
            message: "No tiene permisos para crear documentos de esta empresa",
          });
        }
      } else if (!isAdmin && !isClienteAdmin) {
        return res.status(403).json({
          success: false,
          message: "No tiene permisos para crear documentos de empresa",
        });
      }
    }

    // 1.5 Validar entidadesAsociadas (si se proporcionan)
    const { entidadesAsociadas } = req.body;
    if (entidadesAsociadas && entidadesAsociadas.length > 0) {
      for (const asociada of entidadesAsociadas) {
        let entidadAsociada;
        if (asociada.entidadModelo === "Vehiculo") {
          entidadAsociada = await Vehiculo.findById(asociada.entidadId);
        } else if (asociada.entidadModelo === "Tercero") {
          entidadAsociada = await Tercero.findById(asociada.entidadId);
        } else if (asociada.entidadModelo === "Empresa") {
          entidadAsociada = await Empresa.findById(asociada.entidadId);
        }
        if (!entidadAsociada) {
          return res.status(404).json({
            success: false,
            message: `Entidad asociada no encontrada: ${asociada.entidadModelo} ${asociada.entidadId}`,
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
      empresaId,
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

    // Filtro por empresa: resolver documentos cuya entidad pertenezca a esa empresa
    if (empresaId) {
      const [vehiculosEmpresa, tercerosEmpresa] = await Promise.all([
        Vehiculo.find({ empresaAfiliadora: empresaId, deletedAt: null })
          .select("_id")
          .lean(),
        Tercero.find({ empresa: empresaId, deletedAt: null })
          .select("_id")
          .lean(),
      ]);

      const vIds = vehiculosEmpresa.map((v) => v._id);
      const tIds = tercerosEmpresa.map((t) => t._id);

      const empresaFilter = {
        $or: [
          { entidadModelo: "Vehiculo", entidadId: { $in: vIds } },
          { entidadModelo: "Tercero", entidadId: { $in: tIds } },
          { entidadModelo: "Empresa", entidadId: empresaId },
          { "entidadesAsociadas.entidadId": { $in: vIds } },
        ],
      };

      // Combinar con scope existente (que puede tener su propio $or)
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: empresaFilter.$or }];
        delete query.$or;
      } else {
        Object.assign(query, empresaFilter);
      }
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

    // El filtro por estado se aplica después del recálculo en tiempo real
    const filtroEstado = estado || null;

    // Soft delete: por defecto excluir eliminados
    if (!includeDeleted || includeDeleted === "false") {
      query.deletedAt = null;
    }

    // Si hay filtro de estado, lo usamos en la query como hint pero luego
    // re-filtramos después del recálculo para mayor precisión
    if (filtroEstado) {
      query.estado = filtroEstado;
    }

    // Ejecutar consulta con paginación
    const skip = (parseInt(page) - 1) * parseInt(limit);
    let documentos = await Documento.find(query)
      .sort({ fechaVencimiento: 1 })
      .limit(parseInt(limit))
      .skip(skip)
      .populate("entidadId", "placa nombres apellidos razonSocial")
      .populate("subidoPor", "username")
      .lean();

    // Recalcular estado en tiempo real según fechaVencimiento
    documentos = documentos.map(recalcularEstado);

    // Si se pidió filtrar por estado, re-filtrar después del recálculo
    // (un doc guardado como VIGENTE pudo haber cambiado a VENCIDO)
    if (filtroEstado) {
      documentos = documentos.filter((d) => d.estado === filtroEstado);
    }

    const total = filtroEstado
      ? await Documento.countDocuments(query) // Aproximado; el conteo exacto requeriría recalcular todos
      : await Documento.countDocuments(query);

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

    const query = {
      $or: [
        { entidadId },
        { "entidadesAsociadas.entidadId": entidadId },
      ],
      deletedAt: includeDeleted === "true" ? { $ne: null } : null,
    };

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

    let documentos = await Documento.find(query)
      .sort({ fechaVencimiento: 1 })
      .populate("subidoPor", "username")
      .lean();

    // Recalcular estado en tiempo real
    documentos = documentos.map(recalcularEstado);

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

    // Recalcular estado en tiempo real
    recalcularEstado(documento);

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
    const { isAdmin } = getRoles(req);

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message:
          "Solo administradores pueden eliminar documentos permanentemente",
      });
    }

    const { id } = req.params;
    const documento = await Documento.findById(id);

    if (!documento) {
      return res.status(404).json({
        success: false,
        message: "Documento no encontrado",
      });
    }

    // Eliminar archivos de S3
    const keysToDelete = [];
    if (documento.archivo?.key) keysToDelete.push(documento.archivo.key);
    if (documento.archivoReverso?.key) keysToDelete.push(documento.archivoReverso.key);
    if (documento.archivoExtra?.key) keysToDelete.push(documento.archivoExtra.key);

    if (keysToDelete.length > 0) {
      await Promise.all(keysToDelete.map((key) => s3Service.deleteObject(key)));
      logger.info(`S3: eliminados ${keysToDelete.length} archivo(s) del documento ${id}`);
    }

    await documento.deleteOne();

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

/**
 * Generar presigned URL para subir archivo a S3
 */
exports.getPresignedUrl = async (req, res) => {
  try {
    const { fileName, mimeType, folder } = req.body;

    if (!fileName || !mimeType) {
      return res.status(400).json({
        success: false,
        message: "fileName y mimeType son obligatorios",
      });
    }

    const data = await s3Service.generatePresignedUrl({
      fileName,
      mimeType,
      folder,
    });

    res.json({ success: true, data });
  } catch (error) {
    logger.error(`Error generando presigned URL: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
