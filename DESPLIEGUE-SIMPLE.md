# 🚀 DESPLIEGUE RNDC EN ROCKY LINUX - PASO A PASO SIMPLE

**Guía comando por comando | MongoDB Local con Seguridad**

---

## 📋 ANTES DE EMPEZAR

**Necesitas:**

1.  Usuario y password de **Cellvi API**
2.  💻 Acceso SSH al **servidor Rocky Linux**
3.  📝 Decidir un usuario/password para **MongoDB** (recomendado: `rndc_admin` / password seguro)

---

## PASO 1: CONECTAR AL SERVIDOR

```bash
# Conectarse por SSH (cambia TU_IP y TU_USUARIO)
ssh TU_USUARIO@TU_IP

# Ejemplo:
# ssh root@192.168.1.100
```

---

## PASO 2: ACTUALIZAR SISTEMA

```bash
# Actualizar paquetes
sudo dnf update -y

# Instalar herramientas
sudo dnf install -y wget curl git vim tar
```

---

## PASO 3: INSTALAR NODE.JS 18

```bash
# Descargar repositorio
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -

# Instalar
sudo dnf install -y nodejs

# Verificar
node --version
npm --version
```

---

## PASO 4: INSTALAR MONGODB 7

```bash
# Crear repositorio
sudo nano /etc/yum.repos.d/mongodb-org-7.0.repo
```

**Copiar esto:**

```
[mongodb-org-7.0]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/redhat/8/mongodb-org/7.0/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://www.mongodb.org/static/pgp/server-7.0.asc
```

**Guardar:** `Ctrl+X`, `Y`, `Enter`

```bash
# Instalar MongoDB
sudo dnf install -y mongodb-org

# Iniciar MongoDB (SIN autenticación por ahora)
sudo systemctl enable mongod
sudo systemctl start mongod

# Verificar
sudo systemctl status mongod
```

---

## PASO 5: CREAR USUARIO Y PASSWORD PARA MONGODB

```bash
# Conectar a MongoDB
mongosh

# Dentro de mongosh, ejecutar:
use admin

db.createUser({
  user: "rndc_admin",
  pwd: "Asegurar2025*",
  roles: [
    { role: "userAdminAnyDatabase", db: "admin" },
    { role: "readWriteAnyDatabase", db: "admin" }
  ]
})

# Salir
exit
```

---

## PASO 6: HABILITAR AUTENTICACIÓN EN MONGODB

```bash
# Editar configuración de MongoDB
sudo nano /etc/mongod.conf
```

**Buscar la sección `#security:` y cambiarla por:**

```yaml
security:
  authorization: enabled
```

**Guardar:** `Ctrl+X`, `Y`, `Enter`

```bash
# Reiniciar MongoDB
sudo systemctl restart mongod

# Verificar
sudo systemctl status mongod
```

---

## PASO 7: PROBAR AUTENTICACIÓN

```bash
# Probar conexión con usuario/password
mongosh "mongodb://rndc_admin:Asegurar2025*@localhost:27017/admin"

# Si conecta, escribir:
show dbs

# Salir
exit
```

---

## PASO 8: CREAR BASE DE DATOS INICIAL

```bash
# Conectar con autenticación
mongosh "mongodb://rndc_admin:Asegurar2025*@localhost:27017/admin"

# Crear base de datos
use cellvi-rndc

# Crear colecciones vacías
db.createCollection("manifiestos")
db.createCollection("registrosrmm")
db.createCollection("logs")
db.createCollection("asignaciones")

# Verificar
show collections

# Salir
exit
```

---

## PASO 9: CREAR DIRECTORIO DEL PROYECTO

```bash
# Crear carpeta
sudo mkdir -p /opt/rndc
sudo chown $USER:$USER /opt/rndc

# Ir ahí
cd /opt/rndc
```

---

## PASO 10: TRANSFERIR CÓDIGO BACKEND

**En tu PC** (PowerShell):

```powershell
# Ir a carpeta del proyecto
cd C:\Users\dsmon\OneDrive\Documentos\Documents\Cellviweb

# Comprimir
tar --exclude='node_modules' --exclude='.git' --exclude='logs' -czf apirndc.tar.gz apirndc

# Transferir (CAMBIA IP y USUARIO)
scp apirndc.tar.gz TU_USUARIO@TU_IP:/opt/rndc/
```

**En el servidor:**

```bash
cd /opt/rndc

# Descomprimir
tar -xzf apirndc.tar.gz
mv apirndc backend
cd backend
```

---

## PASO 11: CONFIGURAR .ENV PARA PRODUCCIÓN

```bash
nano .env
```

**Copiar esto (CAMBIAR tus datos):**

```env
# PRODUCCIÓN
NODE_ENV=production
PORT=3000

# MONGODB LOCAL CON AUTENTICACIÓN
MONGODB_URI=mongodb://rndc_admin:Asegurar2025*@localhost:27017/cellvi-rndc

# CELLVI API - TUS CREDENCIALES REALES
CELLVI_API_URL=https://cellviapi.asegurar.com.co
CELLVI_USERNAME=TU_USUARIO_CELLVI
CELLVI_PASSWORD=TU_PASSWORD_CELLVI

# Usuario ADMIN de Cellvi (para workers)
CELLVI_ADMIN_USERNAME=TU_ADMIN_CELLVI
CELLVI_ADMIN_PASSWORD=TU_ADMIN_PASSWORD_CELLVI

# RNDC SOAP
SOAP_ENDPOINT_URL=http://rndcws.mintransporte.gov.co:8080/soap/IBPMServices
SOAP_REQUEST_TIMEOUT=60000

# LOGS
LOG_LEVEL=warn
```

**Guardar:** `Ctrl+X`, `Y`, `Enter`

---

## PASO 12: INSTALAR DEPENDENCIAS

```bash
cd /opt/rndc/backend

# Instalar
npm install --production

# Crear carpeta de logs
mkdir -p logs
```

---

## PASO 13: INSTALAR PM2

```bash
# Instalar globalmente
sudo npm install -g pm2

# Verificar
pm2 --version
```

---

## PASO 14: PROBAR CONEXIÓN

```bash
cd /opt/rndc/backend

# Probar que conecta a MongoDB
node -e "const mongoose = require('mongoose'); const uri = require('dotenv').config().parsed.MONGODB_URI; mongoose.connect(uri).then(() => console.log('✅ MongoDB OK')).catch(e => console.log('❌ Error:', e.message));"
```

---

## PASO 15: INICIAR BACKEND

```bash
cd /opt/rndc/backend

# Iniciar con PM2
pm2 start ecosystem.config.js

# Ver estado
pm2 status

# Ver logs
pm2 logs rndc-backend --lines 30
```

---

## PASO 16: GUARDAR PM2

```bash
# Guardar configuración
pm2 save

# Auto-inicio
pm2 startup systemd

# Ejecutar el comando que PM2 te muestra
```

---

## PASO 17: PROBAR BACKEND

```bash
# Health check
curl http://localhost:3000/health

# Debe responder:
# {"status":"OK","mongodb":"connected",...}
```

---

## PASO 18: COMPILAR FRONTEND (EN TU PC)

```powershell
# Ir a frontend
cd C:\Users\dsmon\OneDrive\Documentos\Documents\MAC\asegurar

# Compilar
npm run build

# Comprimir
cd build
tar -czf frontend-build.tar.gz *

# Transferir
scp frontend-build.tar.gz TU_USUARIO@TU_IP:/opt/rndc/
```

---

## PASO 19: INSTALAR FRONTEND (EN EL SERVIDOR)

```bash
cd /opt/rndc
mkdir -p frontend
cd frontend

# Extraer
tar -xzf ../frontend-build.tar.gz

# Verificar
ls -la index.html
```

---

## PASO 20: INSTALAR NGINX

```bash
sudo dnf install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

## PASO 21: CONFIGURAR NGINX

```bash
sudo nano /etc/nginx/conf.d/rndc.conf
```

**Copiar (CAMBIAR TU_IP):**

```nginx
server {
    listen 80;
    server_name TU_IP;

    location / {
        root /opt/rndc/frontend;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location /health {
        proxy_pass http://localhost:3000/health;
    }
}
```

**Guardar:** `Ctrl+X`, `Y`, `Enter`

---

## PASO 22: PERMISOS Y SELINUX

```bash
# Permisos
sudo chown -R nginx:nginx /opt/rndc/frontend
sudo chmod -R 755 /opt/rndc/frontend

# SELinux
sudo chcon -R -t httpd_sys_content_t /opt/rndc/frontend
sudo setsebool -P httpd_can_network_connect 1
```

---

## PASO 23: FIREWALL

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

---

## PASO 24: REINICIAR NGINX

```bash
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl status nginx
```

---

## PASO 25: ¡PROBAR!

**En tu navegador:**

```
http://TU_IP
```

Deberías ver el login. Al iniciar sesión con Cellvi, el sistema empezará a sincronizar manifiestos automáticamente.

---

## PASO 26: VERIFICAR SERVICIOS

```bash
# PM2
pm2 status

# MongoDB
sudo systemctl status mongod

# Nginx
sudo systemctl status nginx

# Logs
pm2 logs rndc-backend
```

---

## 💾 BACKUP AUTOMÁTICO

```bash
# Crear script
nano /home/$USER/backup-mongo.sh
```

**Copiar:**

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/mongodb"
mkdir -p $BACKUP_DIR

mongodump --uri="mongodb://rndc_admin:TU_PASSWORD@localhost:27017/cellvi-rndc" --out="$BACKUP_DIR/backup-$DATE"

# Mantener últimos 7 días
find $BACKUP_DIR -type d -mtime +7 -exec rm -rf {} \; 2>/dev/null
```

```bash
# Permisos
chmod +x /home/$USER/backup-mongo.sh

# Probar
/home/$USER/backup-mongo.sh

# Cron diario
crontab -e

# Agregar:
0 2 * * * /home/$USER/backup-mongo.sh
```

---

## 🎉 ¡SISTEMA EN PRODUCCIÓN!

**Configuración:**

- ✅ MongoDB local con usuario/password
- ✅ Base de datos vacía lista
- ✅ PM2 con auto-restart
- ✅ Nginx sirviendo frontend
- ✅ Backup automático diario
- ✅ **NODE_ENV=production**

**Los manifiestos se sincronizarán automáticamente desde RNDC cuando:**

- Los workers se ejecuten (cada cierto tiempo)
- O puedes forzar sincronización desde el dashboard

---

## 🐛 TROUBLESHOOTING

### Backend no conecta a MongoDB

```bash
# Verificar usuario/password
mongosh "mongodb://rndc_admin:TU_PASSWORD@localhost:27017/admin"

# Ver logs
pm2 logs rndc-backend --err
```

### MongoDB no inicia

```bash
sudo systemctl status mongod
sudo journalctl -u mongod -n 50
```

### Nginx 502

```bash
pm2 status
curl http://localhost:3000/health
```

---

## 📝 COMANDOS ÚTILES

```bash
# Reiniciar todo
pm2 restart all
sudo systemctl restart nginx mongod

# Estados
pm2 status
sudo systemctl status mongod nginx

# Logs
pm2 logs rndc-backend
sudo tail -f /var/log/nginx/error.log

# Backup manual
mongodump --uri="mongodb://rndc_admin:TU_PASSWORD@localhost:27017/cellvi-rndc" --out=/tmp/backup-manual
```

---

**¡Sistema RNDC en producción con MongoDB seguro! 🚀**
