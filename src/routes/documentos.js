const express = require("express");
const router = express.Router();
const documentoController = require("../controllers/documentoController");
const { authenticate } = require("../middleware/auth");

// Subida de archivos (Metadata por ahora)
router.post("/", authenticate, documentoController.upload);

// Listar por entidad (ej: /documentos/vehiculo/:id) -> No, mejor param query o ruta especifica
// Definimos ruta: /entidad/:entidadId
router.get(
  "/entidad/:entidadId",
  authenticate,
  documentoController.getByEntity,
);

router.put("/:id", authenticate, documentoController.update);
router.delete("/:id", authenticate, documentoController.delete);

module.exports = router;
