const Preoperacional = require("../models/Preoperacional");
const Vehiculo = require("../models/Vehiculo");
const Tercero = require("../models/Tercero");
const Documento = require("../models/Documento");
const logger = require("../config/logger");

/**
 * Scope de preoperacionales según rol:
 * - ADMIN/SUPER: todo
 * - CLIENTE_ADMIN: vehículos de su empresa
 * - CLIENTE: solo sus vehiculosPermitidos
 */
async function getPreoperacionalScope(req) {
  const rolesNormalized = (req.user?.roles || []).map((r) =>
    r.replace("ROLE_", "").toUpperCase(),
  );
  const isAdmin = rolesNormalized.includes("ADMIN");
  const isClienteAdmin = rolesNormalized.includes("CLIENTE_ADMIN");

  if (isAdmin) {
    return {};
  }

  if (isClienteAdmin) {
    const empresaId = req.user?.empresaId;
    if (!empresaId) {
      return { vehiculo: null }; // no ve nada
    }
    const vehiculos = await Vehiculo.find({ empresaAfiliadora: empresaId })
      .select("_id")
      .lean();
    const vehiculoIds = vehiculos.map((v) => v._id);
    return { vehiculo: { $in: vehiculoIds } };
  }

  // CLIENTE: solo vehículos asignados (por placa)
  const permitidos = req.session?.vehiculosPermitidos || [];
  if (!permitidos.length) {
    return { vehiculo: null };
  }
  const placas = permitidos.map((v) => v.placa);
  const vehiculos = await Vehiculo.find({ placa: { $in: placas } })
    .select("_id")
    .lean();
  const vehiculoIds = vehiculos.map((v) => v._id);
  return { vehiculo: { $in: vehiculoIds } };
}

/**
 * Verificar si el usuario tiene acceso a un vehículo (por ID o por registro)
 */
async function tieneAccesoVehiculo(req, vehiculoId) {
  const scope = await getPreoperacionalScope(req);
  if (Object.keys(scope).length === 0) return true; // admin
  if (scope.vehiculo === null) return false;
  if (scope.vehiculo.$in) {
    const idStr = vehiculoId?.toString?.() || vehiculoId;
    return scope.vehiculo.$in.some((id) => id.toString() === idStr);
  }
  return scope.vehiculo.toString() === (vehiculoId?.toString?.() || vehiculoId);
}

/**
 * Obtener datos QR de una preoperacional
 * GET /api/preoperacionales/:id/qr
 */
exports.getQR = async (req, res) => {
  try {
    const preop = await Preoperacional.findOne({
      _id: req.params.id,
      deletedAt: null,
    })
      .populate(
        "vehiculo",
        "placa numeroInterno marca linea modelo empresaAfiliadora",
      )
      .populate("conductor", "nombres apellidos identificacion")
      .lean();

    if (!preop) {
      return res
        .status(404)
        .json({ success: false, message: "Preoperacional no encontrada" });
    }

    // Verificar acceso
    const acceso = await tieneAccesoVehiculo(req, preop.vehiculo?._id);
    if (!acceso) {
      return res.status(403).json({
        success: false,
        message: "No tiene permisos para ver esta preoperacional",
      });
    }

    // Obtener empresa
    const Empresa = require("../models/Empresa");
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
      data: {
        codigoPublico: preop.codigoPublico,
        qrVerificationUrl: `/api/verificar/preoperacional/${preop.codigoPublico}`,
        contadorQR: preop.contadorQR,
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
        seccionDelantera: preop.seccionDelantera,
        seccionMedia: preop.seccionMedia,
        seccionTrasera: preop.seccionTrasera,
        firmadoCheck: preop.firmadoCheck || false,
        firmaConductorUrl: preop.firmaConductorUrl || null,
        creadoEn: preop.createdAt,
      },
    });
  } catch (error) {
    logger.error(`Error obteniendo QR de preoperacional: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Crear preoperacional
 */
exports.create = async (req, res) => {
  try {
    const { vehiculo: vehiculoId, conductor: conductorId } = req.body;

    const vehiculo = await Vehiculo.findById(vehiculoId);
    if (!vehiculo) {
      return res.status(404).json({
        success: false,
        message: "Vehículo no encontrado",
      });
    }

    const conductor = await Tercero.findById(conductorId);
    if (!conductor) {
      return res.status(404).json({
        success: false,
        message: "Conductor (tercero) no encontrado",
      });
    }

    const tieneAcceso = await tieneAccesoVehiculo(req, vehiculoId);
    if (!tieneAcceso) {
      return res.status(403).json({
        success: false,
        message: "No tiene permisos para crear preoperacional de este vehículo",
      });
    }

    const check = new Preoperacional(req.body);
    await check.save();

    const populated = await Preoperacional.findById(check._id)
      .populate("vehiculo", "placa numeroInterno")
      .populate("conductor", "nombres apellidos");

    const responseData = populated ? populated.toObject() : check.toObject();
    responseData.qrVerificationUrl = `/api/verificar/preoperacional/${responseData.codigoPublico}`;

    res.status(201).json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    logger.error(`Error creando preoperacional: ${error.message}`);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Listar preoperacionales con filtros (según scope del token)
 */
exports.getAll = async (req, res) => {
  try {
    const {
      vehiculoId,
      conductorId,
      estadoGeneral,
      fechaDesde,
      fechaHasta,
      page = 1,
      limit = 20,
      includeDeleted = false,
    } = req.query;

    const query = {};

    const scope = await getPreoperacionalScope(req);
    if (Object.keys(scope).length > 0) {
      Object.assign(query, scope);
    }
    if (scope.vehiculo === null) {
      return res.json({
        success: true,
        data: [],
        pagination: { page: 1, limit: parseInt(limit), total: 0, pages: 0 },
      });
    }

    if (vehiculoId) query.vehiculo = vehiculoId;
    if (conductorId) query.conductor = conductorId;
    if (estadoGeneral) query.estadoGeneral = estadoGeneral;

    if (fechaDesde || fechaHasta) {
      query.fecha = {};
      if (fechaDesde) query.fecha.$gte = new Date(fechaDesde);
      if (fechaHasta) query.fecha.$lte = new Date(fechaHasta);
    }

    if (!includeDeleted || includeDeleted === "false") {
      query.deletedAt = null;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const list = await Preoperacional.find(query)
      .sort({ fecha: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .populate("vehiculo", "placa numeroInterno")
      .populate("conductor", "nombres apellidos")
      .lean();

    const total = await Preoperacional.countDocuments(query);

    res.json({
      success: true,
      data: list,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error(`Error listando preoperacionales: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Listar por vehículo
 */
exports.getByVehiculo = async (req, res) => {
  try {
    const { vehiculoId } = req.params;
    const { page = 1, limit = 20, includeDeleted = false } = req.query;

    const tieneAcceso = await tieneAccesoVehiculo(req, vehiculoId);
    if (!tieneAcceso) {
      return res.status(403).json({
        success: false,
        message: "No tiene permisos para ver preoperacionales de este vehículo",
      });
    }

    const query = { vehiculo: vehiculoId };
    if (!includeDeleted || includeDeleted === "false") {
      query.deletedAt = null;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const checks = await Preoperacional.find(query)
      .sort({ fecha: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .populate("conductor", "nombres apellidos")
      .lean();

    res.json({
      success: true,
      data: checks,
    });
  } catch (error) {
    logger.error(`Error getByVehiculo preoperacional: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Obtener uno por ID
 */
exports.getOne = async (req, res) => {
  try {
    const { id } = req.params;
    const check = await Preoperacional.findOne({ _id: id, deletedAt: null })
      .populate("vehiculo")
      .populate("conductor");

    if (!check) {
      return res.status(404).json({
        success: false,
        message: "Preoperacional no encontrado",
      });
    }

    const vehiculoId = check.vehiculo?._id ?? check.vehiculo;
    const tieneAcceso = await tieneAccesoVehiculo(req, vehiculoId);
    if (!tieneAcceso) {
      return res.status(403).json({
        success: false,
        message: "Acceso denegado a este registro",
      });
    }

    res.json({
      success: true,
      data: check,
    });
  } catch (error) {
    logger.error(`Error getOne preoperacional: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Actualizar (cualquier usuario con acceso al vehículo del check)
 */
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const check = await Preoperacional.findOne({ _id: id, deletedAt: null });

    if (!check) {
      return res.status(404).json({
        success: false,
        message: "Preoperacional no encontrado",
      });
    }

    const tieneAcceso = await tieneAccesoVehiculo(req, check.vehiculo);
    if (!tieneAcceso) {
      return res.status(403).json({
        success: false,
        message: "No tiene permisos para editar este preoperacional",
      });
    }

    Object.assign(check, req.body);
    await check.save();

    const updated = await Preoperacional.findById(check._id)
      .populate("vehiculo", "placa numeroInterno")
      .populate("conductor", "nombres apellidos");

    res.json({
      success: true,
      data: updated || check,
    });
  } catch (error) {
    logger.error(`Error actualizando preoperacional: ${error.message}`);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Soft delete
 */
exports.softDelete = async (req, res) => {
  try {
    const { id } = req.params;
    const check = await Preoperacional.findOne({ _id: id, deletedAt: null });

    if (!check) {
      return res.status(404).json({
        success: false,
        message: "Preoperacional no encontrado",
      });
    }

    const tieneAcceso = await tieneAccesoVehiculo(req, check.vehiculo);
    if (!tieneAcceso) {
      return res.status(403).json({
        success: false,
        message: "No tiene permisos para eliminar este preoperacional",
      });
    }

    await check.softDelete(req.user?.userId || null);

    res.json({
      success: true,
      message: "Preoperacional eliminado temporalmente",
      data: check,
    });
  } catch (error) {
    logger.error(`Error soft delete preoperacional: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Restaurar
 */
exports.restore = async (req, res) => {
  try {
    const { id } = req.params;
    const check = await Preoperacional.findById(id);

    if (!check) {
      return res.status(404).json({
        success: false,
        message: "Preoperacional no encontrado",
      });
    }
    if (!check.deletedAt) {
      return res.status(400).json({
        success: false,
        message: "El preoperacional no está eliminado",
      });
    }

    const tieneAcceso = await tieneAccesoVehiculo(req, check.vehiculo);
    if (!tieneAcceso) {
      return res.status(403).json({
        success: false,
        message: "No tiene permisos para restaurar este preoperacional",
      });
    }

    await check.restore();

    res.json({
      success: true,
      message: "Preoperacional restaurado",
      data: check,
    });
  } catch (error) {
    logger.error(`Error restaurando preoperacional: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Hard delete (solo ADMIN)
 */
exports.hardDelete = async (req, res) => {
  try {
    const rolesNormalized = (req.user?.roles || []).map((r) =>
      r.replace("ROLE_", "").toUpperCase(),
    );
    const isAdmin = rolesNormalized.includes("ADMIN");

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message:
          "Solo administradores pueden eliminar preoperacionales permanentemente",
      });
    }

    const { id } = req.params;
    const check = await Preoperacional.findByIdAndDelete(id);

    if (!check) {
      return res.status(404).json({
        success: false,
        message: "Preoperacional no encontrado",
      });
    }

    res.json({
      success: true,
      message: "Preoperacional eliminado permanentemente",
    });
  } catch (error) {
    logger.error(`Error hard delete preoperacional: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Validar hoja de vida del vehículo y conductor antes de crear preoperacional.
 * Retorna autorizado: true/false con errores (bloquean) y alertas (POR_VENCER).
 */
exports.validarHojaDeVida = async (req, res) => {
  try {
    const { vehiculoId, conductorId } = req.params;
    const errores = [];
    const alertas = [];

    // 1. Verificar existencia
    const [vehiculo, conductor] = await Promise.all([
      Vehiculo.findOne({ _id: vehiculoId, deletedAt: null }),
      Tercero.findOne({ _id: conductorId, deletedAt: null }),
    ]);

    if (!vehiculo) {
      return res.status(404).json({ success: false, message: "Vehículo no encontrado" });
    }
    if (!conductor) {
      return res.status(404).json({ success: false, message: "Conductor no encontrado" });
    }

    // 2. Verificar permisos
    const tieneAcceso = await tieneAccesoVehiculo(req, vehiculoId);
    if (!tieneAcceso) {
      return res.status(403).json({ success: false, message: "No tiene permisos sobre este vehículo" });
    }

    // 3. Validar estado del vehículo
    if (vehiculo.estado !== "ACTIVO") {
      errores.push({
        campo: "VEHICULO_ESTADO",
        mensaje: `El vehículo está en estado ${vehiculo.estado}. Debe estar ACTIVO.`,
      });
    }

    // 4. Validar estado y rol del conductor
    if (conductor.estado !== "ACTIVO") {
      errores.push({
        campo: "CONDUCTOR_ESTADO",
        mensaje: `El conductor está en estado ${conductor.estado}. Debe estar ACTIVO.`,
      });
    }
    if (!conductor.roles || !conductor.roles.includes("CONDUCTOR")) {
      errores.push({
        campo: "CONDUCTOR_ROL",
        mensaje: "El tercero seleccionado no tiene el rol CONDUCTOR asignado.",
      });
    }

    // 5. Consultar documentos del vehículo y conductor en paralelo
    const [docsVehiculo, docsConductor] = await Promise.all([
      Documento.find({
        entidadId: vehiculoId,
        entidadModelo: "Vehiculo",
        tipoDocumento: { $in: ["SOAT", "TECNOMECANICA", "TARJETA_OPERACION"] },
        deletedAt: null,
      })
        .sort({ fechaVencimiento: -1 })
        .lean(),
      Documento.find({
        entidadId: conductorId,
        entidadModelo: "Tercero",
        tipoDocumento: "LICENCIA_CONDUCCION",
        deletedAt: null,
      })
        .sort({ fechaVencimiento: -1 })
        .lean(),
    ]);

    // 6. Validar documentos requeridos del vehículo
    const docsRequeridosVehiculo = ["SOAT", "TECNOMECANICA", "TARJETA_OPERACION"];
    for (const tipo of docsRequeridosVehiculo) {
      const docs = docsVehiculo.filter((d) => d.tipoDocumento === tipo);
      validarDocumento(tipo, docs, "vehículo", errores, alertas);
    }

    // 7. Validar licencia del conductor
    validarDocumento("LICENCIA_CONDUCCION", docsConductor, "conductor", errores, alertas);

    res.json({
      success: true,
      data: {
        autorizado: errores.length === 0,
        errores,
        alertas,
      },
    });
  } catch (error) {
    logger.error(`Error validando hoja de vida: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Helper: Validar un tipo de documento y agregar error/alerta según estado.
 */
function validarDocumento(tipo, docs, entidad, errores, alertas) {
  if (!docs.length) {
    errores.push({
      campo: tipo,
      mensaje: `No se encontró ${tipo.replace(/_/g, " ")} registrado para el ${entidad}.`,
    });
    return;
  }

  // Tomar el más reciente (ya ordenados por fechaVencimiento desc)
  const mejor = docs.find((d) => d.estado === "VIGENTE" || d.estado === "POR_VENCER");

  if (!mejor) {
    // Todos vencidos/rechazados
    const masReciente = docs[0];
    const fecha = masReciente.fechaVencimiento
      ? new Date(masReciente.fechaVencimiento).toISOString().split("T")[0]
      : "N/A";
    errores.push({
      campo: tipo,
      mensaje: `${tipo.replace(/_/g, " ")} vencido desde ${fecha}.`,
    });
    return;
  }

  if (mejor.estado === "POR_VENCER" && mejor.fechaVencimiento) {
    const hoy = new Date();
    const vence = new Date(mejor.fechaVencimiento);
    const diasRestantes = Math.ceil((vence - hoy) / (1000 * 60 * 60 * 24));
    const fecha = vence.toISOString().split("T")[0];
    alertas.push({
      campo: tipo,
      mensaje: `${tipo.replace(/_/g, " ")} vence en ${diasRestantes} día(s) (${fecha}).`,
    });
  }
}
