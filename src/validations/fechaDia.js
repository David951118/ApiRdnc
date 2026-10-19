const Joi = require("joi");
const { fechaSoloDia } = require("../utils/rangoFechas");

/**
 * Joi.date() para campos que son solo un día ("2026-10-20"). Joi.date() los
 * dejaba a medianoche UTC y en Colombia se veían como el día anterior; aquí
 * se anclan al mediodía colombiano (ver rangoFechas.fechaSoloDia).
 */
const fechaDia = Joi.date().custom((valor) => fechaSoloDia(valor), "día colombiano");

module.exports = fechaDia;
