const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

// Logo oficial (azul/amarillo sobre fondo claro) — se integra en la franja de
// marca de la plantilla y se estampa sobre las imágenes generadas con IA
const LOGO_PATH = path.resolve(__dirname, "../assets/logo-asegurar.png");
const logoBuffer = fs.readFileSync(LOGO_PATH);

/**
 * Composición de la imagen de Instagram (1080x1080) con plantilla corporativa
 * propia — respaldo cuando el modelo de imagen de Gemini no está disponible
 * (p. ej. sin facturación en Google). Foto(s) del admin + franja de marca
 * Asegurar con el título de la publicación.
 */

const W = 1080;
const H = 1080;
const FOTO_H = 700; // alto del área de fotos; el resto es la franja de marca

function escapeXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Parte el título en líneas de máximo `max` caracteres (por palabra)
function partirLineas(texto, max = 30, maxLineas = 3) {
  const palabras = texto.trim().split(/\s+/);
  const lineas = [];
  let actual = "";
  for (const p of palabras) {
    if ((actual + " " + p).trim().length > max) {
      if (actual) lineas.push(actual.trim());
      actual = p;
    } else {
      actual = (actual + " " + p).trim();
    }
  }
  if (actual) lineas.push(actual.trim());
  if (lineas.length > maxLineas) {
    lineas.length = maxLineas;
    lineas[maxLineas - 1] = lineas[maxLineas - 1].replace(/\S+$/, "").trim() + "…";
  }
  return lineas;
}

/**
 * @param {{ tema: string, fotos: Array<{buffer: Buffer}> }} params
 * @returns {Promise<{ buffer: Buffer, mimeType: string }>}
 */
async function componerImagen({ tema, fotos }) {
  const n = Math.min(fotos.length, 4);

  // ── Área de fotos: 1 grande, o collage en columnas ──
  const composites = [];
  if (n === 1) {
    composites.push({
      input: await sharp(fotos[0].buffer).resize(W, FOTO_H, { fit: "cover" }).toBuffer(),
      top: 0,
      left: 0,
    });
  } else if (n === 2) {
    const w2 = W / 2;
    for (let i = 0; i < 2; i++) {
      composites.push({
        input: await sharp(fotos[i].buffer).resize(w2, FOTO_H, { fit: "cover" }).toBuffer(),
        top: 0,
        left: i * w2,
      });
    }
  } else {
    // 3-4 fotos: principal a la izquierda, secundarias apiladas a la derecha
    const wIzq = Math.round(W * 0.62);
    const wDer = W - wIzq;
    const sec = fotos.slice(1, n);
    const hSec = Math.floor(FOTO_H / sec.length);
    composites.push({
      input: await sharp(fotos[0].buffer).resize(wIzq, FOTO_H, { fit: "cover" }).toBuffer(),
      top: 0,
      left: 0,
    });
    for (let i = 0; i < sec.length; i++) {
      composites.push({
        input: await sharp(sec[i].buffer).resize(wDer, hSec, { fit: "cover" }).toBuffer(),
        top: i * hSec,
        left: wIzq,
      });
    }
  }

  // ── Franja de marca con el título (SVG) ──
  const lineas = partirLineas(tema.toUpperCase(), 28, 3);
  const lineaH = 58;
  const inicioY = 830 + (3 - lineas.length) * 18;
  const textos = lineas
    .map(
      (l, i) =>
        `<text x="70" y="${inicioY + i * lineaH}" font-family="Arial, Helvetica, sans-serif" font-size="46" font-weight="900" fill="#ffffff">${escapeXml(l)}</text>`,
    )
    .join("\n");

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="banda" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0a2d6e"/>
      <stop offset="0.6" stop-color="#114a9e"/>
      <stop offset="1" stop-color="#1565c0"/>
    </linearGradient>
    <linearGradient id="sombra" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0a2d6e" stop-opacity="0"/>
      <stop offset="1" stop-color="#0a2d6e" stop-opacity="0.85"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${FOTO_H}" width="${W}" height="${H - FOTO_H}" fill="url(#banda)"/>
  <rect x="0" y="${FOTO_H - 120}" width="${W}" height="120" fill="url(#sombra)"/>
  <rect x="70" y="${FOTO_H + 42}" width="110" height="10" rx="5" fill="#ffd54f"/>
  ${textos}
  <rect x="60" y="966" width="252" height="86" rx="14" fill="#ffffff"/>
  <text x="336" y="1022" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="#cfe0f5">Monitoreo satelital 24/7 · asegurar.com.co</text>
  <circle cx="985" cy="912" r="40" fill="none" stroke="#ffd54f" stroke-opacity="0.5" stroke-width="3"/>
  <circle cx="985" cy="912" r="22" fill="none" stroke="#ffd54f" stroke-opacity="0.8" stroke-width="3"/>
  <circle cx="985" cy="912" r="6" fill="#ffd54f"/>
</svg>`;

  composites.push({ input: Buffer.from(svg), top: 0, left: 0 });

  // Logo oficial dentro de la tarjeta blanca de la franja de marca
  const logoStrip = await sharp(logoBuffer)
    .resize(220, 66, { fit: "inside" })
    .toBuffer();
  const metaStrip = await sharp(logoStrip).metadata();
  composites.push({
    input: logoStrip,
    top: 966 + Math.round((86 - metaStrip.height) / 2),
    left: 60 + Math.round((252 - metaStrip.width) / 2),
  });

  const buffer = await sharp({
    create: { width: W, height: H, channels: 3, background: "#0a2d6e" },
  })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toBuffer();

  return { buffer, mimeType: "image/jpeg" };
}

/**
 * Estampa el logo oficial de Asegurar (sobre tarjeta blanca redondeada) en la
 * esquina superior izquierda de una imagen. Se usa sobre las piezas generadas
 * por IA para garantizar que TODA publicación lleve el logo.
 *
 * @param {Buffer} buffer - Imagen base (cualquier tamaño)
 * @returns {Promise<{ buffer: Buffer, mimeType: string }>}
 */
async function estamparLogo(buffer) {
  const meta = await sharp(buffer).metadata();
  const ancho = meta.width || W;

  // Tarjeta proporcional al ancho de la imagen (~24% del ancho)
  const cardW = Math.round(ancho * 0.24);
  const cardH = Math.round(cardW * 0.34);
  const margen = Math.round(ancho * 0.028);
  const radio = Math.round(cardH * 0.18);

  const card = `<svg width="${cardW}" height="${cardH}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="${radio}" fill="#ffffff" fill-opacity="0.96"/>
</svg>`;

  const logo = await sharp(logoBuffer)
    .resize(Math.round(cardW * 0.86), Math.round(cardH * 0.72), { fit: "inside" })
    .toBuffer();
  const metaLogo = await sharp(logo).metadata();

  const salida = await sharp(buffer)
    .composite([
      { input: Buffer.from(card), top: margen, left: margen },
      {
        input: logo,
        top: margen + Math.round((cardH - metaLogo.height) / 2),
        left: margen + Math.round((cardW - metaLogo.width) / 2),
      },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();

  return { buffer: salida, mimeType: "image/jpeg" };
}

module.exports = { componerImagen, estamparLogo };
