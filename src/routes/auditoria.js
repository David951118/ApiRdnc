const express = require("express");
const router = express.Router();
const AuditLog = require("../models/AuditLog");
const checkRole = require("../middleware/roleCheck");
const logger = require("../config/logger");

/**
 * GET /api/auditoria
 * Trazabilidad de acciones del sistema.
 * Filtros: ?usuario= &entidad= &accion= &desde= &hasta= &page= &limit=
 * ADMIN ve todo; CLIENTE_ADMIN y AUDITOR ven solo su empresa.
 */
router.get(
  "/",
  checkRole(["ADMIN", "SUPER_ADMIN", "CLIENTE_ADMIN", "AUDITOR"]),
  async (req, res) => {
    try {
      const {
        usuario,
        entidad,
        accion,
        desde,
        hasta,
        page = 1,
        limit = 50,
      } = req.query;

      const filtro = {};

      // Scope por empresa para roles no globales
      const esAdminGlobal = (req.user.roles || []).some((r) =>
        ["ROLE_ADMIN", "ROLE_SUPER_ADMIN", "ADMIN", "SUPER_ADMIN"].includes(r),
      );
      if (!esAdminGlobal) {
        if (!req.user.empresaId) {
          return res.json({ success: true, data: [], total: 0 });
        }
        filtro.empresaId = req.user.empresaId;
      }

      if (usuario) filtro.username = new RegExp(usuario, "i");
      if (entidad) filtro.entidad = entidad;
      if (accion) filtro.accion = accion;
      if (desde || hasta) {
        filtro.createdAt = {};
        if (desde) filtro.createdAt.$gte = new Date(desde);
        if (hasta) filtro.createdAt.$lte = new Date(hasta);
      }

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(200, Math.max(1, parseInt(limit)));

      const [registros, total] = await Promise.all([
        AuditLog.find(filtro)
          .sort({ createdAt: -1 })
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum)
          .lean(),
        AuditLog.countDocuments(filtro),
      ]);

      res.json({
        success: true,
        data: registros,
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
      });
    } catch (error) {
      logger.error(`Error consultando auditoría: ${error.message}`);
      res.status(500).json({ success: false, message: error.message });
    }
  },
);

module.exports = router;
