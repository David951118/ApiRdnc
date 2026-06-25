const express = require("express");
const router = express.Router();
const rutaController = require("../controllers/rutaController");
const { authenticate } = require("../middleware/auth");
const checkRole = require("../middleware/roleCheck");

// Crear/editar rutas: administrador y supervisor (CLIENTE_ADMIN, atado a su empresa).
const GESTION_RUTA = ["ADMIN", "SUPER_ADMIN", "CLIENTE_ADMIN"];
// Eliminar / papelera (restaurar / borrar definitivo): SOLO admin de plataforma.
const ADMIN_RUTA = ["ADMIN", "SUPER_ADMIN"];

// Crear ruta
router.post("/", authenticate, checkRole(GESTION_RUTA), rutaController.create);

// Listar (todos pueden ver, scope por rol; ?soloEliminadas=true → papelera)
router.get("/", authenticate, rutaController.getAll);

// Obtener por ID (todos pueden ver)
router.get("/:id", authenticate, rutaController.getOne);

// Actualizar
router.put("/:id", authenticate, checkRole(GESTION_RUTA), rutaController.update);

// Marcar/desmarcar favorita
router.patch(
  "/:id/favorita",
  authenticate,
  checkRole(GESTION_RUTA),
  rutaController.toggleFavorita,
);

// Soft Delete (solo admin de plataforma)
router.delete(
  "/:id",
  authenticate,
  checkRole(ADMIN_RUTA),
  rutaController.softDelete,
);

// Restaurar desde la papelera (solo admin de plataforma)
router.post(
  "/:id/restore",
  authenticate,
  checkRole(ADMIN_RUTA),
  rutaController.restore,
);

// Hard Delete / borrado definitivo (solo admin de plataforma)
router.delete(
  "/:id/hard",
  authenticate,
  checkRole(ADMIN_RUTA),
  rutaController.hardDelete,
);

module.exports = router;
