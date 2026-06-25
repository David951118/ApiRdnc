const Repuesto = require("../models/Repuesto");
const MovimientoInventario = require("../models/MovimientoInventario");
const logger = require("../config/logger");

/**
 * Servicio de inventario: única vía para mover stock.
 * Actualiza el stock de forma atómica ($inc) y deja registro en el kardex.
 */

/**
 * Registra un movimiento de inventario y actualiza el stock.
 *
 * @param {Object} datos - { repuesto, tipo, cantidad, costoUnitario?, ordenTrabajo?,
 *                           vehiculo?, placa?, motivo?, usuario, empresa? }
 * @returns {Promise<MovimientoInventario>}
 *
 * Reglas:
 *  - ENTRADA: stock += cantidad. Si trae costoUnitario, actualiza el último costo.
 *  - SALIDA:  stock -= cantidad. Se permite stock negativo (no bloquea el cierre
 *             de una OT), pero queda warning en logs para corregir con AJUSTE.
 *  - AJUSTE:  stock = cantidad (inventario físico).
 */
async function registrarMovimiento(datos) {
  const repuesto = await Repuesto.findOne({
    _id: datos.repuesto,
    deletedAt: null,
  });
  if (!repuesto) {
    throw new Error("Repuesto no encontrado");
  }

  const stockAnterior = repuesto.stock;
  let stockNuevo;
  const update = {};

  switch (datos.tipo) {
    case "ENTRADA":
      stockNuevo = stockAnterior + datos.cantidad;
      update.$inc = { stock: datos.cantidad };
      if (datos.costoUnitario > 0) {
        update.$set = { costoUnitario: datos.costoUnitario };
      }
      break;

    case "SALIDA":
      stockNuevo = stockAnterior - datos.cantidad;
      update.$inc = { stock: -datos.cantidad };
      if (stockNuevo < 0) {
        logger.warn(
          `[Inventario] Stock negativo para ${repuesto.nombre}: ${stockNuevo}. ` +
            `Corregir con un AJUSTE de inventario.`,
        );
      }
      break;

    case "AJUSTE":
      stockNuevo = datos.cantidad;
      update.$set = { stock: datos.cantidad };
      break;

    default:
      throw new Error(`Tipo de movimiento inválido: ${datos.tipo}`);
  }

  await Repuesto.updateOne({ _id: repuesto._id }, update);

  const movimiento = await MovimientoInventario.create({
    repuesto: repuesto._id,
    tipo: datos.tipo,
    cantidad: datos.cantidad,
    costoUnitario: datos.costoUnitario ?? repuesto.costoUnitario ?? 0,
    stockAnterior,
    stockNuevo,
    ordenTrabajo: datos.ordenTrabajo || null,
    vehiculo: datos.vehiculo || null,
    placa: datos.placa || null,
    motivo: datos.motivo || null,
    usuario: datos.usuario,
    empresa: datos.empresa ?? repuesto.empresa ?? null,
  });

  return movimiento;
}

/**
 * Descuenta del inventario los repuestos de una OT cerrada.
 * Solo procesa entradas del array repuestos que traigan repuestoId
 * (las de texto libre no afectan stock).
 */
async function consumirRepuestosDeOT(ot, usuario) {
  const resultados = [];
  for (const item of ot.repuestos || []) {
    if (!item.repuestoId) continue;
    try {
      const mov = await registrarMovimiento({
        repuesto: item.repuestoId,
        tipo: "SALIDA",
        cantidad: item.cantidad || 1,
        costoUnitario: item.costoUnitario || 0,
        ordenTrabajo: ot._id,
        vehiculo: ot.vehiculo,
        placa: ot.placa,
        motivo: `Consumo en ${ot.numero}`,
        usuario,
        empresa: ot.empresa,
      });
      resultados.push(mov);
    } catch (error) {
      // No bloquear el cierre de la OT por un repuesto inválido
      logger.error(
        `[Inventario] Error consumiendo repuesto ${item.nombre} en ${ot.numero}: ${error.message}`,
      );
    }
  }
  return resultados;
}

module.exports = { registrarMovimiento, consumirRepuestosDeOT };
