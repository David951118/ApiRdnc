require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const connectDB = require("./config/database");

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

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

// Servir archivos estáticos
app.use(express.static("public"));

// Connect to Database
connectDB().then(() => {
  // Initialize workers after successful DB connection
  require("./workers/syncManifiestos").init();
  require("./workers/monitorVehiculos");
  require("./workers/reportRMM");
  require("./workers/detectRNMM"); // Detectar casos para RNMM
  require("./workers/reportRNMM"); // Reportar RNMM al RNDC

  console.log("Workers initialized successfully");
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
    environment: process.env.NODE_ENV,
  });
});

// Routes públicas (sin autenticación)
app.use("/api/auth", authRoutes); // Login, logout, etc.

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
// Global Error Handler
app.use(require("./middleware/errorHandler"));

// Process Error Handlers para producción
process.on("unhandledRejection", (reason, promise) => {
  const logger = require("./config/logger");
  logger.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  const logger = require("./config/logger");
  logger.error("Uncaught Exception:", error);
  process.exit(1);
});

// Graceful Shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, closing gracefully...");
  server.close(() => {
    console.log("Process terminated");
    process.exit(0);
  });
});

// Start Server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`URL: http://localhost:${PORT}`);
});

module.exports = app;
