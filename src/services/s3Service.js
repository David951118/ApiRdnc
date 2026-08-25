const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const crypto = require("crypto");
const config = require("../config/env");

const s3Client = new S3Client({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
});

const BUCKET = config.aws.s3Bucket;

/**
 * Genera una presigned URL para subir un archivo a S3
 * @param {Object} params
 * @param {string} params.fileName - Nombre original del archivo
 * @param {string} params.mimeType - Tipo MIME (application/pdf, image/png, etc.)
 * @param {string} [params.folder="documentos"] - Carpeta en S3
 * @returns {{ uploadUrl: string, key: string, publicUrl: string }}
 */
async function generatePresignedUrl({ fileName, mimeType, folder = "documentos" }) {
  const uuid = crypto.randomUUID();
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `${folder}/${Date.now()}-${uuid}-${sanitizedName}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: mimeType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 600 });
  const publicUrl = `https://${BUCKET}.s3.${config.aws.region}.amazonaws.com/${key}`;

  return { uploadUrl, key, publicUrl };
}

/**
 * Sube un buffer directamente a S3 (para archivos generados por el servidor)
 * @param {Object} params
 * @param {Buffer} params.buffer - Contenido del archivo
 * @param {string} params.mimeType - Tipo MIME
 * @param {string} params.fileName - Nombre base del archivo
 * @param {string} [params.folder="contenido"] - Carpeta en S3
 * @returns {{ key: string, publicUrl: string }}
 */
async function uploadBuffer({ buffer, mimeType, fileName, folder = "contenido" }) {
  const uuid = crypto.randomUUID();
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `${folder}/${Date.now()}-${uuid}-${sanitizedName}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
  });
  await s3Client.send(command);

  const publicUrl = `https://${BUCKET}.s3.${config.aws.region}.amazonaws.com/${key}`;
  return { key, publicUrl };
}

/**
 * Descarga un objeto de S3 como buffer
 * @param {string} key - Key del objeto en S3
 * @returns {{ buffer: Buffer, mimeType: string }}
 */
async function getObjectBuffer(key) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  const response = await s3Client.send(command);
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  return {
    buffer: Buffer.concat(chunks),
    mimeType: response.ContentType || "application/octet-stream",
  };
}

/**
 * Elimina un objeto de S3
 * @param {string} key - Key del objeto en S3
 */
async function deleteObject(key) {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  await s3Client.send(command);
}

module.exports = {
  generatePresignedUrl,
  uploadBuffer,
  getObjectBuffer,
  deleteObject,
};
