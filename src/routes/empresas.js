const express = require("express");
const router = express.Router();
const empresaController = require("../controllers/empresaController");
const { authenticate } = require("../middleware/auth");
const checkRole = require("../middleware/roleCheck");
const validate = require("../middleware/validate");
const {
  createEmpresa,
  updateEmpresa,
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
