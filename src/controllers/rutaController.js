const Ruta = require("../models/Ruta");
const logger = require("../config/logger");

function getRoles(req) {
  const rolesUpper = (req.user?.roles || []).map((r) =>
    r.replace("ROLE_", "").toUpperCase(),
  );
  return {
    isAdmin:
      rolesUpper.includes("ADMIN") || rolesUpper.includes("SUPER_ADMIN"),
    isClienteAdmin: rolesUpper.includes("CLIENTE_ADMIN"),
  };
}

function coord(p) {
  return {
    nombre: p && p.nombre ? String(p.nombre).trim() : "",
    lat: p && p.lat != null ? Number(p.lat) : null,
    lng: p && p.lng != null ? Number(p.lng) : null,
  };
}

/**
 * Deriva los campos de la ruta a partir de sus TRAMOS (origen → destino con
 * distancia por segmento). Calcula los puntos ordenados, el origen/destino, el
 * recorrido en texto y la distancia total (suma de tramos). Así el admin solo
 * captura los tramos y el resto se completa solo.
 */
function aplicarTramos(body) {
  const tramos = (body.tramos || [])
    .filter((t) => t && t.origen && t.destino && t.origen.nombre && t.destino.nombre)
    .map((t, i) => ({
      orden: i + 1,
      origen: coord(t.origen),
      destino: coord(t.destino),
      distanciaKm: t.distanciaKm != null ? Number(t.distanciaKm) : null,
    }));

  body.tramos = tramos;
  if (!tramos.length) return body;

  // Puntos = origen del primer tramo + destino de cada tramo
  const puntos = [tramos[0].origen, ...tramos.map((t) => t.destino)].map((p, i) => ({
    orden: i + 1,
    nombre: p.nombre,
    lat: p.lat,
    lng: p.lng,
  }));
  body.puntos = puntos;
  body.origen = tramos[0].origen.nombre;
  body.destino = tramos[tramos.length - 1].destino.nombre;
  body.recorrido = puntos.map((p) => p.nombre).join(" → ");
  if (!body.nombre) body.nombre = `${body.origen} → ${body.destino}`;

  const distancias = tramos.map((t) => t.distanciaKm).filter((d) => d != null && !Number.isNaN(d));
  if (distancias.length) {
    body.distanciaKm = distancias.reduce((a, b) => a + b, 0);
  }
  return body;
}

/**
 * Normaliza una ruta antes de guardar: si trae tramos, deriva todo de ellos;
 * si solo trae puntos (compatibilidad), deriva de los puntos.
 */
function prepararRuta(body) {
  if (Array.isArray(body.tramos) && body.tramos.length) return aplicarTramos(body);

  if (Array.isArray(body.puntos) && body.puntos.length) {
    const puntos = body.puntos
      .filter((p) => p && p.nombre && String(p.nombre).trim())
      .map((p, i) => ({
        orden: i + 1,
        nombre: String(p.nombre).trim(),
        lat: p.lat ?? null,
        lng: p.lng ?? null,
      }));
    body.puntos = puntos;
    if (puntos.length) {
      if (!body.origen) body.origen = puntos[0].nombre;
      if (!body.destino) body.destino = puntos[puntos.length - 1].nombre;
      if (!body.recorrido) body.recorrido = puntos.map((p) => p.nombre).join(" → ");
      if (!body.nombre) body.nombre = `${body.origen} → ${body.destino}`;
    }
  }
  return body;
}

// Crear Ruta
exports.create = async (req, res) => {
  try {
    const { isAdmin } = getRoles(req);
    const ruta = new Ruta(prepararRuta({ ...req.body }));
    ruta.creadoPor = req.user?.userId || null;

    // Cualquier usuario no-admin queda atado a su empresa automáticamente.
    if (!isAdmin && req.user?.empresaId) {
      ruta.empresa = req.user.empresaId;
    }

    await ruta.save();
    res.status(201).json({ success: true, data: ruta });
  } catch (error) {
    logger.error(`Error creando ruta: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

// Listar rutas con scope
exports.getAll = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search,
      includeDeleted = false,
      soloEliminadas = false,
      onlyDeleted = false,
    } = req.query;
    const { isAdmin, isClienteAdmin } = getRoles(req);
    const query = {};

    const verSoloEliminadas =
      soloEliminadas === "true" ||
      soloEliminadas === true ||
      onlyDeleted === "true" ||
      onlyDeleted === true;

    // Ver eliminadas (papelera) o incluirlas es exclusivo del admin de plataforma.
    if (isAdmin && verSoloEliminadas) {
      query.deletedAt = { $ne: null };
    } else if (isAdmin && (includeDeleted === "true" || includeDeleted === true)) {
      // sin filtro de deletedAt (ve activas + eliminadas)
    } else {
      query.deletedAt = null;
    }

    // CLIENTE_ADMIN solo ve las rutas de su empresa
    if (!isAdmin) {
      if (isClienteAdmin && req.user?.empresaId) {
        query.empresa = req.user.empresaId;
      } else {
        // CLIENTE normal: ve rutas activas de su empresa
        if (req.user?.empresaId) {
          query.empresa = req.user.empresaId;
        }
      }
    }

    if (search) {
      query.$or = [
        { nombre: new RegExp(search, "i") },
        { origen: new RegExp(search, "i") },
        { destino: new RegExp(search, "i") },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const rutas = await Ruta.find(query)
      .limit(parseInt(limit))
      .skip(skip)
      .sort({ favorita: -1, origen: 1, destino: 1 })
      .lean();

    const total = await Ruta.countDocuments(query);

    res.json({
      success: true,
      data: rutas,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error(`Error listando rutas: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Obtener una ruta por ID
exports.getOne = async (req, res) => {
  try {
    const ruta = await Ruta.findOne(
      scopeRuta(req, { _id: req.params.id, deletedAt: null }),
    );
    if (!ruta)
      return res
        .status(404)
        .json({ success: false, message: "Ruta no encontrada" });
    res.json({ success: true, data: ruta });
  } catch (error) {
    logger.error(`Error obteniendo ruta: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Filtro base que ata las rutas a la empresa del usuario (salvo ADMIN).
function scopeRuta(req, filtro = {}) {
  const { isAdmin } = getRoles(req);
  if (!isAdmin && req.user?.empresaId) filtro.empresa = req.user.empresaId;
  return filtro;
}

// Actualizar ruta
exports.update = async (req, res) => {
  try {
    const ruta = await Ruta.findOne(
      scopeRuta(req, { _id: req.params.id, deletedAt: null }),
    );
    if (!ruta)
      return res
        .status(404)
        .json({ success: false, message: "Ruta no encontrada" });

    const body = prepararRuta({ ...req.body });
    // No permitir reasignar empresa/creadoPor desde el cliente.
    delete body.empresa;
    delete body.creadoPor;
    Object.assign(ruta, body);
    await ruta.save();
    res.json({ success: true, data: ruta });
  } catch (error) {
    logger.error(`Error actualizando ruta: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

// Marcar/desmarcar como favorita
exports.toggleFavorita = async (req, res) => {
  try {
    const ruta = await Ruta.findOne(
      scopeRuta(req, { _id: req.params.id, deletedAt: null }),
    );
    if (!ruta)
      return res
        .status(404)
        .json({ success: false, message: "Ruta no encontrada" });

    ruta.favorita =
      typeof req.body?.favorita === "boolean" ? req.body.favorita : !ruta.favorita;
    await ruta.save();
    res.json({ success: true, data: ruta });
  } catch (error) {
    logger.error(`Error en favorita de ruta: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

// Soft Delete
exports.softDelete = async (req, res) => {
  try {
    const ruta = await Ruta.findOne(
      scopeRuta(req, { _id: req.params.id, deletedAt: null }),
    );
    if (!ruta)
      return res
        .status(404)
        .json({ success: false, message: "Ruta no encontrada" });

    await ruta.softDelete(req.user?.userId || null);
    res.json({
      success: true,
      message: "Ruta eliminada temporalmente",
      data: ruta,
    });
  } catch (error) {
    logger.error(`Error soft-delete ruta: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Restaurar
exports.restore = async (req, res) => {
  try {
    const ruta = await Ruta.findById(req.params.id);
    if (!ruta)
      return res
        .status(404)
        .json({ success: false, message: "Ruta no encontrada" });
    if (!ruta.deletedAt)
      return res
        .status(400)
        .json({ success: false, message: "La ruta no está eliminada" });

    await ruta.restore();
    res.json({ success: true, message: "Ruta restaurada", data: ruta });
  } catch (error) {
    logger.error(`Error restaurando ruta: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Hard Delete (Solo ADMIN)
exports.hardDelete = async (req, res) => {
  try {
    const ruta = await Ruta.findByIdAndDelete(req.params.id);
    if (!ruta)
      return res
        .status(404)
        .json({ success: false, message: "Ruta no encontrada" });
    res.json({ success: true, message: "Ruta eliminada permanentemente" });
  } catch (error) {
    logger.error(`Error hard-delete ruta: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};
