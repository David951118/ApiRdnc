const express = require("express");
const router = express.Router();
const Manifiesto = require("../models/Manifiesto");
const RegistroRMM = require("../models/RegistroRMM");
const Configuracion = require("../models/Configuracion");

// /**
//  * GET /api/manifiestos - Listar manifiestos con filtros
//  */
// router.get("/", async (req, res) => {
//   try {
//     const { estado, esMonitoreable, placa, page = 1, limit = 20 } = req.query;

//     const filter = {};

//     if (estado) filter.estado = estado;
//     if (esMonitoreable !== undefined)
//       filter.esMonitoreable = esMonitoreable === "true";
//     if (placa) filter.placa = new RegExp(placa, "i");

//     const skip = (parseInt(page) - 1) * parseInt(limit);

//     const manifiestos = await Manifiesto.find(filter)
//       .sort({ createdAt: -1 })
//       .skip(skip)
//       .limit(parseInt(limit))
//       .lean();

//     const total = await Manifiesto.countDocuments(filter);

//     res.json({
//       success: true,
//       data: {
//         manifiestos,
//         pagination: {
//           page: parseInt(page),
//           limit: parseInt(limit),
//           total,
//           pages: Math.ceil(total / parseInt(limit)),
//         },
//       },
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: error.message,
//     });
//   }
// });
// Obtener todos los manifiestos (con filtro opcional por placas)
router.get("/", async (req, res) => {
  try {
    const { placas } = req.query; // Recibir parámetro
    let filtro = {};
    // Si viene el parámetro placas, filtrar por ellas
    if (placas && placas.trim() !== "") {
      const listaPlacas = placas.split(",").map(p => p.trim().toUpperCase());
      filtro.placa = { $in: listaPlacas };
    }
    const manifiestos = await Manifiesto.find(filtro).sort({
      fechaExpedicion: -1,
    });
    
    res.json(manifiestos);
  } catch (error) {
    logger.error(`Error obteniendo manifiestos: ${error.message}`);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

/**
 * GET /api/manifiestos/estadisticas - Estadísticas de manifiestos
 */
router.get("/estadisticas", async (req, res) => {
  try {
    const total = await Manifiesto.countDocuments();
    const activos = await Manifiesto.countDocuments({ estado: "activo" });
    const completados = await Manifiesto.countDocuments({
      estado: "completado",
    });
    const monitoreables = await Manifiesto.countDocuments({
      esMonitoreable: true,
    });
    const noMonitoreables = await Manifiesto.countDocuments({
      esMonitoreable: false,
    });

    // Agrupar por motivo de no monitoreable
    const motivosNoMonitoreable = await Manifiesto.aggregate([
      { $match: { esMonitoreable: false } },
      {
        $group: {
          _id: "$motivoNoMonitoreable",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Manifiestos por placa
    const porPlaca = await Manifiesto.aggregate([
      {
        $group: {
          _id: "$placa",
          count: { $sum: 1 },
          monitoreables: {
            $sum: { $cond: ["$esMonitoreable", 1, 0] },
          },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    res.json({
      success: true,
      data: {
        total,
        activos,
        completados,
        monitoreables,
        noMonitoreables,
        motivosNoMonitoreable,
        topPlacas: porPlaca,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/manifiestos/:id - Obtener manifiesto por ID
 */
router.get("/:id", async (req, res) => {
  try {
    const manifiesto = await Manifiesto.findById(req.params.id).lean();

    if (!manifiesto) {
      return res.status(404).json({
        success: false,
        error: "Manifiesto no encontrado",
      });
    }

    // Obtener RMMs asociados
    const rmms = await RegistroRMM.find({
      manifiestoId: manifiesto._id,
    }).lean();

    res.json({
      success: true,
      data: {
        manifiesto,
        rmms,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DELETE /api/manifiestos/:id - Eliminar manifiesto
 */
router.delete("/:id", async (req, res) => {
  try {
    const manifiesto = await Manifiesto.findByIdAndDelete(req.params.id);

    if (!manifiesto) {
      return res.status(404).json({
        success: false,
        error: "Manifiesto no encontrado",
      });
    }

    res.json({
      success: true,
      message: "Manifiesto eliminado correctamente",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});



module.exports = router;
