const mongoose = require("mongoose");
const Vehiculo = require("../models/Vehiculo");

/**
 * Determina el alcance de vehículos a los que el usuario tiene acceso, según rol.
 * Reutiliza la misma lógica que preoperacionales para mantener coherencia:
 * - ADMIN/SUPER_ADMIN: todos (filtro vacío).
 * - CLIENTE_ADMIN: vehículos de su empresa.
 * - CLIENTE/CONDUCTOR/PROPIETARIO/USER: vehículos donde el tercero del usuario sea
 *   propietario o esté en conductoresAsignados, más el legacy de Cellvi (vehiculosPermitidos
 *   por placa en la sesión).
 *
 * Devuelve un filtro Mongo aplicable al campo `_id` del vehículo, o:
 *   - {}              → acceso total (admin)
 *   - { _id: null }   → no ve nada
 *   - { _id: {$in} }  → lista acotada
 */
async function getVehiculoScope(req) {
  const rolesNormalized = (req.user?.roles || []).map((r) =>
    r.replace("ROLE_", "").toUpperCase(),
  );
  const isAdmin =
    rolesNormalized.includes("ADMIN") || rolesNormalized.includes("SUPER_ADMIN");
  const isClienteAdmin = rolesNormalized.includes("CLIENTE_ADMIN");

  if (isAdmin) return {};

  if (isClienteAdmin) {
    const empresaId = req.user?.empresaId;
    if (!empresaId) return { _id: null };
    const vehiculos = await Vehiculo.find({ empresaAfiliadora: empresaId })
      .select("_id")
      .lean();
    return { _id: { $in: vehiculos.map((v) => v._id) } };
  }

  // CLIENTE / CONDUCTOR / PROPIETARIO / USER
  const terceroId = req.user?.terceroId;
  const permitidos = req.session?.vehiculosPermitidos || [];
  const idsSet = new Set();

  if (terceroId) {
    const asignados = await Vehiculo.find({
      deletedAt: null,
      $or: [{ propietario: terceroId }, { conductoresAsignados: terceroId }],
    })
      .select("_id")
      .lean();
    asignados.forEach((v) => idsSet.add(v._id.toString()));
  }

  if (permitidos.length) {
    const placas = permitidos.map((v) => v.placa);
    const vehiculos = await Vehiculo.find({ placa: { $in: placas } })
      .select("_id")
      .lean();
    vehiculos.forEach((v) => idsSet.add(v._id.toString()));
  }

  if (idsSet.size === 0) return { _id: null };

  return {
    _id: {
      $in: Array.from(idsSet).map((id) => new mongoose.Types.ObjectId(id)),
    },
  };
}

/**
 * ¿El usuario tiene acceso al vehículo indicado?
 */
async function tieneAccesoVehiculo(req, vehiculoId) {
  const scope = await getVehiculoScope(req);
  if (Object.keys(scope).length === 0) return true; // admin
  if (scope._id === null) return false;
  const idStr = vehiculoId?.toString?.() || String(vehiculoId);
  if (scope._id.$in) {
    return scope._id.$in.some((id) => id.toString() === idStr);
  }
  return false;
}

module.exports = { getVehiculoScope, tieneAccesoVehiculo };
