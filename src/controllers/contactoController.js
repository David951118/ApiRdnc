const { enviarEmail, renderContactoHTML } = require("../services/emailService");
const logger = require("../config/logger");

/**
 * Enviar mensaje desde el formulario de contacto.
 * POST /api/contacto
 * Body: { nombre, email, celular, observacion }
 * Público - sin autenticación.
 */
exports.enviarMensajeContacto = async (req, res) => {
  try {
    const { nombre, email, celular, observacion } = req.body;

    // Validación básica
    const errores = [];
    if (!nombre || nombre.trim().length < 2) {
      errores.push("El nombre es obligatorio (mínimo 2 caracteres)");
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errores.push("El email no es válido");
    }
    if (!celular || celular.trim().length < 7) {
      errores.push("El celular es obligatorio");
    }
    if (!observacion || observacion.trim().length < 5) {
      errores.push("La observación debe tener al menos 5 caracteres");
    }

    if (errores.length > 0) {
      return res.status(400).json({ success: false, errores });
    }

    const destinatario = process.env.EMAIL_CONTACT_TO;
    if (!destinatario) {
      logger.error("EMAIL_CONTACT_TO no configurado en .env");
      return res.status(500).json({
        success: false,
        message: "Servicio de contacto no configurado",
      });
    }

    await enviarEmail({
      to: destinatario,
      replyTo: email,
      subject: `[Contacto Asegurar] Nuevo mensaje de ${nombre}`,
      html: renderContactoHTML({ nombre, email, celular, observacion }),
      text: `Nuevo mensaje de contacto\n\nNombre: ${nombre}\nEmail: ${email}\nCelular: ${celular}\n\nObservación:\n${observacion}`,
    });

    res.json({
      success: true,
      message: "Mensaje enviado. Nos pondremos en contacto pronto.",
    });
  } catch (error) {
    logger.error(`Error enviando contacto: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "No se pudo enviar el mensaje. Intente más tarde.",
    });
  }
};
