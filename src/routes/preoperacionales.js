const express = require("express");
const router = express.Router();
const preoperacionalController = require("../controllers/preoperacionalController");
const { authenticate } = require("../middleware/auth");

router.post("/", authenticate, preoperacionalController.create);
router.get(
  "/vehiculo/:vehiculoId",
  authenticate,
  preoperacionalController.getByVehiculo,
);
router.get("/:id", authenticate, preoperacionalController.getOne);

module.exports = router;
