const express = require("express");
const router = express.Router();
const terceroController = require("../controllers/terceroController");
const { authenticate } = require("../middleware/auth");
const validate = require("../middleware/validate");
const checkRole = require("../middleware/roleCheck");
const {
  createTercero,
  updateTercero,
} = require("../validations/terceroValidation");

// Crear
router.post(
  "/",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  validate(createTercero),
  terceroController.create,
);

// Listar
router.get("/", authenticate, terceroController.getAll);

// Por empresa
router.get(
  "/empresa/:empresaId",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  terceroController.getByEmpresa,
);

// Por usuario Cellvi
router.get(
  "/usuario/:usuarioCellvi",
  authenticate,
  terceroController.getByUsuarioCellvi,
);

// Por ID o cédula
router.get("/:id", authenticate, terceroController.getOne);

// Actualizar
router.put(
  "/:id",
  authenticate,
  validate(updateTercero),
  terceroController.update,
);

// Soft Delete
router.delete(
  "/:id",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  terceroController.softDelete,
);

// Restaurar
router.post(
  "/:id/restore",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  terceroController.restore,
);

// Hard Delete
router.delete(
  "/:id/hard",
  authenticate,
  checkRole(["ADMIN"]),
  terceroController.hardDelete,
);

module.exports = router;
