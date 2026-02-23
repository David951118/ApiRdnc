const express = require("express");
const router = express.Router();
const documentoController = require("../controllers/documentoController");
const { authenticate } = require("../middleware/auth");
const validate = require("../middleware/validate");
const {
  createDocumento,
  updateDocumento,
} = require("../validations/documentoValidation");

// Crear documento (con validación)
router.post(
  "/",
  authenticate,
  validate(createDocumento),
  documentoController.upload,
);

// Listar documentos con filtros (nuevo endpoint principal)
router.get("/", authenticate, documentoController.getAll);

// Listar documentos por entidad específica
router.get(
  "/entidad/:entidadId",
  authenticate,
  documentoController.getByEntity,
);

// Obtener un documento por ID
router.get("/:id", authenticate, documentoController.getOne);

// Actualizar documento (con validación)
router.put(
  "/:id",
  authenticate,
  validate(updateDocumento),
  documentoController.update,
);

// Soft Delete (eliminación temporal)
router.delete("/:id", authenticate, documentoController.softDelete);

// Hard Delete (eliminación definitiva) - Solo ADMIN
router.delete(
  "/:id/hard",
  authenticate,
  documentoController.hardDelete,
);

// Restaurar documento eliminado
router.post("/:id/restore", authenticate, documentoController.restore);

module.exports = router;
