const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/expedicionController");
const checkRole = require("../middleware/roleCheck");
const validate = require("../middleware/validate");
const val = require("../validations/expedicionValidation");

/**
 * Módulo de EXPEDICIÓN de remesas y manifiestos ante el RNDC.
 *
 * Expedir es un acto legal de la empresa de transporte → acceso restringido:
 * ADMIN/SUPER_ADMIN (plataforma) y CLIENTE_ADMIN (admin de la empresa
 * cliente). El CLIENTE/CONDUCTOR normal NO tiene acceso a nada de esto.
 * (authenticate corre a nivel de app en app.js)
 */
const EXPEDICION = ["ADMIN", "SUPER_ADMIN", "CLIENTE_ADMIN"];
const SOLO_ADMIN = ["ADMIN", "SUPER_ADMIN"];

// ═══ Credencial RNDC de la empresa ═══
router.put(
  "/credencial",
  checkRole(EXPEDICION),
  validate(val.credencial),
  ctrl.guardarCredencial,
);
router.get("/credencial", checkRole(EXPEDICION), ctrl.obtenerCredencial);
router.post(
  "/credencial/verificar",
  checkRole(EXPEDICION),
  ctrl.verificarCredencial,
);

// ═══ Maestros RNDC (terceros y vehículos) ═══
router.post(
  "/terceros",
  checkRole(EXPEDICION),
  validate(val.tercero),
  ctrl.registrarTercero,
);
router.post(
  "/vehiculos",
  checkRole(EXPEDICION),
  validate(val.vehiculo),
  ctrl.registrarVehiculo,
);

// ═══ Remesas ═══
router.post(
  "/remesas",
  checkRole(EXPEDICION),
  validate(val.remesa),
  ctrl.expedirRemesa,
);
router.get("/remesas", checkRole(EXPEDICION), ctrl.listarRemesas);
router.post(
  "/remesas/:id/anular",
  checkRole(EXPEDICION),
  validate(val.anulacion),
  ctrl.anularRemesa,
);
router.post(
  "/remesas/:id/cumplir",
  checkRole(EXPEDICION),
  validate(val.cumplido),
  ctrl.cumplirRemesa,
);

// ═══ Manifiestos ═══
router.post(
  "/manifiestos",
  checkRole(EXPEDICION),
  validate(val.manifiesto),
  ctrl.expedirManifiesto,
);
router.get("/manifiestos", checkRole(EXPEDICION), ctrl.listarManifiestos);
router.post(
  "/manifiestos/:id/anular",
  checkRole(EXPEDICION),
  validate(val.anulacion),
  ctrl.anularManifiesto,
);
router.post(
  "/manifiestos/:id/cumplir",
  checkRole(EXPEDICION),
  validate(val.cumplido),
  ctrl.cumplirManifiesto,
);
router.post(
  "/manifiestos/:id/consultar-aceptacion",
  checkRole(EXPEDICION),
  ctrl.consultarAceptacion,
);

// ═══ Consumo (monetización) ═══
router.get("/consumo", checkRole(EXPEDICION), ctrl.consumoEmpresa);
router.get("/consumo/resumen", checkRole(SOLO_ADMIN), ctrl.resumenConsumos);

module.exports = router;
