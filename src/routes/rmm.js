const express = require("express");
const router = express.Router();
const RegistroRMM = require("../models/RegistroRMM");
const Manifiesto = require("../models/Manifiesto");

/**
 * GET /api/rmm - Listar RMMs con filtros
 */
router.get("/", async (req, res) => {
  try {
    const { estado, placa, page = 1, limit = 20 } = req.query;

    const filter = {};

    if (estado) filter.estado = estado;
    if (placa) filter.numPlaca = new RegExp(placa, "i");

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const rmms = await RegistroRMM.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await RegistroRMM.countDocuments(filter);

    res.json({
      success: true,
      data: {
        rmms,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
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
 * GET /api/rmm/estadisticas - Estadísticas de RMMs
 */
router.get("/estadisticas", async (req, res) => {
  try {
    const total = await RegistroRMM.countDocuments();
    const pendientes = await RegistroRMM.countDocuments({
      estado: "pendiente",
    });
    const reportados = await RegistroRMM.countDocuments({
      estado: "reportado",
    });
    const errores = await RegistroRMM.countDocuments({ estado: "error" });
    const vencidos = await RegistroRMM.countDocuments({ estado: "vencido" });

    // RMMs por placa
    const porPlaca = await RegistroRMM.aggregate([
      {
        $group: {
          _id: "$numPlaca",
          count: { $sum: 1 },
          reportados: {
            $sum: { $cond: [{ $eq: ["$estado", "reportado"] }, 1, 0] },
          },
          pendientes: {
            $sum: { $cond: [{ $eq: ["$estado", "pendiente"] }, 1, 0] },
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
        pendientes,
        reportados,
        errores,
        vencidos,
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
 * POST /api/rmm/:id/reintentar - Reintentar envío de RMM
 */
router.post("/:id/reintentar", async (req, res) => {
  try {
    const rmm = await RegistroRMM.findById(req.params.id);

    if (!rmm) {
      return res.status(404).json({
        success: false,
        error: "RMM no encontrado",
      });
    }

    // Resetear estado para reintento
    rmm.estado = "pendiente";
    rmm.intentos = 0;
    rmm.errorMensaje = null;
    await rmm.save();

    res.json({
      success: true,
      message: "RMM marcado para reintento",
      data: rmm,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
