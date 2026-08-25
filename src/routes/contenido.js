const express = require("express");
const router = express.Router();
const contenidoController = require("../controllers/contenidoController");
const { authenticate } = require("../middleware/auth");
const checkRole = require("../middleware/roleCheck");

/**
 * Módulo de contenido: blog del sitio web + publicaciones para redes.
 *
 * - Las rutas /blog/public* son abiertas: las consume la página web.
 * - TODO lo demás exige rol ADMIN (exclusivamente; ningún otro rol).
 */

// ── Público (sitio web) ──
router.get("/blog/public", contenidoController.getBlogPublic);
router.get("/blog/public/:slug", contenidoController.getBlogPublicBySlug);

// ── Administración (solo ADMIN) ──
const soloAdmin = [authenticate, checkRole(["ADMIN"])];

// Subida de imágenes vía backend (base64 → S3; el bucket no tiene CORS para el navegador)
router.post("/subir-imagen", ...soloAdmin, contenidoController.subirImagen);
// Descarte de imágenes subidas que no se usaron (cancelación / fallo)
router.post("/descartar-imagenes", ...soloAdmin, contenidoController.descartarImagenes);
// Presigned URL a S3 (alternativa directa; requiere CORS en el bucket)
router.post("/presigned-url", ...soloAdmin, contenidoController.getPresignedUrl);

// Blog
router.get("/blog", ...soloAdmin, contenidoController.getBlogAll);
router.post("/blog/disenar", ...soloAdmin, contenidoController.disenarBlog);
router.post("/blog", ...soloAdmin, contenidoController.createBlogPost);
router.put("/blog/:id", ...soloAdmin, contenidoController.updateBlogPost);
router.delete("/blog/:id", ...soloAdmin, contenidoController.deleteBlogPost);

// Publicaciones para redes (Instagram)
router.get("/social", ...soloAdmin, contenidoController.getSocialAll);
router.post("/social/generar", ...soloAdmin, contenidoController.generarSocial);
router.get(
  "/social/:id/imagen",
  ...soloAdmin,
  contenidoController.descargarImagenSocial,
);
router.post(
  "/social/:id/publicada",
  ...soloAdmin,
  contenidoController.marcarPublicada,
);
router.delete("/social/:id", ...soloAdmin, contenidoController.deleteSocial);

module.exports = router;
