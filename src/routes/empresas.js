const express = require("express");
const router = express.Router();
const empresaController = require("../controllers/empresaController");
const { authenticate } = require("../middleware/auth");
const checkRole = require("../middleware/roleCheck");
const validate = require("../middleware/validate");
const {
  createEmpresa,
  updateEmpresa,
  cambiarEstadoEmpresa,
} = require("../validations/empresaValidation");

// Crear
router.post(
  "/",
  authenticate,
  checkRole(["ADMIN"]),
  validate(createEmpresa),
  empresaController.create,
);

// Listar
router.get("/", authenticate, checkRole(["ADMIN"]), empresaController.getAll);

// Listar resumen (Solo ADMIN)
router.get("/list", authenticate, checkRole(["ADMIN"]), empresaController.getList);

// Obtener por ID
router.get("/:id", authenticate, empresaController.getOne);

// Actualizar
router.put(
  "/:id",
  authenticate,
  checkRole(["ADMIN"]),
  validate(updateEmpresa),
  empresaController.update,
);

// Activar / desactivar empresa (corta el acceso de toda su flota)
router.patch(
  "/:id/estado",
  authenticate,
  checkRole(["ADMIN"]),
  validate(cambiarEstadoEmpresa),
  empresaController.cambiarEstado,
);

// Alcance de una desactivación: vehículos y usuarios que perderían acceso
router.get(
  "/:id/alcance",
  authenticate,
  checkRole(["ADMIN"]),
  empresaController.alcance,
);

// Soft Delete
router.delete(
  "/:id",
  authenticate,
  checkRole(["ADMIN"]),
  empresaController.softDelete,
);

// Restaurar
router.post(
  "/:id/restore",
  authenticate,
  checkRole(["ADMIN"]),
  empresaController.restore,
);

// Hard Delete
router.delete(
  "/:id/hard",
  authenticate,
  checkRole(["ADMIN"]),
  empresaController.hardDelete,
);

module.exports = router;
