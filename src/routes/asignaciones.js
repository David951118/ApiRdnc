const express = require("express");
const router = express.Router();
const asignacionService = require("../services/asignacionService");
const cellviAdminClient = require("../services/cellviAdminClient");

/**
 * POST /api/asignaciones/procesar - Procesar asignaciones automáticas
 */
router.post("/procesar", async (req, res) => {
  try {
    const resultado = await asignacionService.procesarAsignacionesAutomaticas();

    res.json(resultado);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/asignaciones/vehiculos - Ver vehículos asignados al usuario RNDC
 */
router.get("/vehiculos", async (req, res) => {
  try {
    const vehiculos = await cellviAdminClient.getVehiculosUsuarioRNDC();

    res.json({
      success: true,
      data: {
        total: vehiculos.length,
        vehiculos,
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
 * POST /api/asignaciones/asignar - Asignar vehículo manualmente
 * Body: { vehiculoId: 4237 }
 */
router.post("/asignar", async (req, res) => {
  try {
    const { vehiculoId } = req.body;

    if (!vehiculoId) {
      return res.status(400).json({
        success: false,
        error: "vehiculoId es requerido",
      });
    }

    const resultado = await cellviAdminClient.asignarVehiculo(
      parseInt(vehiculoId)
    );

    res.json(resultado);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/asignaciones/desasignar - Desasignar vehículo manualmente
 * Body: { vehiculoId: 4237 }
 */
router.post("/desasignar", async (req, res) => {
  try {
    const { vehiculoId } = req.body;

    if (!vehiculoId) {
      return res.status(400).json({
        success: false,
        error: "vehiculoId es requerido",
      });
    }

    const resultado = await cellviAdminClient.desasignarVehiculo(
      parseInt(vehiculoId)
    );

    res.json(resultado);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
