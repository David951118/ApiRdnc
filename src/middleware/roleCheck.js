/**
 * Middleware para verificar roles de usuario (Basado en Cellvi)
 * @param {Array|String} allowedRoles - Roles permitidos (ej: ['ADMIN'])
 */
const checkRole = (allowedRoles) => {
  const requiredRoles = Array.isArray(allowedRoles)
    ? allowedRoles
    : [allowedRoles];

  return (req, res, next) => {
    // req.user viene del Auth service, y tiene un array .roles
    // Ej: req.user.roles = ['ROLE_ADMIN', 'ROLE_USER']
    const userRoles = req.user && req.user.roles ? req.user.roles : [];

    // Normalizar roles para comparación (quitar ROLE_, mayúsculas)
    // Buscamos si ALGUNO de los roles del usuario coincide con los requeridos
    const hasPermission = userRoles.some((userRole) => {
      // Normalización simple: 'ROLE_ADMIN' -> 'ADMIN'
      const normalizedUserRole = userRole.replace("ROLE_", "").toUpperCase();
      return requiredRoles.includes(normalizedUserRole);
    });

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: "Acceso Denegado",
        message: `No tiene permisos suficientes. Requerido: ${requiredRoles.join(" o ")}`,
      });
    }

    next();
  };
};

module.exports = checkRole;
