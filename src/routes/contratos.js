const express = require("express");
const router = express.Router();
const contratoController = require("../controllers/contratoFUECController");
const { authenticate } = require("../middleware/auth");

router.post("/", authenticate, contratoController.create);
router.get("/", authenticate, contratoController.getAll);
router.get("/:id", authenticate, contratoController.getOne);

module.exports = router;
