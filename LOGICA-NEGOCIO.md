#  Lógica de Negocio y Arquitectura - Sistema RNDC Cellvi

Este documento detalla el funcionamiento interno, los flujos de negocio y la arquitectura del sistema de integración entre Cellvi y el RNDC.

##  Arquitectura General

El sistema actúa como un **Backend for Frontend (BFF)** y un **Middleware de Sincronización**.

1.  **Backend (Node.js/Express):**
    - Gestiona la autenticación de usuarios contra Cellvi.
    - Sirve de proxy seguro para las consultas al RNDC.
    - Expone una API REST para el Frontend.
    - Ejecuta Workers en segundo plano.

2.  **Base de Datos (MongoDB):**
    - Almacena manifiestos sincronizados (`Manifiesto`).
    - Almacena el estado de los reportes RMM (`RegistroRMM`).
    - Gestiona novedades y excepciones (`RegistroRNMM`).
    - Almacena logs y auditoría y sesiones de usuario (`UserSession`).

3.  **Workers (Segundo Plano):**
    - Son procesos cronometrados que ejecutan la lógica pesada de negocio.

---

##  Flujos de Negocio

### 1. Sincronización de Manifiestos (`syncManifiestos.js`)

**Objetivo:** Mantener una copia local de los manifiestos asignados a la empresa para no saturar al RNDC.

- **Frecuencia:** Cada 15 minutos (configurable).
- **Lógica:**
  1.  Consulta al RNDC (proceso 41) los manifiestos activos.
  2.  Por cada manifiesto, verifica si el vehículo (`placa`) existe en Cellvi.
  3.  Si existe, lo marca como `esMonitoreable: true` y guarda los detalles.
  4.  Si no existe, lo marca como `esMonitoreable: false` y registra el motivo.

### 2. Monitoreo de Vehículos (`monitorVehiculos.js`)

**Objetivo:** Detectar cuándo un vehículo llega o sale de un punto de control.

- **Frecuencia:** Cada 5 minutos.
- **Lógica:**
  1.  Busca manifiestos activos (`estado: "ACTIVO"`) y monitoreables.
  2.  Consulta la última posición GPS del vehículo en Cellvi.
  3.  Calcula la distancia al siguiente punto de control (`haversine`).
  4.  **Llegada:** Si está a < 500m del punto, registra la llegada y crea un `RegistroRMM`.
  5.  **Salida:** Si ya llegó y se aleja > 1km, registra la salida y actualiza el `RegistroRMM`.

### 3. Reporte RMM (`reportRMM.js`)

**Objetivo:** Enviar los reportes de monitoreo (Llegada/Salida) al RNDC cuando corresponde.

- **Frecuencia:** Cada 3 minutos.
- **Lógica:**
  1.  Busca registros `RegistroRMM` en estado `pendiente` o `error`.
  2.  Verifica si estamos dentro de la ventana de tiempo permitida.
  3.  Genera el XML para el proceso RNDC (ID 45).
  4.  **Regla de Negocio Crítica:** Siempre debe enviar fecha de llegada Y fecha de salida.
      - Si no hay fecha de salida real (vehículo sigue en el punto), calcula una **Salida Estimada** (Llegada + Tiempo Pactado o 60 min).
  5.  Envía al RNDC y actualiza el estado (`enviado` o `error`).

### 4. Detección de Novedades RNMM (`detectRNMM.js`)

**Objetivo:** Identificar casos donde NO es posible enviar un RMM y se debe reportar una novedad (excepción).

- **Frecuencia:** Cada 1 hora.
- **Casos:**
  - **Código 1 (Vehículo no apareció):** Si pasaron 24h de la cita y no hay detección GPS de llegada.
  - **Código 2 (Placa no registrada):** Si el vehículo del manifiesto no existe en Cellvi (detectado previamente en `syncManifiestos`).
  - **Código 3 (Sin transmisión):** Si el GPS dejó de reportar por tiempo prolongado.

### 5. Reporte RNMM (`reportRNMM.js`)

**Objetivo:** Enviar las novedades detectadas al RNDC.

- **Frecuencia:** Cada 15 minutos.
- **Lógica:**
  1.  Busca novedades `RegistroRNMM` pendientes.
  2.  Verifica ventana de tiempo estricta (24h - 36h después de la cita).
  3.  Envía al RNDC (proceso 46).

---

##  Seguridad y Autenticación

El sistema utiliza un esquema de **Tokens Múltiples**:

1.  **Frontend -> Backend (Nuestro JWT):**
    - El usuario se loguea en el Frontend con credenciales de Cellvi.
    - El Backend valida contra Cellvi y genera su propio JWT (HS256).
    - Este token contiene los roles y **vehículos permitidos** para ese usuario.
    - El token viaja en el header `Authorization: Bearer <token>`.

2.  **Backend -> Cellvi (Token Cellvi):**
    - El Backend mantiene una sesión administrativa transparente con Cellvi para consultar GPS y validar usuarios.
    - Este token NUNCA llega al frontend.

3.  **Backend -> RNDC (Usuario/Clave en XML):**
    - Las credenciales del RNDC están seguras en el `.env` del servidor y se inyectan en cada petición SOAP.

---

##  Endpoints Principales (API REST)

Base URL: `/api`

### Autenticación

- `POST /auth/login`: Iniciar sesión. Retorna JWT y datos de usuario.
- `POST /auth/refresh`: Renovar token antes de que expire.
- `POST /auth/logout`: Cerrar sesión (invalida token en BD).
- `GET /auth/me`: Obtener datos del usuario actual.

### Manifiestos

- `GET /manifiestos`: Listar manifiestos. Filtra automáticamente por vehículos permitidos del usuario.
- `DELETE /manifiestos/:id`: Borrar un manifiesto (Solo Admin).

### Logs y Auditoría

- `GET /logs`: Ver historial de transacciones con RNDC.
- `GET /logs/stats`: Estadísticas de éxito/error.

---

## Modelos de Datos (MongoDB)

### UserSession

Controla la validez de los tokens JWT y permite invalidarlos remotamente (Logout).

- `token`: Hash del token.
- `vehiculosPermitidos`: Array de placas que este usuario puede ver.
- `expiresAt`: TTL index para auto-borrado.

### Manifiesto

La verdad absoluta sobre el viaje. Contiene:

- Datos del conductor/vehículo.
- Array de `puntosControl` con sus estados individuales.
- `motivoNoMonitoreable`: Razón si no se puede trackear.

### RegistroRMM

Cola de envío para reportes de paso (Llegada/Salida).

- `estado`: pendiente, enviado, error.
- `salidaEstimada`: Flag si la salida fue calculada.

### RegistroRNMM

Cola de envío para novedades (Excepciones).

- `codigoNovedad`: 1-5 según manual RNDC.
- `fechaLimiteReporte`: Deadline para enviar (Cita + 36h).
