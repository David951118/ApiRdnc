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

// CRUD Vehículos con Validación
router.post(
  "/",
  authenticate,
  // Solo ADMIN o CLIENTE_ADMIN pueden crear vehículos
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  validate(createVehiculo),
  vehiculoController.create,
);
router.get("/", authenticate, vehiculoController.getAll);
router.get("/:id", authenticate, vehiculoController.getOne);
router.put(
  "/:id",
  authenticate,
  validate(updateVehiculo),
  vehiculoController.update,
);
router.delete("/:id", authenticate, vehiculoController.delete);

module.exports = router;
