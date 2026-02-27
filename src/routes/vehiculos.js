const express = require("express");
const router = express.Router();
const vehiculoController = require("../controllers/vehiculoController");
const { authenticate } = require("../middleware/auth");
const checkRole = require("../middleware/roleCheck");
const validate = require("../middleware/validate");
const {
  createVehiculo,
  updateVehiculo,
} = require("../validations/vehiculoValidation");

// Crear
router.post(
  "/",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  validate(createVehiculo),
  vehiculoController.create,
);

// Listar
router.get("/", authenticate, vehiculoController.getAll);

// Obtener por ID o Placa
router.get("/:id", authenticate, vehiculoController.getOne);

// Actualizar
router.put(
  "/:id",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  validate(updateVehiculo),
  vehiculoController.update,
);

// Soft Delete
router.delete(
  "/:id",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  vehiculoController.softDelete,
);

// Restaurar
router.post(
  "/:id/restore",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  vehiculoController.restore,
);

// Hard Delete
router.delete(
  "/:id/hard",
  authenticate,
  checkRole(["ADMIN"]),
  vehiculoController.hardDelete,
);

module.exports = router;
