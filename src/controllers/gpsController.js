const MarcaGPS = require("../models/MarcaGPS");
const ModeloGPS = require("../models/ModeloGPS");
const CiudadGPS = require("../models/CiudadGPS");
const TecnicoGPS = require("../models/TecnicoGPS");
const EquipoGPS = require("../models/EquipoGPS");
const ActividadGPS = require("../models/ActividadGPS");
const Vehiculo = require("../models/Vehiculo");
const logger = require("../config/logger");

// ════════════════════════════════════════════════════════════════
// MARCA GPS
// ════════════════════════════════════════════════════════════════

exports.crearMarca = async (req, res) => {
  try {
    const marca = await MarcaGPS.create(req.body);
    res.status(201).json({ success: true, data: marca });
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(409)
        .json({ success: false, message: "Ya existe una marca con ese nombre" });
    }
    logger.error(`Error creando marca GPS: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.listarMarcas = async (req, res) => {
  try {
    const { includeDeleted = false, search } = req.query;
    const query = {};
    if (!includeDeleted || includeDeleted === "false") query.deletedAt = null;
    if (search) query.nombre = new RegExp(search, "i");

    const marcas = await MarcaGPS.find(query).sort({ nombre: 1 }).lean();

    // Conteos de modelos y equipos por marca (solo no eliminados).
    const ids = marcas.map((m) => m._id);
    const [modelosAgg, equiposAgg] = await Promise.all([
      ModeloGPS.aggregate([
        { $match: { marca: { $in: ids }, deletedAt: null } },
        { $group: { _id: "$marca", total: { $sum: 1 } } },
      ]),
      EquipoGPS.aggregate([
        { $match: { marca: { $in: ids }, deletedAt: null } },
        { $group: { _id: "$marca", total: { $sum: 1 } } },
      ]),
    ]);
    const modelosPorMarca = Object.fromEntries(
      modelosAgg.map((x) => [x._id.toString(), x.total]),
    );
    const equiposPorMarca = Object.fromEntries(
      equiposAgg.map((x) => [x._id.toString(), x.total]),
    );
    const data = marcas.map((m) => ({
      ...m,
      totalModelos: modelosPorMarca[m._id.toString()] || 0,
      totalEquipos: equiposPorMarca[m._id.toString()] || 0,
    }));

    res.json({ success: true, data });
  } catch (error) {
    logger.error(`Error listando marcas GPS: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.obtenerMarca = async (req, res) => {
  try {
    const marca = await MarcaGPS.findOne({
      _id: req.params.id,
      deletedAt: null,
    }).lean();
    if (!marca)
      return res
        .status(404)
        .json({ success: false, message: "Marca no encontrada" });

    const modelos = await ModeloGPS.find({
      marca: marca._id,
      deletedAt: null,
    })
      .sort({ nombre: 1 })
      .lean();
    res.json({ success: true, data: { ...marca, modelos } });
  } catch (error) {
    logger.error(`Error obteniendo marca GPS: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.actualizarMarca = async (req, res) => {
  try {
    const marca = await MarcaGPS.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      req.body,
      { new: true, runValidators: true },
    );
    if (!marca)
      return res
        .status(404)
        .json({ success: false, message: "Marca no encontrada" });
    res.json({ success: true, data: marca });
  } catch (error) {
    logger.error(`Error actualizando marca GPS: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.eliminarMarca = async (req, res) => {
  try {
    const marca = await MarcaGPS.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!marca)
      return res
        .status(404)
        .json({ success: false, message: "Marca no encontrada" });

    // No borrar si tiene modelos con equipos vinculados.
    const modelos = await ModeloGPS.find({ marca: marca._id, deletedAt: null })
      .select("_id")
      .lean();
    const equipos = await EquipoGPS.countDocuments({
      modelo: { $in: modelos.map((m) => m._id) },
      deletedAt: null,
    });
    if (equipos > 0) {
      return res.status(409).json({
        success: false,
        message: `No se puede eliminar: la marca tiene ${equipos} equipo(s) registrados`,
      });
    }

    await marca.softDelete(req.user?.userId);
    res.json({ success: true, message: "Marca eliminada" });
  } catch (error) {
    logger.error(`Error eliminando marca GPS: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════════════════════════════
// MODELO GPS
// ════════════════════════════════════════════════════════════════

exports.crearModelo = async (req, res) => {
  try {
    const marca = await MarcaGPS.findOne({
      _id: req.body.marca,
      deletedAt: null,
    });
    if (!marca)
      return res
        .status(404)
        .json({ success: false, message: "Marca no encontrada" });

    const modelo = await ModeloGPS.create(req.body);
    res.status(201).json({ success: true, data: modelo });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Ya existe un modelo con ese nombre para esta marca",
      });
    }
    logger.error(`Error creando modelo GPS: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.listarModelos = async (req, res) => {
  try {
    const { marca, includeDeleted = false } = req.query;
    const query = {};
    if (!includeDeleted || includeDeleted === "false") query.deletedAt = null;
    if (marca) query.marca = marca;

    const modelos = await ModeloGPS.find(query)
      .populate("marca", "nombre")
      .sort({ nombre: 1 })
      .lean();
    res.json({ success: true, data: modelos });
  } catch (error) {
    logger.error(`Error listando modelos GPS: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.obtenerModelo = async (req, res) => {
  try {
    const modelo = await ModeloGPS.findOne({
      _id: req.params.id,
      deletedAt: null,
    })
      .populate("marca", "nombre")
      .lean();
    if (!modelo)
      return res
        .status(404)
        .json({ success: false, message: "Modelo no encontrado" });
    res.json({ success: true, data: modelo });
  } catch (error) {
    logger.error(`Error obteniendo modelo GPS: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.actualizarModelo = async (req, res) => {
  try {
    const modelo = await ModeloGPS.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      req.body,
      { new: true, runValidators: true },
    );
    if (!modelo)
      return res
        .status(404)
        .json({ success: false, message: "Modelo no encontrado" });
    res.json({ success: true, data: modelo });
  } catch (error) {
    logger.error(`Error actualizando modelo GPS: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.eliminarModelo = async (req, res) => {
  try {
    const modelo = await ModeloGPS.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!modelo)
      return res
        .status(404)
        .json({ success: false, message: "Modelo no encontrado" });

    const equipos = await EquipoGPS.countDocuments({
      modelo: modelo._id,
      deletedAt: null,
    });
    if (equipos > 0) {
      return res.status(409).json({
        success: false,
        message: `No se puede eliminar: el modelo tiene ${equipos} equipo(s) registrados`,
      });
    }

    await modelo.softDelete(req.user?.userId);
    res.json({ success: true, message: "Modelo eliminado" });
  } catch (error) {
    logger.error(`Error eliminando modelo GPS: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════════════════════════════
// CIUDAD GPS
// ════════════════════════════════════════════════════════════════

exports.crearCiudad = async (req, res) => {
  try {
    const ciudad = await CiudadGPS.create(req.body);
    res.status(201).json({ success: true, data: ciudad });
  } catch (error) {
    if (error.code === 11000) {
      // Si la colisión es por esCentral, dar mensaje específico
      if (error.keyPattern?.esCentral) {
        return res.status(409).json({
          success: false,
          message: "Ya existe una ciudad central registrada",
        });
      }
      return res.status(409).json({
        success: false,
        message: "Ya existe una ciudad con ese nombre",
      });
    }
    logger.error(`Error creando ciudad GPS: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.listarCiudades = async (req, res) => {
  try {
    const { includeDeleted = false } = req.query;
    const query = {};
    if (!includeDeleted || includeDeleted === "false") query.deletedAt = null;
    const ciudades = await CiudadGPS.find(query).sort({ nombre: 1 }).lean();
    res.json({ success: true, data: ciudades });
  } catch (error) {
    logger.error(`Error listando ciudades GPS: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.obtenerCiudad = async (req, res) => {
  try {
    const ciudad = await CiudadGPS.findOne({
      _id: req.params.id,
      deletedAt: null,
    }).lean();
    if (!ciudad)
      return res
        .status(404)
        .json({ success: false, message: "Ciudad no encontrada" });
    res.json({ success: true, data: ciudad });
  } catch (error) {
    logger.error(`Error obteniendo ciudad GPS: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.actualizarCiudad = async (req, res) => {
  try {
    const ciudad = await CiudadGPS.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      req.body,
      { new: true, runValidators: true },
    );
    if (!ciudad)
      return res
        .status(404)
        .json({ success: false, message: "Ciudad no encontrada" });
    res.json({ success: true, data: ciudad });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.esCentral) {
      return res.status(409).json({
        success: false,
        message: "Ya existe una ciudad central registrada",
      });
    }
    logger.error(`Error actualizando ciudad GPS: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.eliminarCiudad = async (req, res) => {
  try {
    const ciudad = await CiudadGPS.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!ciudad)
      return res
        .status(404)
        .json({ success: false, message: "Ciudad no encontrada" });

    if (ciudad.esCentral) {
      return res.status(409).json({
        success: false,
        message: "No se puede eliminar la ciudad central",
      });
    }

    const [equipos, tecnicos] = await Promise.all([
      EquipoGPS.countDocuments({ ciudad: ciudad._id, deletedAt: null }),
      TecnicoGPS.countDocuments({ ciudad: ciudad._id, deletedAt: null }),
    ]);
    if (equipos > 0 || tecnicos > 0) {
      return res.status(409).json({
        success: false,
        message: `No se puede eliminar: la ciudad tiene ${equipos} equipo(s) y ${tecnicos} técnico(s)`,
      });
    }

    await ciudad.softDelete(req.user?.userId);
    res.json({ success: true, message: "Ciudad eliminada" });
  } catch (error) {
    logger.error(`Error eliminando ciudad GPS: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════════════════════════════
// TÉCNICO GPS
// ════════════════════════════════════════════════════════════════

exports.crearTecnico = async (req, res) => {
  try {
    const ciudad = await CiudadGPS.findOne({
      _id: req.body.ciudad,
      deletedAt: null,
    });
    if (!ciudad)
      return res
        .status(404)
        .json({ success: false, message: "Ciudad no encontrada" });

    const tecnico = await TecnicoGPS.create(req.body);
    res.status(201).json({ success: true, data: tecnico });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Ya existe un técnico con esa identificación",
      });
    }
    logger.error(`Error creando técnico GPS: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.listarTecnicos = async (req, res) => {
  try {
    const { ciudad, estado, includeDeleted = false, search } = req.query;
    const query = {};
    if (!includeDeleted || includeDeleted === "false") query.deletedAt = null;
    if (ciudad) query.ciudad = ciudad;
    if (estado) query.estado = estado;
    if (search) {
      query.$or = [
        { nombres: new RegExp(search, "i") },
        { apellidos: new RegExp(search, "i") },
        { identificacion: new RegExp(search, "i") },
      ];
    }

    const tecnicos = await TecnicoGPS.find(query)
      .populate("ciudad", "nombre departamento")
      .sort({ apellidos: 1, nombres: 1 })
      .lean();
    res.json({ success: true, data: tecnicos });
  } catch (error) {
    logger.error(`Error listando técnicos GPS: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /tecnicos/:id/equipos
 * Lista todos los equipos en posesión actual del técnico (EN_TRANSITO,
 * EN_POSESION_TECNICO, INSTALADO o EN_REVISION). Filtros opcionales por estado.
 */
exports.equiposPorTecnico = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.query;

    const tecnico = await TecnicoGPS.findOne({ _id: id, deletedAt: null })
      .populate("ciudad", "nombre departamento")
      .lean();
    if (!tecnico)
      return res
        .status(404)
        .json({ success: false, message: "Técnico no encontrado" });

    const estadosPosesion = [
      "EN_TRANSITO",
      "EN_POSESION_TECNICO",
      "INSTALADO",
      "EN_REVISION",
    ];
    const filtroEstado = estado
      ? estadosPosesion.includes(estado)
        ? [estado]
        : []
      : estadosPosesion;

    const query = {
      tecnico: tecnico._id,
      deletedAt: null,
    };
    if (filtroEstado.length) query.estado = { $in: filtroEstado };

    const equipos = await EquipoGPS.find(query)
      .populate("marca", "nombre")
      .populate("modelo", "nombre")
      .populate("ciudad", "nombre esCentral")
      .populate("vehiculoInstalado", "placa numeroInterno")
      .sort({ updatedAt: -1 })
      .lean();

    // Resumen por estado
    const porEstado = {};
    for (const e of equipos) {
      porEstado[e.estado] = (porEstado[e.estado] || 0) + 1;
    }

    res.json({
      success: true,
      data: {
        tecnico: {
          _id: tecnico._id,
          nombres: tecnico.nombres,
          apellidos: tecnico.apellidos,
          identificacion: tecnico.identificacion,
          ciudad: tecnico.ciudad,
        },
        total: equipos.length,
        porEstado,
        equipos,
      },
    });
  } catch (error) {
    logger.error(`Error listando equipos del técnico: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.obtenerTecnico = async (req, res) => {
  try {
    const tecnico = await TecnicoGPS.findOne({
      _id: req.params.id,
      deletedAt: null,
    })
      .populate("ciudad", "nombre departamento")
      .lean();
    if (!tecnico)
      return res
        .status(404)
        .json({ success: false, message: "Técnico no encontrado" });

    // Equipos en posesión actual
    const equipos = await EquipoGPS.find({
      tecnico: tecnico._id,
      estado: { $in: ["EN_TRANSITO", "INSTALADO", "EN_REVISION"] },
      deletedAt: null,
    })
      .populate("marca", "nombre")
      .populate("modelo", "nombre")
      .lean();

    res.json({ success: true, data: { ...tecnico, equipos } });
  } catch (error) {
    logger.error(`Error obteniendo técnico GPS: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.actualizarTecnico = async (req, res) => {
  try {
    const tecnico = await TecnicoGPS.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      req.body,
      { new: true, runValidators: true },
    );
    if (!tecnico)
      return res
        .status(404)
        .json({ success: false, message: "Técnico no encontrado" });
    res.json({ success: true, data: tecnico });
  } catch (error) {
    logger.error(`Error actualizando técnico GPS: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.eliminarTecnico = async (req, res) => {
  try {
    const tecnico = await TecnicoGPS.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!tecnico)
      return res
        .status(404)
        .json({ success: false, message: "Técnico no encontrado" });

    const equipos = await EquipoGPS.countDocuments({
      tecnico: tecnico._id,
      estado: { $in: ["EN_TRANSITO", "INSTALADO", "EN_REVISION"] },
      deletedAt: null,
    });
    if (equipos > 0) {
      return res.status(409).json({
        success: false,
        message: `No se puede eliminar: el técnico tiene ${equipos} equipo(s) en su posesión`,
      });
    }

    await tecnico.softDelete(req.user?.userId);
    res.json({ success: true, message: "Técnico eliminado" });
  } catch (error) {
    logger.error(`Error eliminando técnico GPS: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════════════════════════════
// EQUIPO GPS
// ════════════════════════════════════════════════════════════════

async function getCiudadCentral() {
  return CiudadGPS.findOne({ esCentral: true, deletedAt: null });
}

/**
 * Resumen global de equipos INSTALADO, agrupado por marca/modelo con desglose
 * por condición. Los instalados no pertenecen al inventario de ninguna ciudad
 * (no sabemos su ubicación real), por eso se reportan en su propia sección.
 */
async function resumenInstaladosGlobal() {
  const agg = await EquipoGPS.aggregate([
    { $match: { deletedAt: null, estado: "INSTALADO" } },
    {
      $lookup: {
        from: "marcagps",
        localField: "marca",
        foreignField: "_id",
        as: "_marca",
      },
    },
    {
      $lookup: {
        from: "modelogps",
        localField: "modelo",
        foreignField: "_id",
        as: "_modelo",
      },
    },
    {
      $group: {
        _id: {
          marca: { $arrayElemAt: ["$_marca.nombre", 0] },
          modelo: { $arrayElemAt: ["$_modelo.nombre", 0] },
          condicion: "$condicion",
        },
        total: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        marca: "$_id.marca",
        modelo: "$_id.modelo",
        condicion: "$_id.condicion",
        total: 1,
      },
    },
    { $sort: { marca: 1, modelo: 1 } },
  ]);

  const map = {};
  for (const r of agg) {
    const key = `${r.marca || "?"} ${r.modelo || "?"}`;
    if (!map[key]) {
      map[key] = { marca: r.marca, modelo: r.modelo, nuevos: 0, segunda: 0, total: 0 };
    }
    if (r.condicion === "NUEVO") map[key].nuevos += r.total;
    else if (r.condicion === "SEGUNDA") map[key].segunda += r.total;
    map[key].total += r.total;
  }
  const modelos = Object.values(map);
  return {
    totalEquipos: modelos.reduce((s, m) => s + m.total, 0),
    modelos,
  };
}

exports.crearEquipo = async (req, res) => {
  try {
    const { marca, modelo, ciudad } = req.body;

    // Validar marca/modelo coherentes
    const modeloDoc = await ModeloGPS.findOne({
      _id: modelo,
      deletedAt: null,
    });
    if (!modeloDoc)
      return res
        .status(404)
        .json({ success: false, message: "Modelo no encontrado" });
    if (modeloDoc.marca.toString() !== marca.toString()) {
      return res.status(400).json({
        success: false,
        message: "El modelo no pertenece a la marca indicada",
      });
    }

    // Si no se especifica ciudad, usa la central
    let ciudadFinal = ciudad;
    if (!ciudadFinal) {
      const central = await getCiudadCentral();
      if (!central) {
        return res.status(400).json({
          success: false,
          message:
            "No hay ciudad central registrada. Cree primero la ciudad central (Pasto).",
        });
      }
      ciudadFinal = central._id;
    }

    const condicion = req.body.condicion || "NUEVO";
    const instalarDirecto = req.body.estado === "INSTALADO";

    const doc = {
      ...req.body,
      ciudad: ciudadFinal,
      condicion,
      estado: "DISPONIBLE",
    };

    if (instalarDirecto) {
      // Registro directo en producción: el equipo nunca pasó por inventario.
      // Resolver vehículo por placa (si está en la flota).
      const placa = (req.body.placaInstalada || "").toUpperCase();
      let vehiculoRef = null;
      if (placa) {
        const veh = await Vehiculo.findOne({ placa, deletedAt: null })
          .select("_id")
          .lean();
        if (veh) vehiculoRef = veh._id;
      }
      // Propiedad: COMODATO auto-completa el propietario.
      const tipoPropiedad = req.body.tipoPropiedad || "COMODATO";
      let propietarioNombre = req.body.propietarioNombre;
      if (tipoPropiedad === "COMODATO")
        propietarioNombre = propietarioNombre || "ASEGURAR LTDA";

      const fechaInstalacion = req.body.fechaInstalacion
        ? new Date(req.body.fechaInstalacion)
        : new Date();

      Object.assign(doc, {
        estado: "INSTALADO",
        placaInstalada: placa || null,
        vehiculoInstalado: vehiculoRef,
        lineaSim: req.body.lineaSim || null,
        numeroSim: req.body.numeroSim || null,
        tipoPropiedad,
        propietarioNombre,
        fechaInstalacion,
        yaUsado: true,
        historial: [
          {
            accion: "INSTALADO",
            estadoNuevo: "INSTALADO",
            ciudadDestino: ciudadFinal,
            usuario: req.user?.userId || null,
            fecha: fechaInstalacion,
            observaciones:
              req.body.observaciones ||
              "Equipo registrado directamente en producción (sin pasar por inventario)",
          },
        ],
      });
    } else {
      doc.historial = [
        {
          accion: condicion === "SEGUNDA" ? "RECIBIDO_SEGUNDA" : "CREADO",
          estadoNuevo: "DISPONIBLE",
          ciudadDestino: ciudadFinal,
          usuario: req.user?.userId || null,
          fecha: new Date(),
          observaciones:
            condicion === "SEGUNDA"
              ? "Equipo de segunda recibido en inventario"
              : "Equipo nuevo recibido en inventario",
        },
      ];
    }

    const equipo = await EquipoGPS.create(doc);

    res.status(201).json({ success: true, data: equipo });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Ya existe un equipo con ese IMEI",
      });
    }
    logger.error(`Error creando equipo GPS: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.listarEquipos = async (req, res) => {
  try {
    const {
      estado,
      ciudad,
      tecnico,
      marca,
      modelo,
      imei,
      includeDeleted = false,
      page = 1,
      limit = 50,
    } = req.query;

    const query = {};
    if (!includeDeleted || includeDeleted === "false") query.deletedAt = null;
    if (estado) query.estado = estado;
    if (ciudad) query.ciudad = ciudad;
    if (tecnico) query.tecnico = tecnico;
    if (marca) query.marca = marca;
    if (modelo) query.modelo = modelo;
    if (imei) query.imei = new RegExp(imei, "i");

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const equipos = await EquipoGPS.find(query)
      .populate("marca", "nombre")
      .populate("modelo", "nombre")
      .populate("ciudad", "nombre departamento esCentral")
      .populate("tecnico", "nombres apellidos identificacion")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await EquipoGPS.countDocuments(query);

    res.json({
      success: true,
      data: equipos,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error(`Error listando equipos GPS: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.obtenerEquipo = async (req, res) => {
  try {
    const equipo = await EquipoGPS.findOne({
      _id: req.params.id,
      deletedAt: null,
    })
      .populate("marca", "nombre")
      .populate("modelo", "nombre")
      .populate("ciudad", "nombre departamento esCentral")
      .populate("tecnico", "nombres apellidos identificacion telefono")
      .populate("vehiculoInstalado", "placa numeroInterno")
      .lean();
    if (!equipo)
      return res
        .status(404)
        .json({ success: false, message: "Equipo no encontrado" });
    res.json({ success: true, data: equipo });
  } catch (error) {
    logger.error(`Error obteniendo equipo GPS: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.actualizarEquipo = async (req, res) => {
  try {
    const equipo = await EquipoGPS.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!equipo)
      return res
        .status(404)
        .json({ success: false, message: "Equipo no encontrado" });

    Object.assign(equipo, req.body);
    equipo.historial.push({
      accion: "ACTUALIZADO",
      estadoAnterior: equipo.estado,
      estadoNuevo: equipo.estado,
      usuario: req.user?.userId || null,
      fecha: new Date(),
      observaciones: "Datos del equipo actualizados",
    });
    await equipo.save();
    res.json({ success: true, data: equipo });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Ya existe un equipo con ese IMEI",
      });
    }
    logger.error(`Error actualizando equipo GPS: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.eliminarEquipo = async (req, res) => {
  try {
    const equipo = await EquipoGPS.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!equipo)
      return res
        .status(404)
        .json({ success: false, message: "Equipo no encontrado" });

    // Soft delete es reversible: permitimos en cualquier estado.
    // Si está INSTALADO o EN_TRANSITO, lo limpiamos para que no quede asignado.
    if (["INSTALADO", "EN_TRANSITO", "EN_POSESION_TECNICO"].includes(equipo.estado)) {
      equipo.tecnico = null;
      equipo.vehiculoInstalado = null;
    }

    await equipo.softDelete(req.user?.userId);
    res.json({
      success: true,
      message: `Equipo eliminado (soft). Estado al borrar: ${equipo.estado}. Use POST /equipos/${equipo._id}/restore para deshacer.`,
    });
  } catch (error) {
    logger.error(`Error eliminando equipo GPS: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Inventario disponible en la central ───
exports.inventarioCentral = async (req, res) => {
  try {
    const central = await getCiudadCentral();
    if (!central) {
      return res
        .status(400)
        .json({ success: false, message: "No hay ciudad central registrada" });
    }

    const equipos = await EquipoGPS.find({
      ciudad: central._id,
      estado: "DISPONIBLE",
      deletedAt: null,
    })
      .populate("marca", "nombre")
      .populate("modelo", "nombre")
      .lean();

    // Resumen por marca/modelo con desglose por condición (NUEVO/SEGUNDA).
    const resumenMap = {};
    for (const e of equipos) {
      const marca = e.marca?.nombre || "?";
      const modelo = e.modelo?.nombre || "?";
      const key = `${marca} / ${modelo}`;
      if (!resumenMap[key]) {
        resumenMap[key] = { marca, modelo, nuevos: 0, segunda: 0, total: 0 };
      }
      if (e.condicion === "SEGUNDA") resumenMap[key].segunda += 1;
      else resumenMap[key].nuevos += 1;
      resumenMap[key].total += 1;
    }
    const resumenPorModelo = Object.values(resumenMap).sort((a, b) =>
      `${a.marca} ${a.modelo}`.localeCompare(`${b.marca} ${b.modelo}`),
    );

    res.json({
      success: true,
      data: {
        ciudadCentral: central.nombre,
        totalDisponibles: equipos.length,
        resumenPorModelo,
        equipos,
      },
    });
  } catch (error) {
    logger.error(`Error consultando inventario central: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════════════════════════════
// FLUJO DE EQUIPOS
// ════════════════════════════════════════════════════════════════

/**
 * Helper interno: aplica el envío a un equipo ya cargado.
 * Lanza { status, message } cuando hay error de validación.
 */
async function aplicarEnvioAEquipo({
  equipo,
  ciudadDestinoDoc,
  tecnicoDoc,
  observaciones,
  userId,
}) {
  if (equipo.estado !== "DISPONIBLE") {
    throw {
      status: 409,
      message: `Solo se pueden enviar equipos DISPONIBLE. Estado actual: ${equipo.estado}`,
    };
  }
  if (tecnicoDoc.ciudad.toString() !== ciudadDestinoDoc._id.toString()) {
    throw {
      status: 400,
      message: "El técnico no pertenece a la ciudad de destino",
    };
  }
  const ciudadOrigen = equipo.ciudad;
  const esTransferencia =
    ciudadOrigen.toString() !== ciudadDestinoDoc._id.toString();

  equipo.historial.push({
    accion: "ENVIADO",
    estadoAnterior: equipo.estado,
    estadoNuevo: "EN_TRANSITO",
    ciudadOrigen,
    ciudadDestino: ciudadDestinoDoc._id,
    tecnicoNuevo: tecnicoDoc._id,
    usuario: userId || null,
    fecha: new Date(),
    observaciones: esTransferencia
      ? `Transferencia entre ciudades${observaciones ? " | " + observaciones : ""}`
      : `Asignación a técnico local${observaciones ? " | " + observaciones : ""}`,
  });

  equipo.estado = "EN_TRANSITO";
  equipo.ciudad = ciudadDestinoDoc._id;
  equipo.tecnico = tecnicoDoc._id;
  await equipo.save();
  return { equipo, esTransferencia };
}

/**
 * Helper interno: aplica la confirmación de recepción a un equipo ya cargado.
 */
async function aplicarRecepcionAEquipo({ equipo, observaciones, userId }) {
  if (equipo.estado !== "EN_TRANSITO") {
    throw {
      status: 409,
      message: `Solo se confirma recepción de equipos EN_TRANSITO. Estado actual: ${equipo.estado}`,
    };
  }
  equipo.historial.push({
    accion: "RECIBIDO_TECNICO",
    estadoAnterior: equipo.estado,
    estadoNuevo: "EN_POSESION_TECNICO",
    tecnicoAnterior: equipo.tecnico,
    tecnicoNuevo: equipo.tecnico,
    ciudadDestino: equipo.ciudad,
    usuario: userId || null,
    fecha: new Date(),
    observaciones: observaciones || "Recepción confirmada por técnico",
  });
  equipo.estado = "EN_POSESION_TECNICO";
  await equipo.save();
  return equipo;
}

/**
 * POST /equipos/:id/enviar
 * Envía un equipo a un técnico en una ciudad.
 * Estado: DISPONIBLE → EN_TRANSITO
 */
exports.enviarEquipo = async (req, res) => {
  try {
    const { ciudad, tecnico, observaciones } = req.body;

    const equipo = await EquipoGPS.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!equipo)
      return res
        .status(404)
        .json({ success: false, message: "Equipo no encontrado" });

    const ciudadDestino = await CiudadGPS.findOne({
      _id: ciudad,
      deletedAt: null,
    });
    if (!ciudadDestino)
      return res
        .status(404)
        .json({ success: false, message: "Ciudad de destino no encontrada" });

    const tecnicoDoc = await TecnicoGPS.findOne({
      _id: tecnico,
      deletedAt: null,
    });
    if (!tecnicoDoc)
      return res
        .status(404)
        .json({ success: false, message: "Técnico no encontrado" });

    try {
      const { esTransferencia } = await aplicarEnvioAEquipo({
        equipo,
        ciudadDestinoDoc: ciudadDestino,
        tecnicoDoc,
        observaciones,
        userId: req.user?.userId,
      });

      res.json({
        success: true,
        message: esTransferencia
          ? `Equipo enviado a ${ciudadDestino.nombre} y asignado a ${tecnicoDoc.nombres} ${tecnicoDoc.apellidos}`
          : `Equipo asignado a ${tecnicoDoc.nombres} ${tecnicoDoc.apellidos} en ${ciudadDestino.nombre}`,
        data: equipo,
      });
    } catch (e) {
      if (e?.status)
        return res.status(e.status).json({ success: false, message: e.message });
      throw e;
    }
  } catch (error) {
    logger.error(`Error enviando equipo GPS: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /equipos/enviar-paquete
 * Envía varios equipos en una sola petición a un técnico/ciudad.
 * Body: { equipos: [id1, id2, ...], ciudad, tecnico, observaciones? }
 *
 * Procesamiento individual: los equipos válidos se envían y los inválidos
 * se reportan en el array `errores`. La respuesta es 207 si hubo mezcla.
 */
exports.enviarEquiposPaquete = async (req, res) => {
  try {
    const { equipos, ciudad, tecnico, observaciones } = req.body;

    const ciudadDestino = await CiudadGPS.findOne({
      _id: ciudad,
      deletedAt: null,
    });
    if (!ciudadDestino)
      return res
        .status(404)
        .json({ success: false, message: "Ciudad de destino no encontrada" });

    const tecnicoDoc = await TecnicoGPS.findOne({
      _id: tecnico,
      deletedAt: null,
    });
    if (!tecnicoDoc)
      return res
        .status(404)
        .json({ success: false, message: "Técnico no encontrado" });

    const exitosos = [];
    const errores = [];

    for (const equipoId of equipos) {
      try {
        const equipo = await EquipoGPS.findOne({
          _id: equipoId,
          deletedAt: null,
        });
        if (!equipo) {
          errores.push({ equipoId, message: "Equipo no encontrado" });
          continue;
        }
        await aplicarEnvioAEquipo({
          equipo,
          ciudadDestinoDoc: ciudadDestino,
          tecnicoDoc,
          observaciones,
          userId: req.user?.userId,
        });
        exitosos.push({
          equipoId,
          imei: equipo.imei,
          serial: equipo.serial,
          estado: equipo.estado,
        });
      } catch (e) {
        errores.push({
          equipoId,
          message: e?.message || "Error desconocido",
        });
      }
    }

    const status = errores.length === 0 ? 200 : exitosos.length === 0 ? 409 : 207;

    res.status(status).json({
      success: errores.length === 0,
      message: `Paquete procesado: ${exitosos.length} enviado(s), ${errores.length} con error`,
      data: {
        ciudadDestino: ciudadDestino.nombre,
        tecnico: `${tecnicoDoc.nombres} ${tecnicoDoc.apellidos}`,
        totalEnviados: exitosos.length,
        totalErrores: errores.length,
        exitosos,
        errores,
      },
    });
  } catch (error) {
    logger.error(`Error enviando paquete GPS: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /equipos/:id/confirmar-recepcion
 * El técnico (o el admin en su nombre) confirma que el equipo fue recibido.
 * Estado: EN_TRANSITO → EN_POSESION_TECNICO
 */
exports.confirmarRecepcion = async (req, res) => {
  try {
    const { observaciones } = req.body || {};
    const equipo = await EquipoGPS.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!equipo)
      return res
        .status(404)
        .json({ success: false, message: "Equipo no encontrado" });

    try {
      await aplicarRecepcionAEquipo({
        equipo,
        observaciones,
        userId: req.user?.userId,
      });
      res.json({
        success: true,
        message: "Recepción confirmada. Equipo en posesión del técnico.",
        data: equipo,
      });
    } catch (e) {
      if (e?.status)
        return res.status(e.status).json({ success: false, message: e.message });
      throw e;
    }
  } catch (error) {
    logger.error(`Error confirmando recepción: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /equipos/confirmar-recepcion-paquete
 * Confirma recepción de varios equipos a la vez.
 * Body: { equipos: [id1, id2, ...], observaciones? }
 */
exports.confirmarRecepcionPaquete = async (req, res) => {
  try {
    const { equipos, observaciones } = req.body;

    const exitosos = [];
    const errores = [];

    for (const equipoId of equipos) {
      try {
        const equipo = await EquipoGPS.findOne({
          _id: equipoId,
          deletedAt: null,
        });
        if (!equipo) {
          errores.push({ equipoId, message: "Equipo no encontrado" });
          continue;
        }
        await aplicarRecepcionAEquipo({
          equipo,
          observaciones,
          userId: req.user?.userId,
        });
        exitosos.push({
          equipoId,
          imei: equipo.imei,
          serial: equipo.serial,
          estado: equipo.estado,
        });
      } catch (e) {
        errores.push({
          equipoId,
          message: e?.message || "Error desconocido",
        });
      }
    }

    const status = errores.length === 0 ? 200 : exitosos.length === 0 ? 409 : 207;

    res.status(status).json({
      success: errores.length === 0,
      message: `Paquete confirmado: ${exitosos.length} recibido(s), ${errores.length} con error`,
      data: {
        totalConfirmados: exitosos.length,
        totalErrores: errores.length,
        exitosos,
        errores,
      },
    });
  } catch (error) {
    logger.error(`Error confirmando paquete GPS: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /equipos-gps/:id/instalar
 * Marca el equipo como instalado (en uso).
 * Estado: EN_TRANSITO → INSTALADO
 */
exports.instalarEquipo = async (req, res) => {
  try {
    const { vehiculo, observaciones } = req.body;

    const equipo = await EquipoGPS.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!equipo)
      return res
        .status(404)
        .json({ success: false, message: "Equipo no encontrado" });

    if (
      !["EN_TRANSITO", "EN_POSESION_TECNICO"].includes(equipo.estado)
    ) {
      return res.status(409).json({
        success: false,
        message: `Solo se pueden instalar equipos EN_TRANSITO o EN_POSESION_TECNICO. Estado actual: ${equipo.estado}`,
      });
    }

    equipo.historial.push({
      accion: "INSTALADO",
      estadoAnterior: equipo.estado,
      estadoNuevo: "INSTALADO",
      tecnicoAnterior: equipo.tecnico,
      tecnicoNuevo: equipo.tecnico,
      ciudadDestino: equipo.ciudad,
      usuario: req.user?.userId || null,
      fecha: new Date(),
      observaciones,
    });

    equipo.estado = "INSTALADO";
    equipo.fechaInstalacion = new Date();
    equipo.yaUsado = true;
    if (vehiculo) equipo.vehiculoInstalado = vehiculo;
    await equipo.save();

    res.json({ success: true, message: "Equipo marcado como instalado", data: equipo });
  } catch (error) {
    logger.error(`Error instalando equipo GPS: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /equipos-gps/:id/retirar
 * Retira el equipo del vehículo.
 * Estado: INSTALADO → EN_REVISION
 */
exports.retirarEquipo = async (req, res) => {
  try {
    const { observaciones } = req.body;

    const equipo = await EquipoGPS.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!equipo)
      return res
        .status(404)
        .json({ success: false, message: "Equipo no encontrado" });

    if (equipo.estado !== "INSTALADO") {
      return res.status(409).json({
        success: false,
        message: `Solo se pueden retirar equipos INSTALADO. Estado actual: ${equipo.estado}`,
      });
    }

    equipo.historial.push({
      accion: "RETIRADO",
      estadoAnterior: equipo.estado,
      estadoNuevo: "EN_REVISION",
      tecnicoAnterior: equipo.tecnico,
      tecnicoNuevo: equipo.tecnico,
      ciudadDestino: equipo.ciudad,
      usuario: req.user?.userId || null,
      fecha: new Date(),
      observaciones,
    });

    equipo.estado = "EN_REVISION";
    equipo.fechaRetiro = new Date();
    equipo.vehiculoInstalado = null;
    await equipo.save();

    res.json({
      success: true,
      message: "Equipo retirado y marcado para revisión",
      data: equipo,
    });
  } catch (error) {
    logger.error(`Error retirando equipo GPS: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /equipos-gps/:id/revisar
 * Acción del jefe de red sobre un equipo EN_REVISION.
 * Body: { accion: "REUSAR" | "DEVOLVER_CENTRAL" | "DESCARTAR", tecnico?, ciudad?, observaciones? }
 *
 * - REUSAR: vuelve a INSTALADO si todavía sirve (puede reasignar técnico/ciudad).
 *           Útil cuando "está en uso" según el flujo descrito.
 * - DEVOLVER_CENTRAL: regresa a la central (Pasto) como DISPONIBLE.
 * - DESCARTAR: marca como RETIRADO permanentemente.
 */
exports.revisarEquipo = async (req, res) => {
  try {
    const { accion, tecnico, ciudad, observaciones } = req.body;

    const equipo = await EquipoGPS.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!equipo)
      return res
        .status(404)
        .json({ success: false, message: "Equipo no encontrado" });

    if (equipo.estado !== "EN_REVISION") {
      return res.status(409).json({
        success: false,
        message: `Solo se revisan equipos EN_REVISION. Estado actual: ${equipo.estado}`,
      });
    }

    const tecnicoAnterior = equipo.tecnico;
    const estadoAnterior = equipo.estado;

    if (accion === "DEVOLVER_CENTRAL") {
      const central = await getCiudadCentral();
      if (!central) {
        return res
          .status(400)
          .json({ success: false, message: "No hay ciudad central registrada" });
      }
      equipo.estado = "DISPONIBLE";
      equipo.ciudad = central._id;
      equipo.tecnico = null;
      equipo.vehiculoInstalado = null;
      equipo.fechaInstalacion = null;
      equipo.historial.push({
        accion: "REVISADO_DEVOLVER",
        estadoAnterior,
        estadoNuevo: "DISPONIBLE",
        tecnicoAnterior,
        ciudadOrigen: equipo.ciudad,
        ciudadDestino: central._id,
        usuario: req.user?.userId || null,
        fecha: new Date(),
        observaciones,
      });
    } else if (accion === "REUSAR") {
      // Reasigna el equipo. Si pasan ciudad/tecnico, se actualizan.
      let ciudadFinal = equipo.ciudad;
      let tecnicoFinal = equipo.tecnico;

      if (ciudad) {
        const ciudadDoc = await CiudadGPS.findOne({
          _id: ciudad,
          deletedAt: null,
        });
        if (!ciudadDoc)
          return res
            .status(404)
            .json({ success: false, message: "Ciudad no encontrada" });
        ciudadFinal = ciudadDoc._id;
      }
      if (tecnico) {
        const tecDoc = await TecnicoGPS.findOne({
          _id: tecnico,
          deletedAt: null,
        });
        if (!tecDoc)
          return res
            .status(404)
            .json({ success: false, message: "Técnico no encontrado" });
        if (tecDoc.ciudad.toString() !== ciudadFinal.toString()) {
          return res.status(400).json({
            success: false,
            message: "El técnico no pertenece a la ciudad indicada",
          });
        }
        tecnicoFinal = tecDoc._id;
      }

      equipo.estado = "INSTALADO";
      equipo.ciudad = ciudadFinal;
      equipo.tecnico = tecnicoFinal;
      equipo.fechaInstalacion = new Date();
      equipo.historial.push({
        accion: "REVISADO_REUSAR",
        estadoAnterior,
        estadoNuevo: "INSTALADO",
        tecnicoAnterior,
        tecnicoNuevo: tecnicoFinal,
        ciudadDestino: ciudadFinal,
        usuario: req.user?.userId || null,
        fecha: new Date(),
        observaciones,
      });
    } else if (accion === "DESCARTAR") {
      equipo.estado = "RETIRADO";
      equipo.tecnico = null;
      equipo.vehiculoInstalado = null;
      equipo.historial.push({
        accion: "DESCARTADO",
        estadoAnterior,
        estadoNuevo: "RETIRADO",
        tecnicoAnterior,
        usuario: req.user?.userId || null,
        fecha: new Date(),
        observaciones,
      });
    }

    await equipo.save();
    res.json({
      success: true,
      message: `Equipo revisado: ${accion}`,
      data: equipo,
    });
  } catch (error) {
    logger.error(`Error revisando equipo GPS: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /equipos/:id/enviar-garantia
 * Envía un equipo al proveedor por garantía. Sale del inventario.
 * Estado: DISPONIBLE | EN_REVISION → EN_GARANTIA
 */
exports.enviarGarantia = async (req, res) => {
  try {
    const { proveedor, motivo, observaciones } = req.body;

    const equipo = await EquipoGPS.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!equipo)
      return res
        .status(404)
        .json({ success: false, message: "Equipo no encontrado" });

    if (!["DISPONIBLE", "EN_REVISION"].includes(equipo.estado)) {
      return res.status(409).json({
        success: false,
        message: `Solo se pueden enviar a garantía equipos DISPONIBLE o EN_REVISION. Estado actual: ${equipo.estado}`,
      });
    }

    const estadoAnterior = equipo.estado;
    const tecnicoAnterior = equipo.tecnico;

    equipo.estado = "EN_GARANTIA";
    equipo.tecnico = null;
    equipo.vehiculoInstalado = null;

    equipo.historial.push({
      accion: "ENVIADO_GARANTIA",
      estadoAnterior,
      estadoNuevo: "EN_GARANTIA",
      tecnicoAnterior,
      ciudadOrigen: equipo.ciudad,
      usuario: req.user?.userId || null,
      fecha: new Date(),
      observaciones: [
        `Motivo: ${motivo}`,
        proveedor ? `Proveedor: ${proveedor}` : null,
        observaciones,
      ]
        .filter(Boolean)
        .join(" | "),
    });

    await equipo.save();
    res.json({
      success: true,
      message: "Equipo enviado a garantía",
      data: equipo,
    });
  } catch (error) {
    logger.error(`Error enviando equipo a garantía: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /equipos/:id/recibir-garantia
 * Recibe el equipo de vuelta del proveedor. Vuelve al inventario central.
 * Estado: EN_GARANTIA → DISPONIBLE (en la central).
 * Si marcarComoSegunda=true, el equipo pasa a condicion=SEGUNDA.
 */
exports.recibirGarantia = async (req, res) => {
  try {
    const { marcarComoSegunda, observaciones } = req.body;

    const equipo = await EquipoGPS.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!equipo)
      return res
        .status(404)
        .json({ success: false, message: "Equipo no encontrado" });

    if (equipo.estado !== "EN_GARANTIA") {
      return res.status(409).json({
        success: false,
        message: `Solo se reciben de garantía equipos EN_GARANTIA. Estado actual: ${equipo.estado}`,
      });
    }

    const central = await getCiudadCentral();
    if (!central) {
      return res
        .status(400)
        .json({ success: false, message: "No hay ciudad central registrada" });
    }

    const estadoAnterior = equipo.estado;
    equipo.estado = "DISPONIBLE";
    equipo.ciudad = central._id;
    if (marcarComoSegunda) equipo.condicion = "SEGUNDA";

    equipo.historial.push({
      accion: "RECIBIDO_GARANTIA",
      estadoAnterior,
      estadoNuevo: "DISPONIBLE",
      ciudadDestino: central._id,
      usuario: req.user?.userId || null,
      fecha: new Date(),
      observaciones,
    });

    await equipo.save();
    res.json({
      success: true,
      message: "Equipo recibido de garantía y disponible en inventario",
      data: equipo,
    });
  } catch (error) {
    logger.error(`Error recibiendo equipo de garantía: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════════════════════════════
// REPORTES
// ════════════════════════════════════════════════════════════════

/**
 * Resuelve un rango de fechas a partir de query params.
 * Modos soportados:
 *   - Por período predefinido: ?periodo=hoy|semanal|quincenal|mensual|trimestral|semestral|anual
 *   - Por rango personalizado: ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 *   - Si no se manda nada → mensual (últimos 30 días).
 *
 * El rango personalizado tiene prioridad sobre el período si llegan ambos.
 * Las fechas inválidas caen al default. `hasta` se ajusta al fin de día (23:59:59.999)
 * y `desde` al inicio (00:00:00).
 */
function resolverRango(query) {
  const { periodo, desde, hasta } = query;

  // Modo rango personalizado
  if (desde || hasta) {
    const desdeDate = desde ? new Date(desde) : new Date("1970-01-01");
    const hastaDate = hasta ? new Date(hasta) : new Date();

    if (isNaN(desdeDate.getTime()) || isNaN(hastaDate.getTime())) {
      // Fecha inválida: caer a mensual.
      const fin = new Date();
      const inicio = new Date();
      inicio.setMonth(inicio.getMonth() - 1);
      return { desde: inicio, hasta: fin, etiqueta: "mensual", invalidRange: true };
    }

    desdeDate.setHours(0, 0, 0, 0);
    hastaDate.setHours(23, 59, 59, 999);
    return { desde: desdeDate, hasta: hastaDate, etiqueta: "personalizado" };
  }

  // Modo período predefinido
  const fin = new Date();
  const inicio = new Date();
  switch (periodo) {
    case "hoy":
      inicio.setHours(0, 0, 0, 0);
      break;
    case "semanal":
      inicio.setDate(inicio.getDate() - 7);
      break;
    case "quincenal":
      inicio.setDate(inicio.getDate() - 15);
      break;
    case "trimestral":
      inicio.setMonth(inicio.getMonth() - 3);
      break;
    case "semestral":
      inicio.setMonth(inicio.getMonth() - 6);
      break;
    case "anual":
      inicio.setFullYear(inicio.getFullYear() - 1);
      break;
    case "mensual":
    default:
      inicio.setMonth(inicio.getMonth() - 1);
      break;
  }
  return { desde: inicio, hasta: fin, etiqueta: periodo || "mensual" };
}

/**
 * GET /reportes/movimientos?periodo=mensual|semanal&desde=&hasta=
 * Conteos de movimientos del período: recibidos nuevos, recibidos segunda,
 * enviados a sede, instalados (usados), restaurados, garantía, descartados.
 * Desglosado por condición (NUEVO/SEGUNDA) y con detalle por marca/modelo.
 */
exports.reporteMovimientos = async (req, res) => {
  try {
    const { desde, hasta, etiqueta } = resolverRango(req.query);

    // Aggregation: desenrollar historial dentro del rango y agrupar por acción + condición
    const movimientos = await EquipoGPS.aggregate([
      { $match: { deletedAt: null } },
      { $unwind: "$historial" },
      {
        $match: {
          "historial.fecha": { $gte: desde, $lte: hasta },
          "historial.accion": {
            $in: [
              "CREADO",
              "RECIBIDO_SEGUNDA",
              "ENVIADO",
              "INSTALADO",
              "RETIRADO",
              "REVISADO_REUSAR",
              "REVISADO_DEVOLVER",
              "ENVIADO_GARANTIA",
              "RECIBIDO_GARANTIA",
              "DESCARTADO",
            ],
          },
        },
      },
      {
        $lookup: {
          from: "marcagps",
          localField: "marca",
          foreignField: "_id",
          as: "_marca",
        },
      },
      {
        $lookup: {
          from: "modelogps",
          localField: "modelo",
          foreignField: "_id",
          as: "_modelo",
        },
      },
      {
        $project: {
          accion: "$historial.accion",
          condicion: "$condicion",
          fecha: "$historial.fecha",
          marca: { $arrayElemAt: ["$_marca.nombre", 0] },
          modelo: { $arrayElemAt: ["$_modelo.nombre", 0] },
        },
      },
      {
        $group: {
          _id: {
            accion: "$accion",
            condicion: "$condicion",
            marca: "$marca",
            modelo: "$modelo",
          },
          total: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          accion: "$_id.accion",
          condicion: "$_id.condicion",
          marca: "$_id.marca",
          modelo: "$_id.modelo",
          total: 1,
        },
      },
      { $sort: { accion: 1, marca: 1, modelo: 1 } },
    ]);

    // Helper: sumar total filtrando por accion(s) y condición opcional
    const sumar = (acciones, condicion) => {
      const arr = Array.isArray(acciones) ? acciones : [acciones];
      return movimientos
        .filter(
          (m) =>
            arr.includes(m.accion) &&
            (condicion ? m.condicion === condicion : true),
        )
        .reduce((s, m) => s + m.total, 0);
    };

    const resumen = {
      recibidosNuevos: sumar("CREADO", "NUEVO"),
      recibidosSegunda:
        sumar("RECIBIDO_SEGUNDA") + sumar("CREADO", "SEGUNDA"),
      enviadosASede: {
        nuevos: sumar("ENVIADO", "NUEVO"),
        segunda: sumar("ENVIADO", "SEGUNDA"),
        total: sumar("ENVIADO"),
      },
      usadosInstalados: {
        nuevos: sumar("INSTALADO", "NUEVO"),
        segunda: sumar("INSTALADO", "SEGUNDA"),
        total: sumar("INSTALADO"),
      },
      retirados: sumar("RETIRADO"),
      restaurados: sumar(["REVISADO_REUSAR", "REVISADO_DEVOLVER"]),
      enviadosGarantia: sumar("ENVIADO_GARANTIA"),
      recibidosGarantia: sumar("RECIBIDO_GARANTIA"),
      descartados: sumar("DESCARTADO"),
    };

    // Conteo de actividades del período por tipoActividad
    const actividadesAgg = await ActividadGPS.aggregate([
      {
        $match: {
          deletedAt: null,
          fechaActividad: { $gte: desde, $lte: hasta },
        },
      },
      { $group: { _id: "$tipoActividad", total: { $sum: 1 } } },
    ]);
    const actividadesPorTipo = Object.fromEntries(
      actividadesAgg.map((x) => [x._id, x.total]),
    );

    // Detalle de actividades del período (populated) — útil para auditoría
    const actividadesDetalle = await ActividadGPS.find({
      deletedAt: null,
      fechaActividad: { $gte: desde, $lte: hasta },
    })
      .sort({ fechaActividad: -1 })
      .populate("tecnico", "nombres apellidos identificacion")
      .populate("ciudad", "nombre")
      .populate({
        path: "equipoInstalado",
        select: "imei serial marca modelo condicion estado",
        populate: [
          { path: "marca", select: "nombre" },
          { path: "modelo", select: "nombre" },
        ],
      })
      .populate({
        path: "equipoRetirado",
        select: "imei serial marca modelo condicion estado tipoPropiedad propietarioNombre",
        populate: [
          { path: "marca", select: "nombre" },
          { path: "modelo", select: "nombre" },
        ],
      })
      .lean();

    res.json({
      success: true,
      data: {
        periodo: etiqueta,
        rango: { desde, hasta },
        resumen,
        actividades: {
          total: actividadesAgg.reduce((s, x) => s + x.total, 0),
          porTipo: actividadesPorTipo,
          detalle: actividadesDetalle,
        },
        detallePorModelo: movimientos,
      },
    });
  } catch (error) {
    logger.error(`Error generando reporte de movimientos: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /reportes/inventario-por-ciudad
 * Tabla del inventario operativo (todos los equipos no descartados ni en garantía)
 * agrupado por ciudad → modelo → condición.
 *
 * Ejemplo de salida: "Pasto: 5 VT100 nuevos; Ipiales: 3 VT100 nuevos, 2 VT100 segunda".
 */
exports.reporteInventarioPorCiudad = async (req, res) => {
  try {
    const {
      incluirInstalados = "true",
      incluirEnTransito = "true",
      incluirEnRevision = "true",
    } = req.query;

    // Los equipos INSTALADO NO se cuentan dentro de la ciudad: una vez
    // instalados no sabemos su ubicación real, así que se reportan en una
    // sección global aparte (ver `instalados` más abajo).
    const estadosVisibles = ["DISPONIBLE"];
    if (incluirEnTransito === "true") {
      estadosVisibles.push("EN_TRANSITO");
      estadosVisibles.push("EN_POSESION_TECNICO");
    }
    if (incluirEnRevision === "true") estadosVisibles.push("EN_REVISION");

    const filas = await EquipoGPS.aggregate([
      {
        $match: {
          deletedAt: null,
          estado: { $in: estadosVisibles },
        },
      },
      {
        $lookup: {
          from: "ciudadgps",
          localField: "ciudad",
          foreignField: "_id",
          as: "_ciudad",
        },
      },
      {
        $lookup: {
          from: "marcagps",
          localField: "marca",
          foreignField: "_id",
          as: "_marca",
        },
      },
      {
        $lookup: {
          from: "modelogps",
          localField: "modelo",
          foreignField: "_id",
          as: "_modelo",
        },
      },
      {
        $group: {
          _id: {
            ciudad: { $arrayElemAt: ["$_ciudad.nombre", 0] },
            esCentral: { $arrayElemAt: ["$_ciudad.esCentral", 0] },
            marca: { $arrayElemAt: ["$_marca.nombre", 0] },
            modelo: { $arrayElemAt: ["$_modelo.nombre", 0] },
            condicion: "$condicion",
            estado: "$estado",
          },
          total: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          ciudad: "$_id.ciudad",
          esCentral: "$_id.esCentral",
          marca: "$_id.marca",
          modelo: "$_id.modelo",
          condicion: "$_id.condicion",
          estado: "$_id.estado",
          total: 1,
        },
      },
      { $sort: { ciudad: 1, modelo: 1, condicion: 1, estado: 1 } },
    ]);

    // Reorganizar como tabla pivot por ciudad
    const porCiudad = {};
    for (const f of filas) {
      const ciudad = f.ciudad || "(sin ciudad)";
      if (!porCiudad[ciudad]) {
        porCiudad[ciudad] = {
          ciudad,
          esCentral: !!f.esCentral,
          totalEquipos: 0,
          modelos: {},
        };
      }
      const modeloKey = `${f.marca || "?"} ${f.modelo || "?"}`;
      if (!porCiudad[ciudad].modelos[modeloKey]) {
        porCiudad[ciudad].modelos[modeloKey] = {
          marca: f.marca,
          modelo: f.modelo,
          nuevos: 0,
          segunda: 0,
          porEstado: {},
          total: 0,
        };
      }
      const m = porCiudad[ciudad].modelos[modeloKey];
      if (f.condicion === "NUEVO") m.nuevos += f.total;
      else if (f.condicion === "SEGUNDA") m.segunda += f.total;
      m.porEstado[f.estado] = (m.porEstado[f.estado] || 0) + f.total;
      m.total += f.total;
      porCiudad[ciudad].totalEquipos += f.total;
    }

    // Convertir a array y armar texto resumen estilo "Pasto: 5 VT100 nuevos, 2 VT100 segunda"
    const tabla = Object.values(porCiudad)
      .sort((a, b) =>
        a.esCentral === b.esCentral
          ? a.ciudad.localeCompare(b.ciudad)
          : a.esCentral
            ? -1
            : 1,
      )
      .map((c) => {
        const fragmentos = [];
        for (const m of Object.values(c.modelos)) {
          const label = `${m.marca || ""} ${m.modelo || ""}`.trim();
          if (m.nuevos) fragmentos.push(`${m.nuevos} ${label} nuevos`);
          if (m.segunda) fragmentos.push(`${m.segunda} ${label} segunda`);
        }
        return {
          ciudad: c.ciudad,
          esCentral: c.esCentral,
          totalEquipos: c.totalEquipos,
          modelos: Object.values(c.modelos),
          resumen: `${c.ciudad}: ${fragmentos.join(", ") || "sin equipos"}`,
        };
      });

    // Texto plano global
    const textoGlobal = tabla.map((t) => t.resumen).join(" | ");

    // ─── Sección global de INSTALADOS (fuera de ciudad) ───
    let instalados = null;
    if (incluirInstalados === "true") {
      instalados = await resumenInstaladosGlobal();
    }

    res.json({
      success: true,
      data: {
        estadosIncluidos: estadosVisibles,
        totalCiudades: tabla.length,
        totalEquipos: tabla.reduce((s, t) => s + t.totalEquipos, 0),
        tabla,
        instalados,
        resumenTexto: textoGlobal,
      },
    });
  } catch (error) {
    logger.error(
      `Error generando reporte de inventario por ciudad: ${error.message}`,
    );
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════════════════════════════
// BÚSQUEDA DE EQUIPO (verificación previa)
// ════════════════════════════════════════════════════════════════

/**
 * GET /equipos/buscar?imei=&serial=&idEquipo=
 * Verifica si un equipo ya existe en plataforma. Útil antes de registrar
 * un equipo retirado: el frontend pregunta primero, y si no existe, manda
 * equipoRetiradoNuevo en la actividad.
 */
exports.buscarEquipo = async (req, res) => {
  try {
    const { imei, serial, idEquipo } = req.query;
    const or = [];
    if (imei) or.push({ imei: imei.trim() });
    if (serial) or.push({ serial: serial.trim() });
    if (idEquipo) or.push({ idEquipo: idEquipo.trim() });

    if (or.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Debe enviar imei, serial o idEquipo",
      });
    }

    const equipo = await EquipoGPS.findOne({ $or: or, deletedAt: null })
      .populate("marca", "nombre")
      .populate("modelo", "nombre")
      .populate("ciudad", "nombre esCentral")
      .populate("tecnico", "nombres apellidos identificacion")
      .lean();

    if (!equipo) {
      return res.status(404).json({
        success: false,
        existe: false,
        message: "Equipo no registrado en plataforma",
      });
    }

    res.json({ success: true, existe: true, data: equipo });
  } catch (error) {
    logger.error(`Error buscando equipo GPS: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════════════════════════════
// ACTIVIDADES GPS
// ════════════════════════════════════════════════════════════════

/**
 * POST /actividades
 * Registra una actividad de campo: instalación, cambio, garantía, prueba o
 * equipo dañado. Mutuamente actualiza el equipo instalado y, si aplica, el
 * equipo retirado, dejando el destino correcto según la propiedad.
 */
exports.crearActividad = async (req, res) => {
  try {
    const {
      tipoActividad,
      tecnico: tecnicoId,
      ciudad: ciudadId,
      equipoInstalado: equipoInstaladoId,
      equipoRetirado: equipoRetiradoId,
      equipoRetiradoNuevo,
      placaInstalada,
      lineaSim,
      numeroSim,
      tipoPropiedad,
      propietarioNombre: propNombreInput,
      fechaActividad,
      observaciones,
    } = req.body;

    // 1. Validar técnico y ciudad
    const ciudad = await CiudadGPS.findOne({
      _id: ciudadId,
      deletedAt: null,
    });
    if (!ciudad)
      return res
        .status(404)
        .json({ success: false, message: "Ciudad no encontrada" });

    const tecnico = await TecnicoGPS.findOne({
      _id: tecnicoId,
      deletedAt: null,
    });
    if (!tecnico)
      return res
        .status(404)
        .json({ success: false, message: "Técnico no encontrado" });
    if (tecnico.ciudad.toString() !== ciudad._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "El técnico no pertenece a la ciudad de la actividad",
      });
    }

    // 2. Validar equipo a instalar
    const equipoInstalado = await EquipoGPS.findOne({
      _id: equipoInstaladoId,
      deletedAt: null,
    });
    if (!equipoInstalado)
      return res
        .status(404)
        .json({ success: false, message: "equipoInstalado no encontrado" });

    if (
      !["DISPONIBLE", "EN_TRANSITO", "EN_POSESION_TECNICO"].includes(
        equipoInstalado.estado,
      )
    ) {
      return res.status(409).json({
        success: false,
        message: `El equipo a instalar debe estar DISPONIBLE, EN_TRANSITO o EN_POSESION_TECNICO. Estado actual: ${equipoInstalado.estado}`,
      });
    }

    // El equipo debe tener un técnico asignado antes de la actividad.
    // El admin lo asigna previamente con POST /equipos/:id/enviar.
    if (!equipoInstalado.tecnico) {
      return res.status(409).json({
        success: false,
        message:
          "El equipo a instalar no tiene técnico asignado. Asígnelo primero con POST /api/gps/equipos/:id/enviar (ciudad y técnico de la sede).",
      });
    }

    // El equipo y el técnico de la actividad deben estar en la misma ciudad.
    if (equipoInstalado.ciudad.toString() !== ciudad._id.toString()) {
      return res.status(400).json({
        success: false,
        message:
          "El equipo a instalar no está en la ciudad de la actividad. Transfiera el equipo a la ciudad correcta antes de registrar.",
      });
    }

    // 3. Resolver equipo retirado (si la actividad lo requiere)
    let equipoRetirado = null;
    let equipoRetiradoExistia = true;
    const requiereRetiro = ActividadGPS.REQUIEREN_RETIRO.has(tipoActividad);

    if (requiereRetiro) {
      if (equipoRetiradoId) {
        equipoRetirado = await EquipoGPS.findOne({
          _id: equipoRetiradoId,
          deletedAt: null,
        });
        if (!equipoRetirado)
          return res
            .status(404)
            .json({ success: false, message: "equipoRetirado no encontrado" });
      } else if (equipoRetiradoNuevo) {
        // Crear sobre la marcha como SEGUNDA, ya usado, en estado INSTALADO
        // (lo siguiente lo va a mover según el destino)
        const nuevoPropNombre =
          equipoRetiradoNuevo.tipoPropiedad === "COMODATO"
            ? equipoRetiradoNuevo.propietarioNombre || "ASEGURAR LTDA"
            : equipoRetiradoNuevo.propietarioNombre;

        equipoRetirado = await EquipoGPS.create({
          imei: equipoRetiradoNuevo.imei,
          serial: equipoRetiradoNuevo.serial || undefined,
          marca: equipoRetiradoNuevo.marca,
          modelo: equipoRetiradoNuevo.modelo,
          condicion: "SEGUNDA",
          yaUsado: true,
          estado: "INSTALADO",
          ciudad: ciudad._id,
          tipoPropiedad: equipoRetiradoNuevo.tipoPropiedad,
          propietarioNombre: nuevoPropNombre,
          historial: [
            {
              accion: "RECIBIDO_SEGUNDA",
              estadoNuevo: "INSTALADO",
              ciudadDestino: ciudad._id,
              usuario: req.user?.userId || null,
              fecha: new Date(),
              observaciones:
                "Auto-registrado durante actividad de cambio (no existía previamente)",
            },
          ],
        });
        equipoRetiradoExistia = false;
      }
    }

    // 4. Lookup de vehículo por placa (opcional)
    let vehiculoRef = null;
    if (placaInstalada) {
      const veh = await Vehiculo.findOne({
        placa: placaInstalada.toUpperCase(),
        deletedAt: null,
      })
        .select("_id")
        .lean();
      if (veh) vehiculoRef = veh._id;
    }

    // 5. Auto-completar propietarioNombre
    const propietarioNombre =
      tipoPropiedad === "COMODATO"
        ? propNombreInput || "ASEGURAR LTDA"
        : propNombreInput;

    // 6. Mutar el equipo instalado
    const ahora = new Date();
    const estadoAnteriorInst = equipoInstalado.estado;
    equipoInstalado.estado = "INSTALADO";
    equipoInstalado.yaUsado = true;
    equipoInstalado.fechaInstalacion = ahora;
    equipoInstalado.ciudad = ciudad._id;
    equipoInstalado.tecnico = tecnico._id;
    equipoInstalado.placaInstalada = placaInstalada;
    equipoInstalado.lineaSim = lineaSim || null;
    equipoInstalado.numeroSim = numeroSim || null;
    equipoInstalado.tipoPropiedad = tipoPropiedad;
    equipoInstalado.propietarioNombre = propietarioNombre;
    if (vehiculoRef) equipoInstalado.vehiculoInstalado = vehiculoRef;

    equipoInstalado.historial.push({
      accion: "REGISTRADO_ACTIVIDAD",
      estadoAnterior: estadoAnteriorInst,
      estadoNuevo: "INSTALADO",
      ciudadDestino: ciudad._id,
      tecnicoNuevo: tecnico._id,
      usuario: req.user?.userId || null,
      fecha: ahora,
      observaciones: `Actividad: ${tipoActividad} | placa: ${placaInstalada}`,
    });
    await equipoInstalado.save();

    // 7. Mutar el equipo retirado (si hay)
    let destinoEquipoRetirado = null;
    if (equipoRetirado) {
      const estadoAnteriorRet = equipoRetirado.estado;
      const tecAntRet = equipoRetirado.tecnico;

      if (tipoActividad === "EQUIPO_DANADO") {
        // Descartado definitivo
        equipoRetirado.estado = "RETIRADO";
        equipoRetirado.tecnico = null;
        equipoRetirado.vehiculoInstalado = null;
        equipoRetirado.fechaRetiro = ahora;
        destinoEquipoRetirado = "DESCARTADO";

        equipoRetirado.historial.push({
          accion: "DESCARTADO",
          estadoAnterior: estadoAnteriorRet,
          estadoNuevo: "RETIRADO",
          tecnicoAnterior: tecAntRet,
          usuario: req.user?.userId || null,
          fecha: ahora,
          observaciones: `Retirado por daño en actividad ${tipoActividad}`,
        });
      } else if (equipoRetirado.tipoPropiedad === "PROPIO") {
        // Devuelto al cliente
        equipoRetirado.estado = "DEVUELTO_CLIENTE";
        equipoRetirado.tecnico = null;
        equipoRetirado.vehiculoInstalado = null;
        equipoRetirado.fechaRetiro = ahora;
        destinoEquipoRetirado = "AL_CLIENTE";

        equipoRetirado.historial.push({
          accion: "DEVUELTO_AL_CLIENTE",
          estadoAnterior: estadoAnteriorRet,
          estadoNuevo: "DEVUELTO_CLIENTE",
          tecnicoAnterior: tecAntRet,
          usuario: req.user?.userId || null,
          fecha: ahora,
          observaciones: `Equipo PROPIO devuelto a ${equipoRetirado.propietarioNombre || "cliente"}`,
        });
      } else {
        // COMODATO → vuelve al centro vía técnico de la actividad
        equipoRetirado.estado = "EN_REVISION";
        equipoRetirado.tecnico = tecnico._id;
        equipoRetirado.ciudad = ciudad._id;
        equipoRetirado.vehiculoInstalado = null;
        equipoRetirado.fechaRetiro = ahora;
        destinoEquipoRetirado = "AL_CENTRO";

        equipoRetirado.historial.push({
          accion: "RETIRADO",
          estadoAnterior: estadoAnteriorRet,
          estadoNuevo: "EN_REVISION",
          tecnicoAnterior: tecAntRet,
          tecnicoNuevo: tecnico._id,
          ciudadDestino: ciudad._id,
          usuario: req.user?.userId || null,
          fecha: ahora,
          observaciones: `Retirado en actividad ${tipoActividad} (COMODATO, vuelve al centro)`,
        });
      }

      await equipoRetirado.save();
    }

    // 8. Crear el registro de actividad
    const actividad = await ActividadGPS.create({
      tipoActividad,
      tecnico: tecnico._id,
      ciudad: ciudad._id,
      registradoPor: {
        userId: req.user?.userId || null,
        username: req.user?.username || null,
      },
      equipoInstalado: equipoInstalado._id,
      equipoRetirado: equipoRetirado?._id || null,
      equipoRetiradoExistia,
      placaInstalada,
      vehiculo: vehiculoRef,
      lineaSim: lineaSim || null,
      numeroSim: numeroSim || null,
      tipoPropiedad,
      propietarioNombre,
      destinoEquipoRetirado,
      fechaActividad: fechaActividad ? new Date(fechaActividad) : ahora,
      observaciones: observaciones || null,
    });

    const populated = await ActividadGPS.findById(actividad._id)
      .populate("tecnico", "nombres apellidos identificacion")
      .populate("ciudad", "nombre esCentral")
      .populate({
        path: "equipoInstalado",
        populate: [{ path: "marca", select: "nombre" }, { path: "modelo", select: "nombre" }],
      })
      .populate({
        path: "equipoRetirado",
        populate: [{ path: "marca", select: "nombre" }, { path: "modelo", select: "nombre" }],
      })
      .populate("vehiculo", "placa numeroInterno")
      .lean();

    res.status(201).json({
      success: true,
      message: "Actividad registrada",
      data: populated,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "IMEI duplicado al auto-crear equipo retirado",
      });
    }
    logger.error(`Error creando actividad GPS: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listarActividades = async (req, res) => {
  try {
    const {
      tipoActividad,
      tecnico,
      ciudad,
      placa,
      desde,
      hasta,
      includeDeleted = false,
      page = 1,
      limit = 50,
    } = req.query;

    const query = {};
    if (!includeDeleted || includeDeleted === "false") query.deletedAt = null;
    if (tipoActividad) query.tipoActividad = tipoActividad;
    if (tecnico) query.tecnico = tecnico;
    if (ciudad) query.ciudad = ciudad;
    if (placa) query.placaInstalada = placa.toUpperCase();
    if (desde || hasta) {
      query.fechaActividad = {};
      if (desde) query.fechaActividad.$gte = new Date(desde);
      if (hasta) query.fechaActividad.$lte = new Date(hasta);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const actividades = await ActividadGPS.find(query)
      .sort({ fechaActividad: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate("tecnico", "nombres apellidos")
      .populate("ciudad", "nombre")
      .populate("equipoInstalado", "imei serial")
      .populate("equipoRetirado", "imei serial")
      .lean();

    const total = await ActividadGPS.countDocuments(query);

    res.json({
      success: true,
      data: actividades,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error(`Error listando actividades GPS: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.obtenerActividad = async (req, res) => {
  try {
    const actividad = await ActividadGPS.findOne({
      _id: req.params.id,
      deletedAt: null,
    })
      .populate("tecnico", "nombres apellidos identificacion telefono")
      .populate("ciudad", "nombre departamento esCentral")
      .populate({
        path: "equipoInstalado",
        populate: [
          { path: "marca", select: "nombre" },
          { path: "modelo", select: "nombre" },
        ],
      })
      .populate({
        path: "equipoRetirado",
        populate: [
          { path: "marca", select: "nombre" },
          { path: "modelo", select: "nombre" },
        ],
      })
      .populate("vehiculo", "placa numeroInterno marca linea")
      .lean();

    if (!actividad)
      return res
        .status(404)
        .json({ success: false, message: "Actividad no encontrada" });

    res.json({ success: true, data: actividad });
  } catch (error) {
    logger.error(`Error obteniendo actividad GPS: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PUT /actividades/:id
 * Edición SEGURA de una actividad: solo permite cambiar datos que NO mueven el
 * inventario (placa, línea/SIM, número SIM, propiedad/propietario, fecha y
 * observaciones). NO se permite cambiar equipo instalado/retirado, técnico,
 * ciudad ni tipo de actividad, porque eso requeriría revertir y re-aplicar los
 * movimientos de inventario. Para esos casos: eliminar y volver a crear.
 *
 * Los cambios de placa/SIM/propiedad se sincronizan al equipo instalado.
 */
exports.actualizarActividad = async (req, res) => {
  try {
    const actividad = await ActividadGPS.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!actividad)
      return res
        .status(404)
        .json({ success: false, message: "Actividad no encontrada" });

    const {
      placaInstalada,
      lineaSim,
      numeroSim,
      tipoPropiedad,
      propietarioNombre,
      fechaActividad,
      observaciones,
    } = req.body;

    // Propiedad / propietario (auto-completar para COMODATO)
    const tipoPropFinal =
      tipoPropiedad !== undefined ? tipoPropiedad : actividad.tipoPropiedad;
    let propFinal =
      propietarioNombre !== undefined
        ? propietarioNombre
        : actividad.propietarioNombre;
    if (tipoPropFinal === "COMODATO") propFinal = propFinal || "ASEGURAR LTDA";

    // Resolver vehículo si cambia la placa
    let vehiculoRef = actividad.vehiculo;
    let placaFinal = actividad.placaInstalada;
    if (placaInstalada !== undefined) {
      placaFinal = placaInstalada ? placaInstalada.toUpperCase() : placaInstalada;
      vehiculoRef = null;
      if (placaFinal) {
        const veh = await Vehiculo.findOne({
          placa: placaFinal,
          deletedAt: null,
        })
          .select("_id")
          .lean();
        if (veh) vehiculoRef = veh._id;
      }
    }

    if (placaInstalada !== undefined) {
      actividad.placaInstalada = placaFinal;
      actividad.vehiculo = vehiculoRef;
    }
    if (lineaSim !== undefined) actividad.lineaSim = lineaSim || null;
    if (numeroSim !== undefined) actividad.numeroSim = numeroSim || null;
    actividad.tipoPropiedad = tipoPropFinal;
    actividad.propietarioNombre = propFinal;
    if (fechaActividad !== undefined && fechaActividad)
      actividad.fechaActividad = new Date(fechaActividad);
    if (observaciones !== undefined) actividad.observaciones = observaciones || null;

    await actividad.save();

    // Sincronizar el equipo instalado (si sigue vinculado y no eliminado).
    if (actividad.equipoInstalado) {
      const equipo = await EquipoGPS.findOne({
        _id: actividad.equipoInstalado,
        deletedAt: null,
      });
      if (equipo) {
        if (placaInstalada !== undefined) {
          equipo.placaInstalada = placaFinal;
          if (vehiculoRef) equipo.vehiculoInstalado = vehiculoRef;
        }
        if (lineaSim !== undefined) equipo.lineaSim = lineaSim || null;
        if (numeroSim !== undefined) equipo.numeroSim = numeroSim || null;
        equipo.tipoPropiedad = tipoPropFinal;
        equipo.propietarioNombre = propFinal;
        equipo.historial.push({
          accion: "ACTUALIZADO",
          estadoAnterior: equipo.estado,
          estadoNuevo: equipo.estado,
          usuario: req.user?.userId || null,
          fecha: new Date(),
          observaciones: "Datos sincronizados por edición de actividad",
        });
        await equipo.save();
      }
    }

    const populated = await ActividadGPS.findById(actividad._id)
      .populate("tecnico", "nombres apellidos identificacion")
      .populate("ciudad", "nombre esCentral")
      .populate({
        path: "equipoInstalado",
        populate: [
          { path: "marca", select: "nombre" },
          { path: "modelo", select: "nombre" },
        ],
      })
      .populate({
        path: "equipoRetirado",
        populate: [
          { path: "marca", select: "nombre" },
          { path: "modelo", select: "nombre" },
        ],
      })
      .populate("vehiculo", "placa numeroInterno")
      .lean();

    res.json({
      success: true,
      message: "Actividad actualizada",
      data: populated,
    });
  } catch (error) {
    logger.error(`Error actualizando actividad GPS: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.eliminarActividad = async (req, res) => {
  try {
    const actividad = await ActividadGPS.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!actividad)
      return res
        .status(404)
        .json({ success: false, message: "Actividad no encontrada" });

    await actividad.softDelete(req.user?.userId);
    res.json({ success: true, message: "Actividad eliminada (soft)" });
  } catch (error) {
    logger.error(`Error eliminando actividad GPS: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════════════════════════════
// REPORTE: EQUIPOS DEVUELTOS AL CLIENTE
// ════════════════════════════════════════════════════════════════

exports.reporteEquiposDevueltos = async (req, res) => {
  try {
    // Solo aplica filtro de rango si vienen periodo/desde/hasta en la query;
    // sin nada → devuelve histórico completo (comportamiento previo).
    const aplicaRango =
      !!req.query.periodo || !!req.query.desde || !!req.query.hasta;
    const { desde, hasta, etiqueta } = aplicaRango
      ? resolverRango(req.query)
      : { desde: null, hasta: null, etiqueta: "historico" };

    const query = { estado: "DEVUELTO_CLIENTE", deletedAt: null };
    if (aplicaRango) {
      query.fechaRetiro = { $gte: desde, $lte: hasta };
    }

    const equipos = await EquipoGPS.find(query)
      .populate("marca", "nombre")
      .populate("modelo", "nombre")
      .populate("ciudad", "nombre")
      .sort({ fechaRetiro: -1 })
      .lean();

    // Para cada equipo, traer la última actividad que lo retiró
    const equipoIds = equipos.map((e) => e._id);
    const actividades = await ActividadGPS.find({
      equipoRetirado: { $in: equipoIds },
      destinoEquipoRetirado: "AL_CLIENTE",
      deletedAt: null,
    })
      .sort({ fechaActividad: -1 })
      .populate("tecnico", "nombres apellidos")
      .lean();

    const ultimaActividadPorEquipo = {};
    for (const a of actividades) {
      const key = a.equipoRetirado.toString();
      if (!ultimaActividadPorEquipo[key]) ultimaActividadPorEquipo[key] = a;
    }

    const data = equipos.map((e) => ({
      ...e,
      actividadDevolucion: ultimaActividadPorEquipo[e._id.toString()] || null,
    }));

    res.json({
      success: true,
      data: {
        rango: aplicaRango
          ? { desde, hasta, etiqueta }
          : { etiqueta: "historico" },
        total: data.length,
        equipos: data,
      },
    });
  } catch (error) {
    logger.error(
      `Error generando reporte de equipos devueltos: ${error.message}`,
    );
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════

exports.dashboard = async (req, res) => {
  try {
    const { desde, hasta, etiqueta } = resolverRango(req.query);
    const ahora = new Date();

    // ─── Counts globales por estado ───
    const porEstadoAgg = await EquipoGPS.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: "$estado", total: { $sum: 1 } } },
    ]);
    const porEstado = Object.fromEntries(
      porEstadoAgg.map((x) => [x._id, x.total]),
    );

    const totalEquipos = porEstadoAgg.reduce((s, x) => s + x.total, 0);
    const totalActivos = porEstado.INSTALADO || 0;
    const totalDisponibles = porEstado.DISPONIBLE || 0;
    const totalEnTransito = porEstado.EN_TRANSITO || 0;
    const totalEnPosesionTecnico = porEstado.EN_POSESION_TECNICO || 0;
    const totalEnRevision = porEstado.EN_REVISION || 0;
    const totalEnGarantia = porEstado.EN_GARANTIA || 0;
    const totalDevueltosCliente = porEstado.DEVUELTO_CLIENTE || 0;
    const totalRetirados = porEstado.RETIRADO || 0;

    // Stock central
    const central = await getCiudadCentral();
    let stockCentral = 0;
    if (central) {
      stockCentral = await EquipoGPS.countDocuments({
        ciudad: central._id,
        estado: "DISPONIBLE",
        deletedAt: null,
      });
    }

    const denomUtil =
      totalActivos +
      totalDisponibles +
      totalEnTransito +
      totalEnPosesionTecnico;
    const porcentajeUtilizacion =
      denomUtil > 0 ? Math.round((totalActivos / denomUtil) * 100) : 0;

    const STOCK_MINIMO = 10;

    // ─── Actividades del período ───
    const actividadesAgg = await ActividadGPS.aggregate([
      {
        $match: {
          deletedAt: null,
          fechaActividad: { $gte: desde, $lte: hasta },
        },
      },
      { $group: { _id: "$tipoActividad", total: { $sum: 1 } } },
    ]);
    const actividadesPorTipo = Object.fromEntries(
      actividadesAgg.map((x) => [x._id, x.total]),
    );
    const totalActividades = actividadesAgg.reduce(
      (s, x) => s + x.total,
      0,
    );

    const sumarActividades = (tipos) =>
      tipos.reduce((s, t) => s + (actividadesPorTipo[t] || 0), 0);

    // ─── Movimientos del período (historial) ───
    const movAgg = await EquipoGPS.aggregate([
      { $match: { deletedAt: null } },
      { $unwind: "$historial" },
      {
        $match: {
          "historial.fecha": { $gte: desde, $lte: hasta },
        },
      },
      {
        $group: {
          _id: { accion: "$historial.accion", condicion: "$condicion" },
          total: { $sum: 1 },
        },
      },
    ]);
    const sumarMov = (acciones, condicion) => {
      const arr = Array.isArray(acciones) ? acciones : [acciones];
      return movAgg
        .filter(
          (m) =>
            arr.includes(m._id.accion) &&
            (condicion ? m._id.condicion === condicion : true),
        )
        .reduce((s, m) => s + m.total, 0);
    };

    const movimientosPeriodo = {
      recibidosNuevos: sumarMov("CREADO", "NUEVO"),
      recibidosSegunda:
        sumarMov("RECIBIDO_SEGUNDA") + sumarMov("CREADO", "SEGUNDA"),
      enviadosASede: sumarMov("ENVIADO"),
      instalados: sumarMov("INSTALADO"),
      retirados: sumarMov("RETIRADO"),
      enviadosGarantia: sumarMov("ENVIADO_GARANTIA"),
      recibidosGarantia: sumarMov("RECIBIDO_GARANTIA"),
      descartados: sumarMov("DESCARTADO"),
      devueltosCliente: sumarMov("DEVUELTO_AL_CLIENTE"),
    };

    // ─── Top técnicos por actividades del período ───
    const tecnicosTop = await ActividadGPS.aggregate([
      {
        $match: {
          deletedAt: null,
          fechaActividad: { $gte: desde, $lte: hasta },
        },
      },
      { $group: { _id: "$tecnico", totalActividades: { $sum: 1 } } },
      { $sort: { totalActividades: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "tecnicogps",
          localField: "_id",
          foreignField: "_id",
          as: "_tecnico",
        },
      },
      { $unwind: "$_tecnico" },
      {
        $lookup: {
          from: "ciudadgps",
          localField: "_tecnico.ciudad",
          foreignField: "_id",
          as: "_ciudad",
        },
      },
      {
        $project: {
          _id: 0,
          totalActividades: 1,
          tecnico: {
            _id: "$_tecnico._id",
            nombres: "$_tecnico.nombres",
            apellidos: "$_tecnico.apellidos",
            ciudad: { $arrayElemAt: ["$_ciudad.nombre", 0] },
          },
        },
      },
    ]);

    // ─── Ciudades con más inventario (INSTALADO se excluye del conteo por ciudad) ───
    const ciudadesAgg = await EquipoGPS.aggregate([
      { $match: { deletedAt: null, estado: { $ne: "INSTALADO" } } },
      {
        $group: {
          _id: { ciudad: "$ciudad", estado: "$estado" },
          total: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "ciudadgps",
          localField: "_id.ciudad",
          foreignField: "_id",
          as: "_ciudad",
        },
      },
      {
        $project: {
          ciudad: { $arrayElemAt: ["$_ciudad.nombre", 0] },
          esCentral: { $arrayElemAt: ["$_ciudad.esCentral", 0] },
          estado: "$_id.estado",
          total: 1,
          _id: 0,
        },
      },
    ]);
    const ciudadesMap = {};
    for (const row of ciudadesAgg) {
      const k = row.ciudad || "(sin ciudad)";
      if (!ciudadesMap[k]) {
        ciudadesMap[k] = {
          ciudad: k,
          esCentral: !!row.esCentral,
          totalEquipos: 0,
          porEstado: {},
        };
      }
      ciudadesMap[k].porEstado[row.estado] =
        (ciudadesMap[k].porEstado[row.estado] || 0) + row.total;
      ciudadesMap[k].totalEquipos += row.total;
    }
    const ciudadesConMasInventario = Object.values(ciudadesMap)
      .sort((a, b) => b.totalEquipos - a.totalEquipos)
      .slice(0, 5);

    // ─── Modelos más usados ───
    const modelosAgg = await EquipoGPS.aggregate([
      { $match: { deletedAt: null } },
      {
        $group: {
          _id: { marca: "$marca", modelo: "$modelo", estado: "$estado" },
          total: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "marcagps",
          localField: "_id.marca",
          foreignField: "_id",
          as: "_marca",
        },
      },
      {
        $lookup: {
          from: "modelogps",
          localField: "_id.modelo",
          foreignField: "_id",
          as: "_modelo",
        },
      },
      {
        $project: {
          marca: { $arrayElemAt: ["$_marca.nombre", 0] },
          modelo: { $arrayElemAt: ["$_modelo.nombre", 0] },
          estado: "$_id.estado",
          total: 1,
          _id: 0,
        },
      },
    ]);
    const modelosMap = {};
    for (const row of modelosAgg) {
      const key = `${row.marca || "?"}|${row.modelo || "?"}`;
      if (!modelosMap[key]) {
        modelosMap[key] = {
          marca: row.marca,
          modelo: row.modelo,
          totalInstalados: 0,
          totalDisponibles: 0,
          total: 0,
        };
      }
      const m = modelosMap[key];
      if (row.estado === "INSTALADO") m.totalInstalados += row.total;
      if (row.estado === "DISPONIBLE") m.totalDisponibles += row.total;
      m.total += row.total;
    }
    const modelosMasUsados = Object.values(modelosMap)
      .sort((a, b) => b.totalInstalados - a.totalInstalados)
      .slice(0, 5);

    // ─── Alertas ───
    const alertas = [];
    if (stockCentral < STOCK_MINIMO) {
      alertas.push({
        tipo: "STOCK_BAJO",
        mensaje: `Stock central por debajo del mínimo (${stockCentral} equipos)`,
        severidad: "alta",
      });
    }
    const limite30 = new Date(ahora);
    limite30.setDate(limite30.getDate() - 30);
    const enRevisionProlongada = await EquipoGPS.countDocuments({
      estado: "EN_REVISION",
      deletedAt: null,
      updatedAt: { $lt: limite30 },
    });
    if (enRevisionProlongada > 0) {
      alertas.push({
        tipo: "EN_REVISION_PROLONGADA",
        mensaje: `${enRevisionProlongada} equipo(s) llevan más de 30 días en EN_REVISION`,
        severidad: "media",
      });
    }
    const limite60 = new Date(ahora);
    limite60.setDate(limite60.getDate() - 60);
    const enGarantiaProlongada = await EquipoGPS.countDocuments({
      estado: "EN_GARANTIA",
      deletedAt: null,
      updatedAt: { $lt: limite60 },
    });
    if (enGarantiaProlongada > 0) {
      alertas.push({
        tipo: "EN_GARANTIA_PROLONGADA",
        mensaje: `${enGarantiaProlongada} equipo(s) llevan más de 60 días EN_GARANTIA`,
        severidad: "media",
      });
    }

    res.json({
      success: true,
      data: {
        rango: { desde, hasta, etiqueta },
        kpis: {
          totalEquipos,
          totalActivos,
          totalDisponibles,
          totalEnTransito,
          totalEnPosesionTecnico,
          totalEnRevision,
          totalEnGarantia,
          totalDevueltosCliente,
          totalRetirados,
          porcentajeUtilizacion,
          stockCentral,
          stockMinimoSugerido: STOCK_MINIMO,
        },
        actividadesPeriodo: {
          total: totalActividades,
          porTipo: actividadesPorTipo,
          instalacionesNuevas: actividadesPorTipo.INSTALACION_NUEVA || 0,
          cambios: sumarActividades([
            "CAMBIO_2G_4G",
            "CAMBIO_CON_COSTO",
            "CAMBIO_SIN_COSTO",
            "CAMBIO_COMODATO",
          ]),
          homologaciones: actividadesPorTipo.HOMOLOGACION || 0,
          garantias: actividadesPorTipo.GARANTIA || 0,
          danados: actividadesPorTipo.EQUIPO_DANADO || 0,
          pruebas: actividadesPorTipo.PRUEBAS || 0,
        },
        movimientosPeriodo,
        tecnicosTopActividades: tecnicosTop,
        ciudadesConMasInventario,
        modelosMasUsados,
        alertas,
      },
    });
  } catch (error) {
    logger.error(`Error generando dashboard GPS: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /reportes/general
 * Reporte completo del período. Incluye:
 *   - resumen ejecutivo (KPIs)
 *   - todas las actividades del período (populated)
 *   - todos los movimientos del período (eventos del historial de cada equipo)
 *   - asignaciones técnico → equipos (snapshot actual: quién tiene qué)
 *   - tabla resumen por ciudad: cuántos equipos por modelo y condición
 *
 * Query: ?periodo=mensual|semanal o ?desde=&hasta=
 */
exports.reporteGeneral = async (req, res) => {
  try {
    const { desde, hasta, etiqueta } = resolverRango(req.query);

    // ─── 1. KPIs por estado (snapshot global) ───
    const porEstadoAgg = await EquipoGPS.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: "$estado", total: { $sum: 1 } } },
    ]);
    const porEstado = Object.fromEntries(
      porEstadoAgg.map((x) => [x._id, x.total]),
    );

    const central = await getCiudadCentral();
    const stockCentral = central
      ? await EquipoGPS.countDocuments({
          ciudad: central._id,
          estado: "DISPONIBLE",
          deletedAt: null,
        })
      : 0;

    // ─── 2. Actividades del período (con detalle populated) ───
    const actividades = await ActividadGPS.find({
      deletedAt: null,
      fechaActividad: { $gte: desde, $lte: hasta },
    })
      .sort({ fechaActividad: -1 })
      .populate("tecnico", "nombres apellidos identificacion")
      .populate("ciudad", "nombre departamento esCentral")
      .populate({
        path: "equipoInstalado",
        select: "imei serial marca modelo condicion estado tipoPropiedad propietarioNombre",
        populate: [
          { path: "marca", select: "nombre" },
          { path: "modelo", select: "nombre" },
        ],
      })
      .populate({
        path: "equipoRetirado",
        select: "imei serial marca modelo condicion estado tipoPropiedad propietarioNombre",
        populate: [
          { path: "marca", select: "nombre" },
          { path: "modelo", select: "nombre" },
        ],
      })
      .populate("vehiculo", "placa numeroInterno")
      .lean();

    const actividadesPorTipo = {};
    for (const a of actividades) {
      actividadesPorTipo[a.tipoActividad] =
        (actividadesPorTipo[a.tipoActividad] || 0) + 1;
    }

    // ─── 3. Movimientos del período (historial de equipos) ───
    const movimientosAgg = await EquipoGPS.aggregate([
      { $match: { deletedAt: null } },
      { $unwind: "$historial" },
      {
        $match: {
          "historial.fecha": { $gte: desde, $lte: hasta },
        },
      },
      {
        $lookup: {
          from: "marcagps",
          localField: "marca",
          foreignField: "_id",
          as: "_marca",
        },
      },
      {
        $lookup: {
          from: "modelogps",
          localField: "modelo",
          foreignField: "_id",
          as: "_modelo",
        },
      },
      {
        $lookup: {
          from: "ciudadgps",
          localField: "historial.ciudadDestino",
          foreignField: "_id",
          as: "_ciudadDestino",
        },
      },
      {
        $lookup: {
          from: "tecnicogps",
          localField: "historial.tecnicoNuevo",
          foreignField: "_id",
          as: "_tecnico",
        },
      },
      {
        $project: {
          equipoId: "$_id",
          imei: "$imei",
          condicion: "$condicion",
          marca: { $arrayElemAt: ["$_marca.nombre", 0] },
          modelo: { $arrayElemAt: ["$_modelo.nombre", 0] },
          accion: "$historial.accion",
          fecha: "$historial.fecha",
          estadoAnterior: "$historial.estadoAnterior",
          estadoNuevo: "$historial.estadoNuevo",
          ciudadDestino: { $arrayElemAt: ["$_ciudadDestino.nombre", 0] },
          tecnico: {
            $cond: [
              { $gt: [{ $size: "$_tecnico" }, 0] },
              {
                nombres: { $arrayElemAt: ["$_tecnico.nombres", 0] },
                apellidos: { $arrayElemAt: ["$_tecnico.apellidos", 0] },
              },
              null,
            ],
          },
          observaciones: "$historial.observaciones",
        },
      },
      { $sort: { fecha: -1 } },
    ]);

    const movimientosPorAccion = {};
    for (const m of movimientosAgg) {
      movimientosPorAccion[m.accion] =
        (movimientosPorAccion[m.accion] || 0) + 1;
    }

    // ─── 4. Asignaciones técnico → equipos (snapshot actual) ───
    const asignacionesAgg = await EquipoGPS.aggregate([
      {
        $match: {
          deletedAt: null,
          tecnico: { $ne: null },
          estado: {
            $in: ["EN_TRANSITO", "EN_POSESION_TECNICO", "INSTALADO", "EN_REVISION"],
          },
        },
      },
      {
        $lookup: {
          from: "tecnicogps",
          localField: "tecnico",
          foreignField: "_id",
          as: "_tecnico",
        },
      },
      {
        $lookup: {
          from: "ciudadgps",
          localField: "ciudad",
          foreignField: "_id",
          as: "_ciudad",
        },
      },
      {
        $lookup: {
          from: "marcagps",
          localField: "marca",
          foreignField: "_id",
          as: "_marca",
        },
      },
      {
        $lookup: {
          from: "modelogps",
          localField: "modelo",
          foreignField: "_id",
          as: "_modelo",
        },
      },
      {
        $project: {
          tecnicoId: "$tecnico",
          tecnicoNombres: { $arrayElemAt: ["$_tecnico.nombres", 0] },
          tecnicoApellidos: { $arrayElemAt: ["$_tecnico.apellidos", 0] },
          tecnicoIdentificacion: { $arrayElemAt: ["$_tecnico.identificacion", 0] },
          ciudad: { $arrayElemAt: ["$_ciudad.nombre", 0] },
          equipo: {
            _id: "$_id",
            imei: "$imei",
            serial: "$serial",
            estado: "$estado",
            condicion: "$condicion",
            placaInstalada: "$placaInstalada",
            marca: { $arrayElemAt: ["$_marca.nombre", 0] },
            modelo: { $arrayElemAt: ["$_modelo.nombre", 0] },
          },
        },
      },
      { $sort: { tecnicoApellidos: 1 } },
    ]);

    // Agrupar por técnico
    const asignacionesPorTecnico = {};
    for (const r of asignacionesAgg) {
      const key = r.tecnicoId.toString();
      if (!asignacionesPorTecnico[key]) {
        asignacionesPorTecnico[key] = {
          tecnico: {
            _id: r.tecnicoId,
            nombres: r.tecnicoNombres,
            apellidos: r.tecnicoApellidos,
            identificacion: r.tecnicoIdentificacion,
            ciudad: r.ciudad,
          },
          totalEquipos: 0,
          porEstado: {},
          equipos: [],
        };
      }
      const t = asignacionesPorTecnico[key];
      t.equipos.push(r.equipo);
      t.totalEquipos += 1;
      t.porEstado[r.equipo.estado] =
        (t.porEstado[r.equipo.estado] || 0) + 1;
    }
    const asignaciones = Object.values(asignacionesPorTecnico);

    // ─── 5. Tabla resumen por ciudad (modelo + condición) ───
    // INSTALADO se excluye del inventario por ciudad y se reporta aparte.
    const filasCiudad = await EquipoGPS.aggregate([
      {
        $match: {
          deletedAt: null,
          estado: {
            $in: [
              "DISPONIBLE",
              "EN_TRANSITO",
              "EN_POSESION_TECNICO",
              "EN_REVISION",
            ],
          },
        },
      },
      {
        $lookup: {
          from: "ciudadgps",
          localField: "ciudad",
          foreignField: "_id",
          as: "_ciudad",
        },
      },
      {
        $lookup: {
          from: "marcagps",
          localField: "marca",
          foreignField: "_id",
          as: "_marca",
        },
      },
      {
        $lookup: {
          from: "modelogps",
          localField: "modelo",
          foreignField: "_id",
          as: "_modelo",
        },
      },
      {
        $group: {
          _id: {
            ciudad: { $arrayElemAt: ["$_ciudad.nombre", 0] },
            esCentral: { $arrayElemAt: ["$_ciudad.esCentral", 0] },
            marca: { $arrayElemAt: ["$_marca.nombre", 0] },
            modelo: { $arrayElemAt: ["$_modelo.nombre", 0] },
            condicion: "$condicion",
            estado: "$estado",
          },
          total: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          ciudad: "$_id.ciudad",
          esCentral: "$_id.esCentral",
          marca: "$_id.marca",
          modelo: "$_id.modelo",
          condicion: "$_id.condicion",
          estado: "$_id.estado",
          total: 1,
        },
      },
      { $sort: { ciudad: 1, modelo: 1 } },
    ]);

    const ciudadesMap = {};
    for (const f of filasCiudad) {
      const k = f.ciudad || "(sin ciudad)";
      if (!ciudadesMap[k]) {
        ciudadesMap[k] = {
          ciudad: k,
          esCentral: !!f.esCentral,
          totalEquipos: 0,
          porEstado: {},
          modelos: {},
        };
      }
      const c = ciudadesMap[k];
      const mk = `${f.marca || "?"} ${f.modelo || "?"}`;
      if (!c.modelos[mk]) {
        c.modelos[mk] = {
          marca: f.marca,
          modelo: f.modelo,
          nuevos: 0,
          segunda: 0,
          total: 0,
        };
      }
      const m = c.modelos[mk];
      if (f.condicion === "NUEVO") m.nuevos += f.total;
      if (f.condicion === "SEGUNDA") m.segunda += f.total;
      m.total += f.total;
      c.totalEquipos += f.total;
      c.porEstado[f.estado] = (c.porEstado[f.estado] || 0) + f.total;
    }

    const tablaPorCiudad = Object.values(ciudadesMap)
      .sort((a, b) =>
        a.esCentral === b.esCentral
          ? a.ciudad.localeCompare(b.ciudad)
          : a.esCentral
            ? -1
            : 1,
      )
      .map((c) => {
        const fragmentos = [];
        for (const m of Object.values(c.modelos)) {
          const label = `${m.marca || ""} ${m.modelo || ""}`.trim();
          if (m.nuevos) fragmentos.push(`${m.nuevos} ${label} nuevos`);
          if (m.segunda) fragmentos.push(`${m.segunda} ${label} segunda`);
        }
        return {
          ciudad: c.ciudad,
          esCentral: c.esCentral,
          totalEquipos: c.totalEquipos,
          porEstado: c.porEstado,
          modelos: Object.values(c.modelos),
          resumen: `${c.ciudad}: ${fragmentos.join(", ") || "sin equipos"}`,
        };
      });

    const resumenTexto = tablaPorCiudad.map((t) => t.resumen).join(" | ");

    // Equipos instalados, fuera del conteo por ciudad.
    const instalados = await resumenInstaladosGlobal();

    res.json({
      success: true,
      data: {
        rango: { desde, hasta, etiqueta },

        instalados,

        kpis: {
          totalEquipos: porEstadoAgg.reduce((s, x) => s + x.total, 0),
          porEstado,
          stockCentral,
        },

        actividadesPeriodo: {
          total: actividades.length,
          porTipo: actividadesPorTipo,
          detalle: actividades,
        },

        movimientosPeriodo: {
          total: movimientosAgg.length,
          porAccion: movimientosPorAccion,
          detalle: movimientosAgg,
        },

        asignacionesTecnicoEquipo: {
          totalTecnicos: asignaciones.length,
          totalEquipos: asignaciones.reduce(
            (s, t) => s + t.totalEquipos,
            0,
          ),
          tecnicos: asignaciones,
        },

        tablaPorCiudad: {
          totalCiudades: tablaPorCiudad.length,
          totalEquipos: tablaPorCiudad.reduce(
            (s, c) => s + c.totalEquipos,
            0,
          ),
          ciudades: tablaPorCiudad,
          resumenTexto,
        },
      },
    });
  } catch (error) {
    logger.error(`Error generando reporte general: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════════════════════════════
// RESTORE & HARD DELETE
// ════════════════════════════════════════════════════════════════

/**
 * Helper: restaurar (deshacer soft delete) genérico.
 */
async function restoreDoc(Model, id) {
  const doc = await Model.findById(id);
  if (!doc) return { error: { status: 404, message: "No encontrado" } };
  if (!doc.deletedAt)
    return { error: { status: 400, message: "El documento no está eliminado" } };
  await doc.restore();
  return { doc };
}

exports.restoreMarca = async (req, res) => {
  const { error, doc } = await restoreDoc(MarcaGPS, req.params.id);
  if (error) return res.status(error.status).json({ success: false, message: error.message });
  res.json({ success: true, message: "Marca restaurada", data: doc });
};

exports.restoreModelo = async (req, res) => {
  const { error, doc } = await restoreDoc(ModeloGPS, req.params.id);
  if (error) return res.status(error.status).json({ success: false, message: error.message });
  res.json({ success: true, message: "Modelo restaurado", data: doc });
};

exports.restoreCiudad = async (req, res) => {
  const { error, doc } = await restoreDoc(CiudadGPS, req.params.id);
  if (error) return res.status(error.status).json({ success: false, message: error.message });
  res.json({ success: true, message: "Ciudad restaurada", data: doc });
};

exports.restoreTecnico = async (req, res) => {
  const { error, doc } = await restoreDoc(TecnicoGPS, req.params.id);
  if (error) return res.status(error.status).json({ success: false, message: error.message });
  res.json({ success: true, message: "Técnico restaurado", data: doc });
};

exports.restoreEquipo = async (req, res) => {
  const { error, doc } = await restoreDoc(EquipoGPS, req.params.id);
  if (error) return res.status(error.status).json({ success: false, message: error.message });
  res.json({ success: true, message: "Equipo restaurado", data: doc });
};

exports.restoreActividad = async (req, res) => {
  // ActividadGPS no tiene método restore en el schema; lo hacemos aquí.
  const doc = await ActividadGPS.findById(req.params.id);
  if (!doc)
    return res.status(404).json({ success: false, message: "No encontrado" });
  if (!doc.deletedAt)
    return res
      .status(400)
      .json({ success: false, message: "El documento no está eliminado" });
  doc.deletedAt = null;
  doc.deletedBy = null;
  await doc.save();
  res.json({ success: true, message: "Actividad restaurada", data: doc });
};

// ─── HARD DELETE ─────────────────────────────────────────────────
// Eliminación física definitiva. Cada uno valida integridad referencial.

exports.hardDeleteMarca = async (req, res) => {
  try {
    const marca = await MarcaGPS.findById(req.params.id);
    if (!marca)
      return res.status(404).json({ success: false, message: "Marca no encontrada" });

    const modelos = await ModeloGPS.countDocuments({ marca: marca._id });
    const equipos = await EquipoGPS.countDocuments({ marca: marca._id });
    if (modelos > 0 || equipos > 0) {
      return res.status(409).json({
        success: false,
        message: `No se puede eliminar permanentemente: ${modelos} modelo(s) y ${equipos} equipo(s) referencian esta marca`,
      });
    }
    await marca.deleteOne();
    res.json({ success: true, message: "Marca eliminada permanentemente" });
  } catch (error) {
    logger.error(`Error hard delete marca: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.hardDeleteModelo = async (req, res) => {
  try {
    const modelo = await ModeloGPS.findById(req.params.id);
    if (!modelo)
      return res.status(404).json({ success: false, message: "Modelo no encontrado" });

    const equipos = await EquipoGPS.countDocuments({ modelo: modelo._id });
    if (equipos > 0) {
      return res.status(409).json({
        success: false,
        message: `No se puede eliminar permanentemente: ${equipos} equipo(s) referencian este modelo`,
      });
    }
    await modelo.deleteOne();
    res.json({ success: true, message: "Modelo eliminado permanentemente" });
  } catch (error) {
    logger.error(`Error hard delete modelo: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.hardDeleteCiudad = async (req, res) => {
  try {
    const ciudad = await CiudadGPS.findById(req.params.id);
    if (!ciudad)
      return res.status(404).json({ success: false, message: "Ciudad no encontrada" });

    if (ciudad.esCentral) {
      return res.status(409).json({
        success: false,
        message: "No se puede eliminar permanentemente la ciudad central",
      });
    }
    const [equipos, tecnicos, actividades] = await Promise.all([
      EquipoGPS.countDocuments({ ciudad: ciudad._id }),
      TecnicoGPS.countDocuments({ ciudad: ciudad._id }),
      ActividadGPS.countDocuments({ ciudad: ciudad._id }),
    ]);
    if (equipos > 0 || tecnicos > 0 || actividades > 0) {
      return res.status(409).json({
        success: false,
        message: `No se puede eliminar permanentemente: ${equipos} equipo(s), ${tecnicos} técnico(s), ${actividades} actividad(es) la referencian`,
      });
    }
    await ciudad.deleteOne();
    res.json({ success: true, message: "Ciudad eliminada permanentemente" });
  } catch (error) {
    logger.error(`Error hard delete ciudad: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.hardDeleteTecnico = async (req, res) => {
  try {
    const tecnico = await TecnicoGPS.findById(req.params.id);
    if (!tecnico)
      return res.status(404).json({ success: false, message: "Técnico no encontrado" });

    const [equipos, actividades] = await Promise.all([
      EquipoGPS.countDocuments({ tecnico: tecnico._id }),
      ActividadGPS.countDocuments({ tecnico: tecnico._id }),
    ]);
    if (equipos > 0 || actividades > 0) {
      return res.status(409).json({
        success: false,
        message: `No se puede eliminar permanentemente: ${equipos} equipo(s) y ${actividades} actividad(es) referencian este técnico`,
      });
    }
    await tecnico.deleteOne();
    res.json({ success: true, message: "Técnico eliminado permanentemente" });
  } catch (error) {
    logger.error(`Error hard delete técnico: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Hard delete equipo: solo permitido en estados terminales o si ya está soft-deleted.
 * Si tiene actividades vinculadas, las desvincula (deja la actividad pero pone null
 * en equipoInstalado/equipoRetirado) — la actividad como evento histórico se preserva.
 */
exports.hardDeleteEquipo = async (req, res) => {
  try {
    const equipo = await EquipoGPS.findById(req.params.id);
    if (!equipo)
      return res.status(404).json({ success: false, message: "Equipo no encontrado" });

    const estadosBloqueados = [
      "INSTALADO",
      "EN_TRANSITO",
      "EN_POSESION_TECNICO",
      "EN_GARANTIA",
    ];
    if (!equipo.deletedAt && estadosBloqueados.includes(equipo.estado)) {
      return res.status(409).json({
        success: false,
        message: `No se puede eliminar permanentemente un equipo en estado ${equipo.estado}. Hágale soft delete primero (DELETE /equipos/:id) o llévelo a un estado terminal.`,
      });
    }

    // Desvincular el equipo del registro de actividades (dos updates simples
    // en vez de una aggregation pipeline). Esto preserva el histórico de
    // actividades pero deja la referencia al equipo en null.
    let desvinculadas = 0;
    try {
      const r1 = await ActividadGPS.updateMany(
        { equipoInstalado: equipo._id },
        { $set: { equipoInstalado: null } },
      );
      const r2 = await ActividadGPS.updateMany(
        { equipoRetirado: equipo._id },
        { $set: { equipoRetirado: null } },
      );
      desvinculadas =
        (r1.modifiedCount || 0) + (r2.modifiedCount || 0);
    } catch (e) {
      logger.warn(
        `No se pudieron desvincular actividades del equipo ${equipo._id}: ${e.message}`,
      );
    }

    await equipo.deleteOne();

    res.json({
      success: true,
      message: "Equipo eliminado permanentemente",
      data: { actividadesDesvinculadas: desvinculadas },
    });
  } catch (error) {
    logger.error(
      `Error hard delete equipo ${req.params.id}: ${error.message}`,
      { stack: error.stack },
    );
    res.status(500).json({
      success: false,
      message: error.message,
      detalle: error.name,
    });
  }
};

exports.hardDeleteActividad = async (req, res) => {
  try {
    const actividad = await ActividadGPS.findById(req.params.id);
    if (!actividad)
      return res.status(404).json({ success: false, message: "Actividad no encontrada" });
    await actividad.deleteOne();
    res.json({ success: true, message: "Actividad eliminada permanentemente" });
  } catch (error) {
    logger.error(`Error hard delete actividad: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

