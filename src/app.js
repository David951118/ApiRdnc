require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const connectDB = require("./config/database");

// Importar rutas
const indexRoutes = require("./routes/index");
const manifiestosRoutes = require("./routes/manifiestos");
const rmmRoutes = require("./routes/rmm");
const asignacionesRoutes = require("./routes/asignaciones");

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

  console.log("Workers initialized successfully");
});

// Health Check Endpoint (para monitoreo)
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

// Routes
app.use("/api", indexRoutes);
app.use("/api/manifiestos", manifiestosRoutes);
app.use("/api/rmm", rmmRoutes);
app.use("/api/asignaciones", asignacionesRoutes);
app.use("/api/vehiculos", require("./routes/vehiculos"));
app.use("/api/logs", require("./routes/logs"));

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  const logger = require("./config/logger");
  logger.error("Unhandled error:", {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
  });

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

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
