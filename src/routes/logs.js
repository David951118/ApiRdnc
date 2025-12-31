const express = require("express");
const router = express.Router();
const RNDCLog = require("../models/RNDCLog");
const logger = require("../config/logger");

/**
 * GET /api/logs
 * Obtener logs paginados con filtros
 */
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 20, status, tipo } = req.query;
    const query = {};

    if (status) query.status = status;
    if (tipo) query.tipo = tipo;

    const logs = await RNDCLog.find(query)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await RNDCLog.countDocuments(query);

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    logger.error(`Error obteniendo logs: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
