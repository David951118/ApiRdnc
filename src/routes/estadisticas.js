const express = require("express");
const router = express.Router();
const estadisticasController = require("../controllers/estadisticasController");
const { authenticate } = require("../middleware/auth");
const checkRole = require("../middleware/roleCheck");

// Estadísticas globales (Solo ADMIN)
router.get(
  "/global",
  authenticate,
  checkRole(["ADMIN"]),
  estadisticasController.getGlobal,
);

// Estadísticas por empresa (ADMIN ve cualquiera, CLIENTE_ADMIN solo la suya)
router.get(
  "/empresa/:empresaId",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  estadisticasController.getEmpresaResumen,
);

module.exports = router;
