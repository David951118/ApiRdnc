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
  // Arquitectura post-migración RNDC2 (Guía WS V5, mayo 2026): producción
  // tiene 3 URLs según la función; el ambiente de pruebas es uno solo.
  rndc: {
    // rndcws: todos los procesos EXCEPTO expedir remesas/manifiestos y consultas
    endpoint:
      process.env.SOAP_ENDPOINT_URL ||
      "http://rndcws.mintransporte.gov.co:8080/soap/IBPMServices",
    // rndcws2: EXPEDIR remesas y manifiestos (procesos 3 y 4)
    endpointExpedicion:
      process.env.SOAP_ENDPOINT_URL_EXPEDICION ||
      "http://rndcws2.mintransporte.gov.co:8080/soap/IBPMServices",
    // plc: solo CONSULTAS (tipo 3)
    endpointConsultas:
      process.env.SOAP_ENDPOINT_URL_CONSULTAS ||
      "http://plc.mintransporte.gov.co:8080/soap/IBPMServices",
    // Ambiente de pruebas oficial del RNDC (bd copia de producción)
    endpointPruebas:
      process.env.SOAP_ENDPOINT_URL_PRUEBAS ||
      "http://rndcpruebas.mintransporte.gov.co:8080/soap/IBPMServices",
    requestTimeout: parseInt(process.env.SOAP_REQUEST_TIMEOUT || "60000"),
    nitGps: process.env.RNDC_NIT_GPS || "",
  },

  // Cellvi API
  cellvi: {
    apiUrl: process.env.CELLVI_API_URL || "https://cellviapi.asegurar.com.co",
    username: process.env.CELLVI_USERNAME,
    password: process.env.CELLVI_PASSWORD,
    adminUsername: process.env.CELLVI_ADMIN_USERNAME,
    adminPassword: process.env.CELLVI_ADMIN_PASSWORD,
  },

  // Autenticación / sesiones
  auth: {
    jwtSecret: process.env.JWT_SECRET || "CHANGE_THIS_SECRET_IN_PRODUCTION",
    // Duración de la sesión en minutos. Por defecto una jornada (8h) para evitar
    // caducidades a mitad de turno; ajustable con SESSION_DURATION_MIN.
    sessionDurationMin: parseInt(process.env.SESSION_DURATION_MIN || "480"),
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

  // Google Gemini (generación de contenido para redes y blog)
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || "",
    textModel: process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash",
    imageModel: process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image",
  },

  // AWS S3
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || "us-east-1",
    s3Bucket: process.env.S3_BUCKET_NAME,
  },
};
