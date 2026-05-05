const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/gpsController");
const { authenticate } = require("../middleware/auth");
const checkRole = require("../middleware/roleCheck");
const validate = require("../middleware/validate");
const v = require("../validations/gpsValidation");

// Todo este módulo es exclusivo de ADMIN.
router.use(authenticate, checkRole(["ADMIN"]));

// ─── Marcas ───
router.post("/marcas", validate(v.createMarca), ctrl.crearMarca);
router.get("/marcas", ctrl.listarMarcas);
router.get("/marcas/:id", ctrl.obtenerMarca);
router.put("/marcas/:id", validate(v.updateMarca), ctrl.actualizarMarca);
router.delete("/marcas/:id", ctrl.eliminarMarca);

// ─── Modelos ───
router.post("/modelos", validate(v.createModelo), ctrl.crearModelo);
router.get("/modelos", ctrl.listarModelos);
router.get("/modelos/:id", ctrl.obtenerModelo);
router.put("/modelos/:id", validate(v.updateModelo), ctrl.actualizarModelo);
router.delete("/modelos/:id", ctrl.eliminarModelo);

// ─── Ciudades ───
router.post("/ciudades", validate(v.createCiudad), ctrl.crearCiudad);
router.get("/ciudades", ctrl.listarCiudades);
router.get("/ciudades/:id", ctrl.obtenerCiudad);
router.put("/ciudades/:id", validate(v.updateCiudad), ctrl.actualizarCiudad);
router.delete("/ciudades/:id", ctrl.eliminarCiudad);

// ─── Técnicos ───
router.post("/tecnicos", validate(v.createTecnico), ctrl.crearTecnico);
router.get("/tecnicos", ctrl.listarTecnicos);
router.get("/tecnicos/:id/equipos", ctrl.equiposPorTecnico);
router.get("/tecnicos/:id", ctrl.obtenerTecnico);
router.put("/tecnicos/:id", validate(v.updateTecnico), ctrl.actualizarTecnico);
router.delete("/tecnicos/:id", ctrl.eliminarTecnico);

// ─── Equipos GPS ───
router.post("/equipos", validate(v.createEquipo), ctrl.crearEquipo);
router.get("/equipos", ctrl.listarEquipos);
router.get("/equipos/inventario-central", ctrl.inventarioCentral);
router.get("/equipos/buscar", ctrl.buscarEquipo);
router.get("/equipos/:id", ctrl.obtenerEquipo);
router.put("/equipos/:id", validate(v.updateEquipo), ctrl.actualizarEquipo);
router.delete("/equipos/:id", ctrl.eliminarEquipo);

// Flujo
router.post(
  "/equipos/enviar-paquete",
  validate(v.enviarPaquete),
  ctrl.enviarEquiposPaquete,
);
router.post(
  "/equipos/confirmar-recepcion-paquete",
  validate(v.confirmarRecepcionPaquete),
  ctrl.confirmarRecepcionPaquete,
);
router.post(
  "/equipos/:id/enviar",
  validate(v.enviarEquipo),
  ctrl.enviarEquipo,
);
router.post(
  "/equipos/:id/confirmar-recepcion",
  validate(v.confirmarRecepcion),
  ctrl.confirmarRecepcion,
);
router.post(
  "/equipos/:id/instalar",
  validate(v.instalarEquipo),
  ctrl.instalarEquipo,
);
router.post(
  "/equipos/:id/retirar",
  validate(v.retirarEquipo),
  ctrl.retirarEquipo,
);
router.post(
  "/equipos/:id/revisar",
  validate(v.revisarEquipo),
  ctrl.revisarEquipo,
);

// Garantía
router.post(
  "/equipos/:id/enviar-garantia",
  validate(v.enviarGarantia),
  ctrl.enviarGarantia,
);
router.post(
  "/equipos/:id/recibir-garantia",
  validate(v.recibirGarantia),
  ctrl.recibirGarantia,
);

// ─── Actividades ───
router.post("/actividades", validate(v.crearActividad), ctrl.crearActividad);
router.get("/actividades", ctrl.listarActividades);
router.get("/actividades/:id", ctrl.obtenerActividad);
router.delete("/actividades/:id", ctrl.eliminarActividad);

// ─── Reportes y dashboard ───
router.get("/reportes/movimientos", ctrl.reporteMovimientos);
router.get(
  "/reportes/inventario-por-ciudad",
  ctrl.reporteInventarioPorCiudad,
);
router.get("/reportes/equipos-devueltos", ctrl.reporteEquiposDevueltos);
router.get("/reportes/general", ctrl.reporteGeneral);
router.get("/dashboard", ctrl.dashboard);

module.exports = router;
