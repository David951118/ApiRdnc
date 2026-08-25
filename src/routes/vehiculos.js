const express = require("express");
const router = express.Router();
const vehiculoController = require("../controllers/vehiculoController");
const { authenticate } = require("../middleware/auth");
const checkRole = require("../middleware/roleCheck");
const validate = require("../middleware/validate");
const {
  createVehiculo,
  updateVehiculo,
} = require("../validations/vehiculoValidation");

// Crear
router.post(
  "/",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  validate(createVehiculo),
  vehiculoController.create,
);

// Listar
router.get("/", authenticate, vehiculoController.getAll);

// Listado resumido para selectores (MECANICO lo usa en el formulario de OTs)
router.get(
  "/list",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN", "MECANICO"]),
  vehiculoController.getList,
);

// Obtener lista por idCellvi
router.get("/cellvi/:idCellvi", authenticate, vehiculoController.getByCellviId);

// Kilometraje actual combinando fuentes (Cellvi GPS → preoperacional → manual)
// ?actualizar=true persiste el resultado en el vehículo
router.get(
  "/:id/kilometraje",
  authenticate,
  vehiculoController.getKilometraje,
);

// Obtener por ID o Placa
router.get("/:id", authenticate, vehiculoController.getOne);

// Actualizar
router.put(
  "/:id",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  validate(updateVehiculo),
  vehiculoController.update,
);

// Soft Delete
router.delete(
  "/:id",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  vehiculoController.softDelete,
);

// Restaurar
router.post(
  "/:id/restore",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  vehiculoController.restore,
);

// Hard Delete
router.delete(
  "/:id/hard",
  authenticate,
  checkRole(["ADMIN"]),
  vehiculoController.hardDelete,
);

// ═══ ASIGNACIÓN DE CONDUCTORES/PROPIETARIOS ═══
// Listar conductores asignados (cualquiera autenticado con acceso)
router.get(
  "/:id/conductores",
  authenticate,
  vehiculoController.listarConductoresAsignados,
);

// Asignar conductor/propietario (ADMIN o CLIENTE_ADMIN)
router.post(
  "/:id/conductores",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  vehiculoController.asignarConductor,
);

// Desasignar conductor/propietario (ADMIN o CLIENTE_ADMIN)
router.delete(
  "/:id/conductores/:terceroId",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  vehiculoController.desasignarConductor,
);

module.exports = router;
