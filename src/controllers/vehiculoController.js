const Vehiculo = require("../models/Vehiculo");
const Documento = require("../models/Documento");
const Preoperacional = require("../models/Preoperacional");
const ContratoFuec = require("../models/ContratoFUEC");
const { getVehicleScope } = require("../utils/dataScope");
const { deleteDocumentosWithS3, cleanEntidadesAsociadas } = require("../helpers/cascadeDelete");
const logger = require("../config/logger");

/**
 * Helper: Adjuntar documentos asociados a una lista de vehículos (.lean())
 */
async function attachDocumentos(vehiculos) {
  if (!vehiculos.length) return vehiculos;

  const vehiculoIds = vehiculos.map((v) => v._id);
  const allDocumentos = await Documento.find({
    $or: [
      { entidadId: { $in: vehiculoIds }, entidadModelo: "Vehiculo" },
      { "entidadesAsociadas.entidadId": { $in: vehiculoIds } },
    ],
    deletedAt: null,
  })
    .select(
      "_id tipoDocumento numero entidadEmisora fechaExpedicion fechaVencimiento estado archivo.url entidadId entidadesAsociadas",
    )
    .sort({ fechaVencimiento: 1 })
    .lean();

  return vehiculos.map((vehiculo) => {
    const docs = allDocumentos.filter(
      (doc) =>
        doc.entidadId.toString() === vehiculo._id.toString() ||
        (doc.entidadesAsociadas || []).some(
          (ea) => ea.entidadId.toString() === vehiculo._id.toString(),
        ),
    );
    return { ...vehiculo, documentos: docs };
  });
}

// Crear Vehículo (ADMIN o CLIENTE_ADMIN)
exports.create = async (req, res) => {
  try {
    const vehiculo = new Vehiculo(req.body);
    await vehiculo.save();
    res.status(201).json({ success: true, data: vehiculo });
  } catch (error) {
    logger.error(`Error creando vehículo: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

// Listar (scope de seguridad + soft-delete excluido por defecto)
exports.getAll = async (req, res) => {
  try {
    const { page = 1, limit = 50, placa, includeDeleted = false } = req.query;

    const scopeQuery = getVehicleScope(req);
    const conditions = [];

    if (Object.keys(scopeQuery).length > 0) {
      conditions.push(scopeQuery);
    }
    if (!includeDeleted || includeDeleted === "false") {
      conditions.push({ deletedAt: null });
    }
    if (placa) {
      conditions.push({ placa: new RegExp(placa, "i") });
    }

    const query = conditions.length > 0 ? { $and: conditions } : {};

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const vehiculos = await Vehiculo.find(query)
      .limit(parseInt(limit))
      .skip(skip)
      .populate("propietario", "nombres apellidos razonSocial identificacion")
      .lean();

    const vehiculosConDocs = await attachDocumentos(vehiculos);
    const total = await Vehiculo.countDocuments(query);

    res.json({
      success: true,
      data: vehiculosConDocs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error(`Error listando vehículos: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Listado resumido para selectores (Solo ADMIN / CLIENTE_ADMIN)
exports.getList = async (req, res) => {
  try {
    const { page = 1, limit = 50, search, includeDeleted = false } = req.query;
    const query = {};

    if (!includeDeleted || includeDeleted === "false") {
      query.deletedAt = null;
    }

    if (search) {
      query.placa = new RegExp(search, "i");
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const vehiculos = await Vehiculo.find(query)
      .select("placa")
      .limit(parseInt(limit))
      .skip(skip)
      .sort({ placa: 1 })
      .lean();

    const total = await Vehiculo.countDocuments(query);

    res.json({
      success: true,
      data: vehiculos,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error(`Error listando vehículos (resumen): ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Obtener uno por ID o Placa
exports.getOne = async (req, res) => {
  try {
    const { id } = req.params;
    let vehiculo;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      vehiculo = await Vehiculo.findOne({ _id: id, deletedAt: null }).populate(
        "propietario",
      );
    } else {
      vehiculo = await Vehiculo.findOne({
        placa: id.toUpperCase(),
        deletedAt: null,
      }).populate("propietario");
    }

    if (!vehiculo)
      return res
        .status(404)
        .json({ success: false, message: "Vehículo no encontrado" });

    const [vehiculoConDocs] = await attachDocumentos([vehiculo.toObject()]);
    res.json({ success: true, data: vehiculoConDocs });
  } catch (error) {
    logger.error(`Error obteniendo vehículo: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Obtener lista por idCellvi
exports.getByCellviId = async (req, res) => {
  try {
    const { idCellvi } = req.params;

    const scopeQuery = getVehicleScope(req);
    const conditions = [{ idCellvi }, { deletedAt: null }];

    if (Object.keys(scopeQuery).length > 0) {
      conditions.push(scopeQuery);
    }

    const vehiculos = await Vehiculo.find({ $and: conditions })
      .populate("propietario", "nombres apellidos razonSocial identificacion")
      .lean();

    const vehiculosConDocs = await attachDocumentos(vehiculos);

    // Verificar preoperativa diaria para cada vehículo
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    const vehiculoIds = vehiculos.map((v) => v._id);
    const preopsHoy = await Preoperacional.find({
      vehiculo: { $in: vehiculoIds },
      fecha: { $gte: hoy, $lt: manana },
      deletedAt: null,
    })
      .select("vehiculo")
      .lean();

    const vehiculosConPreop = vehiculosConDocs.map((v) => ({
      ...v,
      preoperativaDiaria: preopsHoy.some(
        (p) => p.vehiculo.toString() === v._id.toString(),
      ),
    }));

    res.json({
      success: true,
      data: vehiculosConPreop,
      total: vehiculosConPreop.length,
    });
  } catch (error) {
    logger.error(`Error obteniendo vehículos por idCellvi: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Actualizar
exports.update = async (req, res) => {
  try {
    const vehiculo = await Vehiculo.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!vehiculo)
      return res
        .status(404)
        .json({ success: false, message: "Vehículo no encontrado" });

    Object.assign(vehiculo, req.body);
    await vehiculo.save();
    res.json({ success: true, data: vehiculo });
  } catch (error) {
    logger.error(`Error actualizando vehículo: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

// Soft Delete
exports.softDelete = async (req, res) => {
  try {
    const vehiculo = await Vehiculo.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!vehiculo)
      return res
        .status(404)
        .json({ success: false, message: "Vehículo no encontrado" });

    await vehiculo.softDelete(req.user?.userId || null);
    res.json({
      success: true,
      message: "Vehículo eliminado temporalmente",
      data: vehiculo,
    });
  } catch (error) {
    logger.error(`Error soft-delete vehículo: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Restaurar
exports.restore = async (req, res) => {
  try {
    const vehiculo = await Vehiculo.findById(req.params.id);
    if (!vehiculo)
      return res
        .status(404)
        .json({ success: false, message: "Vehículo no encontrado" });
    if (!vehiculo.deletedAt)
      return res
        .status(400)
        .json({ success: false, message: "El vehículo no está eliminado" });

    await vehiculo.restore();
    res.json({ success: true, message: "Vehículo restaurado", data: vehiculo });
  } catch (error) {
    logger.error(`Error restaurando vehículo: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Hard Delete con cascada (Solo ADMIN)
exports.hardDelete = async (req, res) => {
  try {
    const vehiculoId = req.params.id;
    const vehiculo = await Vehiculo.findById(vehiculoId);
    if (!vehiculo)
      return res
        .status(404)
        .json({ success: false, message: "Vehículo no encontrado" });

    // Validar: bloquear si tiene contratos activos
    const contratosActivos = await ContratoFuec.countDocuments({
      vehiculo: vehiculoId,
      estado: { $in: ["ACTIVO", "GENERADO"] },
      deletedAt: null,
    });
    if (contratosActivos > 0) {
      return res.status(409).json({
        success: false,
        message: `No se puede eliminar: el vehículo tiene ${contratosActivos} contrato(s) activo(s). Anúlelos primero.`,
      });
    }

    // 1. Soft delete + anular contratos restantes del vehículo
    await ContratoFuec.updateMany(
      { vehiculo: vehiculoId, deletedAt: null },
      { $set: { deletedAt: new Date(), deletedBy: req.user?.userId || null, estado: "ANULADO" } },
    );

    // 2. Hard delete preoperacionales del vehículo
    await Preoperacional.deleteMany({ vehiculo: vehiculoId });

    // 3. Hard delete documentos directos + limpiar S3
    await deleteDocumentosWithS3({
      entidadId: vehiculoId,
      entidadModelo: "Vehiculo",
    });

    // 4. Limpiar de entidadesAsociadas en otros documentos
    await cleanEntidadesAsociadas([vehiculo._id], "Vehiculo");

    // 5. Hard delete el vehículo
    await vehiculo.deleteOne();

    logger.info(`Hard delete vehículo ${vehiculo.placa} (${vehiculoId}) con cascada completa`);
    res.json({ success: true, message: "Vehículo y datos asociados eliminados permanentemente" });
  } catch (error) {
    logger.error(`Error hard-delete vehículo: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};
