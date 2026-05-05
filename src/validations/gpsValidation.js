const Joi = require("joi");

const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);

// ─── Marca ───
const createMarca = Joi.object({
  nombre: Joi.string().trim().min(2).max(100).required(),
  descripcion: Joi.string().trim().allow("", null),
});
const updateMarca = createMarca.fork(["nombre"], (s) => s.optional());

// ─── Modelo ───
const createModelo = Joi.object({
  marca: objectId.required().messages({
    "string.pattern.base": "ID de marca inválido",
    "any.required": "marca es obligatoria",
  }),
  nombre: Joi.string().trim().min(1).max(100).required(),
  descripcion: Joi.string().trim().allow("", null),
});
const updateModelo = createModelo.fork(["marca", "nombre"], (s) => s.optional());

// ─── Ciudad ───
const createCiudad = Joi.object({
  nombre: Joi.string().trim().min(2).max(100).required(),
  departamento: Joi.string().trim().allow("", null),
  esCentral: Joi.boolean().optional(),
});
const updateCiudad = createCiudad.fork(["nombre"], (s) => s.optional());

// ─── Técnico ───
const createTecnico = Joi.object({
  nombres: Joi.string().trim().min(2).max(100).required(),
  apellidos: Joi.string().trim().min(2).max(100).required(),
  identificacion: Joi.string().trim().min(3).max(30).required(),
  telefono: Joi.string().trim().allow("", null),
  email: Joi.string().email().allow("", null),
  ciudad: objectId.required().messages({
    "string.pattern.base": "ID de ciudad inválido",
    "any.required": "ciudad es obligatoria",
  }),
  estado: Joi.string().valid("ACTIVO", "INACTIVO").optional(),
});
const updateTecnico = createTecnico.fork(
  ["nombres", "apellidos", "identificacion", "ciudad"],
  (s) => s.optional(),
);

// ─── Equipo GPS ───
const createEquipo = Joi.object({
  marca: objectId.required().messages({
    "string.pattern.base": "ID de marca inválido",
    "any.required": "marca es obligatoria",
  }),
  modelo: objectId.required().messages({
    "string.pattern.base": "ID de modelo inválido",
    "any.required": "modelo es obligatorio",
  }),
  imei: Joi.string()
    .trim()
    .min(8)
    .max(30)
    .required()
    .messages({ "any.required": "imei es obligatorio" }),
  serial: Joi.string().trim().allow("", null),
  idEquipo: Joi.string().trim().allow("", null),
  observaciones: Joi.string().trim().allow("", null),
  condicion: Joi.string().valid("NUEVO", "SEGUNDA").optional(),
  // Opcional: si no se manda, se ubica en la central (Pasto).
  ciudad: objectId.optional(),
});
const updateEquipo = Joi.object({
  marca: objectId.optional(),
  modelo: objectId.optional(),
  imei: Joi.string().trim().min(8).max(30).optional(),
  serial: Joi.string().trim().allow("", null),
  idEquipo: Joi.string().trim().allow("", null),
  observaciones: Joi.string().trim().allow("", null),
  condicion: Joi.string().valid("NUEVO", "SEGUNDA").optional(),
});

const enviarGarantia = Joi.object({
  proveedor: Joi.string().trim().allow("", null),
  motivo: Joi.string().trim().required().messages({
    "any.required": "motivo es obligatorio para enviar a garantía",
  }),
  observaciones: Joi.string().trim().allow("", null),
});

const recibirGarantia = Joi.object({
  // Si el proveedor reemplazó el equipo y vuelve uno distinto, opcionalmente
  // se puede registrar como SEGUNDA.
  marcarComoSegunda: Joi.boolean().optional(),
  observaciones: Joi.string().trim().allow("", null),
});

const enviarEquipo = Joi.object({
  ciudad: objectId.required().messages({
    "any.required": "ciudad de destino es obligatoria",
  }),
  tecnico: objectId.required().messages({
    "any.required": "tecnico es obligatorio",
  }),
  observaciones: Joi.string().trim().allow("", null),
});

const instalarEquipo = Joi.object({
  vehiculo: objectId.optional(),
  observaciones: Joi.string().trim().allow("", null),
});

const retirarEquipo = Joi.object({
  observaciones: Joi.string().trim().allow("", null),
});

const revisarEquipo = Joi.object({
  accion: Joi.string()
    .valid("REUSAR", "DEVOLVER_CENTRAL", "DESCARTAR")
    .required()
    .messages({
      "any.only":
        "accion debe ser REUSAR, DEVOLVER_CENTRAL o DESCARTAR",
      "any.required": "accion es obligatoria",
    }),
  tecnico: objectId.optional(), // si REUSAR puede reasignarse a un técnico
  ciudad: objectId.optional(), // si REUSAR puede ir a una ciudad
  observaciones: Joi.string().trim().allow("", null),
});

// ─── Actividades GPS ───
const TIPOS_ACTIVIDAD = [
  "INSTALACION_NUEVA",
  "HOMOLOGACION",
  "CAMBIO_2G_4G",
  "CAMBIO_CON_COSTO",
  "CAMBIO_SIN_COSTO",
  "CAMBIO_COMODATO",
  "PRUEBAS",
  "GARANTIA",
  "EQUIPO_DANADO",
];

const REQUIEREN_RETIRO = [
  "CAMBIO_2G_4G",
  "CAMBIO_CON_COSTO",
  "CAMBIO_SIN_COSTO",
  "CAMBIO_COMODATO",
  "GARANTIA",
  "PRUEBAS",
  "EQUIPO_DANADO",
];

// Sub-objeto para crear sobre la marcha un equipo retirado que no existía.
const equipoRetiradoNuevoSchema = Joi.object({
  imei: Joi.string().trim().min(8).max(30).required(),
  serial: Joi.string().trim().allow("", null),
  marca: objectId.required(),
  modelo: objectId.required(),
  tipoPropiedad: Joi.string().valid("PROPIO", "COMODATO").required(),
  propietarioNombre: Joi.string().trim().when("tipoPropiedad", {
    is: "PROPIO",
    then: Joi.required(),
    otherwise: Joi.optional().allow("", null),
  }),
});

const crearActividad = Joi.object({
  tipoActividad: Joi.string()
    .valid(...TIPOS_ACTIVIDAD)
    .required(),
  tecnico: objectId.required(),
  ciudad: objectId.required(),

  equipoInstalado: objectId.required().messages({
    "any.required": "equipoInstalado es obligatorio",
  }),

  // Para tipos que requieren retiro: o se manda equipoRetirado (id existente)
  // o equipoRetiradoNuevo (datos para auto-crear).
  equipoRetirado: objectId.optional(),
  equipoRetiradoNuevo: equipoRetiradoNuevoSchema.optional(),

  placaInstalada: Joi.string().trim().uppercase().min(3).max(20).required(),
  lineaSim: Joi.string().trim().allow("", null),
  numeroSim: Joi.string().trim().allow("", null),

  tipoPropiedad: Joi.string().valid("PROPIO", "COMODATO").required(),
  propietarioNombre: Joi.string().trim().when("tipoPropiedad", {
    is: "PROPIO",
    then: Joi.required().messages({
      "any.required": "propietarioNombre es obligatorio cuando tipoPropiedad=PROPIO",
    }),
    otherwise: Joi.optional().allow("", null),
  }),

  fechaActividad: Joi.date().optional(),
  observaciones: Joi.string().trim().allow("", null),
}).custom((value, helpers) => {
  // Si la actividad requiere retiro, debe haber equipoRetirado o equipoRetiradoNuevo.
  if (REQUIEREN_RETIRO.includes(value.tipoActividad)) {
    if (!value.equipoRetirado && !value.equipoRetiradoNuevo) {
      return helpers.error("any.invalid", {
        message: `tipoActividad=${value.tipoActividad} requiere equipoRetirado o equipoRetiradoNuevo`,
      });
    }
    if (value.equipoRetirado && value.equipoRetiradoNuevo) {
      return helpers.error("any.invalid", {
        message:
          "envíe equipoRetirado o equipoRetiradoNuevo, no ambos",
      });
    }
  }
  return value;
}, "validación condicional de equipo retirado");

const buscarEquipoQuery = Joi.object({
  imei: Joi.string().trim().min(3).optional(),
  serial: Joi.string().trim().min(3).optional(),
  idEquipo: Joi.string().trim().min(3).optional(),
}).or("imei", "serial", "idEquipo");

const enviarPaquete = Joi.object({
  equipos: Joi.array()
    .items(objectId.required())
    .min(1)
    .required()
    .messages({
      "array.min": "Debe enviar al menos un equipo",
      "any.required": "equipos es obligatorio",
    }),
  ciudad: objectId.required(),
  tecnico: objectId.required(),
  observaciones: Joi.string().trim().allow("", null),
});

const confirmarRecepcion = Joi.object({
  observaciones: Joi.string().trim().allow("", null),
});

const confirmarRecepcionPaquete = Joi.object({
  equipos: Joi.array()
    .items(objectId.required())
    .min(1)
    .required()
    .messages({
      "array.min": "Debe confirmar al menos un equipo",
      "any.required": "equipos es obligatorio",
    }),
  observaciones: Joi.string().trim().allow("", null),
});

module.exports = {
  createMarca,
  updateMarca,
  createModelo,
  updateModelo,
  createCiudad,
  updateCiudad,
  createTecnico,
  updateTecnico,
  createEquipo,
  updateEquipo,
  enviarEquipo,
  instalarEquipo,
  retirarEquipo,
  revisarEquipo,
  enviarGarantia,
  recibirGarantia,
  crearActividad,
  buscarEquipoQuery,
  enviarPaquete,
  confirmarRecepcion,
  confirmarRecepcionPaquete,
};
