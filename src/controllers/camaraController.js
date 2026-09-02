const MarcaCamara = require("../models/MarcaCamara");
const ModeloCamara = require("../models/ModeloCamara");
const Camara = require("../models/Camara");
const logger = require("../config/logger");

/**
 * Controlador del inventario de cámaras.
 * Todo el módulo es exclusivo de ADMIN (gate en routes/gps.js).
 */

const POPULATE_CAMARA = [
  { path: "marca", select: "nombre" },
  { path: "modelo", select: "nombre" },
];

function historialEntry(req, accion, extra = {}) {
  return {
    accion,
    usuario: req.user?.userId || req.user?.username || null,
    fecha: new Date(),
    ...extra,
  };
}

// ════════════════════════════════════════════════════════════════
// MARCAS
// ════════════════════════════════════════════════════════════════

exports.crearMarcaCamara = async (req, res) => {
  try {
    const marca = await MarcaCamara.create({
      nombre: req.body.nombre,
      descripcion: req.body.descripcion,
    });
    res.status(201).json({ success: true, data: marca });
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(409)
        .json({ success: false, message: "Ya existe una marca con ese nombre" });
    }
    logger.error(`Error creando marca de cámara: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.listarMarcasCamara = async (req, res) => {
  try {
    const { includeDeleted = false } = req.query;
    const query = includeDeleted === "true" ? {} : { deletedAt: null };
    const marcas = await MarcaCamara.find(query).sort({ nombre: 1 });
    res.json({ success: true, data: marcas });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.actualizarMarcaCamara = async (req, res) => {
  try {
    const marca = await MarcaCamara.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { nombre: req.body.nombre, descripcion: req.body.descripcion },
      { new: true, runValidators: true },
    );
    if (!marca)
      return res.status(404).json({ success: false, message: "Marca no encontrada" });
    res.json({ success: true, data: marca });
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(409)
        .json({ success: false, message: "Ya existe una marca con ese nombre" });
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.eliminarMarcaCamara = async (req, res) => {
  try {
    const enUso = await Camara.countDocuments({
      marca: req.params.id,
      deletedAt: null,
    });
    if (enUso > 0) {
      return res.status(409).json({
        success: false,
        message: `No se puede eliminar: hay ${enUso} cámara(s) con esta marca`,
      });
    }
    const marca = await MarcaCamara.findOne({ _id: req.params.id, deletedAt: null });
    if (!marca)
      return res.status(404).json({ success: false, message: "Marca no encontrada" });
    await marca.softDelete(req.user?.userId);
    res.json({ success: true, message: "Marca eliminada" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════════════════════════════
// MODELOS
// ════════════════════════════════════════════════════════════════

exports.crearModeloCamara = async (req, res) => {
  try {
    const modelo = await ModeloCamara.create({
      marca: req.body.marca,
      nombre: req.body.nombre,
      descripcion: req.body.descripcion,
    });
    const populated = await modelo.populate("marca", "nombre");
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Ya existe un modelo con ese nombre para esa marca",
      });
    }
    logger.error(`Error creando modelo de cámara: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.listarModelosCamara = async (req, res) => {
  try {
    const { marca, includeDeleted = false } = req.query;
    const query = includeDeleted === "true" ? {} : { deletedAt: null };
    if (marca) query.marca = marca;
    const modelos = await ModeloCamara.find(query)
      .populate("marca", "nombre")
      .sort({ nombre: 1 });
    res.json({ success: true, data: modelos });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.actualizarModeloCamara = async (req, res) => {
  try {
    const update = {};
    for (const k of ["marca", "nombre", "descripcion"]) {
      if (req.body[k] !== undefined) update[k] = req.body[k];
    }
    const modelo = await ModeloCamara.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      update,
      { new: true, runValidators: true },
    ).populate("marca", "nombre");
    if (!modelo)
      return res.status(404).json({ success: false, message: "Modelo no encontrado" });
    res.json({ success: true, data: modelo });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Ya existe un modelo con ese nombre para esa marca",
      });
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.eliminarModeloCamara = async (req, res) => {
  try {
    const enUso = await Camara.countDocuments({
      modelo: req.params.id,
      deletedAt: null,
    });
    if (enUso > 0) {
      return res.status(409).json({
        success: false,
        message: `No se puede eliminar: hay ${enUso} cámara(s) con este modelo`,
      });
    }
    const modelo = await ModeloCamara.findOne({ _id: req.params.id, deletedAt: null });
    if (!modelo)
      return res.status(404).json({ success: false, message: "Modelo no encontrado" });
    await modelo.softDelete(req.user?.userId);
    res.json({ success: true, message: "Modelo eliminado" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════════════════════════════
// UNIDADES (CÁMARAS)
// ════════════════════════════════════════════════════════════════

/**
 * POST /gps/camaras
 * Crea una o varias cámaras.
 * Body: { marca, modelo, condicion?, observaciones?, serial } — una unidad
 *   ó   { marca, modelo, condicion?, observaciones?, seriales: ["S1","S2"] } — lote
 */
exports.crearCamara = async (req, res) => {
  try {
    const { marca, modelo, condicion, observaciones, serial, seriales } = req.body;

    const modeloDoc = await ModeloCamara.findOne({ _id: modelo, deletedAt: null });
    if (!modeloDoc)
      return res.status(400).json({ success: false, message: "Modelo no válido" });
    if (String(modeloDoc.marca) !== String(marca)) {
      return res
        .status(400)
        .json({ success: false, message: "El modelo no pertenece a la marca indicada" });
    }

    const lista = Array.isArray(seriales) && seriales.length > 0
      ? seriales
      : serial
        ? [serial]
        : [];
    const limpios = [...new Set(
      lista.map((s) => String(s).trim().toUpperCase()).filter(Boolean),
    )];
    if (limpios.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Debe indicar al menos un serial" });
    }

    const existentes = await Camara.find({ serial: { $in: limpios } })
      .select("serial")
      .lean();
    if (existentes.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Seriales ya registrados: ${existentes.map((e) => e.serial).join(", ")}`,
      });
    }

    const docs = await Camara.insertMany(
      limpios.map((s) => ({
        marca,
        modelo,
        serial: s,
        condicion: condicion || "NUEVA",
        observaciones,
        estado: "EN_EMPRESA",
        historial: [historialEntry(req, "CREADA", { estadoNuevo: "EN_EMPRESA" })],
      })),
    );

    res.status(201).json({
      success: true,
      message: `${docs.length} cámara(s) registrada(s)`,
      data: docs,
    });
  } catch (error) {
    logger.error(`Error creando cámara: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * GET /gps/camaras
 * Filtros: ?estado=&marca=&modelo=&search=&includeDeleted=
 */
exports.listarCamaras = async (req, res) => {
  try {
    const { estado, marca, modelo, search, includeDeleted = false } = req.query;
    const query = includeDeleted === "true" ? {} : { deletedAt: null };
    if (estado) query.estado = estado;
    if (marca) query.marca = marca;
    if (modelo) query.modelo = modelo;
    if (search) {
      const rx = new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [
        { serial: rx },
        { "instaladaEn.placa": rx },
        { "instaladaEn.descripcion": rx },
      ];
    }
    const camaras = await Camara.find(query)
      .populate(POPULATE_CAMARA)
      .sort({ createdAt: -1 });
    res.json({ success: true, data: camaras, total: camaras.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /gps/camaras/resumen — KPIs del inventario de cámaras
 */
exports.resumenCamaras = async (req, res) => {
  try {
    const porEstadoAgg = await Camara.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: "$estado", total: { $sum: 1 } } },
    ]);
    const porEstado = Object.fromEntries(porEstadoAgg.map((x) => [x._id, x.total]));

    const porModelo = await Camara.aggregate([
      { $match: { deletedAt: null } },
      {
        $group: {
          _id: { marca: "$marca", modelo: "$modelo" },
          total: { $sum: 1 },
          enEmpresa: { $sum: { $cond: [{ $eq: ["$estado", "EN_EMPRESA"] }, 1, 0] } },
          instaladas: { $sum: { $cond: [{ $eq: ["$estado", "INSTALADA"] }, 1, 0] } },
          descartadas: { $sum: { $cond: [{ $eq: ["$estado", "DESCARTADA"] }, 1, 0] } },
        },
      },
      {
        $lookup: { from: "marcacamaras", localField: "_id.marca", foreignField: "_id", as: "_marca" },
      },
      {
        $lookup: { from: "modelocamaras", localField: "_id.modelo", foreignField: "_id", as: "_modelo" },
      },
      {
        $project: {
          _id: 0,
          marca: { $arrayElemAt: ["$_marca.nombre", 0] },
          modelo: { $arrayElemAt: ["$_modelo.nombre", 0] },
          total: 1,
          enEmpresa: 1,
          instaladas: 1,
          descartadas: 1,
        },
      },
      { $sort: { marca: 1, modelo: 1 } },
    ]);

    res.json({
      success: true,
      data: {
        total: porEstadoAgg.reduce((s, x) => s + x.total, 0),
        porEstado,
        porModelo,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.obtenerCamara = async (req, res) => {
  try {
    const camara = await Camara.findById(req.params.id).populate(POPULATE_CAMARA);
    if (!camara)
      return res.status(404).json({ success: false, message: "Cámara no encontrada" });
    res.json({ success: true, data: camara });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.actualizarCamara = async (req, res) => {
  try {
    const camara = await Camara.findOne({ _id: req.params.id, deletedAt: null });
    if (!camara)
      return res.status(404).json({ success: false, message: "Cámara no encontrada" });

    const campos = ["marca", "modelo", "serial", "condicion", "observaciones"];
    for (const k of campos) {
      if (req.body[k] !== undefined) camara[k] = req.body[k];
    }
    camara.historial.push(historialEntry(req, "ACTUALIZADA", {
      observaciones: req.body.motivoEdicion || undefined,
    }));
    await camara.save();
    const populated = await Camara.findById(camara._id).populate(POPULATE_CAMARA);
    res.json({ success: true, data: populated });
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(409)
        .json({ success: false, message: "Ya existe una cámara con ese serial" });
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.eliminarCamara = async (req, res) => {
  try {
    const camara = await Camara.findOne({ _id: req.params.id, deletedAt: null });
    if (!camara)
      return res.status(404).json({ success: false, message: "Cámara no encontrada" });
    await camara.softDelete(req.user?.userId);
    res.json({ success: true, message: "Cámara eliminada" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════════════════════════════
// ACCIONES: INSTALAR / RETIRAR / DESCARTAR / REINGRESAR
// ════════════════════════════════════════════════════════════════

/**
 * POST /gps/camaras/:id/instalar
 * Body: { tipo: "VEHICULO"|"SITIO", placa?, descripcion?, observaciones? }
 */
exports.instalarCamara = async (req, res) => {
  try {
    const { tipo = "VEHICULO", placa, descripcion, observaciones } = req.body;
    if (tipo === "VEHICULO" && !placa) {
      return res
        .status(400)
        .json({ success: false, message: "Debe indicar la placa del vehículo" });
    }
    if (tipo === "SITIO" && !descripcion) {
      return res
        .status(400)
        .json({ success: false, message: "Debe describir el sitio de instalación" });
    }

    const camara = await Camara.findOne({ _id: req.params.id, deletedAt: null });
    if (!camara)
      return res.status(404).json({ success: false, message: "Cámara no encontrada" });
    if (camara.estado !== "EN_EMPRESA") {
      return res.status(409).json({
        success: false,
        message: `Solo se puede instalar una cámara EN_EMPRESA (estado actual: ${camara.estado})`,
      });
    }

    const destino = tipo === "VEHICULO"
      ? `Vehículo ${String(placa).toUpperCase()}${descripcion ? ` — ${descripcion}` : ""}`
      : descripcion;

    camara.estado = "INSTALADA";
    camara.instaladaEn = { tipo, placa: placa || undefined, descripcion: descripcion || undefined };
    camara.fechaInstalacion = new Date();
    camara.fechaRetiro = undefined;
    camara.historial.push(historialEntry(req, "INSTALADA", {
      estadoAnterior: "EN_EMPRESA",
      estadoNuevo: "INSTALADA",
      ubicacionNueva: destino,
      observaciones,
    }));
    await camara.save();
    const populated = await Camara.findById(camara._id).populate(POPULATE_CAMARA);
    res.json({ success: true, message: `Cámara instalada en ${destino}`, data: populated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * POST /gps/camaras/:id/retirar
 * Body: { motivo?, observaciones? } — la cámara vuelve a EN_EMPRESA
 */
exports.retirarCamara = async (req, res) => {
  try {
    const { motivo, observaciones } = req.body;
    const camara = await Camara.findOne({ _id: req.params.id, deletedAt: null });
    if (!camara)
      return res.status(404).json({ success: false, message: "Cámara no encontrada" });
    if (camara.estado !== "INSTALADA") {
      return res.status(409).json({
        success: false,
        message: `Solo se puede retirar una cámara INSTALADA (estado actual: ${camara.estado})`,
      });
    }

    const origen = camara.instaladaEn?.placa
      ? `Vehículo ${camara.instaladaEn.placa}`
      : camara.instaladaEn?.descripcion || "instalación anterior";

    camara.estado = "EN_EMPRESA";
    camara.instaladaEn = undefined;
    camara.fechaRetiro = new Date();
    camara.historial.push(historialEntry(req, "RETIRADA", {
      estadoAnterior: "INSTALADA",
      estadoNuevo: "EN_EMPRESA",
      ubicacionAnterior: origen,
      motivo,
      observaciones,
    }));
    await camara.save();
    const populated = await Camara.findById(camara._id).populate(POPULATE_CAMARA);
    res.json({
      success: true,
      message: `Cámara retirada de ${origen}; vuelve al inventario de la empresa`,
      data: populated,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * POST /gps/camaras/:id/descartar
 * Body: { motivo?, observaciones? }
 */
exports.descartarCamara = async (req, res) => {
  try {
    const { motivo, observaciones } = req.body;
    const camara = await Camara.findOne({ _id: req.params.id, deletedAt: null });
    if (!camara)
      return res.status(404).json({ success: false, message: "Cámara no encontrada" });
    if (camara.estado === "DESCARTADA") {
      return res
        .status(409)
        .json({ success: false, message: "La cámara ya está descartada" });
    }

    const estadoAnterior = camara.estado;
    const origen = camara.instaladaEn?.placa
      ? `Vehículo ${camara.instaladaEn.placa}`
      : camara.instaladaEn?.descripcion || null;

    camara.estado = "DESCARTADA";
    camara.instaladaEn = undefined;
    camara.fechaRetiro = new Date();
    camara.historial.push(historialEntry(req, "DESCARTADA", {
      estadoAnterior,
      estadoNuevo: "DESCARTADA",
      ubicacionAnterior: origen || undefined,
      motivo,
      observaciones,
    }));
    await camara.save();
    const populated = await Camara.findById(camara._id).populate(POPULATE_CAMARA);
    res.json({ success: true, message: "Cámara descartada", data: populated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * POST /gps/camaras/:id/reingresar — deshace un descarte (vuelve a EN_EMPRESA)
 */
exports.reingresarCamara = async (req, res) => {
  try {
    const camara = await Camara.findOne({ _id: req.params.id, deletedAt: null });
    if (!camara)
      return res.status(404).json({ success: false, message: "Cámara no encontrada" });
    if (camara.estado !== "DESCARTADA") {
      return res.status(409).json({
        success: false,
        message: "Solo se puede reingresar una cámara DESCARTADA",
      });
    }
    camara.estado = "EN_EMPRESA";
    camara.historial.push(historialEntry(req, "REINGRESADA", {
      estadoAnterior: "DESCARTADA",
      estadoNuevo: "EN_EMPRESA",
      observaciones: req.body.observaciones,
    }));
    await camara.save();
    const populated = await Camara.findById(camara._id).populate(POPULATE_CAMARA);
    res.json({ success: true, message: "Cámara reingresada al inventario", data: populated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
