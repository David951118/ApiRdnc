# 🚛 Sistema RNDC - Dashboard de Monitoreo

Sistema completo de gestión y monitoreo de manifiestos RNDC para transporte de carga en Colombia.

## 📚 DOCUMENTACIÓN

### 🚀 **DESPLIEGUE A PRODUCCIÓN** (NUEVO)

- **[INICIO-RAPIDO.md](INICIO-RAPIDO.md)** ← **¡EMPIEZA AQUÍ!** Guía visual en 3 pasos
- **[README-PRODUCCION.md](README-PRODUCCION.md)** - Resumen ejecutivo de cambios
- **[ROCKY_LINUX_DEPLOYMENT.md](ROCKY_LINUX_DEPLOYMENT.md)** - Paso a paso completo
- **[PRODUCTION_GUIDE.md](PRODUCTION_GUIDE.md)** - Análisis técnico y troubleshooting

### 📖 **DESARROLLO**

- **[MIGRATION_GUIDE.md](MIGRATION_GUIDE.md)** - Migración HTML → React

### 🛠️ **SCRIPTS**

- `prepare-production.bat` - Preparar archivos (Windows) ⚡
- `scripts/backup-mongodb.sh` - Backup base de datos
- `scripts/restore-mongodb.sh` - Restaurar en servidor
- `scripts/check-status.sh` - Verificar estado producción

### ⚙️ **CONFIGURACIONES**

- `ecosystem.config.js` - PM2 cluster mode
- `.env.example` - Variables de entorno
- `nginx-config/rndc.conf` - Nginx optimizado

---

## 🎯 INICIO RÁPIDO

### Desarrollo Local

```bash
# Instalar dependencias
npm install

# Configurar .env
cp .env.example .env
# Editar .env con tus credenciales

# Iniciar desarrollo
npm start
```

### Ir a Producción

```bash
# 1. Preparar archivos (doble clic)
prepare-production.bat

# 2. Seguir guía completa
# Ver: ROCKY_LINUX_DEPLOYMENT.md
```

---

## 🏗️ ARQUITECTURA

### Stack Tecnológico

- **Backend:** Node.js 18 + Express + MongoDB 7
- **Frontend:** React + PrimeReact (repositorio: asegurar)
- **APIs:** Cellvi (REST) + RNDC (SOAP)
- **Workers:** Sincronización automática via cron
- **Production:** PM2 (cluster) + Nginx + Rocky Linux

### Componentes Principales

- **Manifiestos:** Gestión de manifiestos de carga
- **RMMs:** Reportes de movimiento de mercancía
- **Geocercas:** Monitoreo de vehículos en tiempo real
- **Logs:** Auditoría completa de operaciones

---

## 📦 ESTRUCTURA DEL PROYECTO

```
apirndc/
├── src/
│   ├── config/          # Configuraciones (logger, env, db)
│   ├── models/          # Modelos MongoDB (Mongoose)
│   ├── routes/          # Endpoints API REST
│   ├── services/        # Clientes externos (Cellvi, RNDC)
│   └── workers/         # Procesos background (sync, monitor)
├── scripts/             # Scripts de utilidad
│   ├── backup-mongodb.sh
│   ├── restore-mongodb.sh
│   └── check-status.sh
├── nginx-config/        # Configs Nginx para producción
├── logs/               # Logs de aplicación
├── public/             # Dashboard legacy (HTML)
├── ecosystem.config.js  # PM2 config
└── prepare-production.bat  # Script Windows
```

---

## 🔧 VARIABLES DE ENTORNO

Ver archivo `.env.example` para configuración completa.

Variables críticas:

```env
# Servidor
NODE_ENV=production
PORT=3000

# Base de Datos
MONGODB_URI=mongodb://localhost:27017/cellvi-rndc

# Cellvi API
CELLVI_API_URL=https://cellviapi.asegurar.com.co
CELLVI_USERNAME=tu_usuario
CELLVI_PASSWORD=tu_password

# RNDC SOAP
SOAP_ENDPOINT_URL=http://rndcws.mintransporte.gov.co:8080/soap/IBPMServices
```

---

## 🚀 DESPLIEGUE EN PRODUCCIÓN

### Requisitos del Servidor

- **OS:** Rocky Linux 8/9 (o RHEL, CentOS Stream)
- **Node.js:** 18+
- **MongoDB:** 7+
- **Nginx:** Latest
- **RAM:** 2GB mínimo (4GB recomendado)
- **Disco:** 10GB mínimo

### Proceso de Despliegue

Ver **[ROCKY_LINUX_DEPLOYMENT.md](ROCKY_LINUX_DEPLOYMENT.md)** para instrucciones completas paso a paso.

**Resumen rápido:**

1. **Preparar en tu PC:**

   ```bash
   prepare-production.bat  # Ejecutar
   ```

2. **Transferir al servidor:**

   ```bash
   scp -r production-ready usuario@IP_SERVIDOR:/tmp/
   ```

3. **En el servidor:**
   - Instalar Node.js, MongoDB, Nginx
   - Restaurar base de datos
   - Configurar PM2
   - Configurar Nginx
   - Verificar funcionamiento

**Tiempo estimado:** 2-3 horas

---

## 📊 ENDPOINTS API

### Manifiestos

- `GET /api/manifiestos` - Listar manifiestos (con filtros)
- `GET /api/manifiestos/:id` - Detalle de manifiesto
- `DELETE /api/manifiestos/:id` - Eliminar manifiesto
- `GET /api/manifiestos/estadisticas` - Estadísticas generales

### RMMs (Reportes)

- `GET /api/rmm` - Listar RMMs (con filtros)
- `POST /api/rmm/:id/reintentar` - Reintentar RMM fallido
- `GET /api/rmm/estadisticas` - Estadísticas de RMMs

### Vehículos

- `GET /api/vehiculos/:placa/ubicacion` - Ubicación actual (Cellvi)

### Logs y Sistema

- `GET /health` - Health check (monitoreo)
- `GET /api/logs` - Logs del sistema (filtrable)

---

## 🔐 SEGURIDAD

Implementaciones de seguridad:

- ✅ **Rate limiting** en Nginx (protección DDoS)
- ✅ **Headers de seguridad** (XSS, Clickjacking, etc.)
- ✅ **CORS** configurado correctamente
- ✅ **Validación de entrada** en todos los endpoints
- ✅ **Logs de auditoría** completos
- ✅ **SSL/TLS** soportado (Let's Encrypt)
- ✅ **Autenticación** via Cellvi API
- ✅ **Control de acceso** basado en roles

---

## 📈 MONITOREO Y LOGS

### PM2 (Process Manager)

```bash
pm2 monit              # Monitor en tiempo real
pm2 logs               # Ver todos los logs
pm2 logs rndc-backend  # Logs específicos
pm2 status             # Estado de procesos
```

### Logs del Sistema

```bash
# Backend
tail -f logs/combined.log

# Nginx
sudo tail -f /var/log/nginx/rndc-error.log
sudo tail -f /var/log/nginx/rndc-access.log

# MongoDB
sudo journalctl -u mongod -f
```

### Health Check

```bash
curl http://localhost/health

# Respuesta esperada:
# {
#   "status": "OK",
#   "uptime": 12345.67,
#   "mongodb": "connected",
#   "timestamp": "2024-12-30T06:00:00.000Z",
#   "environment": "production"
# }
```

### Verificación Completa

```bash
bash scripts/check-status.sh
```

---

## 🔄 BACKUP Y MANTENIMIENTO

### Backup Manual

```bash
# En el servidor
mongodump --uri="mongodb://localhost:27017/cellvi-rndc" --out=backup-$(date +%Y%m%d)
```

### Backup Automático (Cron)

```bash
# Configurado automáticamente en producción
# Ver: ROCKY_LINUX_DEPLOYMENT.md - Fase 7
# Ejecuta diariamente a las 2:00 AM
```

### Actualización del Sistema

```bash
# Actualizar código
cd /opt/rndc/backend
git pull origin main

# Reinstalar dependencias (si hay cambios)
npm install --production

# Reiniciar aplicación
pm2 restart rndc-backend

# Verificar
pm2 status
curl http://localhost/health
```

### Limpiar Logs Antiguos

```bash
# Rotar logs de PM2
pm2 flush

# Limpiar logs antiguos (más de 7 días)
find logs/ -name "*.log" -mtime +7 -delete
```

---

## 🐛 TROUBLESHOOTING

### Backend no inicia

```bash
# Ver logs
pm2 logs rndc-backend --lines 50 --err

# Probar manualmente
cd /opt/rndc/backend
NODE_ENV=production node src/app.js
```

### Errores de MongoDB

```bash
# Estado del servicio
sudo systemctl status mongod

# Logs recientes
sudo journalctl -u mongod -n 50 --no-pager

# Reiniciar
sudo systemctl restart mongod
```

### Nginx 502 Bad Gateway

```bash
# Verificar que backend esté corriendo
pm2 status

# Verificar conexión al backend
curl http://localhost:3000/health

# Revisar SELinux (Rocky Linux específico)
sudo ausearch -m avc -ts recent
sudo setsebool -P httpd_can_network_connect 1
```

### Errores esporádicos (API externa)

```bash
# Ver logs con filtro de errores
pm2 logs rndc-backend | grep ERROR

# Los errores más comunes son:
# - Timeout Cellvi API (normal, se reintenta automáticamente)
# - SOAP RNDC lento (configurado con 60s timeout)
```

Ver más detalles en: **[PRODUCTION_GUIDE.md](PRODUCTION_GUIDE.md)**

---

## 🎯 MEJORAS IMPLEMENTADAS (Diciembre 2024)

### Código

- ✅ Timeout aumentado 30s → 45s (Cellvi API)
- ✅ Health check endpoint agregado
- ✅ Error handlers robustos (unhandledRejection, uncaughtException)
- ✅ Graceful shutdown implementado
- ✅ Logging mejorado con Winston

### Infraestructura

- ✅ PM2 cluster mode (2 instancias)
- ✅ Nginx con rate limiting y cache
- ✅ SELinux configurado para Rocky Linux
- ✅ SSL/TLS soportado
- ✅ Backup automático diario

### Documentación

- ✅ Guía completa de despliegue
- ✅ Scripts de automatización
- ✅ Troubleshooting detallado
- ✅ Checklist de producción

---

## 📞 RECURSOS Y SOPORTE

### Documentación

- **Inicio rápido:** [INICIO-RAPIDO.md](INICIO-RAPIDO.md)
- **Producción:** [ROCKY_LINUX_DEPLOYMENT.md](ROCKY_LINUX_DEPLOYMENT.md)
- **Análisis técnico:** [PRODUCTION_GUIDE.md](PRODUCTION_GUIDE.md)

### Scripts Útiles

```bash
# Preparar para producción (Windows)
prepare-production.bat

# Verificar estado (Linux)
bash scripts/check-status.sh

# Backup/Restore
bash scripts/backup-mongodb.sh
bash scripts/restore-mongodb.sh
```

### Comandos Rápidos

```bash
# Reiniciar todo
pm2 restart all && sudo systemctl restart nginx

# Ver estado
pm2 status && systemctl status mongod nginx

# Logs en tiempo real
pm2 logs rndc-backend --lines 0
```

---

## 📄 LICENCIA

Copyright © 2024 Asegurar.com.co  
Todos los derechos reservados.

---

## 🎉 ESTADO DEL PROYECTO

### ✅ LISTO PARA PRODUCCIÓN

**Funcionalidades Completas:**

- ✅ Backend API estable con cluster mode
- ✅ Frontend React compilado y optimizado
- ✅ Base de datos migrable sin pérdida
- ✅ Documentación completa paso a paso
- ✅ Scripts de automatización listos
- ✅ Configuraciones optimizadas
- ✅ Manejo de errores robusto
- ✅ Monitoreo y alertas implementados
- ✅ Backups automáticos configurables
- ✅ Soporte para Rocky Linux específico

**Probado en:**

- ✅ Desarrollo local (Windows)
- ✅ Listo para Rocky Linux 8/9
- ✅ Compatible con RHEL/CentOS Stream

---

## 🚀 SIGUIENTE PASO

**Para ir a producción ahora:**

1. Ejecutar: `prepare-production.bat`
2. Abrir: `ROCKY_LINUX_DEPLOYMENT.md`
3. Seguir las instrucciones paso a paso

**Tiempo estimado:** 2-3 horas

---

**Desarrollado con 💙 para Asegurar.com.co**  
_Diciembre 2024 - Sistema RNDC Dashboard v2.0_
