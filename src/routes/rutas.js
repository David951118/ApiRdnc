const express = require("express");
const router = express.Router();
const rutaController = require("../controllers/rutaController");
const { authenticate } = require("../middleware/auth");
const checkRole = require("../middleware/roleCheck");

// Crear ruta (ADMIN o CLIENTE_ADMIN)
router.post(
  "/",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  rutaController.create,
);

// Listar (todos pueden ver, scope por rol)
router.get("/", authenticate, rutaController.getAll);

// Obtener por ID (todos pueden ver)
router.get("/:id", authenticate, rutaController.getOne);

// Actualizar (ADMIN o CLIENTE_ADMIN)
router.put(
  "/:id",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  rutaController.update,
);

// Soft Delete (ADMIN o CLIENTE_ADMIN)
router.delete(
  "/:id",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  rutaController.softDelete,
);

// Restaurar (ADMIN o CLIENTE_ADMIN)
router.post(
  "/:id/restore",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  rutaController.restore,
);

// Hard Delete (Solo ADMIN)
router.delete(
  "/:id/hard",
  authenticate,
  checkRole(["ADMIN"]),
  rutaController.hardDelete,
);

module.exports = router;
