const path = require("path");

// Cargar .env desde la raíz del proyecto
// __dirname es src/config, así que subimos 2 niveles para llegar a la raíz
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env"),
});

/**
 * Configuración centralizada de variables de entorno
 */
module.exports = {
  // Configuración del servidor
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || "development",

  // MongoDB
  mongodb: {
    uri: process.env.MONGODB_URI || "mongodb://localhost:27017/cellvi-rndc",
    uriTest:
      process.env.MONGODB_URI_TEST ||
      "mongodb://localhost:27017/cellvi-rndc-test",
  },

  // RNDC SOAP API
  rndc: {
    endpoint:
      process.env.SOAP_ENDPOINT_URL ||
      "http://rndcws.mintransporte.gov.co:8080/soap/IBPMServices",
    requestTimeout: parseInt(process.env.SOAP_REQUEST_TIMEOUT || "60000"),
  },

  // Cellvi API
  cellvi: {
    apiUrl: process.env.CELLVI_API_URL || "https://cellviapi.asegurar.com.co",
    username: process.env.CELLVI_USERNAME,
    password: process.env.CELLVI_PASSWORD,
    adminUsername: process.env.CELLVI_ADMIN_USERNAME,
    adminPassword: process.env.CELLVI_ADMIN_PASSWORD,
  },

  // Geocercas
  geofence: {
    checkInterval: parseInt(process.env.GEOFENCE_CHECK_INTERVAL || "60000"), // 1 minuto
    defaultRadius: 300, // metros
  },

  // Logging
  log: {
    level: process.env.LOG_LEVEL || "info",
    file: process.env.LOG_FILE || "logs/combined.log",
  },
};
