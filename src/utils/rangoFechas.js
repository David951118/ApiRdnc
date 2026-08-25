/**
 * Interpretación de los filtros de fecha que llegan por query string.
 *
 * El front envía días sueltos ("2026-08-25"). `new Date("2026-08-25")` los
 * interpreta como medianoche UTC, así que un `$lte` dejaba fuera todo lo
 * registrado ese mismo día en Colombia y un `$gte` arrastraba las últimas
 * horas del día anterior. Aquí se anclan al día calendario colombiano
 * (UTC-05:00 fijo, el país no maneja horario de verano).
 */

const OFFSET_CO = "-05:00";
const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Inicio del día colombiano (00:00:00.000). */
function inicioDelDia(valor) {
  if (!valor) return null;
  const texto = String(valor).trim();
  const fecha = SOLO_FECHA.test(texto)
    ? new Date(`${texto}T00:00:00.000${OFFSET_CO}`)
    : new Date(texto);
  return isNaN(fecha.getTime()) ? null : fecha;
}

/** Fin del día colombiano (23:59:59.999), para que `$lte` incluya ese día. */
function finDelDia(valor) {
  if (!valor) return null;
  const texto = String(valor).trim();
  const fecha = SOLO_FECHA.test(texto)
    ? new Date(`${texto}T23:59:59.999${OFFSET_CO}`)
    : new Date(texto);
  return isNaN(fecha.getTime()) ? null : fecha;
}

/**
 * Filtro Mongo para un rango de días. Devuelve null si no hay rango, para
 * poder hacer `if (r) filtro.fecha = r;`.
 */
function rangoDias(desde, hasta) {
  const inicio = inicioDelDia(desde);
  const fin = finDelDia(hasta);
  if (!inicio && !fin) return null;
  const filtro = {};
  if (inicio) filtro.$gte = inicio;
  if (fin) filtro.$lte = fin;
  return filtro;
}

module.exports = { inicioDelDia, finDelDia, rangoDias };
