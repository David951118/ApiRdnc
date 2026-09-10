const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/multaController");
const checkRole = require("../middleware/roleCheck");
const validate = require("../middleware/validate");
const {
  createMulta,
  updateMulta,
  agregarFotos,
  pagarMulta,
  motivo,
  correccionInmovilizacion,
  levantarInmovilizacion,
} = require("../validations/multaValidation");

// Roles: registra/gestiona ADMIN y CLIENTE_ADMIN (este último solo dentro de su
// empresa, ver buscarMulta en el controlador). AUDITOR/MECANICO leen su empresa.
// El conductor/cliente final ve las multas de SUS vehículos (o donde él es el
// conductor multado) y puede subir la corrección de una inmovilización.
// (authenticate ya corre a nivel de app)
const GESTION = ["ADMIN", "SUPER_ADMIN", "CLIENTE_ADMIN"];
const LECTURA = [...GESTION, "AUDITOR", "MECANICO"];
const LECTURA_CONDUCTOR = [...LECTURA, "CONDUCTOR", "CLIENTE", "USER", "PROPIETARIO"];
const ADMIN = ["ADMIN", "SUPER_ADMIN"];

// ═══ LISTADO / RESUMEN (antes de rutas con :id) ═══
router.get("/resumen", checkRole(LECTURA_CONDUCTOR), ctrl.resumen);
router.get("/", checkRole(LECTURA_CONDUCTOR), ctrl.listar);

// ═══ CRUD ═══
router.post("/", checkRole(GESTION), validate(createMulta), ctrl.crear);
router.get("/:id", checkRole(LECTURA_CONDUCTOR), ctrl.obtener);
router.put("/:id", checkRole(GESTION), validate(updateMulta), ctrl.actualizar);

// Fotos / evidencia de la multa (archivos ya subidos a S3 con
// POST /documentos/presigned-url, folder "multas")
router.post("/:id/fotos", checkRole(GESTION), validate(agregarFotos), ctrl.agregarFotos);
router.delete("/:id/fotos/:fotoId", checkRole(GESTION), ctrl.eliminarFoto);

// ═══ ESTADO DE LA MULTA ═══
router.post("/:id/pagar", checkRole(GESTION), validate(pagarMulta), ctrl.pagar);
router.post("/:id/impugnar", checkRole(GESTION), validate(motivo), ctrl.impugnar);
router.post("/:id/anular", checkRole(GESTION), validate(motivo), ctrl.anular);

// ═══ INMOVILIZACIÓN ═══
// Corrección: conductor/propietario del vehículo o administración
router.post(
  "/:id/inmovilizacion/correccion",
  checkRole(LECTURA_CONDUCTOR),
  validate(correccionInmovilizacion),
  ctrl.subirCorreccion,
);
// Levantar: solo administración (valida la corrección o fuerza el levantamiento)
router.post(
  "/:id/inmovilizacion/levantar",
  checkRole(GESTION),
  validate(levantarInmovilizacion),
  ctrl.levantarInmovilizacion,
);

// ═══ PAPELERA ═══
router.delete("/:id", checkRole(GESTION), ctrl.eliminar);
router.post("/:id/restore", checkRole(ADMIN), ctrl.restaurar);
router.delete("/:id/hard", checkRole(ADMIN), ctrl.eliminarDefinitivo);

module.exports = router;
