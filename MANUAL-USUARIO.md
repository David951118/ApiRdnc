#  Manual de Usuario - Dashboard RNDC

Bienvenido al sistema de monitoreo de manifiestos RNDC. Esta guía le ayudará a usar la plataforma para supervisar el estado de su flota y el cumplimiento de los reportes al Ministerio de Transporte.

##  Acceso al Sistema

1.  Ingrese a la dirección web proporcionada por soporte (ej. `https://www.asegurar.com.co/rndc`).
2.  Use sus **credenciales de Cellvi** (El mismo Usuario y Contraseña que usa para rastrear sus vehículos).
3.  Haga clic en **Ingresar**.

> **Nota:** No necesita crear un usuario nuevo. Su cuenta de Cellvi funciona automáticamente.

---

##  Pantalla Principal (Dashboard)

Al ingresar, verá un resumen ejecutivo en la parte superior con 4 indicadores:

- **Total Manifiestos:** Cantidad total de viajes activos descargados del RNDC para su cuenta.
- **Monitoreables:** Viajes donde el vehículo SÍ está registrado en Cellvi y tiene GPS activo. Estos se reportan automáticamente.
- **No Monitoreables:** Viajes donde la placa del RNDC no coincide con ningún vehículo en su cuenta de Cellvi. **¡Atención!** Estos viajes requieren revisión manual ya que no tenemos GPS para ellos.
- **RMMs Pendientes:** Reportes en cola esperando ser transmitidos al servidor del Ministerio.

---

##  Pestaña: Manifiestos

Es la vista principal donde gestiona sus viajes.

###  Filtros

Use la barra gris superior para encontrar viajes específicos:

- **Placa:** Escriba las letras o números de la placa.
- **Estado:** Filtre por `ACTIVO` (en viaje), `CUMPLIDO` (terminado) o `ANULADO`.
- **Monitoreable:** Seleccione "Sí" para ver solo los que se están reportando automáticamente.

### Detalle del Viaje

Haga clic en la flecha **( > )** a la izquierda de cada fila para desplegar la información detallada:

1.  **Botón "Ver Ubicación Actual":** Muestra la última posición GPS conocida del vehículo, velocidad y enlace directo a Google Maps.
2.  **Lista de Puntos de Control:** Muestra las ciudades por donde debe pasar el vehículo.
    - **Etiqueta Verde (COMPLETADO):** El vehículo ya pasó y se reportó al RNDC. Muestra el número de Radicado.
    - **Etiqueta Amarilla (PENDIENTE):** El vehículo aún no ha llegado a este punto.
    - **Mapa:** Enlace para ver la ubicación exacta del punto de control en el mapa.

---

##  Pestaña: RMMs (Reportes de Monitoreo)

Esta pestaña es una auditoría técnica de los envíos al ministerio. Úsela para verificar cumplimiento.

- **Estado Enviado (Verde):** El ministerio recibió y aprobó el reporte de llegada/salida.
- **Estado Error (Rojo):** Hubo un problema. Ponga el mouse sobre el ícono de error para ver el mensaje del RNDC (ej. "Conductor no corresponde").
- **Acciones:**
  - **Reintentar:** Si ve un error de conexión, use este botón para intentar enviar de nuevo.

---

##  Pestaña: Bitácora / Alertas (Solo Admin)

Aquí se muestran las **Novedades (RNMM)** generadas automáticamente.

- **Código 1:** El vehículo no llegó al punto de control 24 horas después de la cita.
- **Código 2:** La placa del manifiesto no existe en nuestra plataforma de rastreo.

Estas novedades se reportan automáticamente al RNDC para evitar sanciones por falta de información.

---

## Preguntas Frecuentes

**¿Por qué un manifiesto dice "No Monitoreable"?**
Significa que la placa escrita en el manifiesto del RNDC no existe exactamente igual en su cuenta de Cellvi. Verifique que el vehículo esté creado en la plataforma de rastreo.

**¿Cuánto tarda en aparecer un nuevo manifiesto aquí?**
El sistema consulta al RNDC cada **15 minutos**. Si acaba de crear el manifiesto en la página del ministerio, espere al próximo ciclo de sincronización.

**¿Qué pasa si el conductor apaga el GPS?**
Si el GPS no reporta, el sistema no puede detectar la llegada. Si pasan 24 horas de la cita sin reporte, el sistema generará automáticamente una **Novedad RNMM** indicando que el vehículo no apareció, para cumplir con la normativa vigilar.

**¿La sesión caduca?**
Sí. Por seguridad, la sesión se cierra automáticamete tras un tiempo de inactividad. Si ve un mensaje de "¿Sigues ahí?", confirme para continuar trabajando sin perder sus filtros.

---

**Soporte Técnico:** Contacte al área de sistemas si detecta errores persistentes en color rojo.
