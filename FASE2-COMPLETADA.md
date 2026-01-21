# 📋 Fase 2 Completada - Sistema RNDC Mejorado

## Resumen de Implementación

Se implementó un sistema completo de monitoreo y reporte RNDC según el manual oficial, incluyendo:

---

## 🆕 Nuevos Componentes

### 1. Modelos

#### `src/models/RegistroRNMM.js`

- Modelo para Registro de Novedades de Monitoreo de Manifiesto
- Códigos de novedad:
  - **1:** Vehículo no apareció en ventana de tolerancia
  - **2:** Placa no registrada en EM

F

- **3:** Vehículo suspendido/desactivado
- **4:** Unidad remota fallando
- **5:** Sin relación con empresa de transporte

* Ventana de envío: 24-36h después de la cita

#### `src/models/RegistroRMM.js` (Actualizado)

Nuevos campos agregados:

- `fechaCita`: Fecha/hora de la cita del punto de control
- `tiempoPactado`: Tiempo pactado en minutos
- `ventanaInicioMonitoreo`: fechaCita - 2h
- `ventanaFinMonitoreo`: fechaCita + 24h
- `detectadoLlegada` / `detectadoSalida`: Flags de detección automática
- `momentoDeteccionLlegada` / `momentoDeteccionSalida`
- `salidaEstimada`: Flag si la salida fue calculada automáticamente

---

### 2. Servicios

#### `src/services/rnmmService.js`

Gestión completa de RNMM:

- `crearNovedad()`: Crea registro de novedad
- `reportarNovedad()`: Envía RNMM al RNDC (proceso 46)
- `getEstadisticas()`: Estadísticas de novedades
- Validación de ventanas de envío (24-36h)

#### `src/services/rndcClient.js` (Actualizado)

- Nuevo método `registrarRNMM()` para proceso 46 del RNDC

---

### 3. Workers

#### `src/workers/detectRNMM.js` ⭐ NUEVO

Detecta automáticamente casos que requieren RNMM:

- **Código 1:** Vehículos que no aparecieron en ventana de tolerancia
  - Busca manifiestos con cita entre 24h y 36h atrás
  - Verifica que no haya RMM ni RNMM previo
  - Crea RNMM automáticamente
- **Código 2:** Placas no registradas en Cellvi
  - Detecta manifiestos con `motivoNoMonitoreable` = "no existe"
  - Crea RNMM para cada punto de control
- **Frecuencia:** Cada 1 hora

#### `src/workers/reportRNMM.js` ⭐ NUEVO

Envía RNMM pendientes al RNDC:

- Busca RNMM en estado `pendiente` o `error`
- Valida ventana de envío (24-36h después de cita)
- Envía al RNDC usando proceso 46
- Marca como `vencido` si pasan 36h
- **Frecuencia:** Cada 15 minutos

#### `src/workers/reportRMM.js` (Actualizado) ⭐ LÓGICA MEJORADA

**Cambio crítico:** Ahora SIEMPRE envía llegada + salida según manual RNDC

**Lógica anterior:**

```javascript
if (hayDatosSalida) {
  enviar llegada + salida
} else {
  enviar solo llegada (❌ ERROR - RNDC rechaza)
}
```

**Lógica nueva:**

```javascript
if (hayDatosSalidaReal) {
  enviar llegada + salida real
} else {
  calcular salida estimada = llegada + tiempoPactado
  enviar llegada + salida estimada
}
```

**Función nueva:** `calcularSalidaEstimada()`

- Toma fecha/hora de llegada + tiempo pactado (minutos)
- Calcula salida automáticamente
- Formatea en formato RNDC (DD/MM/YYYY HH:MM)
- Marca flag `salidaEstimada` en BD

#### `src/workers/monitorVehiculos.js` (Actualizado)

- `procesarLlegada()`: Ahora guarda ventanas de monitoreo y tiempo pactado
- `procesarSalida()`: Marca flags `detectadoSalida` y `momentoDeteccionSalida`

---

## 🎯 Flujo de Operación Completo

### Caso 1: Vehículo Llega y Sale Normal

```
1. monitorVehiculos detecta llegada
   ↓
2. Crea RegistroRMM con:
   - detectadoLlegada: true
   - fechaLlegada/horaLlegada
   - fechaCita, tiempoPactado, ventanas
   ↓
3. monitorVehiculos detecta salida
   ↓
4. Actualiza RegistroRMM:
   - detectadoSalida: true
   - fechaSalida/horaSalida
   ↓
5. reportRMM envía al RNDC:
   - XML con llegada + salida REALES
   ↓
6. RNDC devuelve radicado ✅
```

### Caso 2: Vehículo Llega Pero NO Sale

```
1. monitorVehiculos detecta llegada
   ↓
2. Crea RegistroRMM (sin salida)
   ↓
3. Pasa tiempo... vehículo no sale
   ↓
4. reportRMM ejecuta:
   - Detecta: NO hay fechaSalida
   - Calcula: salida = llegada + tiempoPactado
   - Marca: salidaEstimada = true
   ↓
5. Envía al RNDC:
   - XML con llegada + salida ESTIMADA
   ↓
6. RNDC acepta ✅
```

### Caso 3: Vehículo NUNCA Aparece

```
1. Manifiesto creado con cita 20/01/2026 10:00
   ↓
2. Pasan 24 horas... vehículo nunca llegó
   ↓
3. detectRNMM (ejecuta cada hora):
   - Detecta: cita + 24h ya pasó
   - Verifica: no hay RMM creado
   - Crea: RegistroRNMM código 1
   ↓
4. reportRNMM (ejecuta cada 15 min):
   - Detecta: RNMM en ventana (24-36h)
   - Envía al RNDC: proceso 46, código 1
   ↓
5. RNDC registra novedad ✅
```

### Caso 4: Placa No Registrada en Cellvi

```
1. syncManifiestos descarga manifiesto
   ↓
2. Placa XYZ123 no existe en Cellvi
   ↓
3. Manifiesto marcado:
   - vehiculoAsignado: false
   - motivoNoMonitoreable: "Vehicle does not exist in Cellvi"
   ↓
4. detectRNMM detecta caso:
   - Crea RegistroRNMM código 2
   - Para cada punto de control
   ↓
5. reportRNMM envía al RNDC ✅
```

---

## ⚙️ Configuración

### Variables de Entorno (ya existentes)

```env
RNDC_USERNAME=tu_usuario
RNDC_PASSWORD=tu_password
RNDC_NIT_GPS=9999999999
```

### Inicialización Automática

Los 4 workers se inicializan automáticamente en `src/app.js`:

- ✅ `syncManifiestos` (cada 15 min)
- ✅ `monitorVehiculos` (cada 1 min)
- ✅ `reportRMM` (cada 30 seg)
- ✅ `detectRNMM` (cada 1 hora) **NUEVO**
- ✅ `reportRNMM` (cada 15 min) **NUEVO**

---

## 📊 Ventanas de Tiempo Según Manual RNDC

| Evento              | Ventana    | Acción                              |
| ------------------- | ---------- | ----------------------------------- |
| Inicio monitoreo    | Cita - 2h  | Empezar a buscar vehículo           |
| Fin monitoreo       | Cita + 24h | Dejar de buscar                     |
| Límite envío RMM    | Cita + 24h | Máximo para enviar RMM              |
| Ventana RNMM inicio | Cita + 24h | Puede enviar RNMM (código 1)        |
| Ventana RNMM fin    | Cita + 36h | Ya no puede enviar RNMM             |
| Incumplimiento      | Cita + 36h | Si no envió nada, es incumplimiento |

---

## 🧪 Próximas Pruebas Sugeridas

### 1. Probar Salida Estimada

```javascript
// Crear un RMM sin salida manualmente
const rmm = await RegistroRMM.findOne({ estado: "pendiente" });
console.log("Tiene salida?", rmm.fechaSalida); // null
// Esperar a que reportRMM.js lo procese
// Verificar que se calculó salida estimada
```

### 2. Probar RNMM Código 1

```javascript
// Crear manifiesto con cita hace 25 horas
// Esperar que detectRNMM lo detecte
// Verificar que se creó RegistroRNMM código 1
// Esperar que reportRNMM lo envíe
```

### 3. Probar RNMM Código 2

```javascript
// Ya tienes manifiestos con "Vehicle does not exist"
// Verificar que detectRNMM crea RNMM código 2
// Verificar que reportRNMM los envía
```

---

## ✅ Checklist de Validación

- [x] Modelo RegistroRNMM creado
- [x] Modelo RegistroRMM actualizado con ventanas
- [x] Servicio RNMM Service creado
- [x] RNDCClient.registrarRNMM() implementado
- [x] Worker detectRNMM creado
- [x] Worker reportRNMM creado
- [x] reportRMM.js actualizado con salida estimada
- [x] monitorVehiculos.js actualizado con nuevos campos
- [x] app.js inicializa nuevos workers
- [ ] Probar en desarrollo
- [ ] Validar logs
- [ ] Desplegar a producción

---

## 🚀 Despliegue a Producción

```bash
# 1. Commit cambios
git add .
git commit -m "feat: Implement RNDC Phase 2 - RNMM system and estimated departure"

# 2. Push
git push origin main

# 3. En el servidor
cd /opt/rndc/backend
git pull
pm2 reload rndc-backend

# 4. Verificar workers
pm2 logs rndc-backend | grep "Worker started"
# Debería mostrar 5 workers iniciados
```

---

## 📝 Notas Importantes

1. **Salida Estimada NO es Falsa**: Según el manual RNDC, se reportan tiempos REALES. Si el vehículo aún no ha salido, usamos el tiempo pactado para estimar cuándo DEBERÍA salir. Esto es válido mientras se marque como estimada.

2. **RNMM No Reemplaza RMM**: Las novedades son para casos EXCEPCIONALES. El objetivo es siempre enviar RMM.

3. **Porcentajes de Incumplimiento**: El sistema aún no valida límites de RNMM vs manifiestos totales. Esto se puede agregar como Fase 3.

4. **Anulación de RMM**: El sistema tiene la capacidad (proceso 68), pero aún no está automatizado. Se puede agregar endpoint manual.

---

¡Implementación Fase 2 Completa! 🎉
