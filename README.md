# RNDC Integration Middleware

Sistema middleware para la automatización de reportes RMM y RNMM al RNDC (Ministerio de Transporte), integrando datos de rastreo GPS desde la plataforma Cellvi.

##  Características

- **Sincronización Automática:** Descarga manifiestos activos del RNDC.
- **Monitoreo GPS:** Detecta llegadas y salidas de puntos de control usando geocercas dinámicas.
- **Reporte RMM Inteligente:** Gestiona reportes de cumplimiento y calcula salidas estimadas si es necesario para cumplir normativa.
- **Gestión de Novedades (RNMM):** Reporta automáticamente excepciones (Vehículo no apareció, Placa no registrada) dentro de las ventanas de tiempo legales.
- **Seguridad:** Autenticación JWT con rotación de tokens y gestión de sesiones.

## 🛠 Tech Stack

- **Runtime:** Node.js v18+
- **Base de Datos:** MongoDB v7+
- **Frameworks:** Express.js
- **Librerías Clave:**
  - `axios`: Cliente HTTP para consumir RNDC SOAP y Cellvi API.
  - `xml2js`: Procesamiento de respuestas SOAP XML.
  - `mongoose`: Modelado de datos.
  - `jsonwebtoken` y `bcrypt`: Seguridad y autenticación.
  - `node-cron`: Orquestación de workers.

##  Instalación Rápida

1.  **Configurar variables:**

    ```bash
    cp .env.example .env
    # Editar .env con credenciales de RNDC y Cellvi
    ```

2.  **Instalar dependencias:**

    ```bash
    npm install
    # En producción usar: npm install --production
    ```

3.  **Iniciar:**

    ```bash
    # Desarrollo
    npm run dev

    # Producción (PM2 recomendado)
    npm start
    ```

##  Workers de Automatización

El sistema ejecuta 5 procesos autónomos en paralelo:

| Worker               | Archivo               | Frecuencia | Descripción                                                             |
| :------------------- | :-------------------- | :--------- | :---------------------------------------------------------------------- |
| **Sync Manifiestos** | `syncManifiestos.js`  | 15 min     | Descarga nuevos viajes del RNDC y valida vehículos en Cellvi.           |
| **Monitor GPS**      | `monitorVehiculos.js` | 5 min      | Cruza posiciones GPS en tiempo real con los puntos de control.          |
| **Report RMM**       | `reportRMM.js`        | 3 min      | Genera y envía XMLs de reporte de paso (Llegada/Salida) al RNDC.        |
| **Detect RNMM**      | `detectRNMM.js`       | 1 hora     | Audita viajes pasados para detectar incumplimientos (No apareció).      |
| **Report RNMM**      | `reportRNMM.js`       | 15 min     | Envía reportes de novedades (excepciones) al RNDC en la ventana 24-36h. |

##  Documentación

Para detalles técnicos profundos, consulte:

- [Guía de Despliegue en Producción](./DESPLIEGUE-SIMPLE.md)
- [Lógica de Negocio y Arquitectura](./LOGICA-NEGOCIO.md)
- [ Fase 2: Implementación RNMM](./FASE2-COMPLETADA.md)

---

**Desarrollado por @david951118(github) Jefe de desarrollos de Asegurar Ltda.**
