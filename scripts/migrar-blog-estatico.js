/**
 * Migración one-shot: sube las fotos del blog estático de la página `asegurar`
 * a S3 y crea las 6 noticias históricas como BlogPost en Mongo (estado
 * PUBLICADO, contenido rico en bloques). Idempotente: si el slug ya existe,
 * lo omite.
 *
 * Uso:
 *   node scripts/migrar-blog-estatico.js [rutaAssets]
 *   rutaAssets: carpeta src/Assets del proyecto asegurar
 *               (por defecto ../asegurar/src/Assets relativo a apirndc)
 */
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const config = require("../src/config/env");
const s3Service = require("../src/services/s3Service");
const BlogPost = require("../src/models/BlogPost");

const ASSETS =
  process.argv[2] || path.resolve(__dirname, "../../asegurar/src/Assets");

// Archivo local (relativo a Assets) → se sube una sola vez
const FOTOS = {
  cafePortada: "blog/cafe-recuperado-portada.jpeg",
  cafeFrente: "blog/cafe-recuperado-frente.jpeg",
  cafePolicia: "blog/cafe-recuperado-policia.jpeg",
  reunionRistra: "blog/portadapolicia.jpeg",
  policiaRistra: "blog/ereunion.jpeg",
  reunionSeguridadVial: "blog/policia.jpeg",
  reunionMesaTrabajo: "blog/policia2.jpeg",
  fotoApp: "Foto Portada/cellvi.jpg",
  lanchaVertical: "blog/lanchavertical.jpeg",
  lanchaHorizontal: "blog/lanchaHorizontal.jpeg",
  chucunes: "blog/chucunes.jpeg",
  chucunesInseguro: "blog/inseguridad_0_1.jpeg",
};

const MESES = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
};

function parseFecha(str) {
  // "19 Mayo 2025"
  const [dia, mes, anio] = str.trim().split(/\s+/);
  return new Date(parseInt(anio), MESES[mes.toLowerCase()] ?? 0, parseInt(dia));
}

async function subirFotos() {
  const urls = {}; // alias → { key, url }
  for (const [alias, rel] of Object.entries(FOTOS)) {
    const abs = path.join(ASSETS, rel);
    if (!fs.existsSync(abs)) {
      throw new Error(`No existe el archivo: ${abs}`);
    }
    const buffer = fs.readFileSync(abs);
    const mimeType = rel.toLowerCase().endsWith(".png")
      ? "image/png"
      : "image/jpeg";
    const subida = await s3Service.uploadBuffer({
      buffer,
      mimeType,
      fileName: path.basename(rel),
      folder: "contenido/blog",
    });
    urls[alias] = { key: subida.key, url: subida.publicUrl };
    console.log(`  ✓ ${rel} → ${subida.key}`);
  }
  return urls;
}

function construirPosts(f) {
  const img = (alias, alt, caption) => ({
    tipo: "imagen",
    url: f[alias].url,
    alt,
    caption,
  });

  return [
    {
      slug: "recuperacion-cafe-popayan-2025",
      categoria: "Caso de éxito",
      titulo: "RECUPERACIÓN DE 10 TONELADAS DE CAFÉ EN TIEMPO RÉCORD",
      titulo2:
        "Monitoreo satelital y coordinación con la Policía logran recuperar carga y vehículo en una hora",
      fecha: "19 Mayo 2025",
      lectura: "3 min",
      autor: "Central de Monitoreo ASEGURAR LTDA.",
      portadaAlias: "cafePortada",
      resumen:
        "Un vehículo cargado con 10 toneladas de café fue hurtado en la ruta La Unión (Nariño) – Popayán (Cauca) y recuperado aproximadamente una hora después gracias al dispositivo satelital de ASEGURAR y la articulación con la Policía de Carreteras.",
      tags: ["SeguridadVial", "MonitoreoSatelital", "Café", "Cauca", "Recuperación", "PirateríaTerrestre"],
      imagenesAlias: ["cafePortada", "cafeFrente", "cafePolicia"],
      contenido: [
        { tipo: "parrafo", texto: "El 19 de mayo de 2025, el señor Luis Carlos Burbano Gómez reportó el hurto de un vehículo cargado con 10 toneladas de café mientras cubría la ruta entre La Unión (Nariño) y Popayán (Cauca). De inmediato, la Central de Monitoreo de ASEGURAR LTDA. activó su protocolo de búsqueda y reacción." },
        { tipo: "datos", items: [
          { valor: "10 t", etiqueta: "de café a bordo" },
          { valor: "~1 h", etiqueta: "para recuperar" },
          { valor: "100%", etiqueta: "carga recuperada" },
        ] },
        { tipo: "subtitulo", texto: "Activación inmediata del protocolo" },
        { tipo: "parrafo", texto: "Tras el reporte, la central suministró las coordenadas en tiempo real del dispositivo satelital instalado en la carga y coordinó acciones con la Policía de Carreteras del Cauca, con especial apoyo de la patrullera Yenni Guerrero, manteniendo un intercambio constante de información durante todo el operativo." },
        img("cafePortada", "Vehículo recuperado con la carga de café", "Vehículo de placa TKF-528 recuperado en el sector Loma de la Virgen, Popayán."),
        { tipo: "subtitulo", texto: "Ubicación y recuperación" },
        { tipo: "parrafo", texto: "Gracias al monitoreo en tiempo real y al apoyo de la Policía Nacional, el vehículo y la mercancía fueron ubicados y recuperados en el sector Loma de la Virgen, en Popayán, aproximadamente una hora después del reporte inicial. La totalidad de la carga de café fue puesta a disposición de las autoridades." },
        { tipo: "galeria", imagenes: [
          { url: f.cafeFrente.url, alt: "Camión recuperado de frente", caption: "Vehículo recuperado en buen estado." },
          { url: f.cafePolicia.url, alt: "Entrega de la carga a las autoridades", caption: "Carga de café entregada a la Policía Nacional y la Fiscalía." },
        ] },
        { tipo: "cita", texto: "La rapidez de la recuperación demuestra que la tecnología satelital, combinada con la coordinación entre la central de monitoreo y las autoridades, es la mejor herramienta contra la piratería terrestre.", autor: "Central de Monitoreo ASEGURAR LTDA." },
        { tipo: "subtitulo", texto: "Lecciones y recomendaciones" },
        { tipo: "parrafo", texto: "El caso evidenció la efectividad del dispositivo satelital y de la coordinación interinstitucional entre las autoridades y la central de monitoreo. Ante el alto riesgo de piratería terrestre en la zona, se recomendó a los transportadores reforzar la seguridad en las vías del Cauca mediante caravanas o escoltas armados." },
        { tipo: "destacado", icono: "✅", texto: "¿Transporta carga de alto valor por el sur del país? El monitoreo satelital 24/7 de ASEGURAR LTDA. puede marcar la diferencia entre perder su mercancía o recuperarla en minutos." },
        { tipo: "parrafo", texto: "Agradecemos a la Policía de Carreteras del Cauca, a la patrullera Yenni Guerrero y a todas las autoridades que hicieron posible esta recuperación. En ASEGURAR LTDA. reafirmamos nuestro compromiso con la protección de los transportadores de la región." },
      ],
    },
    {
      slug: "ristra-2024",
      categoria: "Empresarial",
      titulo: "ASEGURAR LTDA. SE INTEGRA AL SISTEMA RISTRA",
      titulo2: "Un paso más hacia la seguridad vial inteligente",
      fecha: "28 Mayo 2024",
      lectura: "2 min",
      autor: "Romulo Bolaños",
      portadaAlias: "reunionRistra",
      resumen:
        "La empresa ASEGURAR LTDA. fue integrada al Registro Integral de Seguridad en el Transporte (RISTRA), en colaboración con autoridades de tránsito del Departamento de Policía Nariño.",
      tags: ["RISTRA", "SeguridadVial", "PolicíaNariño"],
      imagenesAlias: ["reunionRistra", "policiaRistra"],
      contenido: [
        { tipo: "parrafo", texto: "El pasado 28 de mayo de 2024, en las instalaciones de ASEGURAR LTDA., se llevó a cabo una importante reunión con los directivos del RISTRA (Registro Integral de Seguridad en el Transporte), con el objetivo de integrar a nuestra empresa en esta plataforma tecnológica de alto impacto para la seguridad vial." },
        { tipo: "parrafo", texto: "El encuentro contó con la participación de destacados miembros de la Dirección de Transportes y Tránsito del Departamento de Policía Nariño, entre ellos el Subteniente Kevin Saavedra, el Intendente Gabriel Ortega y el Intendente Víctor Yela." },
        img("policiaRistra", "Reunión con directivos del RISTRA", "Directivos de ASEGURAR LTDA. junto a la Policía de Tránsito de Nariño."),
        { tipo: "parrafo", texto: "La incorporación de ASEGURAR LTDA. a esta herramienta representa un avance significativo en el monitoreo, análisis y prevención de incidentes en las vías." },
        { tipo: "parrafo", texto: "Expresamos nuestro sincero agradecimiento a la Policía de Carreteras por su permanente acompañamiento y compromiso con la protección de los transportadores." },
        { tipo: "parrafo", texto: "Con esta alianza, reafirmamos nuestro compromiso de trabajar articuladamente en soluciones tecnológicas y operativas que contribuyan a fortalecer la seguridad en el transporte terrestre." },
      ],
    },
    {
      slug: "reunion-interinstitucional-2025",
      categoria: "Seguridad vial",
      titulo: "REUNIÓN INTERINSTITUCIONAL POR LA SEGURIDAD VIAL EN EL SUR DEL PAÍS",
      titulo2: "Acciones conjuntas frente a la piratería terrestre",
      fecha: "22 Mayo 2025",
      lectura: "2 min",
      autor: "Romulo Bolaños",
      portadaAlias: "reunionSeguridadVial",
      resumen:
        "ASEGURAR LTDA. participó en una reunión clave con autoridades para abordar la creciente inseguridad en las vías del Cauca y Nariño.",
      tags: ["SeguridadVial", "PirateríaTerrestre", "Cauca", "Nariño"],
      imagenesAlias: ["reunionSeguridadVial", "reunionMesaTrabajo"],
      contenido: [
        { tipo: "parrafo", texto: "Ante la creciente racha de inseguridad en las vías de los departamentos del Cauca y Nariño, se llevó a cabo una importante reunión interinstitucional en las instalaciones de ASEGURAR LTDA." },
        { tipo: "parrafo", texto: "Participaron representantes de la Policía de Tránsito y Transporte, así como delegados de las Unidades de Investigación Criminal, quienes analizaron los recientes casos de piratería terrestre." },
        img("reunionMesaTrabajo", "Reunión de seguridad vial", "Mesa de trabajo interinstitucional en ASEGURAR LTDA."),
        { tipo: "parrafo", texto: "ASEGURAR LTDA. expuso datos recolectados a través de su sistema de monitoreo vehicular, evidenciando puntos críticos y patrones de comportamiento delictivo." },
        { tipo: "parrafo", texto: "ASEGURAR LTDA. reitera su compromiso con la seguridad vial y la protección de los activos de sus clientes." },
      ],
    },
    {
      slug: "manual-cellvi-android-2024",
      categoria: "Tutorial",
      titulo: "MANUAL ACTUALIZACIÓN APP CELLVI ANDROID",
      titulo2: "Actualiza la app de Asegurar",
      fecha: "14 Noviembre 2024",
      lectura: "1 min",
      autor: "David Montes",
      portadaAlias: "fotoApp",
      resumen:
        "Manual paso a paso para actualizar la aplicación móvil CELLVI en dispositivos Android.",
      tags: ["CELLVI", "App", "Android", "Tutorial"],
      imagenesAlias: ["fotoApp"],
      contenido: [
        { tipo: "pdf", texto: "/Manual de Actualizacion de app móvil CELLVI Android.pdf" },
      ],
    },
    {
      slug: "novedades-octubre-2024",
      categoria: "Empresarial",
      titulo: "NOVEDADES ASEGURAR OCTUBRE",
      titulo2: "Noticias importantes en Asegurar",
      fecha: "16 Octubre 2024",
      lectura: "2 min",
      autor: "Romulo Bolaños",
      portadaAlias: "lanchaVertical",
      resumen:
        "Resumen de novedades del mes: nuevos servicios fluviales, cambios en recaudo y portal de pagos.",
      tags: ["Novedades", "Putumayo", "PortalDePagos"],
      imagenesAlias: ["lanchaVertical", "lanchaHorizontal"],
      contenido: [
        { tipo: "parrafo", texto: "1.- ASEGURAR LTDA. se une a los sentimientos de dolor por la sensible pérdida de la Señora BLANCA LUCINDA CÓRDOBA DE RAMOS." },
        { tipo: "parrafo", texto: "2.- ASEGURAR LTDA. ha incursionado en los servicios de ubicación vehicular a flotas de transporte fluvial en el Departamento del Putumayo." },
        img("lanchaHorizontal", "Transporte fluvial monitoreado", "Monitoreo de flotas de transporte fluvial en Putumayo."),
        { tipo: "parrafo", texto: "3.- Se informa que el punto de recaudo en Ipiales quedó desactivado. Los pagos deben realizarse por medios electrónicos." },
        { tipo: "parrafo", texto: "4.- A partir del 01 de noviembre de 2024 podrán ejecutar sus pagos a través de nuestra página web por el portal de pagos WOMPI y BANCO DE COLOMBIA con código QR." },
        { tipo: "link", texto: "https://www.asegurar.com.co/portaldepagos", label: "Ir al portal de pagos" },
      ],
    },
    {
      slug: "efectividad-chucunes-2024",
      categoria: "Caso de éxito",
      titulo: "EFECTIVIDAD DE ASEGURAR",
      titulo2: "¡Acciones inmediatas y efectivas!",
      fecha: "5 Mayo 2024",
      lectura: "2 min",
      autor: "Ing. David Montes",
      portadaAlias: "chucunes",
      resumen:
        "Caso de éxito: recuperación de vehículo asaltado en la ruta Pasto–Tumaco, sector Chucunes.",
      tags: ["CasoDeÉxito", "Recuperación", "PastoTumaco"],
      imagenesAlias: ["chucunes", "chucunesInseguro"],
      contenido: [
        { tipo: "parrafo", texto: "En colaboración entre la Policía Nacional, el Ejército Nacional y ASEGURAR LTDA., se logró recuperar el vehículo asaltado en la ruta de Pasto a Tumaco, sector de CHUCUNES." },
        { tipo: "parrafo", texto: "El trabajo conjunto entre las fuerzas de seguridad colombianas y el personal de ASEGURAR fue fundamental para el éxito de esta operación." },
        { tipo: "parrafo", texto: "La recuperación del vehículo es un ejemplo tangible de los esfuerzos continuos que se están realizando para garantizar la seguridad en las carreteras colombianas." },
        { tipo: "parrafo", texto: "¡Sigamos adelante juntos! En ASEGURAR siempre estaremos dispuestos a atender todas sus dudas." },
        img("chucunesInseguro", "Sector Chucunes", "Operativo de recuperación en el sector Chucunes."),
      ],
    },
  ];
}

async function main() {
  console.log(`Assets: ${ASSETS}`);
  await mongoose.connect(config.mongodb.uri);
  console.log("MongoDB conectado");

  console.log("Subiendo fotos a S3…");
  const fotos = await subirFotos();

  const posts = construirPosts(fotos);
  for (const p of posts) {
    const existe = await BlogPost.findOne({ slug: p.slug });
    if (existe) {
      console.log(`  ↷ ya existe, omitido: ${p.slug}`);
      continue;
    }
    await BlogPost.create({
      titulo: p.titulo,
      slug: p.slug,
      titulo2: p.titulo2,
      resumen: p.resumen,
      cuerpo: "",
      contenido: p.contenido,
      categoria: p.categoria,
      tags: p.tags,
      lectura: p.lectura,
      autor: p.autor,
      portada: fotos[p.portadaAlias],
      imagenes: p.imagenesAlias.map((a) => ({ ...fotos[a], alt: p.titulo })),
      estado: "PUBLICADO",
      fechaPublicacion: parseFecha(p.fecha),
      creadoPor: "migracion-blog-estatico",
    });
    console.log(`  ✓ creado: ${p.slug}`);
  }

  await mongoose.disconnect();
  console.log("Migración completada.");
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
