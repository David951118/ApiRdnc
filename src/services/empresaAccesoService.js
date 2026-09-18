const mongoose = require("mongoose");
const Empresa = require("../models/Empresa");
const Vehiculo = require("../models/Vehiculo");
const Tercero = require("../models/Tercero");
const UserSession = require("../models/UserSession");
const logger = require("../config/logger");

/**
 * Control de acceso por empresa.
 *
 * Una empresa INACTIVA o SUSPENDIDA bloquea el acceso a la plataforma de:
 *   - los terceros (usuarios) que pertenecen a ella (Tercero.empresa), y
 *   - los vehículos afiliados a ella (Vehiculo.empresaAfiliadora): se quitan
 *     de `vehiculosPermitidos` al iniciar sesión; si al usuario no le queda
 *     ningún vehículo, no puede entrar.
 *
 * Los ADMIN de la plataforma nunca se bloquean.
 *
 * Los ids de empresas bloqueadas se cachean unos segundos porque se consultan
 * en cada petición autenticada (validateToken).
 */

const CACHE_TTL_MS = 30 * 1000;
let cache = { ids: new Set(), loadedAt: 0 };

function esAdmin(roles) {
  return (roles || []).some(
    (r) => String(r).replace("ROLE_", "").toUpperCase() === "ADMIN",
  );
}

async function empresasBloqueadas() {
  if (Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.ids;
  const docs = await Empresa.find({ estado: { $ne: "ACTIVA" } })
    .select("_id")
    .lean();
  cache = { ids: new Set(docs.map((d) => String(d._id))), loadedAt: Date.now() };
  return cache.ids;
}

function invalidarCache() {
  cache = { ids: new Set(), loadedAt: 0 };
}

async function estaBloqueada(empresaId) {
  if (!empresaId) return false;
  const ids = await empresasBloqueadas();
  return ids.has(String(empresaId));
}

/**
 * Evalúa el acceso en el login.
 * @param {{ tercero?: object, roles?: string[], vehiculos?: Array<{id:number, placa:string}> }} p
 * @returns {Promise<{ bloqueado: boolean, motivo?: string, vehiculos: Array }>}
 *   `vehiculos` viene ya filtrado (sin los de empresas bloqueadas).
 */
async function evaluarAccesoLogin({ tercero, roles, vehiculos }) {
  const lista = Array.isArray(vehiculos) ? vehiculos : [];
  if (esAdmin(roles)) return { bloqueado: false, vehiculos: lista };

  const bloqueadas = await empresasBloqueadas();
  if (bloqueadas.size === 0) return { bloqueado: false, vehiculos: lista };

  if (tercero?.empresa && bloqueadas.has(String(tercero.empresa))) {
    return { bloqueado: true, motivo: "EMPRESA_INACTIVA", vehiculos: [] };
  }

  const placas = lista
    .map((v) => String(v.placa || "").toUpperCase())
    .filter(Boolean);
  if (placas.length === 0) return { bloqueado: false, vehiculos: lista };

  const afiliados = await Vehiculo.find({
    placa: { $in: placas },
    empresaAfiliadora: { $in: [...bloqueadas].map((id) => new mongoose.Types.ObjectId(id)) },
  })
    .select("placa")
    .lean();
  if (afiliados.length === 0) return { bloqueado: false, vehiculos: lista };

  const excluidas = new Set(afiliados.map((v) => String(v.placa).toUpperCase()));
  const permitidos = lista.filter(
    (v) => !excluidas.has(String(v.placa || "").toUpperCase()),
  );

  // Sin tercero de empresa activa y sin vehículos que queden: no entra.
  if (permitidos.length === 0 && !tercero?.empresa) {
    return { bloqueado: true, motivo: "EMPRESA_INACTIVA", vehiculos: [] };
  }
  return { bloqueado: false, vehiculos: permitidos, excluidas: [...excluidas] };
}

/**
 * Cierra las sesiones abiertas de todos los usuarios de la empresa y de
 * quienes tengan en sesión algún vehículo afiliado a ella (los ADMIN no).
 * @returns {Promise<{ sesionesCerradas: number, vehiculos: number, terceros: number }>}
 */
async function cerrarSesionesEmpresa(empresaId) {
  const id = new mongoose.Types.ObjectId(String(empresaId));
  const [vehiculos, terceros] = await Promise.all([
    Vehiculo.find({ empresaAfiliadora: id, deletedAt: null }).select("placa").lean(),
    Tercero.countDocuments({ empresa: id, deletedAt: null }),
  ]);
  const placas = vehiculos.map((v) => v.placa).filter(Boolean);

  const or = [{ "userData.empresaId": id }];
  if (placas.length > 0) or.push({ "vehiculosPermitidos.placa": { $in: placas } });

  const r = await UserSession.deleteMany({
    $or: or,
    "userData.roles": { $nin: ["ROLE_ADMIN"] },
  });
  const sesionesCerradas = r?.deletedCount || 0;
  logger.info(
    `[EmpresaAcceso] Empresa ${empresaId}: ${sesionesCerradas} sesión(es) cerrada(s), ` +
      `${placas.length} vehículo(s), ${terceros} tercero(s) afectados`,
  );
  return { sesionesCerradas, vehiculos: placas.length, terceros };
}

/**
 * Conteo de vehículos y terceros de la empresa (para mostrar el alcance de
 * una desactivación antes de ejecutarla).
 */
async function alcanceEmpresa(empresaId) {
  const id = new mongoose.Types.ObjectId(String(empresaId));
  const [vehiculos, terceros] = await Promise.all([
    Vehiculo.countDocuments({ empresaAfiliadora: id, deletedAt: null }),
    Tercero.countDocuments({ empresa: id, deletedAt: null }),
  ]);
  return { vehiculos, terceros };
}

module.exports = {
  esAdmin,
  estaBloqueada,
  evaluarAccesoLogin,
  cerrarSesionesEmpresa,
  alcanceEmpresa,
  invalidarCache,
};
