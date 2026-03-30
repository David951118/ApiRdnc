const express = require("express");
const router = express.Router();
const verificacionController = require("../controllers/verificacionPublicaController");

// Rutas PÚBLICAS - sin autenticación
router.get(
  "/preoperacional/:codigoPublico",
  verificacionController.verificarPreoperacional,
);

router.get(
  "/contrato/:codigoPublico",
  verificacionController.verificarContrato,
);

module.exports = router;
