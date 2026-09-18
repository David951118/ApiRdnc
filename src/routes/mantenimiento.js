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
  facturaOrden,
} = require("../validations/mantenimientoValidation");

// Roles: gestión completa ADMIN/CLIENTE_ADMIN; MECANICO opera SUS OTs (las
// asignadas a él y las sin asignar); MECANICO_LIDER además ve, edita, crea y
// asigna OTs de otros mecánicos de su empresa (en sesión trae también
// MECANICO, ver authService); AUDITOR solo lectura.
// (El middleware authenticate ya corre a nivel de app)
const GESTION = ["ADMIN", "SUPER_ADMIN", "CLIENTE_ADMIN"];
const LECTURA = [...GESTION, "MECANICO", "AUDITOR"];
const OPERACION = [...GESTION, "MECANICO"];
const ASIGNACION = [...GESTION, "MECANICO_LIDER"];
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
// Asignar/reasignar mecánico: gestión y mecánico líder (dentro de su empresa)
router.post(
  "/ordenes/:id/asignar",
  checkRole(ASIGNACION),
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

// Factura de la OT (opcional, archivo en S3). Se puede adjuntar, reemplazar o
// quitar en cualquier estado salvo ANULADA: la factura suele llegar después
// del cierre. El archivo se sube antes con POST /documentos/presigned-url.
router.put(
  "/ordenes/:id/factura",
  checkRole(OPERACION),
  validate(facturaOrden),
  ctrl.adjuntarFactura,
);
router.delete(
  "/ordenes/:id/factura",
  checkRole(OPERACION),
  ctrl.eliminarFactura,
);

// Borrar una OT: ADMIN y CLIENTE_ADMIN (este ultimo solo dentro de su empresa,
// ver scopeEmpresa en el controlador). El MECANICO no borra.
router.delete("/ordenes/:id", checkRole(GESTION), ctrl.eliminarOrden);

module.exports = router;
