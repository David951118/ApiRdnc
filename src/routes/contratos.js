const express = require("express");
const router = express.Router();
const contratoController = require("../controllers/contratoFUECController");
const { authenticate } = require("../middleware/auth");
const checkRole = require("../middleware/roleCheck");

// Crear
router.post(
  "/",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  contratoController.create,
);

// Verificar consecutivo
router.get(
  "/verificar-consecutivo/:consecutivo",
  authenticate,
  contratoController.verificarConsecutivo,
);

// Obtener datos QR de un contrato
router.get("/:id/qr", authenticate, contratoController.getQR);

// Listar
router.get("/", authenticate, contratoController.getAll);

// Obtener por ID
router.get("/:id", authenticate, contratoController.getOne);

// Actualizar
router.put(
  "/:id",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  contratoController.update,
);

// Soft Delete
router.delete(
  "/:id",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  contratoController.softDelete,
);

// Restaurar
router.post(
  "/:id/restore",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  contratoController.restore,
);

// Hard Delete
router.delete(
  "/:id/hard",
  authenticate,
  checkRole(["ADMIN"]),
  contratoController.hardDelete,
);

module.exports = router;
