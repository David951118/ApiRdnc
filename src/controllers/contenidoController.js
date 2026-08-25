const BlogPost = require("../models/BlogPost");
const PublicacionSocial = require("../models/PublicacionSocial");
const s3Service = require("../services/s3Service");
const geminiService = require("../services/geminiService");
const config = require("../config/env");
const logger = require("../config/logger");

/**
 * Controlador del módulo de contenido (blog del sitio + publicaciones para
 * redes sociales). Toda la administración es exclusiva del rol ADMIN;
 * solo los listados "public" del blog quedan abiertos para la página web.
 */

function slugify(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

// ─────────────────────────── Utilidades de subida ───────────────────────────

/**
 * Subida de imágenes a través del backend (base64 → S3). Se usa en lugar de la
 * subida directa navegador→S3 porque el bucket no tiene CORS habilitado para
 * los orígenes del sitio.
 */
exports.subirImagen = async (req, res, next) => {
  try {
    const { fileName, mimeType, dataBase64 } = req.body;
    if (!fileName || !mimeType || !dataBase64) {
      return res.status(400).json({
        success: false,
        message: "fileName, mimeType y dataBase64 son requeridos",
      });
    }
    if (!mimeType.startsWith("image/")) {
      return res
        .status(400)
        .json({ success: false, message: "Solo se permiten imágenes" });
    }
    const buffer = Buffer.from(
      dataBase64.replace(/^data:[^;]+;base64,/, ""),
      "base64",
    );
    if (buffer.length > 15 * 1024 * 1024) {
      return res
        .status(400)
        .json({ success: false, message: "Imagen demasiado grande (máx. 15 MB)" });
    }
    const subida = await s3Service.uploadBuffer({
      buffer,
      mimeType,
      fileName,
      folder: "contenido",
    });
    res.json({ success: true, data: { key: subida.key, url: subida.publicUrl } });
  } catch (error) {
    next(error);
  }
};

/**
 * Descarta imágenes subidas que no llegaron a usarse (el admin canceló el
 * formulario o falló la generación). Solo acepta llaves de la carpeta
 * contenido/ para no poder borrar nada ajeno al módulo.
 */
exports.descartarImagenes = async (req, res, next) => {
  try {
    const { keys } = req.body;
    if (!Array.isArray(keys) || keys.length === 0 || keys.length > 20) {
      return res
        .status(400)
        .json({ success: false, message: "keys: arreglo de 1 a 20 llaves" });
    }
    let borradas = 0;
    for (const key of keys) {
      if (typeof key !== "string" || !key.startsWith("contenido/")) continue;
      try {
        await s3Service.deleteObject(key);
        borradas++;
      } catch (e) {
        logger.warn(`Contenido: no se pudo descartar de S3 ${key}: ${e.message}`);
      }
    }
    res.json({ success: true, data: { borradas } });
  } catch (error) {
    next(error);
  }
};

// Presigned URL para que el front suba imágenes directo a S3 (carpeta contenido/)
exports.getPresignedUrl = async (req, res, next) => {
  try {
    const { fileName, mimeType } = req.body;
    if (!fileName || !mimeType) {
      return res.status(400).json({
        success: false,
        message: "fileName y mimeType son requeridos",
      });
    }
    if (!mimeType.startsWith("image/")) {
      return res.status(400).json({
        success: false,
        message: "Solo se permiten imágenes",
      });
    }
    const result = await s3Service.generatePresignedUrl({
      fileName,
      mimeType,
      folder: "contenido",
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────── Blog público ───────────────────────────────

// Listado público de entradas publicadas (lo consume la página web, sin auth)
exports.getBlogPublic = async (req, res, next) => {
  try {
    const posts = await BlogPost.find({ estado: "PUBLICADO" })
      .sort({ fechaPublicacion: -1 })
      .select("-creadoPor -actualizadoPor")
      .lean();
    res.json({ success: true, data: posts });
  } catch (error) {
    next(error);
  }
};

// Detalle público por slug
exports.getBlogPublicBySlug = async (req, res, next) => {
  try {
    const post = await BlogPost.findOne({
      slug: req.params.slug,
      estado: "PUBLICADO",
    })
      .select("-creadoPor -actualizadoPor")
      .lean();
    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Entrada no encontrada" });
    }
    res.json({ success: true, data: post });
  } catch (error) {
    next(error);
  }
};

// ────────────────────────────── Blog (admin) ────────────────────────────────

exports.getBlogAll = async (req, res, next) => {
  try {
    const posts = await BlogPost.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: posts });
  } catch (error) {
    next(error);
  }
};

/**
 * Diseña el artículo con IA: recibe texto plano + fotos (ya en S3) y devuelve
 * el borrador estructurado (no guarda nada; el front muestra la vista previa
 * y luego llama a POST /blog con el resultado).
 */
exports.disenarBlog = async (req, res, next) => {
  try {
    const { titulo, texto, fotos } = req.body; // fotos: [{ key, url }]
    if (!texto || !texto.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "El texto del borrador es requerido" });
    }
    const listaFotos = Array.isArray(fotos) ? fotos.slice(0, 8) : [];

    // Descargar las fotos para que Gemini las vea y escriba captions reales
    const conBuffers = [];
    for (const foto of listaFotos) {
      const obj = await s3Service.getObjectBuffer(foto.key);
      conBuffers.push({ url: foto.url, buffer: obj.buffer, mimeType: obj.mimeType });
    }

    const draft = await geminiService.disenarBlog({
      titulo,
      texto,
      fotos: conBuffers,
    });

    // Mapear portadaUrl a {key, url} e incluir el inventario de imágenes
    const porUrl = new Map(listaFotos.map((f) => [f.url, f]));
    draft.portada = porUrl.get(draft.portadaUrl) || listaFotos[0] || {};
    draft.imagenes = listaFotos.map((f) => ({ ...f, alt: draft.titulo || "" }));
    delete draft.portadaUrl;

    res.json({ success: true, data: draft });
  } catch (error) {
    if (error.response?.data?.error?.message) {
      return res.status(502).json({
        success: false,
        message: `Error de Gemini: ${error.response.data.error.message}`,
      });
    }
    if (error.statusCode === 503) {
      return res.status(503).json({ success: false, message: error.message });
    }
    next(error);
  }
};

exports.createBlogPost = async (req, res, next) => {
  try {
    const {
      titulo,
      titulo2,
      resumen,
      cuerpo,
      contenido,
      categoria,
      tags,
      lectura,
      autor,
      portada,
      imagenes,
      estado,
    } = req.body;
    if (!titulo) {
      return res
        .status(400)
        .json({ success: false, message: "El título es requerido" });
    }

    // Slug único: agrega sufijo numérico si ya existe
    let slug = slugify(titulo);
    const existentes = await BlogPost.countDocuments({
      slug: new RegExp(`^${slug}(-\\d+)?$`),
    });
    if (existentes > 0) slug = `${slug}-${existentes + 1}`;

    const post = await BlogPost.create({
      titulo,
      slug,
      titulo2: titulo2 || "",
      resumen: resumen || "",
      cuerpo: cuerpo || "",
      contenido: Array.isArray(contenido) ? contenido : [],
      categoria: categoria || "Noticias",
      tags: Array.isArray(tags) ? tags : [],
      lectura: lectura || "",
      autor: autor || "Asegurar Ltda.",
      portada: portada || {},
      imagenes: imagenes || [],
      estado: estado === "PUBLICADO" ? "PUBLICADO" : "BORRADOR",
      fechaPublicacion: estado === "PUBLICADO" ? new Date() : null,
      creadoPor: req.user.userId || req.user.username,
    });

    logger.info(`Blog: entrada creada "${titulo}" por ${req.user.username}`);
    res.status(201).json({ success: true, data: post });
  } catch (error) {
    next(error);
  }
};

exports.updateBlogPost = async (req, res, next) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Entrada no encontrada" });
    }

    // Si se reemplaza la portada o se quitan imágenes, borrar de S3 los
    // objetos que dejan de estar referenciados (evita huérfanos en el bucket)
    if (req.body.portada !== undefined || req.body.imagenes !== undefined) {
      const nuevasKeys = new Set(
        [
          (req.body.portada !== undefined ? req.body.portada : post.portada)?.key,
          ...((req.body.imagenes !== undefined ? req.body.imagenes : post.imagenes) || []).map(
            (i) => i.key,
          ),
        ].filter(Boolean),
      );
      const viejasKeys = [
        post.portada?.key,
        ...(post.imagenes || []).map((i) => i.key),
      ].filter(Boolean);
      for (const key of viejasKeys) {
        if (!nuevasKeys.has(key)) {
          try {
            await s3Service.deleteObject(key);
            logger.info(`Blog: imagen reemplazada borrada de S3: ${key}`);
          } catch (e) {
            logger.warn(`Blog: no se pudo borrar de S3 ${key}: ${e.message}`);
          }
        }
      }
    }

    const campos = [
      "titulo",
      "titulo2",
      "resumen",
      "cuerpo",
      "contenido",
      "categoria",
      "tags",
      "lectura",
      "autor",
      "portada",
      "imagenes",
    ];
    campos.forEach((c) => {
      if (req.body[c] !== undefined) post[c] = req.body[c];
    });

    if (req.body.estado && ["BORRADOR", "PUBLICADO"].includes(req.body.estado)) {
      // Al publicar por primera vez se fija la fecha de publicación
      if (req.body.estado === "PUBLICADO" && !post.fechaPublicacion) {
        post.fechaPublicacion = new Date();
      }
      post.estado = req.body.estado;
    }

    post.actualizadoPor = req.user.userId || req.user.username;
    await post.save();

    res.json({ success: true, data: post });
  } catch (error) {
    next(error);
  }
};

exports.deleteBlogPost = async (req, res, next) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Entrada no encontrada" });
    }

    // Limpieza de imágenes en S3 (mejor esfuerzo, no bloquea el borrado)
    const keys = [
      post.portada?.key,
      ...(post.imagenes || []).map((i) => i.key),
    ].filter(Boolean);
    for (const key of keys) {
      try {
        await s3Service.deleteObject(key);
      } catch (e) {
        logger.warn(`Blog: no se pudo borrar de S3 ${key}: ${e.message}`);
      }
    }

    await post.deleteOne();
    logger.info(`Blog: entrada eliminada "${post.titulo}" por ${req.user.username}`);
    res.json({ success: true, message: "Entrada eliminada" });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────── Publicaciones para redes ───────────────────────────

exports.getSocialAll = async (req, res, next) => {
  try {
    const pubs = await PublicacionSocial.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: pubs });
  } catch (error) {
    next(error);
  }
};

/**
 * Genera una publicación de Instagram: con el tema + texto + fotos (ya subidas
 * a S3 vía presigned URL), Gemini compone la imagen 1080x1080 y el caption.
 */
exports.generarSocial = async (req, res, next) => {
  try {
    const { tema, texto, fotos } = req.body; // fotos: [{ key, url }]
    if (!tema) {
      return res
        .status(400)
        .json({ success: false, message: "El tema es requerido" });
    }
    if (!Array.isArray(fotos) || fotos.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Debe adjuntar al menos una foto",
      });
    }
    if (fotos.length > 4) {
      return res.status(400).json({
        success: false,
        message: "Máximo 4 fotos por publicación",
      });
    }

    // Descargar las fotos desde S3 para enviarlas a Gemini
    const buffers = [];
    for (const foto of fotos) {
      const obj = await s3Service.getObjectBuffer(foto.key);
      buffers.push(obj);
    }

    // Caption e imagen (la imagen es lo lento; el caption va primero por si falla)
    const caption = await geminiService.generarCaption({ tema, texto });

    // Imagen: Gemini si hay cupo; si el modelo de imagen no está disponible
    // (p. ej. el nivel gratis de Google no incluye imágenes), plantilla propia
    let imagen;
    let modeloImagen = config.gemini.imageModel;
    try {
      imagen = await geminiService.generarImagen({ tema, texto, fotos: buffers });
      // Logo oficial garantizado también en las piezas generadas por IA
      imagen = await require("../services/plantillaSocial").estamparLogo(imagen.buffer);
    } catch (e) {
      const msg = e.response?.data?.error?.message || e.message || "";
      const sinCupo =
        e.response?.status === 429 ||
        e.response?.status === 404 ||
        /quota|billing|not found/i.test(msg);
      if (!sinCupo) throw e;
      logger.warn(
        `Contenido: Gemini imagen no disponible (${msg.slice(0, 120)}). Usando plantilla local.`,
      );
      const plantilla = require("../services/plantillaSocial");
      imagen = await plantilla.componerImagen({ tema, fotos: buffers });
      modeloImagen = "plantilla-asegurar";
    }

    // Guardar la imagen generada en S3
    const ext = imagen.mimeType === "image/jpeg" ? "jpg" : "png";
    const subida = await s3Service.uploadBuffer({
      buffer: imagen.buffer,
      mimeType: imagen.mimeType,
      fileName: `instagram-${slugify(tema)}.${ext}`,
      folder: "contenido/instagram",
    });

    const pub = await PublicacionSocial.create({
      tema,
      texto: texto || "",
      fotos,
      imagenGenerada: { key: subida.key, url: subida.publicUrl },
      caption,
      modeloImagen,
      modeloTexto: config.gemini.textModel,
      creadoPor: req.user.userId || req.user.username,
    });

    logger.info(
      `Contenido: publicación Instagram generada "${tema}" por ${req.user.username}`,
    );
    res.status(201).json({ success: true, data: pub });
  } catch (error) {
    // Errores de Gemini con mensaje claro para el admin
    if (error.response?.data?.error?.message) {
      return res.status(502).json({
        success: false,
        message: `Error de Gemini: ${error.response.data.error.message}`,
      });
    }
    if (error.statusCode === 503) {
      return res.status(503).json({ success: false, message: error.message });
    }
    next(error);
  }
};

// Descargar la imagen generada (proxy desde S3, con nombre de archivo amigable)
exports.descargarImagenSocial = async (req, res, next) => {
  try {
    const pub = await PublicacionSocial.findById(req.params.id);
    if (!pub || !pub.imagenGenerada?.key) {
      return res
        .status(404)
        .json({ success: false, message: "Publicación no encontrada" });
    }
    const obj = await s3Service.getObjectBuffer(pub.imagenGenerada.key);
    const ext = obj.mimeType === "image/jpeg" ? "jpg" : "png";
    res.setHeader("Content-Type", obj.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="instagram-${slugify(pub.tema)}.${ext}"`,
    );
    res.send(obj.buffer);
  } catch (error) {
    next(error);
  }
};

// Marcar como publicada en la red (registro manual del admin)
exports.marcarPublicada = async (req, res, next) => {
  try {
    const pub = await PublicacionSocial.findByIdAndUpdate(
      req.params.id,
      { estado: "PUBLICADA" },
      { new: true },
    );
    if (!pub) {
      return res
        .status(404)
        .json({ success: false, message: "Publicación no encontrada" });
    }
    res.json({ success: true, data: pub });
  } catch (error) {
    next(error);
  }
};

exports.deleteSocial = async (req, res, next) => {
  try {
    const pub = await PublicacionSocial.findById(req.params.id);
    if (!pub) {
      return res
        .status(404)
        .json({ success: false, message: "Publicación no encontrada" });
    }

    const keys = [
      pub.imagenGenerada?.key,
      ...(pub.fotos || []).map((f) => f.key),
    ].filter(Boolean);
    for (const key of keys) {
      try {
        await s3Service.deleteObject(key);
      } catch (e) {
        logger.warn(`Contenido: no se pudo borrar de S3 ${key}: ${e.message}`);
      }
    }

    await pub.deleteOne();
    res.json({ success: true, message: "Publicación eliminada" });
  } catch (error) {
    next(error);
  }
};
