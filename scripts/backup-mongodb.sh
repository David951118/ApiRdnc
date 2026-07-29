#!/bin/bash
# ============================================================================
# Backup de MongoDB (apirndc) — Rocky Linux / servidor físico
#
# Estrategia (misma que el backup de PostgreSQL de CELLVI):
#   - Dump diario comprimido (mongodump --gzip --archive)
#   - Se guarda en una carpeta con árbol de fecha que se crea SOLA:
#       $BACKUP_BASE/AAAA/MM/DD/     (ej: /home/cellvi20/BDMONGO/2026/07/24/)
#   - Retención: borra backups con más de RETENCION_DIAS días y limpia
#     las carpetas de fecha que queden vacías.
#   - Opcional: copia a S3 para redundancia fuera del servidor.
#
# Instalación (una sola vez en el servidor):
#   1. Requiere mongodb-database-tools (mongodump viene ahí):
#        sudo dnf install -y mongodb-database-tools
#   2. Copiar este script y darle permisos:
#        sudo cp backup-mongodb.sh /root/
#        sudo chmod 700 /root/backup-mongodb.sh
#   3. Ajustar DB_NAME y (si aplica) MONGO_URI con credenciales.
#   4. Programar en crontab (diario 1:30 AM):
#        sudo vim /etc/crontab
#        30 1 * * * root /root/backup-mongodb.sh >> /var/log/mongodb-backup.log 2>&1
#
# Restaurar un backup:
#   mongorestore --uri "$MONGO_URI" --gzip --archive=/home/cellvi20/BDMONGO/AAAA/MM/DD/ARCHIVO.archive.gz --drop
# ============================================================================

set -euo pipefail

# ----------------------------- CONFIGURACIÓN -------------------------------
DB_NAME="cellvi-rndc"          # <-- AJUSTAR al nombre real de la base en prod

# Sin autenticación:
MONGO_URI="mongodb://localhost:27017"
# Con autenticación (descomentar y ajustar; mejor aún: usar variable de entorno):
# MONGO_URI="mongodb://rndc_admin:PASSWORD@localhost:27017/?authSource=admin"

# Base en home; las subcarpetas AAAA/MM/DD se crean solas (igual que el backup de Postgres).
BACKUP_BASE="/home/cellvi20/BDMONGO"
RETENCION_DIAS=60              # borra backups con más de N días

# Dueño de los archivos/carpetas creados (para que queden bajo el usuario, no root).
# Dejar vacío para no cambiar el propietario.
BACKUP_OWNER="cellvi20"

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
