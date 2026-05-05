const express = require("express");
const router = express.Router();
const documentoController = require("../controllers/documentoController");
const { authenticate } = require("../middleware/auth");
const checkRole = require("../middleware/roleCheck");
const validate = require("../middleware/validate");
const {
  createDocumento,
  updateDocumento,
} = require("../validations/documentoValidation");

// Generar presigned URL para subida a S3 (cualquier autenticado)
router.post("/presigned-url", authenticate, documentoController.getPresignedUrl);

// Crear documento (cualquier autenticado — permisos de scope en controller)
router.post(
  "/",
  authenticate,
  validate(createDocumento),
  documentoController.upload,
);

// Listar documentos con filtros (cualquier autenticado — scope en controller)
router.get("/", authenticate, documentoController.getAll);

// Listar documentos por entidad específica
router.get(
  "/entidad/:entidadId",
  authenticate,
  documentoController.getByEntity,
);

// Obtener un documento por ID
router.get("/:id", authenticate, documentoController.getOne);

// Actualizar documento (Solo ADMIN / CLIENTE_ADMIN)
router.put(
  "/:id",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  validate(updateDocumento),
  documentoController.update,
);

// Soft Delete (ADMIN o CLIENTE_ADMIN dentro de su empresa)
router.delete(
  "/:id",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  documentoController.softDelete,
);

// Hard Delete (ADMIN o CLIENTE_ADMIN dentro de su empresa)
router.delete(
  "/:id/hard",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  documentoController.hardDelete,
);

// Restaurar documento eliminado (ADMIN o CLIENTE_ADMIN dentro de su empresa)
router.post(
  "/:id/restore",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  documentoController.restore,
);

module.exports = router;
