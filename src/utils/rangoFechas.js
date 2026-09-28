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

/** Día calendario colombiano (YYYY-MM-DD) de un instante. */
function diaColombia(fecha = new Date()) {
  const co = new Date(fecha.getTime() - 5 * 60 * 60 * 1000);
  return co.toISOString().slice(0, 10);
}

/**
 * Fecha a guardar cuando el usuario escoge solo un día ("2026-09-28").
 * Guardarla como medianoche UTC la mostraba en Colombia como el día anterior
 * a las 7 p. m. Si el día es hoy se guarda la hora actual; si es otro día,
 * el mediodía colombiano, que cae dentro del mismo día en cualquier zona.
 */
function fechaDeDiaColombia(valor) {
  if (valor === undefined || valor === null || valor === "") return null;
  if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor;
  const texto = String(valor).trim();
  if (SOLO_FECHA.test(texto)) {
    if (texto === diaColombia()) return new Date();
    const fecha = new Date(`${texto}T12:00:00.000${OFFSET_CO}`);
    return isNaN(fecha.getTime()) ? null : fecha;
  }
  const fecha = new Date(texto);
  return isNaN(fecha.getTime()) ? null : fecha;
}

module.exports = { inicioDelDia, finDelDia, rangoDias, diaColombia, fechaDeDiaColombia };
