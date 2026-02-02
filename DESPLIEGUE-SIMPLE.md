# DESPLIEGUE RNDC EN ROCKY LINUX - PASO A PASO SIMPLE

## PASO 1: CONECTAR AL SERVIDOR

 ssh root@186.111.111.111

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

```
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

# Crear carpeta
#cambiar ruta por /var/www/html/Apirndc
sudo mkdir -p /ruta
sudo chown $USER:$USER /ruta

# Ir ahí
cd /ruta

---

## PASO 10: TRANSFERIR CÓDIGO BACKEND

## pasar repositorip por git o por winscp, si se hace por git hay que agregar el env manualmente

**En el servidor:**

```bash
cd /ruta

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


## PASO 12: INSTALAR DEPENDENCIAS

```bash
cd /ruta

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
cd /ruta

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

## PASO 18: VERIFICAR SERVICIOS

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

## ¡SISTEMA EN PRODUCCIÓN!

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

##  TROUBLESHOOTING

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

##  COMANDOS ÚTILES

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

**¡Sistema RNDC en producción con MongoDB seguro!**
