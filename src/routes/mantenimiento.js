const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/mantenimientoController");
const checkRole = require("../middleware/roleCheck");
const validate = require("../middleware/validate");
const {
  createPlan,
  updatePlan,
  createOrden,
  updateOrden,
  asignarOrden,
  cerrarOrden,
  anularOrden,
} = require("../validations/mantenimientoValidation");

// Roles: gestión completa ADMIN/CLIENTE_ADMIN; MECANICO opera sus OTs;
// AUDITOR solo lectura. (El middleware authenticate ya corre a nivel de app)
const GESTION = ["ADMIN", "SUPER_ADMIN", "CLIENTE_ADMIN"];
const LECTURA = [...GESTION, "MECANICO", "AUDITOR"];
const OPERACION = [...GESTION, "MECANICO"];
// El conductor/cliente puede CONSULTAR (no gestionar) el mantenimiento de sus
// vehículos; el controlador acota a sus vehículos con getVehiculoScope.
const LECTURA_CONDUCTOR = [...LECTURA, "CONDUCTOR", "CLIENTE", "USER", "PROPIETARIO"];

// ═══ ALERTAS (antes de rutas con :id) ═══
router.get("/alertas", checkRole(LECTURA_CONDUCTOR), ctrl.alertas);

// ═══ HISTORIAL TÉCNICO Y COSTOS POR VEHÍCULO ═══
router.get(
  "/historial/:vehiculoId",
  checkRole(LECTURA),
  ctrl.historialVehiculo,
);

// ═══ PLANES DE MANTENIMIENTO ═══
router.post("/planes", checkRole(GESTION), validate(createPlan), ctrl.crearPlan);
router.get("/planes", checkRole(LECTURA), ctrl.listarPlanes);
router.get("/planes/:id", checkRole(LECTURA), ctrl.obtenerPlan);
router.put(
  "/planes/:id",
  checkRole(GESTION),
  validate(updatePlan),
  ctrl.actualizarPlan,
);
router.delete("/planes/:id", checkRole(GESTION), ctrl.eliminarPlan);

// ═══ ÓRDENES DE TRABAJO ═══
// El MECANICO puede crear OTs (si no indica mecánico, el controlador lo auto-asigna)
router.post(
  "/ordenes",
  checkRole(OPERACION),
  validate(createOrden),
  ctrl.crearOrden,
);
router.get("/ordenes", checkRole(LECTURA_CONDUCTOR), ctrl.listarOrdenes);
router.get("/ordenes/:id", checkRole(LECTURA), ctrl.obtenerOrden);
router.put(
  "/ordenes/:id",
  checkRole(OPERACION),
  validate(updateOrden),
  ctrl.actualizarOrden,
);
router.post(
  "/ordenes/:id/asignar",
  checkRole(GESTION),
  validate(asignarOrden),
  ctrl.asignarOrden,
);
router.post("/ordenes/:id/iniciar", checkRole(OPERACION), ctrl.iniciarOrden);
router.post(
  "/ordenes/:id/cerrar",
  checkRole(OPERACION),
  validate(cerrarOrden),
  ctrl.cerrarOrden,
);
router.post(
  "/ordenes/:id/anular",
  checkRole(GESTION),
  validate(anularOrden),
  ctrl.anularOrden,
);

// Borrar una OT: ADMIN y CLIENTE_ADMIN (este ultimo solo dentro de su empresa,
// ver scopeEmpresa en el controlador). El MECANICO no borra.
router.delete("/ordenes/:id", checkRole(GESTION), ctrl.eliminarOrden);

module.exports = router;
