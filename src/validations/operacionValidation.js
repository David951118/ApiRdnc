const Joi = require("joi");

const mongoId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);

const carga = Joi.object({
  pesoKg: Joi.number().min(0).allow(null),
  descripcion: Joi.string().allow("", null),
});

const entrega = Joi.object({
  _id: mongoId.optional(),
  cliente: Joi.string().allow("", null),
  direccion: Joi.string().allow("", null),
  horaProgramada: Joi.date().allow(null),
  horaEntrega: Joi.date().allow(null),
  estado: Joi.string().valid("PENDIENTE", "ENTREGADA", "FALLIDA", "PARCIAL"),
  observacion: Joi.string().allow("", null),
});

const incidencia = Joi.object({
  _id: mongoId.optional(),
  tipo: Joi.string().valid(
    "MECANICA",
    "TRAFICO",
    "ACCIDENTE",
    "CLIMA",
    "SEGURIDAD",
    "OTRO",
  ),
  descripcion: Joi.string().required(),
  hora: Joi.date().allow(null),
});

const createViaje = Joi.object({
  vehiculo: mongoId.required(),
  conductor: mongoId.required(),
  ruta: mongoId.allow(null),
  origen: Joi.string().allow("", null),
  destino: Joi.string().allow("", null),
  fechaProgramada: Joi.date().allow(null),
  kmInicio: Joi.number().min(0).allow(null),
  carga,
  entregas: Joi.array().items(entrega),
  incidencias: Joi.array().items(incidencia),
  observaciones: Joi.string().allow("", null),
});

const updateViaje = Joi.object({
  ruta: mongoId.allow(null),
  origen: Joi.string().allow("", null),
  destino: Joi.string().allow("", null),
  fechaProgramada: Joi.date().allow(null),
  kmInicio: Joi.number().min(0).allow(null),
  carga,
  entregas: Joi.array().items(entrega),
  incidencias: Joi.array().items(incidencia),
  observaciones: Joi.string().allow("", null),
});

const iniciarViaje = Joi.object({
  kmInicio: Joi.number().min(0).allow(null),
  fechaSalida: Joi.date().allow(null),
});

const finalizarViaje = Joi.object({
  kmFin: Joi.number().min(0).required(),
  fechaLlegada: Joi.date().allow(null),
  observaciones: Joi.string().allow("", null),
  entregas: Joi.array().items(entrega),
});

const cancelarViaje = Joi.object({
  motivo: Joi.string().allow("", null),
});

const createTanqueo = Joi.object({
  vehiculo: mongoId.required(),
  conductor: mongoId.allow(null),
  viaje: mongoId.allow(null),
  fecha: Joi.date().allow(null),
  kmTanqueo: Joi.number().min(0).required(),
  galones: Joi.number().min(0).required(),
  costoTotal: Joi.number().min(0),
  costoPorGalon: Joi.number().min(0),
  tipoCombustible: Joi.string().valid("GASOLINA", "DIESEL", "GAS"),
  estacion: Joi.string().allow("", null),
  tanqueLleno: Joi.boolean(),
}).or("costoTotal", "costoPorGalon", "galones");

// El vehículo no se puede cambiar al editar (afecta placa/empresa/serie de rendimiento);
// para corregirlo se elimina y se vuelve a crear.
const updateTanqueo = Joi.object({
  conductor: mongoId.allow(null),
  viaje: mongoId.allow(null),
  fecha: Joi.date().allow(null),
  kmTanqueo: Joi.number().min(0),
  galones: Joi.number().min(0),
  costoTotal: Joi.number().min(0).allow(null),
  costoPorGalon: Joi.number().min(0).allow(null),
  tipoCombustible: Joi.string().valid("GASOLINA", "DIESEL", "GAS"),
  estacion: Joi.string().allow("", null),
  tanqueLleno: Joi.boolean(),
}).min(1);

module.exports = {
  createViaje,
  updateViaje,
  iniciarViaje,
  finalizarViaje,
  cancelarViaje,
  createTanqueo,
  updateTanqueo,
};
