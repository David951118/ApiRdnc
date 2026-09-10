const Joi = require("joi");

const mongoId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);

// Metadatos de un archivo ya subido a S3 con la presigned URL de
// POST /documentos/presigned-url (folder "multas" o "multas/correcciones").
const archivo = Joi.object({
  url: Joi.string().uri().required(),
  key: Joi.string().required(),
  nombre: Joi.string().allow("", null),
  mimeType: Joi.string().allow("", null),
  tamano: Joi.number().min(0).allow(null),
});

const conductorNoRegistrado = Joi.object({
  nombres: Joi.string().allow("", null),
  apellidos: Joi.string().allow("", null),
  tipoId: Joi.string().allow("", null),
  identificacion: Joi.string().allow("", null),
  telefono: Joi.string().allow("", null),
  licencia: Joi.string().allow("", null),
});

const inmovilizacionCreate = Joi.object({
  aplica: Joi.boolean().default(false),
  fechaInicio: Joi.date().allow(null),
  patio: Joi.string().allow("", null),
  motivo: Joi.string().allow("", null),
  costoGrua: Joi.number().min(0).allow(null),
  costoPatios: Joi.number().min(0).allow(null),
});

const RESPONSABLES = ["EMPRESA", "CONDUCTOR", "PROPIETARIO"];

const createMulta = Joi.object({
  vehiculo: mongoId.required(),
  conductor: mongoId.allow(null),
  conductorNoRegistrado: conductorNoRegistrado.allow(null),
  fecha: Joi.date().required(),
  numeroComparendo: Joi.string().allow("", null),
  codigoInfraccion: Joi.string().allow("", null),
  descripcion: Joi.string().required(),
  autoridad: Joi.string().allow("", null),
  agente: Joi.string().allow("", null),
  ciudad: Joi.string().allow("", null),
  lugar: Joi.string().allow("", null),
  valor: Joi.number().min(0).required(),
  fechaLimitePago: Joi.date().allow(null),
  responsable: Joi.string().valid(...RESPONSABLES),
  fotos: Joi.array().items(archivo),
  inmovilizacion: inmovilizacionCreate,
  observaciones: Joi.string().allow("", null),
});

// Al editar no se cambia el vehículo (afecta empresa/placa/inmovilización) ni
// el estado (tiene endpoints propios: pagar / impugnar / anular).
const updateMulta = Joi.object({
  conductor: mongoId.allow(null),
  conductorNoRegistrado: conductorNoRegistrado.allow(null),
  fecha: Joi.date(),
  numeroComparendo: Joi.string().allow("", null),
  codigoInfraccion: Joi.string().allow("", null),
  descripcion: Joi.string(),
  autoridad: Joi.string().allow("", null),
  agente: Joi.string().allow("", null),
  ciudad: Joi.string().allow("", null),
  lugar: Joi.string().allow("", null),
  valor: Joi.number().min(0),
  fechaLimitePago: Joi.date().allow(null),
  responsable: Joi.string().valid(...RESPONSABLES),
  observaciones: Joi.string().allow("", null),
  // Solo datos informativos de la inmovilización; el ciclo (aplica/estado) va
  // por sus endpoints. Se permite activar la inmovilización de una multa que
  // se registró sin ella (p. ej. el vehículo fue llevado a patios después).
  inmovilizacion: Joi.object({
    aplica: Joi.boolean(),
    fechaInicio: Joi.date().allow(null),
    patio: Joi.string().allow("", null),
    motivo: Joi.string().allow("", null),
    costoGrua: Joi.number().min(0).allow(null),
    costoPatios: Joi.number().min(0).allow(null),
  }),
}).min(1);

const agregarFotos = Joi.object({
  fotos: Joi.array().items(archivo).min(1).required(),
});

const pagarMulta = Joi.object({
  valorPagado: Joi.number().min(0).required(),
  fechaPago: Joi.date().allow(null),
  comprobante: archivo.allow(null),
  observaciones: Joi.string().allow("", null),
});

const motivo = Joi.object({
  motivo: Joi.string().allow("", null),
});

const correccionInmovilizacion = Joi.object({
  descripcion: Joi.string().allow("", null),
  evidencias: Joi.array().items(archivo).default([]),
}).custom((value, helpers) => {
  if (!value.descripcion && !(value.evidencias && value.evidencias.length)) {
    return helpers.message(
      "Indique una descripción de la corrección o adjunte al menos una evidencia",
    );
  }
  return value;
});

const levantarInmovilizacion = Joi.object({
  observaciones: Joi.string().allow("", null),
  // true: levantar aunque no se haya subido corrección (decisión administrativa)
  forzar: Joi.boolean().default(false),
});

module.exports = {
  createMulta,
  updateMulta,
  agregarFotos,
  pagarMulta,
  motivo,
  correccionInmovilizacion,
  levantarInmovilizacion,
};
