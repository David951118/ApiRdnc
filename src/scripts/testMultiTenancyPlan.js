/**
 * Verifica el aislamiento multiempresa de los planes de mantenimiento:
 * un plan de la empresa A por clase de vehículo NO debe alcanzar vehículos de la empresa B.
 * Corre contra la base de pruebas cellvi-rndc-test (aislada). Uso: node src/scripts/testMultiTenancyPlan.js
 */
require("dotenv").config();
const u = new URL(process.env.MONGODB_URI);
u.pathname = "/cellvi-rndc-test";
process.env.MONGODB_URI = u.toString();

const mongoose = require("mongoose");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection;

  const EMP_A = new mongoose.Types.ObjectId();
  const EMP_B = new mongoose.Types.ObjectId();
  const VEH_A = new mongoose.Types.ObjectId();
  const VEH_B = new mongoose.Types.ObjectId();

  // Limpiar colecciones relevantes para un test reproducible
  for (const c of ["vehiculos", "planmantenimientos", "ordentrabajos"]) {
    try { await db.collection(c).deleteMany({ _t: "MT_TEST" }); } catch (e) {}
  }

  // Dos vehículos de la MISMA clase, distinta empresa
  await db.collection("vehiculos").insertMany([
    { _id: VEH_A, _t: "MT_TEST", placa: "AAA111", claseVehiculo: "CAMIONETA", empresaAfiliadora: EMP_A, estado: "ACTIVO", deletedAt: null, kilometrajeActual: 50000 },
    { _id: VEH_B, _t: "MT_TEST", placa: "BBB222", claseVehiculo: "CAMIONETA", empresaAfiliadora: EMP_B, estado: "ACTIVO", deletedAt: null, kilometrajeActual: 50000 },
  ]);

  // Plan de la EMPRESA A, por clase CAMIONETA
  await db.collection("planmantenimientos").insertOne({
    _t: "MT_TEST",
    nombre: "Plan A por clase",
    aplicaTodos: false,
    claseVehiculo: "CAMIONETA",
    vehiculos: [],
    empresa: EMP_A,
    activo: true,
    deletedAt: null,
    items: [{ _id: new mongoose.Types.ObjectId(), nombre: "Cambio de aceite", intervaloKm: 5000, umbralAlertaKm: 500 }],
  });

  // Ejecutar el cálculo SIN empresaId (escenario ADMIN / worker, que era donde se filtraba el bug)
  const svc = require("../services/alertasMantenimientoService");
  const alertas = await svc.calcularAlertas({ consultarCellvi: false, soloAccionables: false });

  const placas = [...new Set(alertas.map((a) => a.vehiculo.placa))];
  const tocaA = placas.includes("AAA111");
  const tocaB = placas.includes("BBB222");

  console.log("Placas con alertas del plan (todas las empresas):", placas.join(", ") || "(ninguna)");
  if (tocaA && !tocaB) {
    console.log("✅ OK: el plan de la empresa A solo alcanzó al vehículo de A (AAA111). B aislado.");
  } else if (tocaB) {
    console.log("❌ FALLO: el plan de la empresa A alcanzó al vehículo de la empresa B (BBB222).");
  } else {
    console.log("⚠️  Inesperado: el plan no alcanzó al vehículo de A.");
  }

  // Limpieza
  for (const c of ["vehiculos", "planmantenimientos", "ordentrabajos"]) {
    await db.collection(c).deleteMany({ _t: "MT_TEST" });
  }
  await mongoose.disconnect();
  process.exit(tocaA && !tocaB ? 0 : 1);
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
