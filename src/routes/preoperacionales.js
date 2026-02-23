const express = require("express");
const router = express.Router();
const preoperacionalController = require("../controllers/preoperacionalController");
const { authenticate } = require("../middleware/auth");
const validate = require("../middleware/validate");
const {
  createPreoperacional,
  updatePreoperacional,
} = require("../validations/preoperacionalValidation");

// Crear (con validación Joi)
router.post(
  "/",
  authenticate,
  validate(createPreoperacional),
  preoperacionalController.create,
);

// Listar con filtros (según scope del token)
router.get("/", authenticate, preoperacionalController.getAll);

// Listar por vehículo (debe ir antes de /:id)
router.get(
  "/vehiculo/:vehiculoId",
  authenticate,
  preoperacionalController.getByVehiculo,
);

// Obtener uno por ID
router.get("/:id", authenticate, preoperacionalController.getOne);

// Actualizar (acceso por scope)
router.put(
  "/:id",
  authenticate,
  validate(updatePreoperacional),
  preoperacionalController.update,
);

// Soft delete
router.delete("/:id", authenticate, preoperacionalController.softDelete);

// Restaurar
router.post("/:id/restore", authenticate, preoperacionalController.restore);

// Hard delete (solo ADMIN)
router.delete("/:id/hard", authenticate, preoperacionalController.hardDelete);

module.exports = router;
