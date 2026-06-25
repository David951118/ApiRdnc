/**
 * Helpers geográficos compartidos.
 */

/**
 * Distancia haversine entre dos puntos {lat, lng}, en metros.
 */
function distanciaMetros(a, b) {
  const R = 6371e3;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Longitud total de una polilínea [{lat, lng}, ...], en kilómetros.
 * Ignora saltos imposibles (> saltoMaxKm entre puntos consecutivos) para no
 * inflar la distancia por errores puntuales de GPS.
 */
function longitudRecorridoKm(puntos, saltoMaxKm = 5) {
  if (!Array.isArray(puntos) || puntos.length < 2) return 0;

  let metros = 0;
  for (let i = 1; i < puntos.length; i++) {
    const d = distanciaMetros(puntos[i - 1], puntos[i]);
    if (d / 1000 <= saltoMaxKm) {
      metros += d;
    }
  }
  return Math.round((metros / 1000) * 100) / 100;
}

module.exports = { distanciaMetros, longitudRecorridoKm };
