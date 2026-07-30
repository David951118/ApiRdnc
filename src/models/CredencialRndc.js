const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Credencial del Web Service RNDC de una EMPRESA DE TRANSPORTE cliente.
 * Con ella la plataforma expide remesas/manifiestos EN NOMBRE de esa empresa.
 * La contraseña se guarda cifrada (AES-256-GCM, ver utils/credencialCrypto).
 */
const CredencialRndcSchema = new Schema(
  {
    empresa: {
      type: Schema.Types.ObjectId,
      ref: "Empresa",
      required: true,
      unique: true,
    },

    // NIT con el que la empresa está registrada en el RNDC como empresa de transporte
    nitEmpresaTransporte: { type: String, required: true },

    // Usuario del WS RNDC (se recomienda usuario dependiente operativo)
    usuarioWS: { type: String, required: true },
    // Contraseña cifrada "iv:tag:data" — NUNCA en texto plano
    passwordCifrada: { type: String, required: true },

    // true → los envíos van al ambiente de pruebas oficial (plc.mintransporte.gov.co)
    modoPruebas: { type: Boolean, default: true },

    estado: {
      type: String,
      enum: ["ACTIVA", "INACTIVA"],
      default: "ACTIVA",
    },

    // Última verificación de la credencial contra el RNDC
    ultimaVerificacion: Date,
    ultimaVerificacionOk: Boolean,
    ultimaVerificacionError: String,

    creadoPor: { type: Schema.Types.ObjectId, ref: "User" },
    actualizadoPor: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("CredencialRndc", CredencialRndcSchema);
