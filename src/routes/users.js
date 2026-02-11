const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { authenticate } = require("../middleware/auth");
const checkRole = require("../middleware/roleCheck");

// Todos los usuarios deben estar autenticados, y ser al menos ADMIN para ver lista
router.get(
  "/",
  authenticate,
  checkRole(["ADMIN", "SUPER_ADMIN"]),
  userController.getAll,
);

// Crear Usuario (Lógica fina dentro del controlador para jerarquía)
router.post(
  "/",
  authenticate,
  checkRole(["ADMIN", "SUPER_ADMIN"]),
  userController.create,
);

module.exports = router;
