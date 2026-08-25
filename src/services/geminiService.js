const axios = require("axios");
const config = require("../config/env");
const logger = require("../config/logger");

/**
 * Servicio de generación de contenido con la API de Google Gemini.
 * Usa la API REST directa (sin SDK) con la key de Google AI Studio.
 *
 * - Caption: modelo de texto (config.gemini.textModel)
 * - Imagen Instagram 1080x1080: modelo de imagen (config.gemini.imageModel),
 *   que recibe las fotos del admin como entrada y compone la pieza final.
 */

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

function assertApiKey() {
  if (!config.gemini.apiKey) {
    const err = new Error(
      "GEMINI_API_KEY no está configurada. Cree una key gratuita en https://aistudio.google.com y agréguela al .env",
    );
    err.statusCode = 503;
    throw err;
  }
}

async function callGemini(model, body) {
  const url = `${BASE_URL}/${model}:generateContent?key=${config.gemini.apiKey}`;
  const { data } = await axios.post(url, body, {
    headers: { "Content-Type": "application/json" },
    timeout: 120000,
    maxBodyLength: Infinity,
  });
  return data;
}

function extractText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts
    .filter((p) => typeof p.text === "string")
    .map((p) => p.text)
    .join("")
    .trim();
}

function extractImage(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find((p) => p.inlineData?.data || p.inline_data?.data);
  if (!imgPart) return null;
  const inline = imgPart.inlineData || imgPart.inline_data;
  return {
    buffer: Buffer.from(inline.data, "base64"),
    mimeType: inline.mimeType || inline.mime_type || "image/png",
  };
}

/**
 * Genera el caption de Instagram (texto + hashtags) para la publicación.
 * @param {{ tema: string, texto: string }} params
 * @returns {Promise<string>}
 */
async function generarCaption({ tema, texto }) {
  assertApiKey();

  const prompt = `Eres el community manager de Asegurar Ltda., empresa colombiana de rastreo GPS vehicular,
monitoreo satelital 24/7 y seguridad para flotas de transporte (plataformas Cellvi, PESV y RNDC).

Escribe el caption para una publicación de Instagram sobre el siguiente tema. Reglas:
- Español colombiano, tono profesional pero cercano.
- Máximo 150 palabras, con emojis moderados.
- Primera línea que enganche (sin la palabra "caption").
- Cierra con llamado a la acción (contactar a Asegurar / visitar asegurar.com.co).
- Termina con 8-12 hashtags relevantes en una sola línea (incluye #AsegurarLtda #RastreoGPS #Colombia).
- Devuelve SOLO el caption listo para pegar, sin comillas ni explicaciones.

Tema: ${tema}

Detalles aportados por la empresa:
${texto || "(sin detalles adicionales)"}`;

  const data = await callGemini(config.gemini.textModel, {
    contents: [{ parts: [{ text: prompt }] }],
  });

  const caption = extractText(data);
  if (!caption) throw new Error("Gemini no devolvió texto para el caption");
  return caption;
}

/**
 * Genera la imagen de la publicación en formato Instagram (cuadrada 1080x1080)
 * a partir de las fotos aportadas por el admin.
 * @param {{ tema: string, texto: string, fotos: Array<{buffer: Buffer, mimeType: string}> }} params
 * @returns {Promise<{ buffer: Buffer, mimeType: string }>}
 */
async function generarImagen({ tema, texto, fotos }) {
  assertApiKey();

  const prompt = `Diseña una publicación de Instagram (imagen cuadrada 1080x1080) para Asegurar Ltda.,
empresa colombiana de rastreo GPS vehicular y monitoreo satelital.

Tema de la publicación: ${tema}
${texto ? `Contexto: ${texto}` : ""}

Instrucciones de diseño:
- Usa las fotos adjuntas como elemento principal de la composición (collage o foto destacada), sin distorsionarlas.
- Estilo corporativo moderno: paleta azul oscuro (#0a2d6e a #1565c0) con acentos amarillos (#ffd54f), limpio y profesional.
- Incluye un titular corto y legible en español relacionado con el tema (máximo 8 palabras, sin errores ortográficos).
- Reserva una franja o espacio con el nombre "ASEGURAR LTDA." y el texto "Monitoreo satelital 24/7".
- Deja DESPEJADA la esquina superior izquierda (sin texto ni elementos importantes): ahí se
  estampará el logo oficial de la empresa después.
- No inventes logos (ni de Asegurar ni de terceros), ni marcas ajenas, ni texto largo.
- Resultado: una sola imagen cuadrada lista para publicar.`;

  const parts = [{ text: prompt }];
  for (const foto of fotos) {
    parts.push({
      inline_data: {
        mime_type: foto.mimeType,
        data: foto.buffer.toString("base64"),
      },
    });
  }

  const data = await callGemini(config.gemini.imageModel, {
    contents: [{ parts }],
  });

  const imagen = extractImage(data);
  if (!imagen) {
    const feedback = data?.promptFeedback?.blockReason || extractText(data);
    logger.error(`Gemini no devolvió imagen. Respuesta: ${feedback}`);
    throw new Error(
      `Gemini no devolvió una imagen${feedback ? ` (${feedback})` : ""}. Intente de nuevo o ajuste el tema.`,
    );
  }
  return imagen;
}

/**
 * Diseña una entrada de blog completa a partir de texto plano y fotos:
 * corrige ortografía/redacción y devuelve la estructura de bloques que usa
 * el renderizador del sitio, con las fotos ubicadas dentro del artículo.
 *
 * @param {{ titulo?: string, texto: string, fotos: Array<{url: string, buffer: Buffer, mimeType: string}> }} params
 * @returns {Promise<Object>} borrador { titulo, titulo2, resumen, categoria, tags, lectura, portadaUrl, contenido }
 */
async function disenarBlog({ titulo, texto, fotos }) {
  assertApiKey();

  const listaFotos = fotos
    .map((f, i) => `FOTO_${i + 1}: ${f.url}`)
    .join("\n");

  const prompt = `Eres el editor del blog de Asegurar Ltda., empresa colombiana de rastreo GPS vehicular,
monitoreo satelital 24/7 y seguridad para el transporte (sur de Colombia: Nariño, Cauca, Putumayo).

Te entrego el borrador en texto plano de una noticia${titulo ? ` (título tentativo: "${titulo}")` : ""} y sus fotos
(adjuntas en este mensaje, en el mismo orden de la lista de URLs). Tu trabajo:

1. CORRIGE ortografía, gramática y redacción (español colombiano, tono periodístico profesional).
2. ESTRUCTURA el artículo en bloques, mejorándolo: título llamativo en MAYÚSCULAS, subtítulo,
   subtítulos internos donde ayuden, y si el texto lo amerita agrega una cita, un bloque de datos
   con cifras del texto (nunca inventes cifras) o un destacado con llamado a la acción.
3. UBICA las fotos dentro del artículo donde mejor acompañen el contenido (bloques "imagen" o
   "galeria"), con "alt" y "caption" descriptivos basados en lo que VES en cada foto.
   USA EXCLUSIVAMENTE las URLs de la lista; no inventes URLs ni omitas fotos.
4. MARCA: el artículo debe mencionar a ASEGURAR LTDA. de forma natural dentro del contenido
   (su papel en los hechos, sus servicios de monitoreo satelital 24/7 según aplique) y debe
   CERRAR SIEMPRE con un bloque "destacado" que invite al lector a proteger su flota con
   ASEGURAR LTDA. (contacto en asegurar.com.co).

FOTOS DISPONIBLES:
${listaFotos}

TEXTO DEL BORRADOR:
${texto}

Responde SOLO con un JSON válido con esta forma exacta (sin markdown, sin comentarios):
{
  "titulo": "TÍTULO EN MAYÚSCULAS",
  "titulo2": "Subtítulo de una línea",
  "resumen": "Resumen de 1-2 frases para la tarjeta del listado",
  "categoria": "una de: Caso de éxito | Seguridad vial | Empresarial | Tutorial | Noticias",
  "tags": ["Etiqueta1", "Etiqueta2"],
  "lectura": "N min",
  "portadaUrl": "URL de la foto que mejor sirva de portada",
  "contenido": [
    { "tipo": "parrafo", "texto": "..." },
    { "tipo": "subtitulo", "texto": "..." },
    { "tipo": "imagen", "url": "...", "alt": "...", "caption": "..." },
    { "tipo": "galeria", "imagenes": [ { "url": "...", "alt": "...", "caption": "..." } ] },
    { "tipo": "cita", "texto": "...", "autor": "..." },
    { "tipo": "datos", "items": [ { "valor": "...", "etiqueta": "..." } ] },
    { "tipo": "destacado", "icono": "✅", "texto": "..." },
    { "tipo": "lista", "textos": ["...", "..."] }
  ]
}
(los tipos de bloque mostrados son los permitidos; usa solo los que el artículo necesite)`;

  const parts = [{ text: prompt }];
  for (const foto of fotos) {
    parts.push({
      inline_data: {
        mime_type: foto.mimeType,
        data: foto.buffer.toString("base64"),
      },
    });
  }

  const data = await callGemini(config.gemini.textModel, {
    contents: [{ parts }],
    generationConfig: { response_mime_type: "application/json" },
  });

  const raw = extractText(data);
  if (!raw) throw new Error("Gemini no devolvió el diseño del artículo");

  let draft;
  try {
    draft = JSON.parse(raw);
  } catch {
    // A veces envuelve el JSON en ```json ... ```
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Gemini devolvió un formato inesperado; intente de nuevo");
    draft = JSON.parse(m[0]);
  }

  // Validación: solo bloques conocidos y solo URLs de las fotos entregadas
  const TIPOS = new Set([
    "parrafo", "subtitulo", "titulo", "imagen", "galeria",
    "cita", "datos", "destacado", "lista", "link",
  ]);
  const urlsValidas = new Set(fotos.map((f) => f.url));
  draft.contenido = (draft.contenido || []).filter((b) => {
    if (!b || !TIPOS.has(b.tipo)) return false;
    if (b.tipo === "imagen") return urlsValidas.has(b.url);
    if (b.tipo === "galeria") {
      b.imagenes = (b.imagenes || []).filter((img) => urlsValidas.has(img.url));
      return b.imagenes.length > 0;
    }
    return true;
  });
  if (!urlsValidas.has(draft.portadaUrl)) {
    draft.portadaUrl = fotos[0]?.url || "";
  }

  return draft;
}

module.exports = { generarCaption, generarImagen, disenarBlog };
