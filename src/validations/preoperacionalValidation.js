const Joi = require("joi");

// Ítem de revisión (común a todas las secciones del vehículo)
const itemRevision = Joi.object({
  estado: Joi.string()
    .valid("BUENO", "REGULAR", "MALO", "NO_APLICA")
    .required()
    .messages({
      "any.only": "estado debe ser BUENO, REGULAR, MALO o NO_APLICA",
      "any.required": "El estado del ítem es obligatorio",
    }),
  observaciones: Joi.string().allow("", null),
  fotoUrl: Joi.string().uri().allow("", null),
});

// Sección conductor (condiciones de salud y aptitud)
const seccionConductor = Joi.object({
  horasSueno: Joi.number().min(0).max(24).allow(null),
  selfieUrl: Joi.string().uri().allow("", null),
  selfieFecha: Joi.date().allow(null),
  estadoSalud: Joi.string()
    .valid("BUENO", "REGULAR", "MALO", "NO_APLICA")
    .allow(null),
  estadoSaludObservaciones: Joi.string().allow("", null),
  tomaMedicamentos: Joi.boolean().default(false),
  medicamentosDetalle: Joi.string().allow("", null),
  consumoSustancias: Joi.boolean().default(false),
  sustanciasDetalle: Joi.string().allow("", null),
}).optional();

// Sección delantera (niveles, fugas, llantas y luces frontales)
const seccionDelantera = Joi.object({
  luces: itemRevision,
  direccionalesDelanteros: itemRevision,
  limpiabrisas: itemRevision,
  parabrisas: itemRevision,
  llantaDelanteraDerecha: itemRevision,
  llantaDelanteraIzquierda: itemRevision,
  bocina: itemRevision,
  frenos: itemRevision,
  nivelAceiteMotor: itemRevision,
  nivelLiquidoFrenos: itemRevision,
  nivelAguaRadiador: itemRevision,
  estadoBateria: itemRevision,
  fugasLiquidos: itemRevision,
}).optional();

// Sección media (cabina, confort, seguridad pasiva, dirección/suspensión, carrocería)
const seccionMedia = Joi.object({
  tablero: itemRevision,
  timon: itemRevision,
  pedales: itemRevision,
  frenoMano: itemRevision,
  kitPrimerosAuxilios: itemRevision,
  reflectivos: itemRevision,
  aireAcondicionado: itemRevision,
  silleteria: itemRevision,
  nivelCombustible: itemRevision,
  pito: itemRevision,
  cinturonesSeguridad: itemRevision,
  airbags: itemRevision,
  vidrios: itemRevision,
  apoyacabezas: itemRevision,
  espejoIzquierdo: itemRevision,
  espejoDerecho: itemRevision,
  espejoRetrovisor: itemRevision,
  estadoDireccion: itemRevision,
  suspensionDelantera: itemRevision,
  suspensionTrasera: itemRevision,
  calcomanias: itemRevision,
  puertas: itemRevision,
}).optional();

// Sección trasera
const seccionTrasera = Joi.object({
  stop: itemRevision,
  llantasRepuesto: itemRevision,
  equipoCarretera: itemRevision,
  llantaTraseraDerecha: itemRevision,
  llantaTraseraIzquierda: itemRevision,
  direccionalesTraseros: itemRevision,
  placa: itemRevision,
  extintor: itemRevision,
  herramienta: itemRevision,
}).optional();

// Sección aseo
const seccionAseo = Joi.object({
  aseoInterno: itemRevision,
  aseoExterno: itemRevision,
  latas: itemRevision,
  pintura: itemRevision,
}).optional();

const createPreoperacional = Joi.object({
  vehiculo: Joi.string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      "string.pattern.base": "ID de vehículo inválido (ObjectId 24 caracteres)",
      "any.required": "El vehículo es obligatorio",
    }),

  conductor: Joi.string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      "string.pattern.base": "ID de conductor (tercero) inválido",
      "any.required": "El conductor es obligatorio",
    }),

  fecha: Joi.date().optional(),
  kilometraje: Joi.number().min(0).allow(null),

  seccionConductor,
  seccionDelantera,
  seccionMedia,
  seccionTrasera,
  seccionAseo,

  // estadoGeneral se calcula automáticamente en el pre-save
  estadoGeneral: Joi.string()
    .valid("APROBADO", "NOVEDAD", "RECHAZADO")
    .optional(),

  firmadoCheck: Joi.boolean().optional(),
  firmaConductorUrl: Joi.string().uri().allow("", null).optional(),

  // Creación delegada por un administrador de flota en nombre del conductor
  creadoPorAdmin: Joi.boolean().optional(),
  creadoPorUserId: Joi.string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .optional()
    .allow("", null)
    .messages({
      "string.pattern.base": "creadoPorUserId inválido (ObjectId 24 caracteres)",
    }),
});

const updatePreoperacional = createPreoperacional.fork(
  ["vehiculo", "conductor"],
  (schema) => schema.optional(),
);

module.exports = {
  createPreoperacional,
  updatePreoperacional,
};
