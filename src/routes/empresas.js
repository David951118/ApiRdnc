const express = require("express");
const router = express.Router();
const empresaController = require("../controllers/empresaController");
const { authenticate } = require("../middleware/auth");
const checkRole = require("../middleware/roleCheck");
const validate = require("../middleware/validate");
const {
  createEmpresa,
  updateEmpresa,
} = require("../validations/empresaValidation");

// Todas las rutas requieren autenticación y rol ADMIN
router.post(
  "/",
  authenticate,
  checkRole(["ADMIN"]),
  validate(createEmpresa),
  empresaController.create,
);

router.get("/", authenticate, checkRole(["ADMIN"]), empresaController.getAll);

router.get("/:id", authenticate, empresaController.getOne);

router.put(
  "/:id",
  authenticate,
  checkRole(["ADMIN"]),
  validate(updateEmpresa),
  empresaController.update,
);

router.delete(
  "/:id",
  authenticate,
  checkRole(["ADMIN"]),
  empresaController.delete,
);

module.exports = router;
