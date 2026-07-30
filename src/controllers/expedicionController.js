const CredencialRndc = require("../models/CredencialRndc");
const RemesaExpedida = require("../models/RemesaExpedida");
const ManifiestoExpedido = require("../models/ManifiestoExpedido");
const ConsumoRndc = require("../models/ConsumoRndc");
const expedicionService = require("../services/expedicionService");
const { cifrar } = require("../utils/credencialCrypto");
const logger = require("../config/logger");

/**
 * Controlador del módulo de EXPEDICIÓN de remesas/manifiestos RNDC.
 * Acceso: ADMIN/SUPER_ADMIN (plataforma) y CLIENTE_ADMIN (empresa cliente).
 * El CLIENTE_ADMIN queda SIEMPRE acotado a su propia empresa.
 */

const esAdmin = (req) =>
  (req.user?.roles || []).some((r) =>
    ["ADMIN", "SUPER_ADMIN"].includes(r.replace("ROLE_", "").toUpperCase()),
  );

/**
 * Resuelve la empresa sobre la que se opera:
 * admin puede indicar cualquier empresa; el resto usa la suya.
 */
function empresaDe(req, explicita) {
  if (esAdmin(req) && explicita) return explicita;
  if (req.user?.empresaId) return req.user.empresaId;
  const err = new Error(
    "No fue posible determinar la empresa del usuario. Indique la empresa (admin) o asocie el usuario a una empresa.",
  );
  err.statusCode = 400;
  throw err;
}

/** Manejo uniforme de errores del service */
function responderError(res, error, contexto) {
  const status = error.statusCode || 500;
  if (status >= 500) logger.error(`[Expedicion] ${contexto}: ${error.message}`);
  return res.status(status).json({ success: false, message: error.message });
}

// ═══ CREDENCIAL ═══

/** PUT /api/expedicion/credencial — crear/actualizar credencial RNDC de la empresa */
exports.guardarCredencial = async (req, res) => {
  try {
    const { nitEmpresaTransporte, usuarioWS, password, modoPruebas } = req.body;
    const empresa = empresaDe(req, req.body.empresa);

    const credencial = await CredencialRndc.findOneAndUpdate(
      { empresa },
      {
        $set: {
          nitEmpresaTransporte,
          usuarioWS,
          passwordCifrada: cifrar(password),
          modoPruebas: modoPruebas !== false,
          estado: "ACTIVA",
          actualizadoPor: req.user?.userId || null,
          // Al cambiar la credencial se invalida la verificación previa
          ultimaVerificacion: null,
          ultimaVerificacionOk: null,
          ultimaVerificacionError: null,
        },
        $setOnInsert: { creadoPor: req.user?.userId || null },
      },
      { upsert: true, new: true },
    );

    res.json({
      success: true,
      message: `Credencial RNDC guardada (ambiente ${credencial.modoPruebas ? "PRUEBAS" : "PRODUCCIÓN"})`,
      data: sanearCredencial(credencial),
    });
  } catch (error) {
    responderError(res, error, "guardarCredencial");
  }
};

/** GET /api/expedicion/credencial — estado de la credencial (sin secretos) */
exports.obtenerCredencial = async (req, res) => {
  try {
    const empresa = empresaDe(req, req.query.empresa);
    const credencial = await CredencialRndc.findOne({ empresa });
    res.json({
      success: true,
      data: credencial ? sanearCredencial(credencial) : null,
    });
  } catch (error) {
    responderError(res, error, "obtenerCredencial");
  }
};

/** POST /api/expedicion/credencial/verificar — prueba la credencial contra el RNDC */
exports.verificarCredencial = async (req, res) => {
  try {
    const empresa = empresaDe(req, req.body.empresa);
    const resultado = await expedicionService.verificarCredencial(empresa);
    res.json({ success: resultado.success, data: resultado });
  } catch (error) {
    responderError(res, error, "verificarCredencial");
  }
};

function sanearCredencial(c) {
  return {
    _id: c._id,
    empresa: c.empresa,
    nitEmpresaTransporte: c.nitEmpresaTransporte,
    usuarioWS: c.usuarioWS,
    modoPruebas: c.modoPruebas,
    estado: c.estado,
    ultimaVerificacion: c.ultimaVerificacion,
    ultimaVerificacionOk: c.ultimaVerificacionOk,
    ultimaVerificacionError: c.ultimaVerificacionError,
    updatedAt: c.updatedAt,
  };
}

// ═══ MAESTROS ═══

/** POST /api/expedicion/terceros — registrar tercero en el RNDC (proceso 11) */
exports.registrarTercero = async (req, res) => {
  try {
    const empresa = empresaDe(req, req.body.empresa);
    const resultado = await expedicionService.registrarTercero(
      empresa,
      req.body.variables,
      req.user?.userId,
    );
    res.status(resultado.success ? 200 : 422).json({
      success: resultado.success,
      data: resultado,
      message: resultado.success
        ? `Tercero registrado en el RNDC (radicado ${resultado.radicado})`
        : resultado.error,
    });
  } catch (error) {
    responderError(res, error, "registrarTercero");
  }
};

/** POST /api/expedicion/vehiculos — registrar vehículo en el RNDC (proceso 12) */
exports.registrarVehiculo = async (req, res) => {
  try {
    const empresa = empresaDe(req, req.body.empresa);
    const resultado = await expedicionService.registrarVehiculo(
      empresa,
      req.body.variables,
      req.user?.userId,
    );
    res.status(resultado.success ? 200 : 422).json({
      success: resultado.success,
      data: resultado,
      message: resultado.success
        ? `Vehículo registrado en el RNDC (radicado ${resultado.radicado})`
        : resultado.error,
    });
  } catch (error) {
    responderError(res, error, "registrarVehiculo");
  }
};

// ═══ REMESAS ═══

/** POST /api/expedicion/remesas — expedir remesa (proceso 3) */
exports.expedirRemesa = async (req, res) => {
  try {
    const empresa = empresaDe(req, req.body.empresa);
    const resultado = await expedicionService.expedirRemesa(
      empresa,
      req.body.consecutivoRemesa,
      req.body.variables,
      req.user?.userId,
    );
    res.status(resultado.success ? 200 : 422).json({
      success: resultado.success,
      data: resultado.remesa,
      message: resultado.success
        ? `Remesa radicada en el RNDC (ingresoid ${resultado.radicado})`
        : resultado.error,
    });
  } catch (error) {
    responderError(res, error, "expedirRemesa");
  }
};

/** GET /api/expedicion/remesas — listar remesas de la empresa */
exports.listarRemesas = async (req, res) => {
  try {
    const empresa = empresaDe(req, req.query.empresa);
    const filtro = { empresa, deletedAt: null };
    if (req.query.estado) filtro.estado = req.query.estado;
    const remesas = await RemesaExpedida.find(filtro)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(req.query.limit || "100"), 500))
      .lean();
    res.json({ success: true, data: remesas });
  } catch (error) {
    responderError(res, error, "listarRemesas");
  }
};

/** POST /api/expedicion/remesas/:id/anular — anular remesa (proceso 9) */
exports.anularRemesa = async (req, res) => {
  try {
    const empresa = empresaDe(req, req.body.empresa);
    const resultado = await expedicionService.anularRemesa(
      empresa,
      req.params.id,
      req.body.motivo,
      req.user?.userId,
    );
    res.status(resultado.success ? 200 : 422).json({
      success: resultado.success,
      data: resultado.remesa,
      message: resultado.success ? "Remesa anulada en el RNDC" : resultado.error,
    });
  } catch (error) {
    responderError(res, error, "anularRemesa");
  }
};

// ═══ MANIFIESTOS ═══

/** POST /api/expedicion/manifiestos — expedir manifiesto (proceso 4) */
exports.expedirManifiesto = async (req, res) => {
  try {
    const empresa = empresaDe(req, req.body.empresa);
    const resultado = await expedicionService.expedirManifiesto(
      empresa,
      req.body.numManifiestoCarga,
      req.body.consecutivosRemesas,
      req.body.variables,
      req.user?.userId,
    );
    res.status(resultado.success ? 200 : 422).json({
      success: resultado.success,
      data: resultado.manifiesto,
      message: resultado.success
        ? `Manifiesto radicado en el RNDC (ingresoid ${resultado.radicado})`
        : resultado.error,
    });
  } catch (error) {
    responderError(res, error, "expedirManifiesto");
  }
};

/** GET /api/expedicion/manifiestos — listar manifiestos de la empresa */
exports.listarManifiestos = async (req, res) => {
  try {
    const empresa = empresaDe(req, req.query.empresa);
    const filtro = { empresa, deletedAt: null };
    if (req.query.estado) filtro.estado = req.query.estado;
    const manifiestos = await ManifiestoExpedido.find(filtro)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(req.query.limit || "100"), 500))
      .lean();
    res.json({ success: true, data: manifiestos });
  } catch (error) {
    responderError(res, error, "listarManifiestos");
  }
};

/** POST /api/expedicion/manifiestos/:id/anular — anular manifiesto (proceso 32) */
exports.anularManifiesto = async (req, res) => {
  try {
    const empresa = empresaDe(req, req.body.empresa);
    const resultado = await expedicionService.anularManifiesto(
      empresa,
      req.params.id,
      req.body.motivo,
      req.user?.userId,
    );
    res.status(resultado.success ? 200 : 422).json({
      success: resultado.success,
      data: resultado.manifiesto,
      message: resultado.success ? "Manifiesto anulado en el RNDC" : resultado.error,
    });
  } catch (error) {
    responderError(res, error, "anularManifiesto");
  }
};

/** POST /api/expedicion/manifiestos/:id/consultar-aceptacion — proceso 73 */
exports.consultarAceptacion = async (req, res) => {
  try {
    const empresa = empresaDe(req, req.body.empresa);
    const resultado = await expedicionService.consultarAceptacion(
      empresa,
      req.params.id,
    );
    res.json({
      success: true,
      data: resultado.manifiesto,
      message:
        resultado.manifiesto.estado === "ACEPTADO"
          ? "El manifiesto ya tiene aceptación electrónica"
          : "Aún sin aceptación electrónica registrada",
    });
  } catch (error) {
    responderError(res, error, "consultarAceptacion");
  }
};

// ═══ CONSUMO (monetización) ═══

/** GET /api/expedicion/consumo — consumo de la empresa (mes actual + histórico) */
exports.consumoEmpresa = async (req, res) => {
  try {
    const empresa = empresaDe(req, req.query.empresa);
    const consumos = await ConsumoRndc.find({ empresa })
      .sort({ periodo: -1 })
      .limit(13)
      .lean();

    const ahora = new Date();
    const periodoActual = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;
    const actual =
      consumos.find((c) => c.periodo === periodoActual) || {
        periodo: periodoActual,
        manifiestosExpedidos: 0,
        remesasExpedidas: 0,
        anulaciones: 0,
        manifiestosPruebas: 0,
        remesasPruebas: 0,
        cupoManifiestos: null,
      };

    res.json({ success: true, data: { actual, historico: consumos } });
  } catch (error) {
    responderError(res, error, "consumoEmpresa");
  }
};

/** GET /api/expedicion/consumo/resumen — TODAS las empresas (solo ADMIN, para facturar) */
exports.resumenConsumos = async (req, res) => {
  try {
    const periodo =
      req.query.periodo ||
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const consumos = await ConsumoRndc.find({ periodo })
      .populate("empresa", "nit razonSocial")
      .sort({ manifiestosExpedidos: -1 })
      .lean();
    res.json({ success: true, data: { periodo, consumos } });
  } catch (error) {
    responderError(res, error, "resumenConsumos");
  }
};
