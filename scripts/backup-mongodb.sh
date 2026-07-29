#!/bin/bash
# ============================================================================
# Backup de MongoDB (apirndc) — Rocky Linux / servidor físico
# CONFIGURADO para el server de producción (2026-07-29):
#   - Base real: cellvi-rndc (Mongo local con autenticación)
#   - El URI (con credenciales) se lee del .env del backend en runtime,
#     así la contraseña NO queda duplicada en este script.
#   - Respaldos en /home/cellvi2.0/BDMONGO/AAAA/MM/DD/ (misma convención que
#     el backup de PostgreSQL en /home/cellvi2.0/BD_CELLVI).
#
# Programado en /etc/crontab (diario 1:30 AM):
#   30 1 * * * root /root/backup-mongodb.sh >> /var/log/mongodb-backup.log 2>&1
#
# Restaurar un backup:
#   MONGO_URI=$(grep -E '^MONGODB_URI=' /var/www/html/Apirndc/.env | cut -d= -f2-)
#   mongorestore --uri "$MONGO_URI" --gzip --archive=/home/cellvi2.0/BDMONGO/AAAA/MM/DD/ARCHIVO.archive.gz --drop
# ============================================================================

set -euo pipefail

# ----------------------------- CONFIGURACIÓN -------------------------------
DB_NAME="cellvi-rndc"

# El URI real (con credenciales) vive en el .env del backend. Se le quita el
# nombre de la base del path porque mongodump no acepta URI-con-base + --db.
ENV_FILE="/var/www/html/Apirndc/.env"
# tr -d '\r': el .env de prod tiene finales de línea CRLF (Windows)
MONGO_URI=$(grep -E '^MONGODB_URI=' "$ENV_FILE" | head -1 | tr -d '\r' | cut -d= -f2- | sed -E 's#(://[^/]+)/[^?]*#\1/#')

if [ -z "$MONGO_URI" ]; then
  echo "[$(date '+%F %T')] ERROR: no se pudo leer MONGODB_URI de $ENV_FILE" >&2
  exit 1
fi

# El usuario de Mongo solo tiene credencial SCRAM-SHA-256 y mongodump negocia
# SHA-1 por defecto contra este mongod → hay que forzar el mecanismo.
case "$MONGO_URI" in
  *authMechanism=*) : ;;
  *\?*) MONGO_URI="${MONGO_URI}&authMechanism=SCRAM-SHA-256" ;;
  *)    MONGO_URI="${MONGO_URI}?authMechanism=SCRAM-SHA-256" ;;
esac

# Base en home; las subcarpetas AAAA/MM/DD se crean solas (igual que el backup de Postgres).
BACKUP_BASE="/home/cellvi2.0/BDMONGO"
RETENCION_DIAS=60              # borra backups con más de N días

# Vacío: los archivos quedan de root, igual que /home/cellvi2.0/BD_CELLVI
# (la cuenta "cellvi2.0" no existe como usuario del sistema).
BACKUP_OWNER=""

# Redundancia fuera del servidor (opcional). Dejar vacío para desactivar.
# Requiere AWS CLI configurado (aws configure) con permiso s3:PutObject.
S3_BUCKET=""                   # ej: "mi-bucket-backups"
S3_PREFIX="backups-mongodb"
# ----------------------------------------------------------------------------

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
YEAR=$(date +%Y)
MONTH=$(date +%m)
DAY=$(date +%d)

# Carpeta de destino con árbol de fecha (se genera sola)
DEST_DIR="$BACKUP_BASE/$YEAR/$MONTH/$DAY"
ARCHIVO="$DEST_DIR/$DB_NAME-$TIMESTAMP.archive.gz"

mkdir -p "$DEST_DIR"

echo "[$(date '+%F %T')] Iniciando backup de $DB_NAME en $DEST_DIR ..."

mongodump \
  --uri="$MONGO_URI" \
  --db="$DB_NAME" \
  --gzip \
  --archive="$ARCHIVO"

# Verificación básica: el archivo existe y no está vacío
if [ ! -s "$ARCHIVO" ]; then
  echo "[$(date '+%F %T')] ERROR: el backup quedó vacío o no se creó" >&2
  exit 1
fi

TAMANO=$(du -h "$ARCHIVO" | cut -f1)
echo "[$(date '+%F %T')] Backup creado: $ARCHIVO ($TAMANO)"

# Ajustar propietario (opcional)
if [ -n "$BACKUP_OWNER" ]; then
  chown -R "$BACKUP_OWNER": "$BACKUP_BASE" 2>/dev/null || true
fi

# Copia a S3 (redundancia fuera del servidor)
if [ -n "$S3_BUCKET" ]; then
  if aws s3 cp "$ARCHIVO" "s3://$S3_BUCKET/$S3_PREFIX/$YEAR/$MONTH/$DAY/$(basename "$ARCHIVO")" --only-show-errors; then
    echo "[$(date '+%F %T')] Copia subida a s3://$S3_BUCKET/$S3_PREFIX/$YEAR/$MONTH/$DAY/"
  else
    echo "[$(date '+%F %T')] ADVERTENCIA: falló la subida a S3 (el backup local sí quedó bien)"
  fi
fi

# Limpieza por retención: borra archivos viejos y carpetas de fecha vacías
find "$BACKUP_BASE" -type f -name "$DB_NAME-*.archive.gz" -mtime +"$RETENCION_DIAS" -delete
find "$BACKUP_BASE" -mindepth 1 -type d -empty -delete

echo "[$(date '+%F %T')] Backup completado."
