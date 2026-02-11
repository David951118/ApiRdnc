const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");

// Rutas de Autenticación
router.post("/login", authController.login);
router.post("/refresh", authenticate, authController.refreshToken);
router.post("/logout", authenticate, authController.logout);
router.get("/me", authenticate, authController.getMe);
router.get("/validate", authController.validateToken);

module.exports = router;
