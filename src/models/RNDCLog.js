const mongoose = require("mongoose");

const rndcLogSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now,
    expires: 60 * 60 * 24 * 7, // Auto-borrar después de 7 días (TTL)
  },
  tipo: {
    type: String,
    required: true,
    enum: [
      "consulta_manifiestos",
      "consulta_manifiesto",
      "registro_rmm",
      "anular_rmm",
      "registro_rnmm",
      // Módulo de expedición (rol empresa de transporte)
      "exp_tercero",
      "exp_vehiculo",
      "exp_remesa",
      "exp_manifiesto",
      "exp_anular_remesa",
      "exp_anular_manifiesto",
      "exp_cumplir_remesa",
      "exp_cumplir_manifiesto",
      "exp_consulta_aceptacion",
      "exp_verificacion",
      "exp_test_conectividad",
    ],
  },
  endpoint: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    required: true,
    enum: ["success", "error", "timeout"],
  },
  duration: {
    type: Number, // milisegundos
    required: true,
  },
  requestPayload: {
    type: String, // XML del request
  },
  responsePayload: {
    type: String, // XML/JSON del response o mensaje de error
  },
  metadata: {
    type: Object, // Datos extra (nit, placa, ids)
  },
});

// Índices para búsquedas rápidas
rndcLogSchema.index({ timestamp: -1 });
rndcLogSchema.index({ status: 1 });
rndcLogSchema.index({ "metadata.placa": 1 });
rndcLogSchema.index({ "metadata.ingresoidManifiesto": 1 });

module.exports = mongoose.model("RNDCLog", rndcLogSchema);
