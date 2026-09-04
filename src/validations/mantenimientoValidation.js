const Joi = require("joi");

const mongoId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);

const itemPlan = Joi.object({
  _id: mongoId.optional(), // presente al actualizar ítems existentes
  nombre: Joi.string().required(),
  descripcion: Joi.string().allow("", null),
  intervaloKm: Joi.number().integer().min(1).allow(null),
  intervaloDias: Joi.number().integer().min(1).allow(null),
  umbralAlertaKm: Joi.number().integer().min(0),
  umbralAlertaDias: Joi.number().integer().min(0),
  // Mantenimiento único a un km objetivo (one-shot)
  unaVez: Joi.boolean(),
  kmObjetivo: Joi.number().integer().min(1).allow(null),
}).or("intervaloKm", "intervaloDias", "kmObjetivo"); // intervalo o km objetivo

const createPlan = Joi.object({
  nombre: Joi.string().required(),
  descripcion: Joi.string().allow("", null),
  vehiculos: Joi.array().items(mongoId),
  claseVehiculo: Joi.string().allow("", null),
  aplicaTodos: Joi.boolean(),
  items: Joi.array().items(itemPlan).min(1).required(),
  empresa: mongoId.allow(null),
  activo: Joi.boolean(),
}).custom((value, helpers) => {
  if (
    !value.aplicaTodos &&
    !(value.vehiculos && value.vehiculos.length) &&
    !value.claseVehiculo
  ) {
    return helpers.message(
      "El plan debe aplicar a vehículos específicos, una clase de vehículo o toda la flota",
    );
  }
  return value;
});

const updatePlan = createPlan.fork(["nombre", "items"], (schema) =>
  schema.optional(),
);

const actividad = Joi.object({
  _id: mongoId.optional(),
  descripcion: Joi.string().required(),
  completada: Joi.boolean(),
});

const repuesto = Joi.object({
  _id: mongoId.optional(),
  nombre: Joi.string().required(),
  cantidad: Joi.number().min(0).default(1),
  costoUnitario: Joi.number().min(0).default(0),
  // Referencia opcional al inventario: descuenta stock al cerrar la OT
  repuestoId: mongoId.allow(null),
});

const manoDeObra = Joi.object({
  horas: Joi.number().min(0),
  costo: Joi.number().min(0),
});

// Factura opcional de la OT: metadatos del archivo ya subido a S3 con la
// presigned URL de /documentos/presigned-url (folder mantenimiento/facturas).
const factura = Joi.object({
  url: Joi.string().uri().required(),
  key: Joi.string().required(),
  nombre: Joi.string().allow("", null),
  mimeType: Joi.string().allow("", null),
  tamano: Joi.number().min(0).allow(null),
});

const createOrden = Joi.object({
  vehiculo: mongoId.required(),
  tipo: Joi.string().valid("PREVENTIVO", "CORRECTIVO").required(),
  origen: Joi.string().valid(
    "ALERTA_PLAN",
    "NOVEDAD_PREOPERACIONAL",
    "MANUAL",
  ),
  plan: mongoId.allow(null),
  planItemId: mongoId.allow(null),
  planItemNombre: Joi.string().allow("", null),
  prioridad: Joi.string().valid("BAJA", "MEDIA", "ALTA", "URGENTE"),
  descripcion: Joi.string().required(),
  kilometraje: Joi.number().min(0).max(2000000).allow(null)
    .messages({
      "number.max":
        "El kilometraje no parece real (máximo 2.000.000 km). Verifique el dato.",
    }),
  mecanico: mongoId.allow(null),
  taller: Joi.string().allow("", null),
  fechaProgramada: Joi.date().allow(null),
  actividades: Joi.array().items(actividad),
  repuestos: Joi.array().items(repuesto),
  manoDeObra,
  factura: factura.allow(null),
});

const updateOrden = Joi.object({
  descripcion: Joi.string(),
  prioridad: Joi.string().valid("BAJA", "MEDIA", "ALTA", "URGENTE"),
  taller: Joi.string().allow("", null),
  fechaProgramada: Joi.date().allow(null),
  kilometraje: Joi.number().min(0).max(2000000).allow(null)
    .messages({
      "number.max":
        "El kilometraje no parece real (máximo 2.000.000 km). Verifique el dato.",
    }),
  actividades: Joi.array().items(actividad),
  repuestos: Joi.array().items(repuesto),
  manoDeObra,
});

const asignarOrden = Joi.object({
  mecanico: mongoId.allow(null),
  taller: Joi.string().allow("", null),
  fechaProgramada: Joi.date().allow(null),
});

const cerrarOrden = Joi.object({
  kilometraje: Joi.number().min(0).max(2000000)
    .messages({
      "number.max":
        "El kilometraje no parece real (máximo 2.000.000 km). Verifique el dato.",
    }),
  observacionesCierre: Joi.string().allow("", null),
  actividades: Joi.array().items(actividad),
  repuestos: Joi.array().items(repuesto),
  manoDeObra,
  taller: Joi.string().allow("", null),
  factura: factura.allow(null),
});

const anularOrden = Joi.object({
  motivo: Joi.string().allow("", null),
});

module.exports = {
  createPlan,
  updatePlan,
  createOrden,
  updateOrden,
  asignarOrden,
  cerrarOrden,
  anularOrden,
  facturaOrden: factura,
};
