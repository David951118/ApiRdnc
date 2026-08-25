const RNDCClient = require("./rndcClient");
const CredencialRndc = require("../models/CredencialRndc");
const RemesaExpedida = require("../models/RemesaExpedida");
const ManifiestoExpedido = require("../models/ManifiestoExpedido");
const ConsumoRndc = require("../models/ConsumoRndc");
const { descifrar } = require("../utils/credencialCrypto");
const config = require("../config/env");
const logger = require("../config/logger");

/**
 * Orquestación de la EXPEDICIÓN de remesas y manifiestos ante el RNDC
 * en nombre de empresas de transporte clientes (rol empresa de transporte).
 *
 * Reglas clave:
 *  - Cada envío se firma con la credencial RNDC de la empresa (cifrada en bd).
 *  - modoPruebas=true → ambiente oficial de pruebas del Ministerio.
 *  - El NIT GPS de Asegurar se inyecta SIEMPRE en las remesas (NUMIDGPS).
 *  - El consumo (monetización) solo se incrementa con radicado exitoso.
 */

/** Escapa un valor para incrustarlo en XML */
function escaparXML(valor) {
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Convierte un objeto {VARIABLE: valor} en subelementos XML del diccionario
 * RNDC. Omite null/undefined/"" y normaliza las etiquetas a MAYÚSCULAS.
 */
function construirVariablesXML(objeto = {}) {
  return Object.entries(objeto)
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .map(([k, v]) => {
      const tag = k.toUpperCase();
      return `<${tag}>${escaparXML(v)}</${tag}>`;
    })
    .join("\n");
}

/** Bloque REMESASMAN del manifiesto (procesoid 43 anidado, según guía oficial) */
function construirBloqueRemesas(consecutivos = []) {
  const remesas = consecutivos
    .map(
      (c) =>
        `<REMESA><CONSECUTIVOREMESA>${escaparXML(c)}</CONSECUTIVOREMESA></REMESA>`,
    )
    .join("\n");
  return `<REMESASMAN procesoid="43">\n${remesas}\n</REMESASMAN>`;
}

/**
 * Obtiene la credencial ACTIVA de la empresa y construye el cliente RNDC
 * apuntando al ambiente/URL que corresponda.
 *
 * Desde la migración a RNDC2 (Guía WS V5) producción usa 3 URLs por función:
 *   - 'expedir'  → rndcws2 (SOLO expedir remesas y manifiestos, procesos 3/4)
 *   - 'consulta' → plc     (SOLO consultas, tipo 3)
 *   - 'general'  → rndcws  (el resto: terceros, vehículos, anulaciones, cumplidos)
 * En modoPruebas todo va al ambiente único de pruebas (rndcpruebas).
 */
async function clienteParaEmpresa(empresaId, proposito = "general") {
  const credencial = await CredencialRndc.findOne({
    empresa: empresaId,
    estado: "ACTIVA",
  });
  if (!credencial) {
    const err = new Error(
      "La empresa no tiene credencial RNDC configurada o está inactiva",
    );
    err.statusCode = 412; // Precondition failed
    throw err;
  }

  let password;
  try {
    password = descifrar(credencial.passwordCifrada);
  } catch (e) {
    const err = new Error(`No fue posible descifrar la credencial: ${e.message}`);
    err.statusCode = 500;
    throw err;
  }

  let endpoint;
  if (credencial.modoPruebas) {
    endpoint = config.rndc.endpointPruebas;
  } else if (proposito === "expedir") {
    endpoint = config.rndc.endpointExpedicion;
  } else if (proposito === "consulta") {
    endpoint = config.rndc.endpointConsultas;
  } else {
    endpoint = config.rndc.endpoint;
  }

  return {
    client: new RNDCClient(credencial.usuarioWS, password, endpoint),
    credencial,
  };
}

/** Campo de consumo según ambiente */
function campoConsumo(base, modoPruebas) {
  if (!modoPruebas) return base;
  if (base === "manifiestosExpedidos") return "manifiestosPruebas";
  if (base === "remesasExpedidas") return "remesasPruebas";
  return null; // anulaciones/cumplidos en pruebas no se cuentan
}

/**
 * Registrar o actualizar un TERCERO (proceso 11) en nombre de la empresa.
 */
async function registrarTercero(empresaId, variables, userId) {
  const { client, credencial } = await clienteParaEmpresa(empresaId);
  const xml = construirVariablesXML({
    NUMNITEMPRESATRANSPORTE: credencial.nitEmpresaTransporte,
    ...variables,
  });
  return client.registrarTercero(xml, { empresaId: String(empresaId), userId });
}

/**
 * Registrar o actualizar un VEHÍCULO (proceso 12) en nombre de la empresa.
 */
async function registrarVehiculo(empresaId, variables, userId) {
  const { client, credencial } = await clienteParaEmpresa(empresaId);
  const xml = construirVariablesXML({
    NUMNITEMPRESATRANSPORTE: credencial.nitEmpresaTransporte,
    ...variables,
  });
  return client.registrarVehiculo(xml, { empresaId: String(empresaId), userId });
}

/**
 * Expedir una REMESA (proceso 3). Crea/actualiza el registro local y solo
 * lo pasa a RADICADA si el RNDC devuelve ingresoid.
 */
async function expedirRemesa(empresaId, consecutivoRemesa, variables, userId) {
  const { client, credencial } = await clienteParaEmpresa(empresaId, "expedir");
  const ambiente = credencial.modoPruebas ? "PRUEBAS" : "PRODUCCION";

  // Borrador local (idempotente por empresa+consecutivo)
  let remesa = await RemesaExpedida.findOneAndUpdate(
    { empresa: empresaId, consecutivoRemesa },
    {
      $set: { datos: variables, ambiente },
      $setOnInsert: { creadoPor: userId, estado: "BORRADOR" },
    },
    { upsert: true, new: true },
  );

  if (remesa.estado === "RADICADA") {
    return {
      success: false,
      error: `La remesa ${consecutivoRemesa} ya fue radicada (ingresoid ${remesa.ingresoid})`,
      remesa,
    };
  }

  const xml = construirVariablesXML({
    NUMNITEMPRESATRANSPORTE: credencial.nitEmpresaTransporte,
    CONSECUTIVOREMESA: consecutivoRemesa,
    ...variables,
    // El NIT de la empresa de rastreo (nosotros) SIEMPRE va en la remesa
    NUMIDGPS: config.rndc.nitGps,
  });

  const resultado = await client.expedirRemesa(xml, {
    empresaId: String(empresaId),
    consecutivoRemesa,
    ambiente,
    userId,
  });

  if (resultado.success && resultado.radicado) {
    remesa.estado = "RADICADA";
    remesa.ingresoid = String(resultado.radicado);
    remesa.fechaRadicacion = new Date();
    remesa.ultimoError = null;
    await remesa.save();

    const campo = campoConsumo("remesasExpedidas", credencial.modoPruebas);
    if (campo) await ConsumoRndc.incrementar(empresaId, campo);
  } else {
    remesa.ultimoError = resultado.error || "Respuesta desconocida del RNDC";
    await remesa.save();
  }

  return { ...resultado, remesa };
}

/**
 * Expedir un MANIFIESTO (proceso 4) asociando remesas ya radicadas.
 */
async function expedirManifiesto(
  empresaId,
  numManifiestoCarga,
  consecutivosRemesas,
  variables,
  userId,
) {
  const { client, credencial } = await clienteParaEmpresa(empresaId, "expedir");
  const ambiente = credencial.modoPruebas ? "PRUEBAS" : "PRODUCCION";

  // Las remesas deben existir localmente y estar RADICADAS en el mismo ambiente
  const remesas = await RemesaExpedida.find({
    empresa: empresaId,
    consecutivoRemesa: { $in: consecutivosRemesas },
    deletedAt: null,
  });
  const radicadas = remesas.filter((r) => r.estado === "RADICADA");
  if (radicadas.length !== consecutivosRemesas.length) {
    const faltantes = consecutivosRemesas.filter(
      (c) => !radicadas.some((r) => r.consecutivoRemesa === c),
    );
    const err = new Error(
      `Estas remesas no están radicadas en el RNDC: ${faltantes.join(", ")}. Radíquelas primero.`,
    );
    err.statusCode = 409;
    throw err;
  }

  let manifiesto = await ManifiestoExpedido.findOneAndUpdate(
    { empresa: empresaId, numManifiestoCarga },
    {
      $set: {
        datos: variables,
        ambiente,
        consecutivosRemesas,
        remesas: radicadas.map((r) => r._id),
      },
      $setOnInsert: { creadoPor: userId, estado: "BORRADOR" },
    },
    { upsert: true, new: true },
  );

  if (manifiesto.estado !== "BORRADOR") {
    return {
      success: false,
      error: `El manifiesto ${numManifiestoCarga} ya fue radicado (estado ${manifiesto.estado})`,
      manifiesto,
    };
  }

  const xml =
    construirVariablesXML({
      NUMNITEMPRESATRANSPORTE: credencial.nitEmpresaTransporte,
      NUMMANIFIESTOCARGA: numManifiestoCarga,
      ...variables,
    }) +
    "\n" +
    construirBloqueRemesas(consecutivosRemesas);

  const resultado = await client.expedirManifiesto(xml, {
    empresaId: String(empresaId),
    numManifiestoCarga,
    ambiente,
    userId,
  });

  if (resultado.success && resultado.radicado) {
    manifiesto.estado = "RADICADO";
    manifiesto.ingresoid = String(resultado.radicado);
    manifiesto.fechaRadicacion = new Date();
    manifiesto.ultimoError = null;
    await manifiesto.save();

    const campo = campoConsumo("manifiestosExpedidos", credencial.modoPruebas);
    if (campo) await ConsumoRndc.incrementar(empresaId, campo);
  } else {
    manifiesto.ultimoError = resultado.error || "Respuesta desconocida del RNDC";
    await manifiesto.save();
  }

  return { ...resultado, manifiesto };
}

/**
 * Anular una REMESA radicada (proceso 9).
 */
async function anularRemesa(empresaId, remesaId, motivo, userId) {
  const remesa = await RemesaExpedida.findOne({
    _id: remesaId,
    empresa: empresaId,
    deletedAt: null,
  });
  if (!remesa) {
    const err = new Error("Remesa no encontrada");
    err.statusCode = 404;
    throw err;
  }
  if (remesa.estado !== "RADICADA") {
    const err = new Error(`Solo se pueden anular remesas RADICADAS (estado actual: ${remesa.estado})`);
    err.statusCode = 409;
    throw err;
  }

  const { client, credencial } = await clienteParaEmpresa(empresaId);
  const xml = construirVariablesXML({
    NUMNITEMPRESATRANSPORTE: credencial.nitEmpresaTransporte,
    CONSECUTIVOREMESA: remesa.consecutivoRemesa,
    OBSERVACIONES: motivo,
  });

  const resultado = await client.anularRemesa(xml, {
    empresaId: String(empresaId),
    consecutivoRemesa: remesa.consecutivoRemesa,
    userId,
  });

  if (resultado.success && resultado.radicado) {
    remesa.estado = "ANULADA";
    remesa.fechaAnulacion = new Date();
    remesa.motivoAnulacion = motivo;
    await remesa.save();
    if (!credencial.modoPruebas) {
      await ConsumoRndc.incrementar(empresaId, "anulaciones");
    }
  } else {
    remesa.ultimoError = resultado.error || null;
    await remesa.save();
  }

  return { ...resultado, remesa };
}

/**
 * Anular un MANIFIESTO radicado (proceso 32).
 */
async function anularManifiesto(empresaId, manifiestoId, motivo, userId) {
  const manifiesto = await ManifiestoExpedido.findOne({
    _id: manifiestoId,
    empresa: empresaId,
    deletedAt: null,
  });
  if (!manifiesto) {
    const err = new Error("Manifiesto no encontrado");
    err.statusCode = 404;
    throw err;
  }
  if (!["RADICADO", "ACEPTADO"].includes(manifiesto.estado)) {
    const err = new Error(
      `Solo se pueden anular manifiestos RADICADOS o ACEPTADOS (estado actual: ${manifiesto.estado})`,
    );
    err.statusCode = 409;
    throw err;
  }

  const { client, credencial } = await clienteParaEmpresa(empresaId);
  const xml = construirVariablesXML({
    NUMNITEMPRESATRANSPORTE: credencial.nitEmpresaTransporte,
    NUMMANIFIESTOCARGA: manifiesto.numManifiestoCarga,
    OBSERVACIONES: motivo,
  });

  const resultado = await client.anularManifiesto(xml, {
    empresaId: String(empresaId),
    numManifiestoCarga: manifiesto.numManifiestoCarga,
    userId,
  });

  if (resultado.success && resultado.radicado) {
    manifiesto.estado = "ANULADO";
    manifiesto.fechaAnulacion = new Date();
    manifiesto.motivoAnulacion = motivo;
    await manifiesto.save();
    if (!credencial.modoPruebas) {
      await ConsumoRndc.incrementar(empresaId, "anulaciones");
    }
  } else {
    manifiesto.ultimoError = resultado.error || null;
    await manifiesto.save();
  }

  return { ...resultado, manifiesto };
}

/**
 * Cumplir una REMESA radicada (proceso 5). Las variables del cumplido
 * (fechas/horas reales de cargue y descargue, cantidad entregada, etc.)
 * vienen del diccionario RNDC — se validan de fondo en el Ministerio.
 */
async function cumplirRemesa(empresaId, remesaId, variables, userId) {
  const remesa = await RemesaExpedida.findOne({
    _id: remesaId,
    empresa: empresaId,
    deletedAt: null,
  });
  if (!remesa) {
    const err = new Error("Remesa no encontrada");
    err.statusCode = 404;
    throw err;
  }
  if (remesa.estado !== "RADICADA") {
    const err = new Error(
      `Solo se pueden cumplir remesas RADICADAS (estado actual: ${remesa.estado})`,
    );
    err.statusCode = 409;
    throw err;
  }

  const { client, credencial } = await clienteParaEmpresa(empresaId);
  const xml = construirVariablesXML({
    NUMNITEMPRESATRANSPORTE: credencial.nitEmpresaTransporte,
    CONSECUTIVOREMESA: remesa.consecutivoRemesa,
    ...variables,
  });

  const resultado = await client.cumplirRemesa(xml, {
    empresaId: String(empresaId),
    consecutivoRemesa: remesa.consecutivoRemesa,
    userId,
  });

  if (resultado.success && resultado.radicado) {
    remesa.estado = "CUMPLIDA";
    remesa.fechaCumplido = new Date();
    remesa.ingresoidCumplido = String(resultado.radicado);
    remesa.ultimoError = null;
    await remesa.save();
  } else {
    remesa.ultimoError = resultado.error || null;
    await remesa.save();
  }

  return { ...resultado, remesa };
}

/**
 * Cumplir un MANIFIESTO radicado/aceptado (proceso 6).
 */
async function cumplirManifiesto(empresaId, manifiestoId, variables, userId) {
  const manifiesto = await ManifiestoExpedido.findOne({
    _id: manifiestoId,
    empresa: empresaId,
    deletedAt: null,
  });
  if (!manifiesto) {
    const err = new Error("Manifiesto no encontrado");
    err.statusCode = 404;
    throw err;
  }
  if (!["RADICADO", "ACEPTADO"].includes(manifiesto.estado)) {
    const err = new Error(
      `Solo se pueden cumplir manifiestos RADICADOS o ACEPTADOS (estado actual: ${manifiesto.estado})`,
    );
    err.statusCode = 409;
    throw err;
  }

  const { client, credencial } = await clienteParaEmpresa(empresaId);
  const xml = construirVariablesXML({
    NUMNITEMPRESATRANSPORTE: credencial.nitEmpresaTransporte,
    NUMMANIFIESTOCARGA: manifiesto.numManifiestoCarga,
    ...variables,
  });

  const resultado = await client.cumplirManifiesto(xml, {
    empresaId: String(empresaId),
    numManifiestoCarga: manifiesto.numManifiestoCarga,
    userId,
  });

  if (resultado.success && resultado.radicado) {
    manifiesto.estado = "CUMPLIDO";
    manifiesto.fechaCumplido = new Date();
    manifiesto.ingresoidCumplido = String(resultado.radicado);
    manifiesto.ultimoError = null;
    await manifiesto.save();
  } else {
    manifiesto.ultimoError = resultado.error || null;
    await manifiesto.save();
  }

  return { ...resultado, manifiesto };
}

/**
 * Consultar la aceptación electrónica de un manifiesto (tipo 3, proceso 73)
 * y sincronizar el estado local si ya fue aceptado.
 */
async function consultarAceptacion(empresaId, manifiestoId) {
  const manifiesto = await ManifiestoExpedido.findOne({
    _id: manifiestoId,
    empresa: empresaId,
    deletedAt: null,
  });
  if (!manifiesto) {
    const err = new Error("Manifiesto no encontrado");
    err.statusCode = 404;
    throw err;
  }
  if (!manifiesto.ingresoid) {
    const err = new Error("El manifiesto aún no está radicado en el RNDC");
    err.statusCode = 409;
    throw err;
  }

  const { client, credencial } = await clienteParaEmpresa(empresaId, "consulta");
  const documento = construirVariablesXML({
    NUMNITEMPRESATRANSPORTE: credencial.nitEmpresaTransporte,
    INGRESOIDMANIFIESTO: manifiesto.ingresoid,
  });

  const resultado = await client.consultarAceptacionManifiesto(
    "INGRESOID,FECHAING,INGRESOIDMANIFIESTO,TIPO,CODIDCONDUCTOR,NUMIDCONDUCTOR,OBSERVACION",
    documento,
    { empresaId: String(empresaId), ingresoidManifiesto: manifiesto.ingresoid },
  );

  if (resultado.success && resultado.documentos?.length) {
    const doc = resultado.documentos[0];
    manifiesto.estado = "ACEPTADO";
    manifiesto.aceptacion = {
      fecha: doc.fechaing ? new Date(doc.fechaing) : new Date(),
      tipo: doc.tipo || null,
      observacion: doc.observacion || null,
    };
    await manifiesto.save();
  }

  return { ...resultado, manifiesto };
}

/**
 * Verifica que la credencial funcione contra el RNDC (consulta liviana).
 */
async function verificarCredencial(empresaId) {
  const { client, credencial } = await clienteParaEmpresa(empresaId, "consulta");

  const documento = construirVariablesXML({
    NUMNITEMPRESATRANSPORTE: credencial.nitEmpresaTransporte,
  });
  const resultado = await client.enviarProceso(
    "exp_verificacion",
    3,
    4,
    "INGRESOID,FECHAING,NUMMANIFIESTOCARGA",
    documento,
    { empresaId: String(empresaId), verificacion: true },
  );

  // Un error de datos ("no hay documentos") también prueba que la
  // autenticación funcionó; solo el error de seguridad la invalida.
  const esErrorSeguridad =
    !resultado.success &&
    /seguridad|usuario|clave|password|autoriza/i.test(resultado.error || "");

  credencial.ultimaVerificacion = new Date();
  credencial.ultimaVerificacionOk = !esErrorSeguridad;
  credencial.ultimaVerificacionError = esErrorSeguridad ? resultado.error : null;
  await credencial.save();

  return {
    success: !esErrorSeguridad,
    detalle: resultado.success
      ? "Credencial válida (consulta exitosa)"
      : esErrorSeguridad
        ? `Credencial rechazada por el RNDC: ${resultado.error}`
        : `Credencial válida (el RNDC respondió: ${resultado.error})`,
    ambiente: credencial.modoPruebas ? "PRUEBAS" : "PRODUCCION",
  };
}

module.exports = {
  clienteParaEmpresa,
  construirVariablesXML,
  construirBloqueRemesas,
  escaparXML,
  registrarTercero,
  registrarVehiculo,
  expedirRemesa,
  expedirManifiesto,
  anularRemesa,
  anularManifiesto,
  cumplirRemesa,
  cumplirManifiesto,
  consultarAceptacion,
  verificarCredencial,
};
