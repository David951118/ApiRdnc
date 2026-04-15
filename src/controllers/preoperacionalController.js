const mongoose = require("mongoose");
const Preoperacional = require("../models/Preoperacional");
const Vehiculo = require("../models/Vehiculo");
const Tercero = require("../models/Tercero");
const Documento = require("../models/Documento");
const s3Service = require("../services/s3Service");
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
 * Habilitar preoperacional extra para un vehículo hoy
 * POST /api/preoperacionales/habilitar-extra/:vehiculoId
 * Body: { motivo: "Cambio de conductor" } (opcional)
 * Solo ADMIN o CLIENTE_ADMIN
 */
exports.habilitarExtra = async (req, res) => {
  try {
    const { vehiculoId } = req.params;
    const { motivo } = req.body;

    const vehiculo = await Vehiculo.findOne({
      _id: vehiculoId,
      deletedAt: null,
    });
    if (!vehiculo) {
      return res
        .status(404)
        .json({ success: false, message: "Vehículo no encontrado" });
    }

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    vehiculo.preoperacionalExtraHabilitada = {
      fecha: hoy,
      habilitadoPor: req.user?.userId || null,
      motivo: motivo || null,
    };
    await vehiculo.save();

    res.json({
      success: true,
      message: `Preoperacional extra habilitada para ${vehiculo.placa} hoy.`,
      data: {
        vehiculo: vehiculo.placa,
        habilitadoPor: req.user?.userId,
        fecha: hoy,
        motivo,
      },
    });
  } catch (error) {
    logger.error(`Error habilitando preoperacional extra: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Crear preoperacional
 * - Solo 1 por vehículo por día
 * - Un admin puede habilitar una extra con /habilitar-extra/:vehiculoId
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

    // Validar: solo 1 preoperacional por vehículo por día
    // Un admin puede habilitar una extra con el endpoint /api/preoperacionales/habilitar-extra/:vehiculoId
    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);
    const finHoy = new Date();
    finHoy.setHours(23, 59, 59, 999);

    const existeHoy = await Preoperacional.findOne({
      vehiculo: vehiculoId,
      fecha: { $gte: inicioHoy, $lte: finHoy },
      deletedAt: null,
    }).lean();

    if (existeHoy) {
      // Verificar si el admin habilitó una extra para hoy
      const extra = vehiculo.preoperacionalExtraHabilitada;
      const extraHabilitada =
        extra?.fecha &&
        new Date(extra.fecha) >= inicioHoy &&
        new Date(extra.fecha) <= finHoy;

      if (!extraHabilitada) {
        return res.status(409).json({
          success: false,
          message:
            "Ya existe una preoperacional para este vehículo hoy. Un administrador debe habilitar una preoperacional extra.",
          data: {
            preoperacionalExistente: existeHoy._id,
            estadoGeneral: existeHoy.estadoGeneral,
            fecha: existeHoy.fecha,
          },
        });
      }

      // Consumir la habilitación extra (solo sirve una vez)
      vehiculo.preoperacionalExtraHabilitada = undefined;
      await vehiculo.save();
    }

    const check = new Preoperacional(req.body);
    check.creadoPor = req.user?.userId || null;
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
 * Listar preoperacionales con novedades pendientes
 * GET /api/preoperacionales/novedades
 */
exports.getNovedadesPendientes = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const scope = await getPreoperacionalScope(req);

    if (scope.vehiculo === null) {
      return res.json({
        success: true,
        data: [],
        pagination: { page: 1, limit: parseInt(limit), total: 0, pages: 0 },
      });
    }

    const query = {
      estadoGeneral: "NOVEDAD",
      deletedAt: null,
      ...scope,
    };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const list = await Preoperacional.find(query)
      .sort({ fechaLimiteNovedades: 1 }) // las más urgentes primero
      .limit(parseInt(limit))
      .skip(skip)
      .populate("vehiculo", "placa numeroInterno")
      .populate("conductor", "nombres apellidos")
      .lean();

    const total = await Preoperacional.countDocuments(query);

    // Agregar info de novedades pendientes vs resueltas
    const data = list.map((p) => {
      const pendientes = (p.novedades || []).filter((n) => !n.resuelta);
      const resueltas = (p.novedades || []).filter((n) => n.resuelta);
      const diasRestantes = p.fechaLimiteNovedades
        ? Math.ceil(
            (new Date(p.fechaLimiteNovedades) - new Date()) /
              (1000 * 60 * 60 * 24),
          )
        : 0;
      return {
        ...p,
        resumenNovedades: {
          total: (p.novedades || []).length,
          pendientes: pendientes.length,
          resueltas: resueltas.length,
          diasRestantes: Math.max(0, diasRestantes),
        },
      };
    });

    res.json({
      success: true,
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error(`Error listando novedades pendientes: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Resolver una novedad (subir foto de corrección)
 * PUT /api/preoperacionales/:id/novedades/:novedadId/resolver
 * Body: { fotoCorreccion: "https://s3.../foto-correccion.jpg" }
 */
exports.resolverNovedad = async (req, res) => {
  try {
    const { id, novedadId } = req.params;
    const { fotoCorreccion } = req.body;

    if (!fotoCorreccion) {
      return res.status(400).json({
        success: false,
        message: "Debe subir la foto de corrección (fotoCorreccion)",
      });
    }

    const preop = await Preoperacional.findOne({ _id: id, deletedAt: null });
    if (!preop) {
      return res
        .status(404)
        .json({ success: false, message: "Preoperacional no encontrada" });
    }

    // Verificar acceso
    const acceso = await tieneAccesoVehiculo(req, preop.vehiculo);
    if (!acceso) {
      return res.status(403).json({
        success: false,
        message: "No tiene permisos para esta preoperacional",
      });
    }

    if (preop.estadoGeneral !== "NOVEDAD") {
      return res.status(400).json({
        success: false,
        message: `No se pueden resolver novedades en estado ${preop.estadoGeneral}`,
      });
    }

    // Buscar la novedad
    const novedad = preop.novedades.id(novedadId);
    if (!novedad) {
      return res
        .status(404)
        .json({ success: false, message: "Novedad no encontrada" });
    }

    if (novedad.estadoCorreccion === "VALIDADA") {
      return res.status(400).json({
        success: false,
        message: "Esta novedad ya fue validada",
      });
    }

    if (!novedad.requiereCorreccion) {
      return res.status(400).json({
        success: false,
        message: "Esta novedad no admite corrección (sueño, salud, sustancias)",
      });
    }

    // Verificar que no haya pasado la fecha límite
    if (new Date() > new Date(novedad.fechaLimite)) {
      return res.status(400).json({
        success: false,
        message:
          "La fecha límite para resolver esta novedad ya venció. Solicite extensión a un administrador.",
      });
    }

    const userId = req.user?.userId || null;

    // Subir corrección → pasa a EN_REVISION (espera validación del admin)
    novedad.fotoCorreccion = fotoCorreccion;
    novedad.estadoCorreccion = "EN_REVISION";
    novedad.fechaResolucion = new Date();
    novedad.resueltaPor = userId;
    // Limpiar rechazo previo si lo hubo
    novedad.rechazadaPor = undefined;
    novedad.fechaRechazo = undefined;
    novedad.motivoRechazo = undefined;

    novedad.historial.push({
      accion: "CORRECCION_SUBIDA",
      usuario: userId,
      fecha: new Date(),
      detalle: "Foto de corrección subida. Pendiente validación del admin.",
    });

    await preop.save({ validateBeforeSave: false });

    const populated = await Preoperacional.findById(preop._id)
      .populate("vehiculo", "placa numeroInterno")
      .populate("conductor", "nombres apellidos")
      .lean();

    res.json({
      success: true,
      message: "Corrección enviada. Esperando validación del administrador.",
      data: populated,
    });
  } catch (error) {
    logger.error(`Error resolviendo novedad: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
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

/**
 * Extender plazo de corrección de una novedad (ADMIN/CLIENTE_ADMIN)
 * PUT /api/preoperacionales/:id/novedades/:novedadId/extender
 * Body: { diasExtra: 15, motivo: "Repuesto en camino" }
 */
exports.extenderPlazo = async (req, res) => {
  try {
    const { id, novedadId } = req.params;
    const { diasExtra, motivo } = req.body;

    if (!diasExtra || diasExtra < 1) {
      return res.status(400).json({
        success: false,
        message: "Debe indicar diasExtra (mínimo 1)",
      });
    }

    const preop = await Preoperacional.findOne({ _id: id, deletedAt: null });
    if (!preop) {
      return res
        .status(404)
        .json({ success: false, message: "Preoperacional no encontrada" });
    }

    const novedad = preop.novedades.id(novedadId);
    if (!novedad) {
      return res
        .status(404)
        .json({ success: false, message: "Novedad no encontrada" });
    }

    if (novedad.estadoCorreccion === "VALIDADA") {
      return res
        .status(400)
        .json({ success: false, message: "La novedad ya fue validada" });
    }

    // Extender fecha límite
    const nuevaFecha = new Date(novedad.fechaLimite);
    nuevaFecha.setDate(nuevaFecha.getDate() + diasExtra);
    novedad.fechaLimite = nuevaFecha;

    novedad.historial.push({
      accion: "PLAZO_EXTENDIDO",
      usuario: req.user?.userId || null,
      fecha: new Date(),
      detalle: `+${diasExtra} días. Motivo: ${motivo || "Sin motivo"}`,
    });

    // Recalcular fecha límite global
    const fechasActivas = preop.novedades
      .filter((n) => n.estadoCorreccion !== "VALIDADA" && n.requiereCorreccion)
      .map((n) => n.fechaLimite);
    if (fechasActivas.length > 0) {
      preop.fechaLimiteNovedades = new Date(Math.max(...fechasActivas));
    }

    // Si estaba RECHAZADO por vencimiento, volver a NOVEDAD
    if (preop.estadoGeneral === "RECHAZADO") {
      preop.estadoGeneral = "NOVEDAD";
    }

    await preop.save({ validateBeforeSave: false });

    res.json({
      success: true,
      message: `Plazo extendido ${diasExtra} días hasta ${nuevaFecha.toISOString().split("T")[0]}`,
      data: { novedadId, nuevaFechaLimite: nuevaFecha, motivo },
    });
  } catch (error) {
    logger.error(`Error extendiendo plazo: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Obtener último kilometraje de un vehículo
 * GET /api/preoperacionales/ultimo-kilometraje/:vehiculoId
 */
exports.ultimoKilometraje = async (req, res) => {
  try {
    const { vehiculoId } = req.params;

    const ultima = await Preoperacional.findOne({
      vehiculo: vehiculoId,
      deletedAt: null,
      kilometraje: { $exists: true, $ne: null },
    })
      .sort({ fecha: -1 })
      .select("kilometraje fecha conductor")
      .populate("conductor", "nombres apellidos")
      .lean();

    res.json({
      success: true,
      data: ultima
        ? {
            kilometraje: ultima.kilometraje,
            fecha: ultima.fecha,
            conductor: ultima.conductor,
          }
        : { kilometraje: 0, fecha: null, conductor: null },
    });
  } catch (error) {
    logger.error(`Error obteniendo último kilometraje: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Estadísticas completas de preoperacionales
 * GET /api/preoperacionales/estadisticas
 * Query params: vehiculoId, conductorId, empresaId, fechaDesde, fechaHasta, item
 */
exports.getEstadisticas = async (req, res) => {
  try {
    const { vehiculoId, conductorId, empresaId, fechaDesde, fechaHasta, item } =
      req.query;

    // Construir filtro base
    const match = { deletedAt: null };

    if (vehiculoId) match.vehiculo = new mongoose.Types.ObjectId(vehiculoId);
    if (conductorId)
      match.conductor = new mongoose.Types.ObjectId(conductorId);

    if (fechaDesde || fechaHasta) {
      match.fecha = {};
      if (fechaDesde) match.fecha.$gte = new Date(fechaDesde);
      if (fechaHasta) match.fecha.$lte = new Date(fechaHasta);
    }

    // Si filtran por empresa, buscar vehículos de esa empresa
    if (empresaId) {
      const vehiculosEmpresa = await Vehiculo.find({
        empresaAfiliadora: empresaId,
        deletedAt: null,
      })
        .select("_id")
        .lean();
      match.vehiculo = {
        $in: vehiculosEmpresa.map((v) => v._id),
      };
    }

    // Aplicar scope según rol
    const scope = await getPreoperacionalScope(req);
    if (scope.vehiculo === null) {
      return res.json({ success: true, data: { total: 0 } });
    }
    if (scope.vehiculo) {
      if (match.vehiculo) {
        // Intersectar con scope
        match.$and = [{ vehiculo: match.vehiculo }, { vehiculo: scope.vehiculo }];
        delete match.vehiculo;
      } else {
        match.vehiculo = scope.vehiculo;
      }
    }

    // 1. Conteo por estado general
    const [total, aprobadas, conNovedad, rechazadas] = await Promise.all([
      Preoperacional.countDocuments(match),
      Preoperacional.countDocuments({ ...match, estadoGeneral: "APROBADO" }),
      Preoperacional.countDocuments({ ...match, estadoGeneral: "NOVEDAD" }),
      Preoperacional.countDocuments({ ...match, estadoGeneral: "RECHAZADO" }),
    ]);

    // 2. Items con más fallas (MALO) — top 10
    const fallosPorItem = await Preoperacional.aggregate([
      { $match: match },
      { $unwind: "$novedades" },
      { $match: { "novedades.tipo": { $in: ["MALO", "REGULAR"] } } },
      ...(item
        ? [{ $match: { "novedades.item": { $regex: item, $options: "i" } } }]
        : []),
      {
        $group: {
          _id: { item: "$novedades.item", tipo: "$novedades.tipo" },
          total: { $sum: 1 },
          resueltas: {
            $sum: { $cond: ["$novedades.resuelta", 1, 0] },
          },
          pendientes: {
            $sum: { $cond: ["$novedades.resuelta", 0, 1] },
          },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 20 },
      {
        $project: {
          _id: 0,
          item: "$_id.item",
          tipo: "$_id.tipo",
          total: 1,
          resueltas: 1,
          pendientes: 1,
        },
      },
    ]);

    // 3. Preoperacionales por mes (últimos 6 meses)
    const hace6Meses = new Date();
    hace6Meses.setMonth(hace6Meses.getMonth() - 6);
    const porMes = await Preoperacional.aggregate([
      { $match: { ...match, fecha: { $gte: hace6Meses } } },
      {
        $group: {
          _id: {
            anio: { $year: "$fecha" },
            mes: { $month: "$fecha" },
            estado: "$estadoGeneral",
          },
          total: { $sum: 1 },
        },
      },
      { $sort: { "_id.anio": 1, "_id.mes": 1 } },
    ]);

    // 4. Novedades por sueño insuficiente
    const novedadesSueno = await Preoperacional.countDocuments({
      ...match,
      "novedades.tipo": "SUENO",
    });

    // 5. Promedio de horas de sueño
    const promedioSueno = await Preoperacional.aggregate([
      { $match: { ...match, "seccionConductor.horasSueno": { $exists: true } } },
      {
        $group: {
          _id: null,
          promedio: { $avg: "$seccionConductor.horasSueno" },
          minimo: { $min: "$seccionConductor.horasSueno" },
          maximo: { $max: "$seccionConductor.horasSueno" },
        },
      },
    ]);

    // 6. Vehículos con más fallas
    const vehiculosConMasFallas = await Preoperacional.aggregate([
      { $match: { ...match, estadoGeneral: { $in: ["NOVEDAD", "RECHAZADO"] } } },
      {
        $group: {
          _id: "$vehiculo",
          totalNovedades: { $sum: 1 },
        },
      },
      { $sort: { totalNovedades: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "vehiculos",
          localField: "_id",
          foreignField: "_id",
          as: "vehiculo",
        },
      },
      { $unwind: "$vehiculo" },
      {
        $project: {
          _id: 0,
          vehiculoId: "$_id",
          placa: "$vehiculo.placa",
          numeroInterno: "$vehiculo.numeroInterno",
          totalNovedades: 1,
        },
      },
    ]);

    // 7. Estadísticas de anotaciones y ciclo de correcciones
    const [anotacionesStats, correccionesStats] = await Promise.all([
      Preoperacional.aggregate([
        { $match: match },
        { $unwind: { path: "$anotaciones", preserveNullAndEmptyArrays: false } },
        {
          $group: {
            _id: "$anotaciones.tipo",
            total: { $sum: 1 },
          },
        },
      ]),
      Preoperacional.aggregate([
        { $match: match },
        { $unwind: "$novedades" },
        {
          $group: {
            _id: "$novedades.estadoCorreccion",
            total: { $sum: 1 },
          },
        },
      ]),
    ]);

    const anotacionesPorTipo = Object.fromEntries(
      anotacionesStats.map((a) => [a._id || "GENERAL", a.total]),
    );
    const totalAnotaciones = anotacionesStats.reduce((s, a) => s + a.total, 0);

    const correccionesPorEstado = Object.fromEntries(
      correccionesStats.map((c) => [c._id || "PENDIENTE", c.total]),
    );

    res.json({
      success: true,
      data: {
        resumen: { total, aprobadas, conNovedad, rechazadas },
        fallosPorItem,
        porMes,
        sueno: {
          totalNovedadesSueno: novedadesSueno,
          promedio: promedioSueno[0]?.promedio
            ? Math.round(promedioSueno[0].promedio * 10) / 10
            : null,
          minimo: promedioSueno[0]?.minimo ?? null,
          maximo: promedioSueno[0]?.maximo ?? null,
        },
        vehiculosConMasFallas,
        anotaciones: {
          total: totalAnotaciones,
          porTipo: anotacionesPorTipo,
        },
        correcciones: {
          pendientes: correccionesPorEstado.PENDIENTE || 0,
          enRevision: correccionesPorEstado.EN_REVISION || 0,
          validadas: correccionesPorEstado.VALIDADA || 0,
          rechazadas: correccionesPorEstado.RECHAZADA || 0,
        },
      },
    });
  } catch (error) {
    logger.error(`Error generando estadísticas preoperacionales: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Historial de correcciones y fallos comunes de un vehículo
 * GET /api/preoperacionales/historial-correcciones/:vehiculoId
 * Query: fechaDesde, fechaHasta, soloNoResueltas
 */
exports.historialCorrecciones = async (req, res) => {
  try {
    const { vehiculoId } = req.params;
    const { fechaDesde, fechaHasta, soloNoResueltas } = req.query;

    const match = {
      vehiculo: new mongoose.Types.ObjectId(vehiculoId),
      deletedAt: null,
      "novedades.0": { $exists: true }, // Solo las que tienen novedades
    };

    if (fechaDesde || fechaHasta) {
      match.fecha = {};
      if (fechaDesde) match.fecha.$gte = new Date(fechaDesde);
      if (fechaHasta) match.fecha.$lte = new Date(fechaHasta);
    }

    const preops = await Preoperacional.find(match)
      .sort({ fecha: -1 })
      .select(
        "fecha estadoGeneral novedades kilometraje conductor fechaLimiteNovedades",
      )
      .populate("conductor", "nombres apellidos identificacion")
      .lean();

    // Aplanar todas las novedades con su contexto
    const correcciones = [];
    for (const p of preops) {
      for (const n of p.novedades) {
        if (soloNoResueltas === "true" && n.resuelta) continue;
        correcciones.push({
          preoperacionalId: p._id,
          fecha: p.fecha,
          estadoGeneral: p.estadoGeneral,
          kilometraje: p.kilometraje,
          conductor: p.conductor,
          novedad: n,
        });
      }
    }

    // Resumen de fallos comunes
    const conteoItems = {};
    for (const c of correcciones) {
      const key = c.novedad.item;
      if (!conteoItems[key]) {
        conteoItems[key] = { total: 0, resueltas: 0, pendientes: 0, tipo: c.novedad.tipo };
      }
      conteoItems[key].total++;
      if (c.novedad.resuelta) conteoItems[key].resueltas++;
      else conteoItems[key].pendientes++;
    }

    const fallosComunes = Object.entries(conteoItems)
      .map(([item, data]) => ({ item, ...data }))
      .sort((a, b) => b.total - a.total);

    res.json({
      success: true,
      data: {
        totalCorrecciones: correcciones.length,
        fallosComunes,
        detalle: correcciones,
      },
    });
  } catch (error) {
    logger.error(`Error obteniendo historial correcciones: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Validar corrección de una novedad (ADMIN/CLIENTE_ADMIN)
 * PUT /api/preoperacionales/:id/novedades/:novedadId/validar
 * Body: { observaciones?: "Todo correcto" }
 * Marca la novedad como VALIDADA. Si todas están validadas → APROBADO.
 */
exports.validarCorreccion = async (req, res) => {
  try {
    const { id, novedadId } = req.params;
    const { observaciones } = req.body;

    const preop = await Preoperacional.findOne({ _id: id, deletedAt: null });
    if (!preop) {
      return res
        .status(404)
        .json({ success: false, message: "Preoperacional no encontrada" });
    }

    const novedad = preop.novedades.id(novedadId);
    if (!novedad) {
      return res
        .status(404)
        .json({ success: false, message: "Novedad no encontrada" });
    }

    if (novedad.estadoCorreccion !== "EN_REVISION") {
      return res.status(400).json({
        success: false,
        message: `Solo se puede validar una novedad EN_REVISION. Estado actual: ${novedad.estadoCorreccion}`,
      });
    }

    const userId = req.user?.userId || null;
    const ahora = new Date();
    const rolesNormalized = (req.user?.roles || []).map((r) =>
      r.replace("ROLE_", "").toUpperCase(),
    );

    // Guardar URLs antes de cualquier cambio
    const fotoFallaOriginal = novedad.fotoFalla;
    const fotoCorreccionOriginal = novedad.fotoCorreccion;
    const fotoFallaKey = novedad.fotoFallaKey;

    novedad.estadoCorreccion = "VALIDADA";
    novedad.resuelta = true;
    novedad.validadaPor = userId;
    novedad.fechaValidacion = ahora;
    novedad.observacionesValidacion = observaciones || null;

    novedad.historial.push({
      accion: "VALIDADA",
      usuario: userId,
      fecha: ahora,
      detalle: observaciones || "Corrección validada",
    });

    // Crear anotación automática de VALIDACIÓN que preserva ambas fotos
    preop.anotaciones.push({
      texto:
        observaciones ||
        `Corrección validada para ${novedad.item}. Se preservan fotos de antes y después.`,
      tipo: "VALIDACION",
      autor: userId,
      autorNombre: req.user?.username || null,
      rol: rolesNormalized[0] || null,
      fecha: ahora,
      novedadOrigenId: novedad._id,
      itemOrigen: novedad.item,
      fotoFalla: fotoFallaOriginal,
      fotoCorreccion: fotoCorreccionOriginal,
    });

    // Borrar foto de falla de S3 (ya está preservada en la anotación)
    if (fotoFallaKey) {
      try {
        await s3Service.deleteObject(fotoFallaKey);
        logger.info(`S3: foto de falla eliminada (${fotoFallaKey})`);
        novedad.fotoFalla = null;
        novedad.fotoFallaKey = null;
      } catch (err) {
        logger.warn(`No se pudo eliminar foto de falla de S3: ${err.message}`);
      }
    }

    // Si TODAS las novedades corregibles están validadas → APROBADO
    const pendientes = preop.novedades.filter(
      (n) => n.requiereCorreccion && n.estadoCorreccion !== "VALIDADA",
    );

    if (pendientes.length === 0) {
      const noCorregibles = preop.novedades.filter((n) => !n.requiereCorreccion);
      if (noCorregibles.length === 0) {
        preop.estadoGeneral = "APROBADO";
      }
    }

    await preop.save({ validateBeforeSave: false });

    res.json({
      success: true,
      message:
        preop.estadoGeneral === "APROBADO"
          ? "Corrección validada. Preoperacional APROBADA. Foto de falla eliminada y preservada en anotación."
          : "Corrección validada. Quedan novedades pendientes.",
      data: preop,
    });
  } catch (error) {
    logger.error(`Error validando corrección: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Rechazar corrección de una novedad (ADMIN/CLIENTE_ADMIN)
 * PUT /api/preoperacionales/:id/novedades/:novedadId/rechazar
 * Body: { motivo: "La foto no muestra la reparación" }
 * Vuelve la novedad a PENDIENTE para que el conductor suba otra corrección.
 */
exports.rechazarCorreccion = async (req, res) => {
  try {
    const { id, novedadId } = req.params;
    const { motivo } = req.body;

    if (!motivo || motivo.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: "Debe indicar un motivo de rechazo (mínimo 5 caracteres)",
      });
    }

    const preop = await Preoperacional.findOne({ _id: id, deletedAt: null });
    if (!preop) {
      return res
        .status(404)
        .json({ success: false, message: "Preoperacional no encontrada" });
    }

    const novedad = preop.novedades.id(novedadId);
    if (!novedad) {
      return res
        .status(404)
        .json({ success: false, message: "Novedad no encontrada" });
    }

    if (novedad.estadoCorreccion !== "EN_REVISION") {
      return res.status(400).json({
        success: false,
        message: `Solo se puede rechazar una novedad EN_REVISION. Estado actual: ${novedad.estadoCorreccion}`,
      });
    }

    const userId = req.user?.userId || null;
    const ahora = new Date();

    novedad.estadoCorreccion = "RECHAZADA";
    novedad.resuelta = false;
    novedad.rechazadaPor = userId;
    novedad.fechaRechazo = ahora;
    novedad.motivoRechazo = motivo;
    // No limpiamos fotoCorreccion para mantener el historial

    novedad.historial.push({
      accion: "RECHAZADA",
      usuario: userId,
      fecha: ahora,
      detalle: motivo,
    });

    await preop.save({ validateBeforeSave: false });

    res.json({
      success: true,
      message: "Corrección rechazada. El conductor debe subir una nueva.",
      data: { novedadId, motivo, estadoCorreccion: "RECHAZADA" },
    });
  } catch (error) {
    logger.error(`Error rechazando corrección: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Agregar comentario al historial de una novedad
 * POST /api/preoperacionales/:id/novedades/:novedadId/comentar
 * Body: { comentario: "..." }
 */
exports.comentarNovedad = async (req, res) => {
  try {
    const { id, novedadId } = req.params;
    const { comentario } = req.body;

    if (!comentario || comentario.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "El comentario es obligatorio",
      });
    }

    const preop = await Preoperacional.findOne({ _id: id, deletedAt: null });
    if (!preop) {
      return res
        .status(404)
        .json({ success: false, message: "Preoperacional no encontrada" });
    }

    const acceso = await tieneAccesoVehiculo(req, preop.vehiculo);
    if (!acceso) {
      return res
        .status(403)
        .json({ success: false, message: "No tiene acceso a esta preoperacional" });
    }

    const novedad = preop.novedades.id(novedadId);
    if (!novedad) {
      return res
        .status(404)
        .json({ success: false, message: "Novedad no encontrada" });
    }

    novedad.historial.push({
      accion: "COMENTARIO",
      usuario: req.user?.userId || null,
      fecha: new Date(),
      detalle: comentario,
    });

    await preop.save({ validateBeforeSave: false });

    res.json({
      success: true,
      message: "Comentario agregado",
      data: { novedadId, historial: novedad.historial },
    });
  } catch (error) {
    logger.error(`Error agregando comentario: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Obtener historial completo de auditoría de una preoperacional
 * GET /api/preoperacionales/:id/historial
 * Retorna todas las novedades con su historial completo + info general
 */
exports.getHistorial = async (req, res) => {
  try {
    const { id } = req.params;

    const preop = await Preoperacional.findOne({ _id: id, deletedAt: null })
      .populate("vehiculo", "placa numeroInterno")
      .populate("conductor", "nombres apellidos identificacion")
      .lean();

    if (!preop) {
      return res
        .status(404)
        .json({ success: false, message: "Preoperacional no encontrada" });
    }

    const acceso = await tieneAccesoVehiculo(req, preop.vehiculo?._id);
    if (!acceso) {
      return res
        .status(403)
        .json({ success: false, message: "No tiene acceso a esta preoperacional" });
    }

    // Armar el resumen
    const novedades = (preop.novedades || []).map((n) => ({
      _id: n._id,
      item: n.item,
      tipo: n.tipo,
      descripcion: n.descripcion,
      estadoCorreccion: n.estadoCorreccion,
      resuelta: n.resuelta,
      requiereCorreccion: n.requiereCorreccion,
      fechaLimite: n.fechaLimite,
      fotoFalla: n.fotoFalla,
      fotoCorreccion: n.fotoCorreccion,
      resueltaPor: n.resueltaPor,
      fechaResolucion: n.fechaResolucion,
      validadaPor: n.validadaPor,
      fechaValidacion: n.fechaValidacion,
      observacionesValidacion: n.observacionesValidacion,
      rechazadaPor: n.rechazadaPor,
      fechaRechazo: n.fechaRechazo,
      motivoRechazo: n.motivoRechazo,
      historial: n.historial || [],
    }));

    res.json({
      success: true,
      data: {
        preoperacional: {
          _id: preop._id,
          fecha: preop.fecha,
          estadoGeneral: preop.estadoGeneral,
          vehiculo: preop.vehiculo,
          conductor: preop.conductor,
          creadoPor: preop.creadoPor,
          createdAt: preop.createdAt,
          fechaLimiteNovedades: preop.fechaLimiteNovedades,
        },
        resumen: {
          totalNovedades: novedades.length,
          pendientes: novedades.filter((n) => n.estadoCorreccion === "PENDIENTE").length,
          enRevision: novedades.filter((n) => n.estadoCorreccion === "EN_REVISION").length,
          validadas: novedades.filter((n) => n.estadoCorreccion === "VALIDADA").length,
          rechazadas: novedades.filter((n) => n.estadoCorreccion === "RECHAZADA").length,
        },
        novedades,
      },
    });
  } catch (error) {
    logger.error(`Error obteniendo historial: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Crear anotación en una preoperacional
 * POST /api/preoperacionales/:id/anotaciones
 * Body: { texto, tipo?, fotoFalla?, fotoCorreccion? }
 * Todos los roles con acceso al vehículo pueden crear anotaciones.
 */
exports.crearAnotacion = async (req, res) => {
  try {
    const { id } = req.params;
    const { texto, tipo, fotoFalla, fotoCorreccion, novedadOrigenId, itemOrigen } = req.body;

    if (!texto || texto.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "El texto de la anotación es obligatorio",
      });
    }

    const preop = await Preoperacional.findOne({ _id: id, deletedAt: null });
    if (!preop) {
      return res
        .status(404)
        .json({ success: false, message: "Preoperacional no encontrada" });
    }

    const acceso = await tieneAccesoVehiculo(req, preop.vehiculo);
    if (!acceso) {
      return res.status(403).json({
        success: false,
        message: "No tiene acceso a esta preoperacional",
      });
    }

    const rolesNormalized = (req.user?.roles || []).map((r) =>
      r.replace("ROLE_", "").toUpperCase(),
    );

    const anotacion = {
      texto: texto.trim(),
      tipo: tipo || "GENERAL",
      autor: req.user?.userId || null,
      autorNombre: req.user?.username || null,
      rol: rolesNormalized[0] || null,
      fecha: new Date(),
      novedadOrigenId: novedadOrigenId || null,
      itemOrigen: itemOrigen || null,
      fotoFalla: fotoFalla || null,
      fotoCorreccion: fotoCorreccion || null,
    };

    preop.anotaciones.push(anotacion);
    await preop.save({ validateBeforeSave: false });

    const creada = preop.anotaciones[preop.anotaciones.length - 1];

    res.status(201).json({
      success: true,
      message: "Anotación creada",
      data: creada,
    });
  } catch (error) {
    logger.error(`Error creando anotación: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Listar anotaciones de una preoperacional
 * GET /api/preoperacionales/:id/anotaciones
 */
exports.listarAnotaciones = async (req, res) => {
  try {
    const { id } = req.params;
    const { tipo } = req.query;

    const preop = await Preoperacional.findOne({ _id: id, deletedAt: null })
      .select("vehiculo anotaciones")
      .lean();

    if (!preop) {
      return res
        .status(404)
        .json({ success: false, message: "Preoperacional no encontrada" });
    }

    const acceso = await tieneAccesoVehiculo(req, preop.vehiculo);
    if (!acceso) {
      return res
        .status(403)
        .json({ success: false, message: "No tiene acceso a esta preoperacional" });
    }

    let anotaciones = preop.anotaciones || [];
    if (tipo) {
      anotaciones = anotaciones.filter((a) => a.tipo === tipo);
    }
    // Más recientes primero
    anotaciones.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    res.json({
      success: true,
      data: anotaciones,
    });
  } catch (error) {
    logger.error(`Error listando anotaciones: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Actualizar una anotación (solo el autor o ADMIN)
 * PUT /api/preoperacionales/:id/anotaciones/:anotacionId
 * Body: { texto }
 */
exports.actualizarAnotacion = async (req, res) => {
  try {
    const { id, anotacionId } = req.params;
    const { texto } = req.body;

    if (!texto || texto.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "El texto de la anotación es obligatorio",
      });
    }

    const preop = await Preoperacional.findOne({ _id: id, deletedAt: null });
    if (!preop) {
      return res
        .status(404)
        .json({ success: false, message: "Preoperacional no encontrada" });
    }

    const anotacion = preop.anotaciones.id(anotacionId);
    if (!anotacion) {
      return res
        .status(404)
        .json({ success: false, message: "Anotación no encontrada" });
    }

    // Solo autor o ADMIN puede editar
    const rolesNormalized = (req.user?.roles || []).map((r) =>
      r.replace("ROLE_", "").toUpperCase(),
    );
    const esAdmin = rolesNormalized.includes("ADMIN");
    const esAutor = anotacion.autor === req.user?.userId;

    if (!esAdmin && !esAutor) {
      return res.status(403).json({
        success: false,
        message: "Solo el autor o un administrador puede editar esta anotación",
      });
    }

    // No permitir editar anotaciones de tipo VALIDACION (son automáticas)
    if (anotacion.tipo === "VALIDACION") {
      return res.status(400).json({
        success: false,
        message: "Las anotaciones de validación no se pueden editar",
      });
    }

    anotacion.texto = texto.trim();
    await preop.save({ validateBeforeSave: false });

    res.json({
      success: true,
      message: "Anotación actualizada",
      data: anotacion,
    });
  } catch (error) {
    logger.error(`Error actualizando anotación: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Eliminar una anotación (solo el autor o ADMIN)
 * DELETE /api/preoperacionales/:id/anotaciones/:anotacionId
 */
exports.eliminarAnotacion = async (req, res) => {
  try {
    const { id, anotacionId } = req.params;

    const preop = await Preoperacional.findOne({ _id: id, deletedAt: null });
    if (!preop) {
      return res
        .status(404)
        .json({ success: false, message: "Preoperacional no encontrada" });
    }

    const anotacion = preop.anotaciones.id(anotacionId);
    if (!anotacion) {
      return res
        .status(404)
        .json({ success: false, message: "Anotación no encontrada" });
    }

    const rolesNormalized = (req.user?.roles || []).map((r) =>
      r.replace("ROLE_", "").toUpperCase(),
    );
    const esAdmin = rolesNormalized.includes("ADMIN");
    const esAutor = anotacion.autor === req.user?.userId;

    if (!esAdmin && !esAutor) {
      return res.status(403).json({
        success: false,
        message: "Solo el autor o un administrador puede eliminar esta anotación",
      });
    }

    // No permitir eliminar anotaciones de tipo VALIDACION (son auditoría)
    if (anotacion.tipo === "VALIDACION" && !esAdmin) {
      return res.status(400).json({
        success: false,
        message:
          "Las anotaciones de validación son de auditoría. Solo ADMIN puede eliminarlas.",
      });
    }

    preop.anotaciones.pull(anotacionId);
    await preop.save({ validateBeforeSave: false });

    res.json({ success: true, message: "Anotación eliminada" });
  } catch (error) {
    logger.error(`Error eliminando anotación: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};
