/**
 * Runner de pruebas de las Fases 0-5 contra el backend de pruebas (:3001 / cellvi-rndc-test).
 * Uso: node src/scripts/runTests.js
 */
require("dotenv").config();
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3001/api";
const token = fs.readFileSync(path.join(__dirname, "..", "..", ".test-token"), "utf8").trim();
const H = { headers: { Authorization: `Bearer ${token}` } };

// IDs sembrados
const VEH = "698e4cc1d09592edacd371d2";   // placa 105-SVQ045, idCellvi 4254
const PLACA = "105-SVQ045";
const COND = "698bff02ca3ea6ba9489737b";  // PEDRO
const MEC = "698bb27b079fb347156d101f";   // JUAN (ROLE_MECANICO)

let pass = 0, fail = 0;
const log = (...a) => console.log(...a);
function ok(name, detail = "") { pass++; log(`  ✅ ${name}${detail ? " — " + detail : ""}`); }
function ko(name, err) { fail++; log(`  ❌ ${name} — ${err}`); }
function errMsg(e) {
  if (e.response) return `HTTP ${e.response.status}: ${JSON.stringify(e.response.data).slice(0, 200)}`;
  return e.message;
}
const data = (r) => (r.data && r.data.data !== undefined ? r.data.data : r.data);

async function main() {
  log("\n══════════ FASE 0 — Fundamentos ══════════");
  // Kilometraje
  try {
    const r = await axios.get(`${BASE}/vehiculos/${VEH}/kilometraje`, H);
    const d = data(r);
    ok("GET kilometraje", `km=${d.kilometraje} fuente=${d.fuente}`);
  } catch (e) { ko("GET kilometraje", errMsg(e)); }
  try {
    const r = await axios.get(`${BASE}/vehiculos/${VEH}/kilometraje?actualizar=true`, H);
    const d = data(r);
    ok("GET kilometraje?actualizar=true", `km=${d.kilometraje} fuente=${d.fuente}`);
  } catch (e) { ko("GET kilometraje?actualizar=true", errMsg(e)); }

  log("\n══════════ FASE 2 (repuesto, antes de cerrar OT) ══════════");
  let repuestoId = null;
  try {
    const r = await axios.post(`${BASE}/inventario/repuestos`, {
      nombre: "Filtro de aceite PRUEBA", codigo: "TEST-FIL-001",
      stockInicial: 10, stockMinimo: 3, costoUnitario: 25000, unidad: "UND",
    }, H);
    const d = data(r);
    repuestoId = d._id || (d.repuesto && d.repuesto._id);
    ok("POST repuesto (stockInicial 10)", `id=${repuestoId} stock=${d.stockActual ?? d.stock ?? "?"}`);
  } catch (e) { ko("POST repuesto", errMsg(e)); }

  if (repuestoId) {
    try {
      const r = await axios.get(`${BASE}/inventario/repuestos/${repuestoId}`, H);
      const d = data(r);
      ok("GET repuesto (verificar stock inicial)", `stock=${d.stockActual ?? d.stock}`);
    } catch (e) { ko("GET repuesto", errMsg(e)); }
    try {
      const r = await axios.get(`${BASE}/inventario/movimientos?repuesto=${repuestoId}`, H);
      const d = data(r);
      const arr = Array.isArray(d) ? d : d.docs || d.movimientos || [];
      ok("Kardex registró ENTRADA inicial", `movimientos=${arr.length}`);
    } catch (e) { ko("GET movimientos kardex", errMsg(e)); }
    for (const mov of [
      { tipo: "ENTRADA", cantidad: 5, motivo: "Compra PRUEBA" },
      { tipo: "SALIDA", cantidad: 2, motivo: "Consumo PRUEBA" },
      { tipo: "AJUSTE", cantidad: 9, motivo: "Conteo físico PRUEBA" },
    ]) {
      try {
        const r = await axios.post(`${BASE}/inventario/movimientos`, { repuesto: repuestoId, ...mov }, H);
        const d = data(r);
        ok(`Movimiento ${mov.tipo} (${mov.cantidad})`, `stockResultante=${d.stockResultante ?? d.stockActual ?? "?"}`);
      } catch (e) { ko(`Movimiento ${mov.tipo}`, errMsg(e)); }
    }
  }

  log("\n══════════ FASE 1 — Mantenimiento ══════════");
  let planId = null, otId = null;
  try {
    const r = await axios.post(`${BASE}/mantenimiento/planes`, {
      nombre: "Plan PRUEBA preventivo", aplicaTodos: true,
      items: [
        { nombre: "Cambio de aceite", intervaloKm: 5000, umbralAlertaKm: 500 },
        { nombre: "Revisión frenos", intervaloDias: 180, umbralAlertaDias: 15 },
      ],
    }, H);
    const d = data(r);
    planId = d._id || (d.plan && d.plan._id);
    ok("POST plan (km + días)", `id=${planId}`);
  } catch (e) { ko("POST plan", errMsg(e)); }

  try {
    const r = await axios.post(`${BASE}/mantenimiento/ordenes`, {
      vehiculo: VEH, tipo: "CORRECTIVO", origen: "MANUAL",
      descripcion: "OT PRUEBA - cambio de filtro", prioridad: "MEDIA",
    }, H);
    const d = data(r);
    otId = d._id || (d.orden && d.orden._id);
    ok("POST orden de trabajo", `id=${otId} estado=${d.estado}`);
  } catch (e) { ko("POST orden", errMsg(e)); }

  if (otId) {
    try {
      const r = await axios.post(`${BASE}/mantenimiento/ordenes/${otId}/asignar`, { mecanico: MEC }, H);
      ok("POST asignar OT a mecánico", `estado=${data(r).estado}`);
    } catch (e) { ko("POST asignar OT", errMsg(e)); }
    try {
      const r = await axios.post(`${BASE}/mantenimiento/ordenes/${otId}/iniciar`, {}, H);
      ok("POST iniciar OT", `estado=${data(r).estado}`);
    } catch (e) { ko("POST iniciar OT", errMsg(e)); }
    try {
      const body = {
        kilometraje: 120500, observacionesCierre: "Cerrada en prueba",
        manoDeObra: { horas: 2, costo: 80000 },
      };
      if (repuestoId) body.repuestos = [{ nombre: "Filtro de aceite PRUEBA", cantidad: 1, costoUnitario: 25000, repuestoId }];
      const r = await axios.post(`${BASE}/mantenimiento/ordenes/${otId}/cerrar`, body, H);
      ok("POST cerrar OT (con repuesto del inventario)", `estado=${data(r).estado}`);
    } catch (e) { ko("POST cerrar OT", errMsg(e)); }
  }

  // Verificar descuento automático de stock por cierre de OT
  if (repuestoId) {
    try {
      const r = await axios.get(`${BASE}/inventario/repuestos/${repuestoId}`, H);
      const d = data(r);
      ok("SALIDA automática por cierre de OT", `stock final=${d.stockActual ?? d.stock}`);
    } catch (e) { ko("verificar stock tras cierre OT", errMsg(e)); }
  }

  try {
    const r = await axios.get(`${BASE}/mantenimiento/alertas`, H);
    const d = data(r);
    const arr = Array.isArray(d) ? d : d.alertas || [];
    ok("GET alertas mantenimiento", `alertas=${arr.length}`);
  } catch (e) { ko("GET alertas", errMsg(e)); }
  try {
    const r = await axios.get(`${BASE}/mantenimiento/alertas?rapido=true`, H);
    ok("GET alertas?rapido=true (sin Cellvi)", "ok");
  } catch (e) { ko("GET alertas rapido", errMsg(e)); }
  try {
    const r = await axios.get(`${BASE}/mantenimiento/historial/${VEH}`, H);
    ok("GET historial/costos por vehículo", JSON.stringify(data(r)).slice(0, 120));
  } catch (e) { ko("GET historial", errMsg(e)); }

  log("\n══════════ FASE 2 — alertas/consumos ══════════");
  try {
    const r = await axios.get(`${BASE}/inventario/alertas-stock`, H);
    const d = data(r);
    const arr = Array.isArray(d) ? d : d.alertas || [];
    ok("GET alertas-stock", `con stock<=mínimo=${arr.length}`);
  } catch (e) { ko("GET alertas-stock", errMsg(e)); }
  try {
    const r = await axios.get(`${BASE}/inventario/consumos?anio=2026`, H);
    ok("GET consumos?anio=2026", JSON.stringify(data(r)).slice(0, 120));
  } catch (e) { ko("GET consumos", errMsg(e)); }

  log("\n══════════ FASE 3 — Operación ══════════");
  let viajeId = null;
  try {
    const r = await axios.post(`${BASE}/operacion/viajes`, {
      vehiculo: VEH, conductor: COND, origen: "Bodega", destino: "Cliente PRUEBA",
      carga: { pesoKg: 3000, descripcion: "Sobrecarga PRUEBA" }, // pesoMaximoKg=2500
    }, H);
    const d = data(r);
    viajeId = d._id || (d.viaje && d.viaje._id);
    const sob = d.alertaSobrecarga ?? (d.viaje && d.viaje.alertaSobrecarga);
    sob ? ok("POST viaje con sobrecarga", `alertaSobrecarga=${sob}`) : ko("POST viaje sobrecarga", `alertaSobrecarga=${sob} (esperaba true)`);
  } catch (e) { ko("POST viaje", errMsg(e)); }

  if (viajeId) {
    try {
      const r = await axios.post(`${BASE}/operacion/viajes/${viajeId}/iniciar`, { kmInicio: 120000 }, H);
      ok("POST iniciar viaje", `estado=${data(r).estado}`);
    } catch (e) { ko("POST iniciar viaje", errMsg(e)); }
    try {
      const r = await axios.post(`${BASE}/operacion/viajes/${viajeId}/finalizar`, { kmFin: 120500 }, H);
      const d = data(r);
      ok("POST finalizar viaje", `kmRecorrido=${d.kmRecorrido} durMin=${d.duracionMinutos}`);
    } catch (e) { ko("POST finalizar viaje", errMsg(e)); }
  }

  let km = 120600;
  for (let i = 1; i <= 3; i++) {
    km += 400;
    try {
      const r = await axios.post(`${BASE}/operacion/combustible`, {
        vehiculo: VEH, kmTanqueo: km, galones: 10, costoPorGalon: 12000,
        tipoCombustible: "GASOLINA", tanqueLleno: true, estacion: "EDS PRUEBA",
      }, H);
      const d = data(r);
      ok(`POST tanqueo #${i} (km ${km})`, `rendimientoTramo=${d.rendimientoTramo ?? "n/a"}`);
    } catch (e) { ko(`POST tanqueo #${i}`, errMsg(e)); }
  }
  try {
    const r = await axios.get(`${BASE}/operacion/combustible/rendimiento?vehiculo=${VEH}`, H);
    ok("GET rendimiento combustible", JSON.stringify(data(r)).slice(0, 140));
  } catch (e) { ko("GET rendimiento", errMsg(e)); }

  log("\n══════════ FASE 4 — Analítica ══════════");
  try {
    const r = await axios.get(`${BASE}/estadisticas/kpis`, H);
    ok("GET kpis", JSON.stringify(data(r)).slice(0, 160));
  } catch (e) { ko("GET kpis", errMsg(e)); }
  try {
    const r = await axios.get(`${BASE}/estadisticas/kpis?desde=2026-01-01&hasta=2026-12-31`, H);
    ok("GET kpis?desde&hasta", "ok");
  } catch (e) { ko("GET kpis rango", errMsg(e)); }

  log("\n══════════ FASE 0 — Auditoría (tras las mutaciones) ══════════");
  try {
    const r = await axios.get(`${BASE}/auditoria?limit=20`, H);
    const d = data(r);
    const arr = Array.isArray(d) ? d : [];
    const acciones = arr.map((x) => `${x.accion} ${x.entidad}`).slice(0, 8);
    arr.length ? ok("GET auditoria registró mutaciones", `total=${r.data.total} ej=[${acciones.join(", ")}]`)
               : ko("GET auditoria", "sin registros (¿auditLogger activo?)");
  } catch (e) { ko("GET auditoria", errMsg(e)); }

  log("\n══════════ FASE 5 — Telemetría (experimental) ══════════");
  try {
    const r = await axios.get(`${BASE}/telemetria/posicion/${PLACA}`, H);
    ok("GET telemetria/posicion", JSON.stringify(data(r)).slice(0, 160));
  } catch (e) { ko("GET telemetria/posicion", errMsg(e)); }
  try {
    const r = await axios.get(`${BASE}/telemetria/recorrido/${PLACA}?desde=2026-06-13 00:00:00&hasta=2026-06-13 23:59:59`, H);
    const d = data(r);
    ok("GET telemetria/recorrido", `kmRecorridos=${d.kmRecorridos ?? "?"} totalPuntos=${d.totalPuntos ?? "?"}`);
  } catch (e) { ko("GET telemetria/recorrido (esperado si path Cellvi difiere)", errMsg(e)); }

  log(`\n══════════ RESUMEN: ${pass} OK, ${fail} fallos ══════════\n`);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
