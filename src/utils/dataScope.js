/**
 * Generador de Filtros de Alcance (Scope)
 * Garantiza que cada usuario solo vea los datos que le corresponden según Cellvi.
 */

const getVehicleScope = (req) => {
  const roles = req.user.roles || [];

  // 1. ADMINS: Ven todo (Acceso total a la flota global)
  // Buscamos roles que tengan "ADMIN" pero NO "CLIENTE" (para excluir CLIENTE_ADMIN)
  // OJO: Ajustar según nombres reales de roles en Cellvi.
  // Si Cellvi usa 'ROLE_ADMIN' y 'ROLE_CLIENT_ADMIN', esto funciona.
  const isAdmin = roles.some(
    (r) =>
      r.toUpperCase().includes("ADMIN") && !r.toUpperCase().includes("CLIENT"),
  );
  const isSuperAdmin = roles.some((r) => r.toUpperCase().includes("SUPER"));

  if (isAdmin || isSuperAdmin) {
    return {}; // Query vacío = Traer todo
  }

  // 2. CLIENTES (Admin o Normal): Solo sus vehículos asignados
  // Usamos la PLACA como identificador común entre Cellvi y esta BD
  const allowedPlates = req.session.vehiculosPermitidos
    ? req.session.vehiculosPermitidos.map((v) => v.placa)
    : [];

  return { placa: { $in: allowedPlates } };
};

module.exports = { getVehicleScope };
