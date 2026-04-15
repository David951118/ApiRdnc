const express = require("express");
const router = express.Router();
const preoperacionalController = require("../controllers/preoperacionalController");
const { authenticate } = require("../middleware/auth");
const checkRole = require("../middleware/roleCheck");
const validate = require("../middleware/validate");
const {
  createPreoperacional,
  updatePreoperacional,
} = require("../validations/preoperacionalValidation");

// Crear (con validación Joi)
router.post(
  "/",
  authenticate,
  validate(createPreoperacional),
  preoperacionalController.create,
);

// Habilitar preoperacional extra para un vehículo (ADMIN/CLIENTE_ADMIN)
router.post(
  "/habilitar-extra/:vehiculoId",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  preoperacionalController.habilitarExtra,
);

// Listar con filtros (según scope del token)
router.get("/", authenticate, preoperacionalController.getAll);

// Estadísticas completas de preoperacionales
router.get("/estadisticas", authenticate, preoperacionalController.getEstadisticas);

// Listar preoperacionales con novedades pendientes
router.get("/novedades", authenticate, preoperacionalController.getNovedadesPendientes);

// Validar hoja de vida antes de crear preoperacional
router.get(
  "/validar/:vehiculoId/:conductorId",
  authenticate,
  preoperacionalController.validarHojaDeVida,
);

// Último kilometraje de un vehículo
router.get(
  "/ultimo-kilometraje/:vehiculoId",
  authenticate,
  preoperacionalController.ultimoKilometraje,
);

// Historial de correcciones y fallos comunes de un vehículo
router.get(
  "/historial-correcciones/:vehiculoId",
  authenticate,
  preoperacionalController.historialCorrecciones,
);

// Listar por vehículo (debe ir antes de /:id)
router.get(
  "/vehiculo/:vehiculoId",
  authenticate,
  preoperacionalController.getByVehiculo,
);

// Resolver una novedad (subir foto de corrección — pasa a EN_REVISION)
router.put(
  "/:id/novedades/:novedadId/resolver",
  authenticate,
  preoperacionalController.resolverNovedad,
);

// Validar corrección de una novedad (ADMIN/CLIENTE_ADMIN)
router.put(
  "/:id/novedades/:novedadId/validar",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  preoperacionalController.validarCorreccion,
);

// Rechazar corrección de una novedad (ADMIN/CLIENTE_ADMIN)
router.put(
  "/:id/novedades/:novedadId/rechazar",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  preoperacionalController.rechazarCorreccion,
);

// Agregar comentario a una novedad
router.post(
  "/:id/novedades/:novedadId/comentar",
  authenticate,
  preoperacionalController.comentarNovedad,
);

// Extender plazo de corrección de una novedad (ADMIN/CLIENTE_ADMIN)
router.put(
  "/:id/novedades/:novedadId/extender",
  authenticate,
  checkRole(["ADMIN", "CLIENTE_ADMIN"]),
  preoperacionalController.extenderPlazo,
);

// Historial/auditoría completa de una preoperacional
router.get(
  "/:id/historial",
  authenticate,
  preoperacionalController.getHistorial,
);

// ═══ ANOTACIONES (CRUD accesible por todos los roles con acceso) ═══
router.get(
  "/:id/anotaciones",
  authenticate,
  preoperacionalController.listarAnotaciones,
);
router.post(
  "/:id/anotaciones",
  authenticate,
  preoperacionalController.crearAnotacion,
);
router.put(
  "/:id/anotaciones/:anotacionId",
  authenticate,
  preoperacionalController.actualizarAnotacion,
);
router.delete(
  "/:id/anotaciones/:anotacionId",
  authenticate,
  preoperacionalController.eliminarAnotacion,
);

// Obtener datos QR de una preoperacional
router.get("/:id/qr", authenticate, preoperacionalController.getQR);

// Obtener uno por ID
router.get("/:id", authenticate, preoperacionalController.getOne);

// Actualizar (acceso por scope)
router.put(
  "/:id",
  authenticate,
  validate(updatePreoperacional),
  preoperacionalController.update,
);

// Soft delete
router.delete("/:id", authenticate, preoperacionalController.softDelete);

// Restaurar
router.post("/:id/restore", authenticate, preoperacionalController.restore);

// Hard delete (solo ADMIN)
router.delete("/:id/hard", authenticate, preoperacionalController.hardDelete);

module.exports = router;
