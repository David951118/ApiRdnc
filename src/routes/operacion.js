const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/operacionController");
const checkRole = require("../middleware/roleCheck");
const validate = require("../middleware/validate");
const {
  createViaje,
  updateViaje,
  iniciarViaje,
  finalizarViaje,
  cancelarViaje,
  createTanqueo,
  updateTanqueo,
} = require("../validations/operacionValidation");

const GESTION = ["ADMIN", "SUPER_ADMIN", "CLIENTE_ADMIN"];
const LECTURA = [...GESTION, "AUDITOR", "CONDUCTOR"];
// El conductor diligencia su propia bitácora (iniciar/finalizar/incidencias)
const OPERACION = [...GESTION, "CONDUCTOR"];
// El cliente final registra tanqueos de SUS vehículos (la propiedad se valida en
// el controlador con tieneAccesoVehiculo). Por eso se suman CLIENTE/USER/PROPIETARIO.
const REGISTRO_TANQUEO = [...OPERACION, "CLIENTE", "USER", "PROPIETARIO"];
// El cliente final también puede LISTAR, pero el controlador lo acota a sus vehículos.
const LECTURA_COMBUSTIBLE = [...LECTURA, "CLIENTE", "USER", "PROPIETARIO"];
// Editar/eliminar/papelera de tanqueos: EXCLUSIVO del admin de plataforma, porque
// modificar la serie recalcula el rendimiento tanque-a-tanque de todo el vehículo.
const ADMIN_COMBUSTIBLE = ["ADMIN", "SUPER_ADMIN"];

// ═══ COMBUSTIBLE ═══
router.get(
  "/combustible/rendimiento",
  checkRole(LECTURA),
  ctrl.rendimientoCombustible,
);
router.post(
  "/combustible",
  checkRole(REGISTRO_TANQUEO),
  validate(createTanqueo),
  ctrl.registrarTanqueo,
);
router.get("/combustible", checkRole(LECTURA_COMBUSTIBLE), ctrl.listarTanqueos);
router.put(
  "/combustible/:id",
  checkRole(ADMIN_COMBUSTIBLE),
  validate(updateTanqueo),
  ctrl.actualizarTanqueo,
);
router.delete(
  "/combustible/:id",
  checkRole(ADMIN_COMBUSTIBLE),
  ctrl.eliminarTanqueo,
);
router.post(
  "/combustible/:id/restore",
  checkRole(ADMIN_COMBUSTIBLE),
  ctrl.restaurarTanqueo,
);
router.delete(
  "/combustible/:id/hard",
  checkRole(ADMIN_COMBUSTIBLE),
  ctrl.eliminarTanqueoDefinitivo,
);

// ═══ VIAJES (asignación + bitácora) ═══
router.post("/viajes", checkRole(GESTION), validate(createViaje), ctrl.crearViaje);
router.get("/viajes", checkRole(LECTURA), ctrl.listarViajes);
router.get("/viajes/:id", checkRole(LECTURA), ctrl.obtenerViaje);
router.put(
  "/viajes/:id",
  checkRole(OPERACION),
  validate(updateViaje),
  ctrl.actualizarViaje,
);
router.post(
  "/viajes/:id/iniciar",
  checkRole(OPERACION),
  validate(iniciarViaje),
  ctrl.iniciarViaje,
);
router.post(
  "/viajes/:id/finalizar",
  checkRole(OPERACION),
  validate(finalizarViaje),
  ctrl.finalizarViaje,
);
router.post(
  "/viajes/:id/cancelar",
  checkRole(GESTION),
  validate(cancelarViaje),
  ctrl.cancelarViaje,
);

module.exports = router;
