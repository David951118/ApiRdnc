const express = require("express");
const router = express.Router();
const contactoController = require("../controllers/contactoController");

// Ruta pública - sin autenticación
router.post("/", contactoController.enviarMensajeContacto);

module.exports = router;
