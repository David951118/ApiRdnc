const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/telemetriaController");
const checkRole = require("../middleware/roleCheck");

// Telemetría: lectura para roles de gestión y operación
const LECTURA = ["ADMIN", "SUPER_ADMIN", "CLIENTE_ADMIN", "AUDITOR", "CONDUCTOR"];

// Última posición + odómetro
router.get("/posicion/:id", checkRole(LECTURA), ctrl.posicionActual);

// Recorrido entre fechas + km calculados
router.get("/recorrido/:id", checkRole(LECTURA), ctrl.recorrido);

// Snapshots diarios de odómetro + consolidados de recorrido real
router.post(
  "/kilometraje-diario/capturar",
  checkRole(["ADMIN", "SUPER_ADMIN"]),
  ctrl.capturarKilometrajeDiario,
);
router.get(
  "/recorrido-flota",
  checkRole(["ADMIN", "SUPER_ADMIN", "CLIENTE_ADMIN", "AUDITOR"]),
  ctrl.recorridoFlota,
);
router.get("/kilometraje-diario/:id", checkRole(LECTURA), ctrl.kilometrajeDiario);

module.exports = router;
