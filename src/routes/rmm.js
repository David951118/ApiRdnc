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

    // Filtro de seguridad: Restringir a vehículos asignados si no es admin
    if (req.user && req.user.roles && !req.user.roles.includes("ROLE_ADMIN")) {
      if (req.session && req.session.vehiculosPermitidos) {
        const placasPermitidas = req.session.vehiculosPermitidos.map((v) =>
          v.placa.toUpperCase(),
        );
        filter.numPlaca = { $in: placasPermitidas };
      }
    }

    if (estado) filter.estado = estado;

    // Si se busca por placa específica
    if (placa) {
      const regex = new RegExp(placa, "i");

      if (filter.numPlaca) {
        // Si ya hay restricción, combinar con AND
        filter.$and = [
          { numPlaca: filter.numPlaca }, // Filtro de permisos
          { numPlaca: regex }, // Filtro de búsqueda
        ];
        delete filter.numPlaca; // Eliminar la clave original para evitar conflictos
      } else {
        filter.numPlaca = regex;
      }
    }

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
    // Construir filtro base según permisos del usuario
    let baseFilter = {};

    if (req.user && req.user.roles && !req.user.roles.includes("ROLE_ADMIN")) {
      if (req.session && req.session.vehiculosPermitidos) {
        const placasPermitidas = req.session.vehiculosPermitidos.map((v) =>
          v.placa.toUpperCase(),
        );
        baseFilter.numPlaca = { $in: placasPermitidas };
      }
    }

    const total = await RegistroRMM.countDocuments(baseFilter);
    const pendientes = await RegistroRMM.countDocuments({
      ...baseFilter,
      estado: "pendiente",
    });
    const reportados = await RegistroRMM.countDocuments({
      ...baseFilter,
      estado: "reportado",
    });
    const errores = await RegistroRMM.countDocuments({
      ...baseFilter,
      estado: "error",
    });
    const vencidos = await RegistroRMM.countDocuments({
      ...baseFilter,
      estado: "vencido",
    });

    // RMMs por placa
    const porPlaca = await RegistroRMM.aggregate([
      { $match: baseFilter }, // Aplicar filtro base
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
