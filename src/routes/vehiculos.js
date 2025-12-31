const express = require("express");
const router = express.Router();
const cellviClient = require("../services/cellviClient");
const logger = require("../config/logger");

/**
 * GET /api/vehiculos/:placa/ubicacion
 * Obtiene la última ubicación conocida del vehículo desde Cellvi
 */
router.get("/:placa/ubicacion", async (req, res) => {
  try {
    const { placa } = req.params;

    // Obtener posición (ya incluye lógica de buscar vehículo por placa)
    const posicion = await cellviClient.getPosicionByPlaca(placa);

    if (!posicion) {
      return res.status(404).json({
        success: false,
        error: "Vehículo no encontrado o sin datos de ubicación",
      });
    }

    res.json({
      success: true,
      data: posicion,
    });
  } catch (error) {
    logger.error(
      `Error en API ubicación ${req.params.placa}: ${error.message}`
    );
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
