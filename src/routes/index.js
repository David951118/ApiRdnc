const express = require("express");
const router = express.Router();
const Configuracion = require("../models/Configuracion");
const Manifiesto = require("../models/Manifiesto");
const RegistroRMM = require("../models/RegistroRMM");

/**
 * GET /api/init - Inicializar configuraciones
 */
router.get("/init", async (req, res) => {
  try {
    // Crear configuraciones
    const configs = [
      {
        clave: "sync_nuevos_interval",
        valor: 15,
        descripcion: "Minutos entre consultas nuevos",
      },
      {
        clave: "sync_todos_interval",
        valor: 24,
        descripcion: "Horas entre consultas todos",
      },
      {
        clave: "monitor_interval",
        valor: 60,
        descripcion: "Segundos entre monitoreo",
      },
      {
        clave: "report_interval",
        valor: 30,
        descripcion: "Segundos entre envío RMM",
      },
      {
        clave: "geocerca_radio",
        valor: 300,
        descripcion: "Radio geocerca (metros)",
      },
      { clave: "rmm_limite_horas", valor: 72, descripcion: "Horas límite RMM" },
    ];

    for (const config of configs) {
      await Configuracion.findOneAndUpdate({ clave: config.clave }, config, {
        upsert: true,
      });
    }

    const resumen = {
      configuraciones: await Configuracion.countDocuments(),
      manifiestos: await Manifiesto.countDocuments(),
      registrosRMM: await RegistroRMM.countDocuments(),
    };

    res.json({
      success: true,
      message: "Configuraciones inicializadas",
      data: resumen,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error inicializando configuraciones",
      error: error.message,
    });
  }
});

/**
 * GET /api/status - Ver estado de colecciones
 */
router.get("/status", async (req, res) => {
  try {
    const configuraciones = await Configuracion.find();
    const manifiestos = await Manifiesto.find().limit(10);
    const registrosRMM = await RegistroRMM.find().limit(10);

    res.json({
      success: true,
      data: {
        configuraciones,
        manifiestos: {
          total: await Manifiesto.countDocuments(),
          items: manifiestos,
        },
        registrosRMM: {
          total: await RegistroRMM.countDocuments(),
          items: registrosRMM,
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
 * GET /api - Ruta raíz
 */
router.get("/", (req, res) => {
  res.json({
    success: true,
    message: "API RNDC2 - Sistema de integración",
    endpoints: {
      init: "GET /api/init - Inicializar configuraciones",
      status: "GET /api/status - Ver estado de colecciones",
    },
  });
});

module.exports = router;
