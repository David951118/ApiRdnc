const mongoose = require("mongoose");

/**
 * Modelo para almacenar sesiones de usuario
 * Guarda el token de Cellvi y los datos del usuario
 */
const userSessionSchema = new mongoose.Schema(
  {
    // Usuario de Cellvi
    username: {
      type: String,
      required: true,
      index: true,
    },

    // Token JWT propio del API RNDC (hash para búsqueda rápida)
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Token de Cellvi (almacenado de forma segura)
    cellviToken: {
      type: String,
      required: true,
    },

    // Información del usuario de Cellvi
    userData: {
      userId: String,
      username: String,
      email: String,
      roles: [String],
    },

    // Vehículos asignados al usuario (IDs de Cellvi)
    vehiculosPermitidos: [
      {
        vehiculoId: Number,
        placa: String,
      },
    ],

    // Fecha de expiración de la sesión
    expiresAt: {
      type: Date,
      required: true,
      required: true,
    },

    // Última actividad
    lastActivity: {
      type: Date,
      default: Date.now,
    },

    // Dirección IP
    ipAddress: String,

    // User Agent
    userAgent: String,
  },
  {
    timestamps: true,
  },
);

// Índice TTL para auto-eliminar sesiones expiradas
userSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Método para verificar si la sesión está activa
userSessionSchema.methods.isActive = function () {
  return this.expiresAt > new Date();
};

// Método para renovar la sesión
userSessionSchema.methods.renovar = async function (duracionMinutos = 30) {
  this.expiresAt = new Date(Date.now() + duracionMinutos * 60 * 1000);
  this.lastActivity = new Date();
  return await this.save();
};

module.exports = mongoose.model("UserSession", userSessionSchema);
