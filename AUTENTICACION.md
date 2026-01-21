# 🔐 Sistema de Autenticación - API RNDC

## Resumen

Se implementó un sistema de autenticación completo usando el patrón **API Gateway/BFF (Backend for Frontend)**. El backend actúa como intermediario entre el frontend y Cellvi API, gestionando sesiones seguras con JWT.

---

## 🏗️ Arquitectura

```
Frontend → API RNDC (login) → Cellvi API
         ↓
    Token JWT RNDC (30min)
         ↓
Frontend → API RNDC (operaciones) [valida JWT, usa token Cellvi internamente]
```

**Ventajas:**

- ✅ Token de Cellvi nunca sale del backend (seguro)
- ✅ Control total de sesiones (30 minutos)
- ✅ Logout efectivo
- ✅ Filtrado automático por vehículos asignados
- ✅ Renovación de token (refresh)

---

## 📦 Nuevos Archivos Creados

### 1. Modelo de Sesión

**src/models/UserSession.js**

- Almacena sesiones activas en MongoDB
- Guarda el token de Cellvi asociado al usuario
- Lista de vehículos permitidos
- Auto-expira sesiones (índice TTL)

### 2. Servicio de Autenticación

**src/services/authService.js**

- `login(username, password)` - Autentica contra Cellvi y crea sesión
- `validateToken(token)` - Valida JWT y obtiene sesión
- `refreshToken(token)` - Renueva sesión
- `logout(token)` - Cierra sesión

### 3. Middleware de Autenticación

**src/middleware/auth.js**

- `authenticate` - Middleware obligatorio para rutas protegidas
- `optionalAuthenticate` - Middleware opcional
- `requireVehicleAccess(field)` - Verifica permisos sobre vehículos

### 4. Rutas de Autenticación

**src/routes/auth.js**

- `POST /api/auth/login` - Iniciar sesión
- `POST /api/auth/logout` - Cerrar sesión
- `POST /api/auth/refresh` - Renovar token
- `GET /api/auth/me` - Información del usuario
- `GET /api/auth/validate` - Validar token

---

## 🔧 Configuración

### 1. Variables de Entorno

Agregar al archivo `.env`:

```env
# Secret para firmar JWT (CAMBIAR EN PRODUCCIÓN)
# Generar con: openssl rand -base64 32
JWT_SECRET=tu_secret_super_seguro_aqui

# Duración de sesión en minutos (opcional, default: 30)
SESSION_DURATION_MINUTES=30
```

### 2. Rutas Protegidas

`src/app.js` ahora protege todas las rutas de API con autenticación:

```javascript
// Rutas públicas
app.use("/api/auth", authRoutes); // /login, /logout, etc.
app.get("/health", ...); // Health check

// Rutas protegidas (requieren token)
app.use("/api/manifiestos", authenticate, manifiestosRoutes);
app.use("/api/rmm", authenticate, rmmRoutes);
app.use("/api/asignaciones", authenticate, asignacionesRoutes);
// ...
```

---

## 🚀 Flujo de Uso

### 1. Login (Frontend)

```javascript
// Cambio en el frontend: Enviar credenciales al backend RNDC
const response = await fetch("http://tu-api/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    username: "usuario_cellvi",
    password: "password_cellvi",
  }),
});

const data = await response.json();

if (data.success) {
  // Guardar token del API RNDC (NO el de Cellvi)
  localStorage.setItem("token", data.token);
  localStorage.setItem("tokenExpiry", data.expiresAt);

  console.log("Usuario:", data.user);
  console.log("Vehículos:", data.user.vehiculos);
}
```

### 2. Peticiones Autenticadas

```javascript
// Incluir token en todas las peticiones
const token = localStorage.getItem("token");

const response = await fetch("http://tu-api/api/manifiestos", {
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
});
```

### 3. Renovar Token

```javascript
// Llamar cada 25 minutos (antes de expirar)
const response = await fetch("http://tu-api/api/auth/refresh", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

const data = await response.json();
if (data.success) {
  localStorage.setItem("token", data.token);
  localStorage.setItem("tokenExpiry", data.expiresAt);
}
```

### 4. Logout

```javascript
const response = await fetch("http://tu-api/api/auth/logout", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

localStorage.removeItem("token");
localStorage.removeItem("tokenExpiry");
```

---

## 🔄 Cambios en el Frontend

### Antes (Login directo a Cellvi)

```javascript
// ❌ Antiguo: Frontend hacía login directo en Cellvi
const response = await fetch(
  "https://cellviapi.asegurar.com.co/api/login_check",
  {
    method: "POST",
    body: JSON.stringify({ username, password }),
  },
);
```

### Después (Login a través del API RNDC)

```javascript
// ✅ Nuevo: Frontend loguea en el API RNDC
const response = await fetch("http://tu-api/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ username, password }),
});

// El backend maneja Cellvi internamente
```

---

## 🔐 Seguridad

### Filtrado Automático de Datos

El middleware `authenticate` adjunta al `req` los vehículos permitidos:

```javascript
// En los controladores, ahora puedes filtrar:
router.get("/", authenticate, async (req, res) => {
  const vehiculosIds = req.session.vehiculosPermitidos.map((v) => v.vehiculoId);

  // Filtrar solo los manifiestos de vehículos permitidos
  const manifiestos = await Manifiesto.find({
    vehiculoId: { $in: vehiculosIds },
  });

  res.json({ success: true, data: manifiestos });
});
```

### Verificación de Permisos Específicos

```javascript
// Ejemplo: Verificar acceso a un vehículo específico
router.get(
  "/:placa",
  authenticate,
  requireVehicleAccess("placa"),
  async (req, res) => {
    // Si llega aquí, el usuario tiene permisos sobre esta placa
    const { placa } = req.params;
    // ...
  },
);
```

---

## 📊 Información Disponible en Rutas Protegidas

Todas las rutas protegidas tienen acceso a:

```javascript
req.user = {
  username: "usuario_cellvi",
  userId: 1234,
  roles: ["ROLE_USER"],
};

req.session = {
  id: "session_mongodb_id",
  cellviToken: "token_interno_de_cellvi", // Para llamadas internas
  vehiculosPermitidos: [
    { vehiculoId: 4237, placa: "GTY872" },
    { vehiculoId: 4210, placa: "ABC123" },
  ],
  expiresAt: "2026-01-19T19:00:00Z",
};
```

---

## ✅ Próximos Pasos

1. **Generar JWT Secret Seguro**

   ```bash
   # En tu servidor de producción
   openssl rand -base64 32
   ```

   Agregar al `.env`:

   ```env
   JWT_SECRET=<tu_secret_generado>
   ```

2. **Actualizar Frontend**
   - Cambiar login para apuntar a `/api/auth/login` (no directo a Cellvi)
   - Implementar renovación automática de token
   - Agregar header `Authorization: Bearer <token>` a todas las peticiones

3. **Probar Flujo Completo**

   ```bash
   # Login
   curl -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"tu_usuario","password":"tu_password"}'

   # Obtener manifiestos (con token)
   curl http://localhost:3000/api/manifiestos \
     -H "Authorization: Bearer <tu_token>"
   ```

4. **Desplegar a Producción**
   - Hacer commit de los cambios
   - Hacer push al repo
   - En el servidor:
     ```bash
     cd /opt/rndc/backend
     git pull
     pm2 reload rndc-backend
     ```

---

## 🐛 Troubleshooting

### Error: "Token no proporcionado"

- Olvidaste incluir el header `Authorization: Bearer <token>`

### Error: "Token inválido o expirado"

- El token expiró (30 min)
- Haz refresh o pide login nuevamente

### Error: "Acceso denegado"

- El usuario no tiene permisos sobre ese vehículo
- Verificar que el vehículo esté asignado al usuario en Cellvi

### Sesiones no expiran automáticamente

- Verifica que MongoDB tenga índices TTL habilitados
- Ejecuta manualmente: `authService.cleanExpiredSessions()`

---

## 📝 Comandos Útiles

```javascript
// En node o script
const authService = require("./src/services/authService");

// Limpiar sesiones expiradas manualmente
await authService.cleanExpiredSessions();

// Ver sesiones activas
const UserSession = require("./src/models/UserSession");
const sesiones = await UserSession.find({});
console.log(sesiones);
```

---

¡Sistema de autenticación completamente funcional! 🎉
