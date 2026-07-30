const crypto = require("crypto");
const logger = require("../config/logger");

/**
 * Cifrado de credenciales RNDC de empresas de transporte (AES-256-GCM).
 * La llave vive en el .env como RNDC_CRED_KEY (64 chars hex = 32 bytes).
 * Generar una con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

function obtenerLlave() {
  const hex = process.env.RNDC_CRED_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "RNDC_CRED_KEY no configurada o inválida (se requieren 64 caracteres hex en el .env)",
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Cifra un texto plano. Retorna "iv:tag:cifrado" en base64.
 */
function cifrar(textoPlano) {
  const llave = obtenerLlave();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", llave, iv);
  const cifrado = Buffer.concat([
    cipher.update(String(textoPlano), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${cifrado.toString("base64")}`;
}

/**
 * Descifra un valor generado por cifrar().
 */
function descifrar(valorCifrado) {
  const llave = obtenerLlave();
  const partes = String(valorCifrado).split(":");
  if (partes.length !== 3) {
    throw new Error("Formato de credencial cifrada inválido");
  }
  const [ivB64, tagB64, dataB64] = partes;
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    llave,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plano = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return plano.toString("utf8");
}

/**
 * Verifica en el arranque que la llave esté bien configurada (solo advierte).
 */
function verificarConfiguracion() {
  try {
    obtenerLlave();
    return true;
  } catch (e) {
    logger.warn(`[Expedicion RNDC] ${e.message} — el módulo de expedición no podrá usarse hasta configurarla`);
    return false;
  }
}

module.exports = { cifrar, descifrar, verificarConfiguracion };
