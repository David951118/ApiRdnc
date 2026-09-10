const mongoose = require("mongoose");
const Multa = require("../models/Multa");
const Vehiculo = require("../models/Vehiculo");
const Tercero = require("../models/Tercero");
const s3Service = require("../services/s3Service");
const {
  getVehiculoScope,
  tieneAccesoVehiculo,
} = require("../services/vehiculoAccessService");
const { rangoDias } = require("../utils/rangoFechas");
const logger = require("../config/logger");

/**
 * Multas / comparendos.
 *
 * Flujo de una inmovilización (vehículo retenido por la autoridad):
 *   1. Se registra la multa con `inmovilizacion.aplica = true` → el vehículo
 *      pasa a estado INMOVILIZADO (sale de operación: sin preoperacionales ni
 *      viajes; descuenta disponibilidad en los KPIs).
 *   2. El conductor o administración sube la corrección (evidencias de que la
 *      causa quedó resuelta) → inmovilizacion.estado = CORRECCION_SUBIDA.
 *   3. Administración (ADMIN / CLIENTE_ADMIN) valida y levanta la
 *      inmovilización → LEVANTADA y el vehículo vuelve a su estado anterior.
 *      Puede levantarse sin corrección con `forzar: true` (queda registrado).
 *   4. El pago de la multa es independiente: PENDIENTE → PAGADA / IMPUGNADA /
 *      ANULADA. Una multa ANULADA libera también la inmovilización.
 */

const POPULATE_VEHICULO = "placa numeroInterno marca linea modelo estado empresaAfiliadora";
const POPULATE_CONDUCTOR = "nombres apellidos identificacion tipoId contacto";

function rolesDe(req) {
  return (req.user?.roles || []).map((r) =>
    r.replace("ROLE_", "").toUpperCase(),
  );
}

function esAdmin(req) {
  const roles = rolesDe(req);
  return roles.includes("ADMIN") || roles.includes("SUPER_ADMIN");
}

function esGestion(req) {
  return esAdmin(req) || rolesDe(req).includes("CLIENTE_ADMIN");
}

/** Roles que ven las multas de toda su empresa (no solo de sus vehículos) */
function tieneLecturaAmplia(req) {
  const roles = rolesDe(req);
  return roles.some((r) =>
    ["ADMIN", "SUPER_ADMIN", "CLIENTE_ADMIN", "AUDITOR", "MECANICO"].includes(r),
  );
}

function scopeEmpresa(req, filtro = {}) {
  if (!esAdmin(req) && req.user.empresaId) {
    filtro.empresa = req.user.empresaId;
  }
  return filtro;
}

/**
 * Filtro base de lectura según rol. Devuelve null si el usuario no puede ver
 * ninguna multa.
 *  - ADMIN: todo
 *  - CLIENTE_ADMIN / AUDITOR / MECANICO: su empresa
 *  - Conductor / cliente final: multas de sus vehículos o donde él sea el
 *    conductor multado
 */
async function scopeLectura(req) {
  if (esAdmin(req)) return {};
  if (tieneLecturaAmplia(req)) {
    if (!req.user.empresaId) return null;
    return { empresa: req.user.empresaId };
  }
  const scope = await getVehiculoScope(req);
  const or = [];
  if (scope._id && scope._id.$in && scope._id.$in.length) {
    or.push({ vehiculo: { $in: scope._id.$in } });
  }
  if (req.user.terceroId) {
    or.push({ conductor: req.user.terceroId });
  }
  if (!or.length) return null;
  return { $or: or };
}

async function puedeVerMulta(req, multa) {
  if (esAdmin(req)) return true;
  if (tieneLecturaAmplia(req)) {
    return (
      !!req.user.empresaId &&
      multa.empresa &&
      multa.empresa.toString() === req.user.empresaId.toString()
    );
  }
  if (
    req.user.terceroId &&
    multa.conductor &&
    multa.conductor.toString() === req.user.terceroId.toString()
  ) {
    return true;
  }
  return tieneAccesoVehiculo(req, multa.vehiculo);
}

function registrarHistorial(multa, req, accion, detalle = "") {
  multa.historial.push({ usuario: req.user.username, accion, detalle });
}

function sellarArchivo(archivo, req) {
  if (!archivo) return null;
  return {
    url: archivo.url,
    key: archivo.key,
    nombre: archivo.nombre || "",
    mimeType: archivo.mimeType || "",
    tamano: archivo.tamano ?? null,
    subidoPor: req.user.username,
    fecha: new Date(),
  };
}

/** Borra un archivo de S3 (best-effort, nunca rompe la petición) */
async function borrarArchivo(archivo) {
  if (!archivo?.key) return;
  try {
    await s3Service.deleteObject(archivo.key);
  } catch (err) {
    logger.warn(`No se pudo borrar ${archivo.key} de S3: ${err.message}`);
  }
}

function nombreUsuario(req) {
  return req.user?.persona || req.user?.username || "";
}

/**
 * Busca la multa aplicando el scope del usuario.
 * `gestion: true` exige rol de gestión (ADMIN o CLIENTE_ADMIN de la empresa).
 */
async function buscarMulta(req, id, { gestion = false, incluirEliminadas = false } = {}) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { error: { status: 404, message: "Multa no encontrada" } };
  }
  const filtro = { _id: id };
  if (!incluirEliminadas) filtro.deletedAt = null;
  const multa = await Multa.findOne(filtro);
  if (!multa) return { error: { status: 404, message: "Multa no encontrada" } };

  if (gestion) {
    if (!esGestion(req)) {
      return { error: { status: 403, message: "No tiene permisos para gestionar multas" } };
    }
    if (!esAdmin(req)) {
      const propia =
        req.user.empresaId &&
        multa.empresa &&
        multa.empresa.toString() === req.user.empresaId.toString();
      if (!propia) {
        return { error: { status: 403, message: "La multa no pertenece a su empresa" } };
      }
    }
  } else if (!(await puedeVerMulta(req, multa))) {
    return { error: { status: 403, message: "No tiene permisos para ver esta multa" } };
  }
  return { multa };
}

/** Pone el vehículo fuera de operación y deja la multa como INMOVILIZADO */
async function inmovilizarVehiculo(multa, vehiculo, req) {
  if (vehiculo.estado !== "INMOVILIZADO") {
    multa.inmovilizacion.estadoVehiculoAnterior = vehiculo.estado || "ACTIVO";
    vehiculo.estado = "INMOVILIZADO";
    await vehiculo.save();
  } else {
    // Ya estaba inmovilizado por otra multa: heredar el estado original
    const otra = await Multa.findOne({
      vehiculo: vehiculo._id,
      _id: { $ne: multa._id },
      deletedAt: null,
      estado: { $ne: "ANULADA" },
      "inmovilizacion.estado": { $in: Multa.INMOVILIZACION_ACTIVA },
    })
      .select("inmovilizacion.estadoVehiculoAnterior")
      .lean();
    multa.inmovilizacion.estadoVehiculoAnterior =
      otra?.inmovilizacion?.estadoVehiculoAnterior || "ACTIVO";
  }
  multa.inmovilizacion.aplica = true;
  multa.inmovilizacion.estado = "INMOVILIZADO";
  if (!multa.inmovilizacion.fechaInicio) {
    multa.inmovilizacion.fechaInicio = new Date();
  }
  registrarHistorial(
    multa,
    req,
    "INMOVILIZADO",
    `Vehículo ${vehiculo.placa} fuera de operación${multa.inmovilizacion.patio ? ` (${multa.inmovilizacion.patio})` : ""}`,
  );
}

/**
 * Devuelve el vehículo a su estado anterior si ya no tiene ninguna otra
 * inmovilización vigente. Retorna true si el vehículo quedó liberado.
 */
async function liberarVehiculoSiCorresponde(multa) {
  const otraActiva = await Multa.exists({
    vehiculo: multa.vehiculo,
    _id: { $ne: multa._id },
    deletedAt: null,
    estado: { $ne: "ANULADA" },
    "inmovilizacion.estado": { $in: Multa.INMOVILIZACION_ACTIVA },
  });
  if (otraActiva) return false;

  const vehiculo = await Vehiculo.findById(multa.vehiculo);
  if (!vehiculo || vehiculo.estado !== "INMOVILIZADO") return false;
  const anterior = multa.inmovilizacion?.estadoVehiculoAnterior;
  vehiculo.estado =
    anterior && anterior !== "INMOVILIZADO" ? anterior : "ACTIVO";
  await vehiculo.save();
  return true;
}

/** Resuelve el conductor (registrado o no) a partir del body */
async function aplicarConductor(multa, body) {
  if (body.conductor !== undefined) {
    if (body.conductor) {
      const tercero = await Tercero.findOne({ _id: body.conductor, deletedAt: null })
        .select("_id")
        .lean();
      if (!tercero) {
        return { error: "Conductor (tercero) no encontrado" };
      }
      multa.conductor = tercero._id;
      multa.conductorRegistrado = true;
      multa.conductorNoRegistrado = undefined;
    } else {
      multa.conductor = null;
      multa.conductorRegistrado = false;
    }
  }
  if (body.conductorNoRegistrado !== undefined) {
    if (body.conductorNoRegistrado && !multa.conductor) {
      multa.conductorNoRegistrado = body.conductorNoRegistrado;
      multa.conductorRegistrado = false;
    } else if (!body.conductorNoRegistrado) {
      multa.conductorNoRegistrado = undefined;
    }
  }
  return {};
}

async function poblar(id) {
  return Multa.findById(id)
    .populate("vehiculo", POPULATE_VEHICULO)
    .populate("conductor", POPULATE_CONDUCTOR)
    .lean();
}

function responderError(res, error) {
  return res.status(error.status).json({ success: false, message: error.message });
}

// ═══════════════════ CRUD ═══════════════════

exports.crear = async (req, res) => {
  try {
    const vehiculo = await Vehiculo.findOne({
      _id: req.body.vehiculo,
      deletedAt: null,
    });
    if (!vehiculo) {
      return res
        .status(404)
        .json({ success: false, message: "Vehículo no encontrado" });
    }
    if (!esAdmin(req)) {
      const propia =
        req.user.empresaId &&
        vehiculo.empresaAfiliadora &&
        vehiculo.empresaAfiliadora.toString() === req.user.empresaId.toString();
      if (!propia) {
        return res.status(403).json({
          success: false,
          message: "El vehículo no pertenece a su empresa",
        });
      }
    }

    const { fotos = [], inmovilizacion = {}, conductor, conductorNoRegistrado, ...datos } =
      req.body;

    const multa = new Multa({
      ...datos,
      vehiculo: vehiculo._id,
      placa: vehiculo.placa,
      empresa: vehiculo.empresaAfiliadora || null,
      fotos: fotos.map((f) => sellarArchivo(f, req)),
      inmovilizacion: {
        aplica: false,
        estado: "NO_APLICA",
        fechaInicio: inmovilizacion.fechaInicio || null,
        patio: inmovilizacion.patio || "",
        motivo: inmovilizacion.motivo || "",
        costoGrua: inmovilizacion.costoGrua || 0,
        costoPatios: inmovilizacion.costoPatios || 0,
      },
      registradoPor: req.user.username,
      registradoPorNombre: nombreUsuario(req),
    });

    const r = await aplicarConductor(multa, { conductor, conductorNoRegistrado });
    if (r.error) return res.status(404).json({ success: false, message: r.error });

    registrarHistorial(
      multa,
      req,
      "REGISTRADA",
      `${datos.codigoInfraccion ? `${datos.codigoInfraccion} · ` : ""}${datos.descripcion}`,
    );

    if (inmovilizacion.aplica) {
      await inmovilizarVehiculo(multa, vehiculo, req);
    }

    await multa.save();
    res.status(201).json({ success: true, data: await poblar(multa._id) });
  } catch (error) {
    logger.error(`Error registrando multa: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listar = async (req, res) => {
  try {
    const {
      vehiculo,
      placa,
      conductor,
      estado,
      responsable,
      inmovilizado,
      desde,
      hasta,
      page = 1,
      limit = 50,
      onlyDeleted,
      soloEliminadas,
    } = req.query;

    const base = await scopeLectura(req);
    if (base === null) {
      return res.json({ success: true, data: [], total: 0, page: 1, pages: 0 });
    }
    const filtro = { ...base };

    const verEliminadas =
      esAdmin(req) && (onlyDeleted === "true" || soloEliminadas === "true");
    filtro.deletedAt = verEliminadas ? { $ne: null } : null;

    if (vehiculo && mongoose.Types.ObjectId.isValid(vehiculo)) {
      filtro.vehiculo = vehiculo;
    }
    if (placa && String(placa).trim()) {
      filtro.placa = new RegExp(
        String(placa).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i",
      );
    }
    if (conductor && mongoose.Types.ObjectId.isValid(conductor)) {
      filtro.conductor = conductor;
    }
    if (estado) filtro.estado = estado;
    if (responsable) filtro.responsable = responsable;
    if (inmovilizado === "true") {
      filtro["inmovilizacion.estado"] = { $in: Multa.INMOVILIZACION_ACTIVA };
    } else if (inmovilizado === "false") {
      filtro["inmovilizacion.estado"] = { $nin: Multa.INMOVILIZACION_ACTIVA };
    } else if (inmovilizado === "aplica") {
      filtro["inmovilizacion.aplica"] = true;
    }
    const rango = rangoDias(desde, hasta);
    if (rango) filtro.fecha = rango;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(limit) || 50));

    const [multas, total] = await Promise.all([
      Multa.find(filtro)
        .populate("vehiculo", POPULATE_VEHICULO)
        .populate("conductor", POPULATE_CONDUCTOR)
        .sort({ fecha: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Multa.countDocuments(filtro),
    ]);

    res.json({
      success: true,
      data: multas,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    logger.error(`Error listando multas: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Resumen para las tarjetas del módulo: totales, valores y vehículos
 * inmovilizados en este momento. ?desde&hasta acotan las multas por fecha de
 * la infracción (la lista de inmovilizados es siempre la vigente).
 */
exports.resumen = async (req, res) => {
  try {
    const base = await scopeLectura(req);
    if (base === null) {
      return res.json({ success: true, data: null });
    }
    const filtro = { ...base, deletedAt: null };
    const rango = rangoDias(req.query.desde, req.query.hasta);
    if (rango) filtro.fecha = rango;

    const [porEstado, inmovilizadas] = await Promise.all([
      Multa.aggregate([
        { $match: filtro },
        {
          $group: {
            _id: "$estado",
            cantidad: { $sum: 1 },
            valor: { $sum: "$valor" },
            costoTotal: { $sum: "$costoTotal" },
            pagado: { $sum: "$pago.valorPagado" },
          },
        },
      ]),
      Multa.find({
        ...base,
        deletedAt: null,
        estado: { $ne: "ANULADA" },
        "inmovilizacion.estado": { $in: Multa.INMOVILIZACION_ACTIVA },
      })
        .select("numero placa vehiculo fecha inmovilizacion.estado inmovilizacion.fechaInicio inmovilizacion.patio inmovilizacion.motivo descripcion")
        .populate("vehiculo", "placa numeroInterno marca linea")
        .sort({ "inmovilizacion.fechaInicio": -1 })
        .lean(),
    ]);

    const estados = {};
    let total = 0;
    let valorTotal = 0;
    let costoTotal = 0;
    let pagado = 0;
    for (const e of porEstado) {
      estados[e._id] = {
        cantidad: e.cantidad,
        valor: e.valor,
        costoTotal: e.costoTotal,
      };
      if (e._id !== "ANULADA") {
        total += e.cantidad;
        valorTotal += e.valor;
        costoTotal += e.costoTotal;
        pagado += e.pagado || 0;
      }
    }
    const pendientes = estados.PENDIENTE || { cantidad: 0, valor: 0, costoTotal: 0 };
    const impugnadas = estados.IMPUGNADA || { cantidad: 0, valor: 0, costoTotal: 0 };

    const vehiculosInmovilizados = new Set(
      inmovilizadas.map((m) => m.vehiculo?._id?.toString() || m.vehiculo?.toString()),
    );

    // Con inmovilización en el periodo (aunque ya se haya levantado)
    const conInmovilizacion = await Multa.countDocuments({
      ...filtro,
      estado: { $ne: "ANULADA" },
      "inmovilizacion.aplica": true,
    });

    res.json({
      success: true,
      data: {
        total,
        valorTotal,
        costoTotal, // valor + grúa + patios
        pagado,
        porPagar: pendientes.valor + impugnadas.valor,
        pendientes: pendientes.cantidad,
        impugnadas: impugnadas.cantidad,
        pagadas: estados.PAGADA?.cantidad || 0,
        anuladas: estados.ANULADA?.cantidad || 0,
        conInmovilizacion,
        inmovilizacionesActivas: inmovilizadas.length,
        vehiculosInmovilizados: vehiculosInmovilizados.size,
        inmovilizadas,
      },
    });
  } catch (error) {
    logger.error(`Error en resumen de multas: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.obtener = async (req, res) => {
  try {
    const { multa, error } = await buscarMulta(req, req.params.id);
    if (error) return responderError(res, error);
    res.json({ success: true, data: await poblar(multa._id) });
  } catch (error) {
    logger.error(`Error obteniendo multa: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.actualizar = async (req, res) => {
  try {
    const { multa, error } = await buscarMulta(req, req.params.id, { gestion: true });
    if (error) return responderError(res, error);
    if (multa.estado === "ANULADA") {
      return res.status(409).json({
        success: false,
        message: "Una multa anulada no se puede editar",
      });
    }

    const { conductor, conductorNoRegistrado, inmovilizacion, ...datos } = req.body;
    const editables = [
      "fecha",
      "numeroComparendo",
      "codigoInfraccion",
      "descripcion",
      "autoridad",
      "agente",
      "ciudad",
      "lugar",
      "valor",
      "fechaLimitePago",
      "responsable",
      "observaciones",
    ];
    editables.forEach((campo) => {
      if (datos[campo] !== undefined) multa[campo] = datos[campo];
    });

    const r = await aplicarConductor(multa, { conductor, conductorNoRegistrado });
    if (r.error) return res.status(404).json({ success: false, message: r.error });

    if (inmovilizacion) {
      ["fechaInicio", "patio", "motivo", "costoGrua", "costoPatios"].forEach((campo) => {
        if (inmovilizacion[campo] !== undefined) {
          multa.inmovilizacion[campo] = inmovilizacion[campo];
        }
      });
      // Activar la inmovilización de una multa que se registró sin ella
      if (
        inmovilizacion.aplica === true &&
        !multa.inmovilizacionVigente() &&
        multa.inmovilizacion.estado !== "LEVANTADA"
      ) {
        const vehiculo = await Vehiculo.findById(multa.vehiculo);
        if (vehiculo) await inmovilizarVehiculo(multa, vehiculo, req);
      }
    }

    registrarHistorial(multa, req, "ACTUALIZADA");
    await multa.save();
    res.json({ success: true, data: await poblar(multa._id) });
  } catch (error) {
    logger.error(`Error actualizando multa: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.agregarFotos = async (req, res) => {
  try {
    const { multa, error } = await buscarMulta(req, req.params.id, { gestion: true });
    if (error) return responderError(res, error);
    const nuevas = req.body.fotos.map((f) => sellarArchivo(f, req));
    multa.fotos.push(...nuevas);
    registrarHistorial(multa, req, "FOTO_AGREGADA", `${nuevas.length} archivo(s)`);
    await multa.save();
    res.json({ success: true, data: await poblar(multa._id) });
  } catch (error) {
    logger.error(`Error agregando fotos a multa: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.eliminarFoto = async (req, res) => {
  try {
    const { multa, error } = await buscarMulta(req, req.params.id, { gestion: true });
    if (error) return responderError(res, error);
    const foto = multa.fotos.id(req.params.fotoId);
    if (!foto) {
      return res.status(404).json({ success: false, message: "Foto no encontrada" });
    }
    const archivo = foto.toObject();
    foto.deleteOne();
    registrarHistorial(multa, req, "FOTO_ELIMINADA", archivo.nombre || archivo.key);
    await multa.save();
    await borrarArchivo(archivo);
    res.json({ success: true, data: await poblar(multa._id) });
  } catch (error) {
    logger.error(`Error eliminando foto de multa: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ═══════════════════ ESTADO DE LA MULTA (pago) ═══════════════════

exports.pagar = async (req, res) => {
  try {
    const { multa, error } = await buscarMulta(req, req.params.id, { gestion: true });
    if (error) return responderError(res, error);
    if (!["PENDIENTE", "IMPUGNADA"].includes(multa.estado)) {
      return res.status(409).json({
        success: false,
        message: `La multa está ${multa.estado.toLowerCase()} y no admite registrar pago`,
      });
    }
    const { valorPagado, fechaPago, comprobante, observaciones } = req.body;
    const anterior = multa.pago?.comprobante ? multa.pago.comprobante.toObject() : null;
    multa.pago = {
      valorPagado,
      fechaPago: fechaPago || new Date(),
      comprobante: comprobante ? sellarArchivo(comprobante, req) : anterior,
      observaciones: observaciones || "",
      registradoPor: req.user.username,
    };
    multa.estado = "PAGADA";
    registrarHistorial(multa, req, "PAGADA", `Valor pagado: ${valorPagado}`);
    await multa.save();
    if (comprobante && anterior?.key && anterior.key !== comprobante.key) {
      await borrarArchivo(anterior);
    }
    res.json({ success: true, data: await poblar(multa._id) });
  } catch (error) {
    logger.error(`Error registrando pago de multa: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.impugnar = async (req, res) => {
  try {
    const { multa, error } = await buscarMulta(req, req.params.id, { gestion: true });
    if (error) return responderError(res, error);
    if (multa.estado !== "PENDIENTE") {
      return res.status(409).json({
        success: false,
        message: "Solo una multa pendiente se puede impugnar",
      });
    }
    multa.impugnacion = {
      motivo: req.body.motivo || "",
      fecha: new Date(),
      registradoPor: req.user.username,
    };
    multa.estado = "IMPUGNADA";
    registrarHistorial(multa, req, "IMPUGNADA", req.body.motivo || "");
    await multa.save();
    res.json({ success: true, data: await poblar(multa._id) });
  } catch (error) {
    logger.error(`Error impugnando multa: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.anular = async (req, res) => {
  try {
    const { multa, error } = await buscarMulta(req, req.params.id, { gestion: true });
    if (error) return responderError(res, error);
    if (multa.estado === "ANULADA") {
      return res.status(409).json({ success: false, message: "La multa ya está anulada" });
    }
    const vigente = multa.inmovilizacionVigente();
    multa.anulacion = {
      motivo: req.body.motivo || "",
      fecha: new Date(),
      registradoPor: req.user.username,
    };
    multa.estado = "ANULADA";
    registrarHistorial(multa, req, "ANULADA", req.body.motivo || "");

    let vehiculoLiberado = false;
    if (vigente) {
      multa.inmovilizacion.estado = "LEVANTADA";
      multa.inmovilizacion.fechaLevantamiento = new Date();
      multa.inmovilizacion.levantadaPor = req.user.username;
      multa.inmovilizacion.observacionesLevantamiento = "Multa anulada";
      registrarHistorial(multa, req, "INMOVILIZACION_LEVANTADA", "Por anulación de la multa");
    }
    await multa.save();
    if (vigente) vehiculoLiberado = await liberarVehiculoSiCorresponde(multa);

    res.json({ success: true, data: await poblar(multa._id), vehiculoLiberado });
  } catch (error) {
    logger.error(`Error anulando multa: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ═══════════════════ INMOVILIZACIÓN ═══════════════════

/**
 * Subir la corrección: la puede hacer administración o el conductor/propietario
 * del vehículo. Deja la inmovilización en CORRECCION_SUBIDA a la espera de que
 * administración la valide y levante.
 */
exports.subirCorreccion = async (req, res) => {
  try {
    const { multa, error } = await buscarMulta(req, req.params.id);
    if (error) return responderError(res, error);
    if (!multa.inmovilizacionVigente()) {
      return res.status(409).json({
        success: false,
        message: "La multa no tiene una inmovilización vigente",
      });
    }
    const { descripcion, evidencias = [] } = req.body;
    const corr = multa.inmovilizacion.correccion || {};
    const nuevas = evidencias.map((e) => sellarArchivo(e, req));
    multa.inmovilizacion.correccion = {
      descripcion: descripcion || corr.descripcion || "",
      evidencias: [...(corr.evidencias || []), ...nuevas],
      fecha: new Date(),
      subidoPor: req.user.username,
      subidoPorNombre: nombreUsuario(req),
    };
    multa.inmovilizacion.estado = "CORRECCION_SUBIDA";
    registrarHistorial(
      multa,
      req,
      "CORRECCION_SUBIDA",
      `${nuevas.length} evidencia(s)${descripcion ? ` · ${descripcion}` : ""}`,
    );
    await multa.save();
    res.json({ success: true, data: await poblar(multa._id) });
  } catch (error) {
    logger.error(`Error subiendo corrección de inmovilización: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Levantar la inmovilización (ADMIN / CLIENTE_ADMIN). Exige corrección subida
 * salvo `forzar: true`. Devuelve el vehículo a su estado anterior si no tiene
 * otra inmovilización vigente.
 */
exports.levantarInmovilizacion = async (req, res) => {
  try {
    const { multa, error } = await buscarMulta(req, req.params.id, { gestion: true });
    if (error) return responderError(res, error);
    if (!multa.inmovilizacionVigente()) {
      return res.status(409).json({
        success: false,
        message: "La multa no tiene una inmovilización vigente",
      });
    }
    const { observaciones, forzar } = req.body;
    if (multa.inmovilizacion.estado !== "CORRECCION_SUBIDA" && !forzar) {
      return res.status(409).json({
        success: false,
        code: "SIN_CORRECCION",
        message:
          "Aún no se ha subido la corrección. Súbala primero o levante la inmovilización sin corrección (quedará registrado).",
      });
    }
    multa.inmovilizacion.estado = "LEVANTADA";
    multa.inmovilizacion.fechaLevantamiento = new Date();
    multa.inmovilizacion.levantadaPor = req.user.username;
    multa.inmovilizacion.observacionesLevantamiento = observaciones || "";
    multa.inmovilizacion.levantadaForzada = Boolean(forzar);
    registrarHistorial(
      multa,
      req,
      "INMOVILIZACION_LEVANTADA",
      `${forzar ? "Sin corrección (forzado)" : "Corrección validada"}${observaciones ? ` · ${observaciones}` : ""}`,
    );
    await multa.save();
    const vehiculoLiberado = await liberarVehiculoSiCorresponde(multa);
    res.json({ success: true, data: await poblar(multa._id), vehiculoLiberado });
  } catch (error) {
    logger.error(`Error levantando inmovilización: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ═══════════════════ PAPELERA ═══════════════════

exports.eliminar = async (req, res) => {
  try {
    const { multa, error } = await buscarMulta(req, req.params.id, { gestion: true });
    if (error) return responderError(res, error);
    const vigente = multa.inmovilizacionVigente();
    registrarHistorial(multa, req, "ELIMINADA");
    await multa.softDelete(req.user.userId);
    // Al enviar a papelera una multa con inmovilización vigente, el vehículo no
    // puede quedar bloqueado por un registro que ya no se ve.
    let vehiculoLiberado = false;
    if (vigente) vehiculoLiberado = await liberarVehiculoSiCorresponde(multa);
    res.json({ success: true, message: "Multa enviada a la papelera", vehiculoLiberado });
  } catch (error) {
    logger.error(`Error eliminando multa: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.restaurar = async (req, res) => {
  try {
    const multa = await Multa.findOne({ _id: req.params.id, deletedAt: { $ne: null } });
    if (!multa) {
      return res.status(404).json({ success: false, message: "Multa no encontrada en la papelera" });
    }
    registrarHistorial(multa, req, "RESTAURADA");
    await multa.restore();
    // Si la inmovilización seguía vigente, el vehículo vuelve a quedar retenido
    if (multa.inmovilizacionVigente()) {
      const vehiculo = await Vehiculo.findById(multa.vehiculo);
      if (vehiculo && vehiculo.estado !== "INMOVILIZADO") {
        multa.inmovilizacion.estadoVehiculoAnterior = vehiculo.estado || "ACTIVO";
        vehiculo.estado = "INMOVILIZADO";
        await vehiculo.save();
        await multa.save();
      }
    }
    res.json({ success: true, data: await poblar(multa._id) });
  } catch (error) {
    logger.error(`Error restaurando multa: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.eliminarDefinitivo = async (req, res) => {
  try {
    const multa = await Multa.findById(req.params.id);
    if (!multa) {
      return res.status(404).json({ success: false, message: "Multa no encontrada" });
    }
    const vigente = multa.inmovilizacionVigente();
    const archivos = [
      ...(multa.fotos || []),
      ...(multa.inmovilizacion?.correccion?.evidencias || []),
      multa.pago?.comprobante,
    ].filter(Boolean);
    await Multa.deleteOne({ _id: multa._id });
    if (vigente) await liberarVehiculoSiCorresponde(multa);
    await Promise.all(archivos.map((a) => borrarArchivo(a)));
    res.json({ success: true, message: "Multa eliminada definitivamente" });
  } catch (error) {
    logger.error(`Error eliminando definitivamente multa: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};
