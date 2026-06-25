/**
 * Suite de CASOS DE USO (happy paths + límites + validaciones + roles + lógica de negocio)
 * contra el backend de pruebas (:3001 / cellvi-rndc-test).
 * Uso: node src/scripts/runUseCases.js
 */
require("dotenv").config();
const axios = require("axios");
const { MongoClient } = require("mongodb");

const BASE = "http://localhost:3001/api";
const CELLVI = process.env.CELLVI_API_URL;

// IDs sembrados
const VEH = "698e4cc1d09592edacd371d2";
const PLACA = "105-SVQ045";
const COND = "698bff02ca3ea6ba9489737b";
const MEC = "698bb27b079fb347156d101f";

let TOKEN = null;
const H = () => ({ headers: { Authorization: `Bearer ${TOKEN}` } });

let pass = 0, fail = 0, flags = [];
const groups = {};
let currentGroup = "";
function group(g) { currentGroup = g; groups[g] = groups[g] || []; console.log(`\n══════════ ${g} ══════════`); }
function ok(name, detail = "") { pass++; console.log(`  ✅ ${name}${detail ? " — " + detail : ""}`); }
function ko(name, detail = "") { fail++; console.log(`  ❌ ${name} — ${detail}`); groups[currentGroup].push("FAIL: " + name + " " + detail); }
function flag(name, detail) { flags.push(`[${currentGroup}] ${name}: ${detail}`); console.log(`  ⚠️  ${name} — ${detail}`); }
function errMsg(e) { return e.response ? `HTTP ${e.response.status}: ${JSON.stringify(e.response.data).slice(0, 160)}` : e.message; }
const data = (r) => (r.data && r.data.data !== undefined ? r.data.data : r.data);

// assert: expect success
async function expectOk(name, fn, assertFn) {
  try { const r = await fn(); const d = data(r); if (assertFn) { const msg = assertFn(d, r); if (msg) return ko(name, msg); } ok(name, typeof assertFn === "undefined" ? "" : ""); return d; }
  catch (e) { ko(name, errMsg(e)); return null; }
}
// assert: expect a specific HTTP error status
async function expectErr(name, status, fn) {
  try { await fn(); ko(name, `esperaba HTTP ${status} pero respondió OK`); }
  catch (e) { if (e.response && e.response.status === status) ok(name, `rechazado correctamente (HTTP ${status})`); else ko(name, `esperaba ${status}, obtuvo ${errMsg(e)}`); }
}

async function login(username, password) {
  const r = await axios.post(`${BASE}/auth/login`, { username, password });
  return r.data.token || (r.data.data && r.data.data.token);
}

// Cambia rolesSistema del usuario de prueba 'rndc' y re-loguea -> token nuevo
async function comoRol(rolesSistema) {
  const u = new URL(process.env.MONGODB_URI); u.pathname = "/cellvi-rndc-test";
  const c = new MongoClient(u.toString()); await c.connect();
  await c.db("cellvi-rndc-test").collection("terceros").updateOne({ usuarioCellvi: "rndc" }, { $set: { rolesSistema } });
  await c.close();
  return login(process.env.CELLVI_USERNAME, process.env.CELLVI_PASSWORD);
}

async function main() {
  TOKEN = await comoRol(["ROLE_ADMIN"]); // admin para la mayoría

  // ───────────────────────────── FASE 0 ─────────────────────────────
  group("FASE 0 — Fundamentos");
  await expectOk("UC0.1 Kilometraje desde GPS Cellvi", () => axios.get(`${BASE}/vehiculos/${VEH}/kilometraje`, H()),
    (d) => (d.kilometraje > 0 && d.fuente ? null : `km=${d.kilometraje} fuente=${d.fuente}`));
  await expectOk("UC0.2 Kilometraje ?actualizar=true persiste", () => axios.get(`${BASE}/vehiculos/${VEH}/kilometraje?actualizar=true`, H()),
    (d) => (d.kilometraje > 0 ? null : "no devolvió km"));
  await expectErr("UC0.3 Kilometraje vehículo inexistente → 404", 404, () => axios.get(`${BASE}/vehiculos/000000000000000000000000/kilometraje`, H()));

  // ───────────────────────────── FASE 2 (repuesto base) ─────────────────────────────
  group("FASE 2 — Inventario");
  let repId = await expectOk("UC2.1 Crear repuesto (stock inicial 10, mínimo 3)",
    () => axios.post(`${BASE}/inventario/repuestos`, { nombre: "Filtro PRUEBA", codigo: "T-FIL", stockInicial: 10, stockMinimo: 3, costoUnitario: 25000, unidad: "UND" }, H()),
    (d) => ((d._id || (d.repuesto && d.repuesto._id)) ? null : "sin id"));
  repId = repId && (repId._id || (repId.repuesto && repId.repuesto._id));

  await expectOk("UC2.1b Kardex registró ENTRADA inicial", () => axios.get(`${BASE}/inventario/movimientos?repuesto=${repId}`, H()),
    (d) => { const a = Array.isArray(d) ? d : d.docs || d.movimientos || []; return a.length >= 1 ? null : "sin movimiento inicial"; });

  // Movimientos con asserts de stock resultante: 10 +5=15, -2=13, AJUSTE 9 -> 9
  const movs = [["ENTRADA", 5, 15], ["SALIDA", 2, 13], ["AJUSTE", 9, 9]];
  for (const [tipo, cant, esperado] of movs) {
    await expectOk(`UC2.2 ${tipo} ${cant} → stock ${esperado}`, () => axios.post(`${BASE}/inventario/movimientos`, { repuesto: repId, tipo, cantidad: cant, motivo: "PRUEBA" }, H()),
      (d) => { const s = d.stockNuevo ?? d.stockResultante ?? d.stock ?? (d.repuesto && d.repuesto.stock); return s === esperado ? null : `stock=${s} (esperaba ${esperado})`; });
  }
  // UC2.3 SALIDA mayor al stock (9) -> permite negativo por diseño
  await expectOk("UC2.3 SALIDA > stock permite negativo (diseño: no bloquea cierre OT)",
    () => axios.post(`${BASE}/inventario/movimientos`, { repuesto: repId, tipo: "SALIDA", cantidad: 50, motivo: "PRUEBA negativo" }, H()),
    (d) => { const s = d.stockNuevo ?? d.stock; return s < 0 ? null : `stock=${s} (esperaba negativo)`; });
  // Restaurar stock a 9 con AJUSTE para el resto de pruebas
  await axios.post(`${BASE}/inventario/movimientos`, { repuesto: repId, tipo: "AJUSTE", cantidad: 9, motivo: "reset" }, H());

  // ───────────────────────────── FASE 1 ─────────────────────────────
  group("FASE 1 — Mantenimiento");
  await expectOk("UC1.1 Crear plan válido (km + días)",
    () => axios.post(`${BASE}/mantenimiento/planes`, { nombre: "Plan PRUEBA", aplicaTodos: true, items: [{ nombre: "Aceite", intervaloKm: 5000, umbralAlertaKm: 500 }, { nombre: "Frenos", intervaloDias: 180, umbralAlertaDias: 15 }] }, H()));
  await expectErr("UC1.2 Plan con ítem sin intervalo → 400", 400,
    () => axios.post(`${BASE}/mantenimiento/planes`, { nombre: "Plan malo", aplicaTodos: true, items: [{ nombre: "X" }] }, H()));
  await expectErr("UC1.3 Plan sin destino (ni todos/clase/vehículos) → 400", 400,
    () => axios.post(`${BASE}/mantenimiento/planes`, { nombre: "Plan sin destino", items: [{ nombre: "Aceite", intervaloKm: 5000 }] }, H()));

  let otId = await expectOk("UC1.4 Crear OT (CORRECTIVO)",
    () => axios.post(`${BASE}/mantenimiento/ordenes`, { vehiculo: VEH, tipo: "CORRECTIVO", origen: "MANUAL", descripcion: "OT PRUEBA", prioridad: "MEDIA" }, H()),
    (d) => (d.estado === "ABIERTA" ? null : `estado=${d.estado} (esperaba ABIERTA)`));
  otId = otId && (otId._id || (otId.orden && otId.orden._id));

  await expectErr("UC1.6 Cerrar OT sin kilometraje → 400", 400,
    () => axios.post(`${BASE}/mantenimiento/ordenes/${otId}/cerrar`, { observacionesCierre: "sin km" }, H()));
  await expectOk("UC1.4b Asignar OT a mecánico", () => axios.post(`${BASE}/mantenimiento/ordenes/${otId}/asignar`, { mecanico: MEC }, H()),
    (d) => (d.estado === "ASIGNADA" ? null : `estado=${d.estado}`));
  await expectOk("UC1.4c Iniciar OT", () => axios.post(`${BASE}/mantenimiento/ordenes/${otId}/iniciar`, {}, H()),
    (d) => (d.estado === "EN_PROCESO" ? null : `estado=${d.estado}`));
  await expectErr("UC1.5 Iniciar OT ya EN_PROCESO → 400", 400, () => axios.post(`${BASE}/mantenimiento/ordenes/${otId}/iniciar`, {}, H()));
  await expectOk("UC1.4d Cerrar OT (con repuesto del inventario, mano de obra)",
    () => axios.post(`${BASE}/mantenimiento/ordenes/${otId}/cerrar`, { kilometraje: 120500, manoDeObra: { horas: 2, costo: 80000 }, repuestos: [{ nombre: "Filtro PRUEBA", cantidad: 1, costoUnitario: 25000, repuestoId: repId }] }, H()),
    (d) => (d.estado === "CERRADA" ? null : `estado=${d.estado}`));
  await expectErr("UC1.5b Cerrar OT ya CERRADA → 400", 400, () => axios.post(`${BASE}/mantenimiento/ordenes/${otId}/cerrar`, { kilometraje: 120500 }, H()));
  await expectErr("UC1.5c Asignar OT CERRADA → 400", 400, () => axios.post(`${BASE}/mantenimiento/ordenes/${otId}/asignar`, { mecanico: MEC }, H()));
  await expectErr("UC1.5d Anular OT CERRADA → 400", 400, () => axios.post(`${BASE}/mantenimiento/ordenes/${otId}/anular`, { motivo: "x" }, H()));

  // UC2.4 verificar descuento automático de stock por cierre OT (9 -> 8)
  await expectOk("UC2.4 SALIDA automática por cierre OT (stock 9→8)", () => axios.get(`${BASE}/inventario/repuestos/${repId}`, H()),
    (d) => { const s = d.stock ?? d.stockActual; return s === 8 ? null : `stock=${s} (esperaba 8)`; });

  await expectOk("UC1.7 Alertas reflejan el plan", () => axios.get(`${BASE}/mantenimiento/alertas`, H()),
    (d) => { const a = Array.isArray(d) ? d : d.alertas || []; return a.length >= 1 ? null : "sin alertas"; });
  await expectOk("UC1.8 Historial de costos por vehículo (mano obra + repuestos)", () => axios.get(`${BASE}/mantenimiento/historial/${VEH}`, H()),
    (d) => (d && (d.ordenes || d.porAnio || d.totalGeneral != null) ? null : "estructura inesperada: " + JSON.stringify(d).slice(0, 80)));

  // ───────────────────────────── FASE 3 ─────────────────────────────
  group("FASE 3 — Operación");
  let viajeId = await expectOk("UC3.1 Viaje con sobrecarga (3000 > 2500)",
    () => axios.post(`${BASE}/operacion/viajes`, { vehiculo: VEH, conductor: COND, origen: "Bodega", destino: "Cliente", carga: { pesoKg: 3000 } }, H()),
    (d, r) => (r.data.alertaSobrecarga === true ? null : `alertaSobrecarga=${r.data.alertaSobrecarga}`));
  viajeId = viajeId && (viajeId._id || (viajeId.viaje && viajeId.viaje._id));
  await expectOk("UC3.2 Viaje carga normal (2000 ≤ 2500) sin alerta",
    () => axios.post(`${BASE}/operacion/viajes`, { vehiculo: VEH, conductor: COND, carga: { pesoKg: 2000 } }, H()),
    (d, r) => (r.data.alertaSobrecarga === false ? null : `alertaSobrecarga=${r.data.alertaSobrecarga}`));

  await expectOk("UC3.3 Iniciar viaje (km 120000)", () => axios.post(`${BASE}/operacion/viajes/${viajeId}/iniciar`, { kmInicio: 120000 }, H()),
    (d) => (d.estado === "EN_CURSO" ? null : `estado=${d.estado}`));
  await expectOk("UC3.3b Finalizar viaje (km 120500) → recorrido 500",
    () => axios.post(`${BASE}/operacion/viajes/${viajeId}/finalizar`, { kmFin: 120500 }, H()),
    (d) => (d.kmRecorrido === 500 ? null : `kmRecorrido=${d.kmRecorrido} (esperaba 500)`));
  await expectErr("UC3.5 Finalizar viaje ya FINALIZADO → 400", 400, () => axios.post(`${BASE}/operacion/viajes/${viajeId}/finalizar`, { kmFin: 120600 }, H()));

  // UC3.4 EDGE: kmFin < kmInicio
  let viaje2 = await expectOk("UC3.4-setup Crear+iniciar viaje para prueba km invertido",
    () => axios.post(`${BASE}/operacion/viajes`, { vehiculo: VEH, conductor: COND }, H()));
  viaje2 = viaje2 && (viaje2._id || (viaje2.viaje && viaje2.viaje._id));
  await axios.post(`${BASE}/operacion/viajes/${viaje2}/iniciar`, { kmInicio: 130000 }, H());
  try {
    const r = await axios.post(`${BASE}/operacion/viajes/${viaje2}/finalizar`, { kmFin: 129000 }, H());
    const d = data(r);
    flag("UC3.4 kmFin<kmInicio aceptado", `el sistema lo acepta y registra kmRecorrido=${d.kmRecorrido} sin avisar (posible mejora: rechazar o advertir)`);
  } catch (e) {
    if (e.response && e.response.status === 400) ok("UC3.4 kmFin<kmInicio → 400 (rechazado)");
    else ko("UC3.4 kmFin<kmInicio", errMsg(e));
  }

  // Combustible: 3 tanqueos -> rendimiento 400/10=40
  let km = 120600;
  for (let i = 1; i <= 3; i++) {
    km += 400;
    await expectOk(`UC3.6 Tanqueo #${i} (km ${km}, 10 gal)`, () => axios.post(`${BASE}/operacion/combustible`, { vehiculo: VEH, kmTanqueo: km, galones: 10, costoPorGalon: 12000, tipoCombustible: "GASOLINA", tanqueLleno: true }, H()),
      (d) => (i === 1 ? null : (d.rendimientoTramo === 40 ? null : `rendimientoTramo=${d.rendimientoTramo} (esperaba 40)`)));
  }
  await expectOk("UC3.7 Rendimiento agregado del vehículo", () => axios.get(`${BASE}/operacion/combustible/rendimiento?vehiculo=${VEH}`, H()),
    (d) => { const a = Array.isArray(d) ? d : []; return a.length && a[0].tanqueos === 3 ? null : "agregado inesperado: " + JSON.stringify(d).slice(0, 100); });

  // ───────────────────────────── FASE 4 ─────────────────────────────
  group("FASE 4 — Analítica");
  await expectOk("UC4.1 KPIs estructura + math", () => axios.get(`${BASE}/estadisticas/kpis`, H()),
    (d) => {
      if (!d.flota || !d.mantenimiento) return "faltan secciones flota/mantenimiento";
      if (d.flota.disponibilidad == null) return "sin disponibilidad";
      if (d.mantenimiento.pctCorrectivo == null) return "sin pctCorrectivo";
      return null;
    });
  await expectOk("UC4.2 KPIs con rango de fechas", () => axios.get(`${BASE}/estadisticas/kpis?desde=2026-01-01&hasta=2026-12-31`, H()));

  // ───────────────────────────── FASE 5 ─────────────────────────────
  group("FASE 5 — Telemetría");
  await expectOk("UC5.1 Posición actual + odómetro", () => axios.get(`${BASE}/telemetria/posicion/${PLACA}`, H()),
    (d) => (d.lat && d.lng ? null : "sin lat/lng"));
  await expectOk("UC5.2 Recorrido hoy (puntos + km)", () => axios.get(`${BASE}/telemetria/recorrido/${PLACA}?desde=2026-06-16 00:00:00&hasta=2026-06-16 23:59:59`, H()),
    (d) => (d.totalPuntos > 0 && d.kmRecorridos >= 0 ? null : `puntos=${d.totalPuntos} km=${d.kmRecorridos}`));
  await expectErr("UC5.3 Recorrido sin desde/hasta → 400", 400, () => axios.get(`${BASE}/telemetria/recorrido/${PLACA}`, H()));

  // ───────────────────────────── ROLES ─────────────────────────────
  group("ROLES (control de acceso)");
  const tokenAuditor = await comoRol(["ROLE_AUDITOR"]);
  const HA = { headers: { Authorization: `Bearer ${tokenAuditor}` } };
  await expectErr("UC-ROL AUDITOR no puede crear plan → 403", 403, () => axios.post(`${BASE}/mantenimiento/planes`, { nombre: "x", aplicaTodos: true, items: [{ nombre: "y", intervaloKm: 1000 }] }, HA));
  try { const r = await axios.get(`${BASE}/mantenimiento/alertas`, HA); (r.status === 200) ? ok("UC-ROL AUDITOR sí puede leer alertas (200)") : ko("UC-ROL AUDITOR lectura", "status " + r.status); } catch (e) { ko("UC-ROL AUDITOR lectura", errMsg(e)); }

  const tokenMec = await comoRol(["ROLE_MECANICO"]);
  const HM = { headers: { Authorization: `Bearer ${tokenMec}` } };
  await expectErr("UC-ROL MECANICO no puede crear plan (es de ADMIN) → 403", 403, () => axios.post(`${BASE}/mantenimiento/planes`, { nombre: "x", aplicaTodos: true, items: [{ nombre: "y", intervaloKm: 1000 }] }, HM));
  try { const r = await axios.get(`${BASE}/mantenimiento/ordenes`, HM); (r.status === 200) ? ok("UC-ROL MECANICO sí puede ver órdenes (200)") : ko("UC-ROL MECANICO ver órdenes", "status " + r.status); } catch (e) { ko("UC-ROL MECANICO ver órdenes", errMsg(e)); }

  // restaurar admin
  TOKEN = await comoRol(["ROLE_ADMIN"]);

  // ───────────────────────────── AUDITORÍA ─────────────────────────────
  group("FASE 0 — Auditoría");
  await expectOk("UC0.4 Auditoría registró las mutaciones", () => axios.get(`${BASE}/auditoria?limit=50`, H()),
    (d) => { const a = Array.isArray(d) ? d : []; return a.length >= 1 ? null : "sin registros"; });
  // Verificar que ningún registro expone datos sensibles en claro
  try {
    const r = await axios.get(`${BASE}/auditoria?limit=100`, H());
    const a = Array.isArray(data(r)) ? data(r) : [];
    const raw = JSON.stringify(a).toLowerCase();
    const expone = /"password"\s*:\s*"(?!\[redactado\])/.test(raw) || /"token"\s*:\s*"(?!\[redactado\])[a-z0-9]{10,}/.test(raw);
    expone ? ko("UC0.4b Auditoría no expone secretos", "se encontró un secreto en claro") : ok("UC0.4b Auditoría no expone secretos en claro");
  } catch (e) { ko("UC0.4b Auditoría secretos", errMsg(e)); }

  // ───────────────────────────── RESUMEN ─────────────────────────────
  console.log(`\n══════════ RESUMEN: ${pass} OK, ${fail} fallos, ${flags.length} observaciones ══════════`);
  if (flags.length) { console.log("\nOBSERVACIONES / POSIBLES MEJORAS:"); flags.forEach((f) => console.log("  ⚠️  " + f)); }
  if (fail) { console.log("\nFALLOS:"); Object.values(groups).flat().forEach((f) => console.log("  ❌ " + f)); }
  process.exit(0);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
