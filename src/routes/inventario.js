const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/inventarioController");
const checkRole = require("../middleware/roleCheck");
const validate = require("../middleware/validate");
const {
  createRepuesto,
  updateRepuesto,
  createMovimiento,
} = require("../validations/inventarioValidation");

const GESTION = ["ADMIN", "SUPER_ADMIN", "CLIENTE_ADMIN"];
const LECTURA = [...GESTION, "MECANICO", "AUDITOR"];
const OPERACION = [...GESTION, "MECANICO"]; // mecánicos registran consumos
// El MECANICO gestiona el catálogo de repuestos (crear/editar); eliminar queda en GESTION
const CATALOGO = [...GESTION, "MECANICO"];

// ═══ ALERTAS Y CONSUMOS (antes de rutas con :id) ═══
router.get("/alertas-stock", checkRole(LECTURA), ctrl.alertasStock);
router.get("/consumos", checkRole(LECTURA), ctrl.consumos);

// ═══ MOVIMIENTOS (kardex) ═══
router.post(
  "/movimientos",
  checkRole(OPERACION),
  validate(createMovimiento),
  ctrl.crearMovimiento,
);
router.get("/movimientos", checkRole(LECTURA), ctrl.listarMovimientos);

// ═══ REPUESTOS (catálogo) ═══
router.post(
  "/repuestos",
  checkRole(CATALOGO),
  validate(createRepuesto),
  ctrl.crearRepuesto,
);
router.get("/repuestos", checkRole(LECTURA), ctrl.listarRepuestos);
router.get("/repuestos/:id", checkRole(LECTURA), ctrl.obtenerRepuesto);
router.put(
  "/repuestos/:id",
  checkRole(CATALOGO),
  validate(updateRepuesto),
  ctrl.actualizarRepuesto,
);
router.delete("/repuestos/:id", checkRole(GESTION), ctrl.eliminarRepuesto);

module.exports = router;
