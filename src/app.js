require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const connectDB = require("./config/database");
const logger = require("./config/logger");

// Importar rutas
const indexRoutes = require("./routes/index");
const authRoutes = require("./routes/auth");
const manifiestosRoutes = require("./routes/manifiestos");
const rmmRoutes = require("./routes/rmm");
const asignacionesRoutes = require("./routes/asignaciones");

// Importar middleware de autenticación
const { authenticate } = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

// ── Validación de variables de entorno requeridas ──
const requiredEnvVars = [
  "MONGODB_URI",
  "JWT_SECRET",
  "CELLVI_API_URL",
  "CELLVI_USERNAME",
  "CELLVI_PASSWORD",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "S3_BUCKET_NAME",
];
const missing = requiredEnvVars.filter((v) => !process.env[v]);
if (missing.length > 0) {
  console.error(
    `❌ Variables de entorno faltantes: ${missing.join(", ")}\nRevisa tu archivo .env`,
  );
  process.exit(1);
}

// ── Middleware ──

// CORS:
// - Si ALLOWED_ORIGINS está vacío/ausente: desactivado (Apache/Nginx lo maneja)
// - Si ALLOWED_ORIGINS tiene valores: Node.js lo maneja con whitelist
// - En desarrollo (sin NODE_ENV=production): todo abierto
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter(Boolean)
  : [];

if (!isProduction) {
  app.use(cors()); // Desarrollo: todo abierto
} else if (allowedOrigins.length > 0) {
  app.use(cors({ origin: allowedOrigins, credentials: true })); // Producción: whitelist
}
// Si producción + sin ALLOWED_ORIGINS: no se usa cors() → Apache lo maneja
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Logging: formato compacto en producción, detallado en desarrollo
app.use(morgan(isProduction ? "combined" : "dev"));

// Servir archivos estáticos
app.use(express.static("public"));

// Connect to Database
connectDB().then(() => {
  // Initialize workers after successful DB connection
  require("./workers/syncManifiestos").init();
  require("./workers/monitorVehiculos");
  require("./workers/reportRMM");
  require("./workers/detectRNMM");
  require("./workers/reportRNMM");
  require("./workers/actualizarEstadoDocumentos");
  require("./workers/vencerNovedadesPreop");

  logger.info("Workers initialized successfully");
});

// Health Check Endpoint (para monitoreo) - SIN autenticación
app.get("/health", (req, res) => {
  const mongoose = require("mongoose");
  res.json({
    status: "OK",
    uptime: process.uptime(),
    mongodb:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

// Routes públicas (sin autenticación)
app.use("/api/auth", authRoutes);
app.use("/api/verificar", require("./routes/verificacion"));
app.use("/api/contacto", require("./routes/contacto"));

// Routes protegidas (requieren autenticación)
app.use("/api", authenticate, indexRoutes);
app.use("/api/manifiestos", authenticate, manifiestosRoutes);
app.use("/api/rmm", authenticate, rmmRoutes);
app.use("/api/asignaciones", authenticate, asignacionesRoutes);
app.use("/api/vehiculos", authenticate, require("./routes/vehiculos"));
app.use("/api/logs", authenticate, require("./routes/logs"));
app.use("/api/terceros", authenticate, require("./routes/terceros"));
app.use("/api/documentos", authenticate, require("./routes/documentos"));
app.use(
  "/api/preoperacionales",
  authenticate,
  require("./routes/preoperacionales"),
);
app.use("/api/empresas", authenticate, require("./routes/empresas"));
app.use("/api/contratos", authenticate, require("./routes/contratos"));
app.use("/api/rutas", authenticate, require("./routes/rutas"));
app.use("/api/estadisticas", authenticate, require("./routes/estadisticas"));

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Global Error Handler
app.use(require("./middleware/errorHandler"));

// Process Error Handlers para producción
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  process.exit(1);
});

// Graceful Shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, closing gracefully...");
  server.close(() => {
    process.exit(0);
  });
});

// Start Server
const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} [${process.env.NODE_ENV}]`);
});

module.exports = app;
