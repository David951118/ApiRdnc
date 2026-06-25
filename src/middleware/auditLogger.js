const AuditLog = require("../models/AuditLog");
const logger = require("../config/logger");

/**
 * Middleware de auditoría transversal.
 *
 * Se monta ANTES de los routers protegidos (app.use("/api", auditLogger)) y
 * registra en AuditLog toda mutación (POST/PUT/PATCH/DELETE) que termine en 2xx.
 *
 * No exige autenticación por sí mismo: lee req.user en el evento "finish" de la
 * respuesta, momento en el que el middleware authenticate de cada router ya lo
 * pobló. Si no hay usuario (ruta pública), no registra.
 *
 * El guardado es fire-and-forget: un fallo de auditoría nunca tumba la petición.
 */

const METODOS_AUDITADOS = ["POST", "PUT", "PATCH", "DELETE"];

// Claves sensibles que se eliminan del payload guardado
const CLAVES_SENSIBLES = /password|clave|token|secret|authorization/i;

const MAX_PAYLOAD_CHARS = 10000;

function sanitizarPayload(body) {
  if (!body || typeof body !== "object") return undefined;

  const limpio = {};
  for (const [key, value] of Object.entries(body)) {
    limpio[key] = CLAVES_SENSIBLES.test(key) ? "[REDACTADO]" : value;
  }

  // Truncar payloads gigantes (ej: base64 de archivos)
  const serializado = JSON.stringify(limpio);
  if (serializado.length > MAX_PAYLOAD_CHARS) {
    return { _truncado: true, _tamano: serializado.length };
  }
  return limpio;
}

/**
 * Deriva entidad, id y acción a partir de la ruta.
 * Ej: PUT  /api/vehiculos/65a.../restore → { entidad: vehiculos, entidadId: 65a..., accion: RESTORE }
 *     DELETE /api/documentos/65a.../hard → { accion: HARD_DELETE }
 */
function interpretarRuta(metodo, url) {
  // Quitar query string y prefijo /api/
  const path = url.split("?")[0].replace(/^\/api\//, "");
  const segmentos = path.split("/").filter(Boolean);

  const entidad = segmentos[0] || "desconocida";
  const entidadId = segmentos.find((s) => /^[0-9a-fA-F]{24}$/.test(s)) || null;
  const ultimo = segmentos[segmentos.length - 1];

  let accion = "OTRO";
  if (ultimo === "restore") accion = "RESTORE";
  else if (ultimo === "hard") accion = "HARD_DELETE";
  else if (metodo === "POST") accion = "CREATE";
  else if (metodo === "PUT" || metodo === "PATCH") accion = "UPDATE";
  else if (metodo === "DELETE") accion = "DELETE";

  return { entidad, entidadId, accion };
}

function auditLogger(req, res, next) {
  if (!METODOS_AUDITADOS.includes(req.method)) return next();

  // Capturar el payload ahora (puede mutarse durante la cadena)
  const payload = sanitizarPayload(req.body);

  res.on("finish", () => {
    try {
      // Solo mutaciones exitosas de usuarios autenticados
      if (res.statusCode >= 400 || !req.user) return;

      const { entidad, entidadId, accion } = interpretarRuta(
        req.method,
        req.originalUrl,
      );

      AuditLog.create({
        username: req.user.username,
        userId: req.user.userId,
        roles: req.user.roles,
        empresaId: req.user.empresaId || null,
        accion,
        entidad,
        entidadId,
        metodo: req.method,
        ruta: req.originalUrl,
        statusCode: res.statusCode,
        payload,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      }).catch((err) =>
        logger.error(`[AuditLog] Error guardando registro: ${err.message}`),
      );
    } catch (err) {
      logger.error(`[AuditLog] Error en middleware: ${err.message}`);
    }
  });

  next();
}

module.exports = auditLogger;
