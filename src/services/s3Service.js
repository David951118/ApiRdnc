const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
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

module.exports = { generatePresignedUrl, deleteObject };
