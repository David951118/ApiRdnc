const Joi = require("joi");

const mongoId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);

const createRepuesto = Joi.object({
  codigo: Joi.string().allow("", null),
  nombre: Joi.string().required(),
  descripcion: Joi.string().allow("", null),
  categoria: Joi.string().allow("", null),
  unidad: Joi.string().allow("", null),
  stockInicial: Joi.number().min(0).default(0),
  stockMinimo: Joi.number().min(0).default(0),
  costoUnitario: Joi.number().min(0).default(0),
  proveedor: mongoId.allow(null),
  empresa: mongoId.allow(null),
  activo: Joi.boolean(),
});

const updateRepuesto = Joi.object({
  codigo: Joi.string().allow("", null),
  nombre: Joi.string(),
  descripcion: Joi.string().allow("", null),
  categoria: Joi.string().allow("", null),
  unidad: Joi.string().allow("", null),
  stockMinimo: Joi.number().min(0),
  costoUnitario: Joi.number().min(0),
  proveedor: mongoId.allow(null),
  activo: Joi.boolean(),
});

const createMovimiento = Joi.object({
  repuesto: mongoId.required(),
  tipo: Joi.string().valid("ENTRADA", "SALIDA", "AJUSTE").required(),
  cantidad: Joi.number().min(0).required(),
  costoUnitario: Joi.number().min(0),
  ordenTrabajo: mongoId.allow(null),
  vehiculo: mongoId.allow(null),
  placa: Joi.string().allow("", null),
  motivo: Joi.string().allow("", null),
  empresa: mongoId.allow(null),
});

module.exports = { createRepuesto, updateRepuesto, createMovimiento };
