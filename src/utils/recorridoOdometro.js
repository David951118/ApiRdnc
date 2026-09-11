/**
 * Recorrido real a partir de los snapshots diarios del odómetro
 * (models/KilometrajeDiario, capturados por workers/kilometrajeDiario.js).
 *
 * Regla única para KPIs gerenciales, análisis por vehículo y telemetría:
 * se suman las diferencias positivas entre snapshots consecutivos, PERO se
 * ignoran los saltos físicamente imposibles (más de KM_MAX_POR_DIA por cada
 * día transcurrido entre los dos snapshots). Esos saltos aparecen cuando la
 * preoperativa se digita con un dígito de más o de menos (543289 → 54329 →
 * 543333) o cuando el odómetro del GPS cambia de base (70313 → 540874): en
 * producción sumarlos inflaba el km de la flota en casi 3 millones.
 * Una diferencia negativa tampoco es recorrido (reset o corrección), pero el
 * siguiente snapshot pasa a ser la nueva base.
 */

// 24 h a ~80 km/h. Ningún vehículo de la flota supera esto en un día.
const KM_MAX_POR_DIA = 2000;

/** Días calendario entre dos fechas "YYYY-MM-DD" (mínimo 1). */
function diasEntre(fechaA, fechaB) {
  if (!fechaA || !fechaB) return 1;
  const a = Date.UTC(+fechaA.slice(0, 4), +fechaA.slice(5, 7) - 1, +fechaA.slice(8, 10));
  const b = Date.UTC(+fechaB.slice(0, 4), +fechaB.slice(5, 7) - 1, +fechaB.slice(8, 10));
  if (Number.isNaN(a) || Number.isNaN(b)) return 1;
  return Math.max(1, Math.round((b - a) / 86400000));
}

/**
 * Suma el recorrido de una lista de snapshots ORDENADA por fecha.
 * @param {{fecha:string, kilometraje:number}[]} snapshots
 * @returns {{recorridoKm:number, saltosIgnorados:number}}
 */
function sumarRecorrido(snapshots) {
  let recorrido = 0;
  let saltosIgnorados = 0;
  for (let i = 1; i < snapshots.length; i++) {
    const delta = snapshots[i].kilometraje - snapshots[i - 1].kilometraje;
    if (!(delta > 0)) continue;
    const dias = diasEntre(snapshots[i - 1].fecha, snapshots[i].fecha);
    if (delta <= KM_MAX_POR_DIA * dias) recorrido += delta;
    else saltosIgnorados++;
  }
  return { recorridoKm: Math.round(recorrido), saltosIgnorados };
}

/**
 * Consolidado con extremos (lo que devuelven los endpoints de telemetría).
 */
function consolidarRecorrido(snapshots) {
  if (!snapshots || snapshots.length === 0) {
    return { dias: 0, kmInicio: null, kmFin: null, recorridoKm: 0, saltosIgnorados: 0 };
  }
  const { recorridoKm, saltosIgnorados } = sumarRecorrido(snapshots);
  return {
    dias: snapshots.length,
    kmInicio: snapshots[0].kilometraje,
    kmFin: snapshots[snapshots.length - 1].kilometraje,
    fechaInicio: snapshots[0].fecha,
    fechaFin: snapshots[snapshots.length - 1].fecha,
    recorridoKm,
    saltosIgnorados,
  };
}

module.exports = { KM_MAX_POR_DIA, diasEntre, sumarRecorrido, consolidarRecorrido };
