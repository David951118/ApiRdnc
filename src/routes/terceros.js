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

// Rutas de Terceros con Validación
router.post(
  "/",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  validate(createTercero),
  terceroController.create,
);
router.get("/", authenticate, terceroController.getAll);
router.get(
  "/empresa/:empresaId",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  terceroController.getByEmpresa,
);
router.get(
  "/usuario/:usuarioCellvi",
  authenticate,
  terceroController.getByUsuarioCellvi,
);
router.get("/:id", authenticate, terceroController.getOne);
router.put(
  "/:id",
  authenticate,
  validate(updateTercero),
  terceroController.update,
);
router.delete("/:id", authenticate, terceroController.delete);

module.exports = router;
