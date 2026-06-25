const Repuesto = require("../models/Repuesto");
const MovimientoInventario = require("../models/MovimientoInventario");
const inventarioService = require("../services/inventarioService");
const logger = require("../config/logger");

function esAdmin(req) {
  return (req.user.roles || []).some((r) =>
    ["ROLE_ADMIN", "ROLE_SUPER_ADMIN", "ADMIN", "SUPER_ADMIN"].includes(r),
  );
}

function scopeEmpresa(req, filtro = {}) {
  if (!esAdmin(req) && req.user.empresaId) {
    filtro.empresa = req.user.empresaId;
  }
  return filtro;
}

// ═══════════════════ REPUESTOS (catálogo) ═══════════════════

exports.crearRepuesto = async (req, res) => {
  try {
    const repuesto = new Repuesto({
      ...req.body,
      empresa: esAdmin(req) ? req.body.empresa || null : req.user.empresaId,
      creadoPor: req.user.username,
    });
    await repuesto.save();

    // Stock inicial: registrar como ENTRADA para que el kardex cuadre
    if (req.body.stockInicial > 0) {
      repuesto.stock = 0; // el movimiento lo lleva al valor real
      await Repuesto.updateOne({ _id: repuesto._id }, { $set: { stock: 0 } });
      await inventarioService.registrarMovimiento({
        repuesto: repuesto._id,
        tipo: "ENTRADA",
        cantidad: req.body.stockInicial,
        costoUnitario: req.body.costoUnitario || 0,
        motivo: "Stock inicial",
        usuario: req.user.username,
        empresa: repuesto.empresa,
      });
      repuesto.stock = req.body.stockInicial;
    }

    res.status(201).json({ success: true, data: repuesto });
  } catch (error) {
    logger.error(`Error creando repuesto: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listarRepuestos = async (req, res) => {
  try {
    const { q, categoria, bajoStock, activo, page = 1, limit = 50 } = req.query;

    const filtro = scopeEmpresa(req, { deletedAt: null });
    if (q) {
      filtro.$or = [
        { nombre: new RegExp(q, "i") },
        { codigo: new RegExp(q, "i") },
      ];
    }
    if (categoria) filtro.categoria = categoria.toUpperCase();
    if (activo) filtro.activo = activo === "true";
    if (bajoStock === "true") {
      filtro.$expr = { $lte: ["$stock", "$stockMinimo"] };
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));

    const [repuestos, total] = await Promise.all([
      Repuesto.find(filtro)
        .populate("proveedor", "nombres apellidos razonSocial")
        .sort({ nombre: 1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Repuesto.countDocuments(filtro),
    ]);

    res.json({
      success: true,
      data: repuestos,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    logger.error(`Error listando repuestos: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.obtenerRepuesto = async (req, res) => {
  try {
    const repuesto = await Repuesto.findOne({
      _id: req.params.id,
      deletedAt: null,
    })
      .populate("proveedor", "nombres apellidos razonSocial")
      .lean();

    if (!repuesto)
      return res
        .status(404)
        .json({ success: false, message: "Repuesto no encontrado" });

    res.json({ success: true, data: repuesto });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.actualizarRepuesto = async (req, res) => {
  try {
    // El stock NO se edita aquí: solo vía movimientos
    delete req.body.stock;

    const repuesto = await Repuesto.findOneAndUpdate(
      scopeEmpresa(req, { _id: req.params.id, deletedAt: null }),
      { $set: req.body },
      { new: true, runValidators: true },
    );

    if (!repuesto)
      return res
        .status(404)
        .json({ success: false, message: "Repuesto no encontrado" });

    res.json({ success: true, data: repuesto });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.eliminarRepuesto = async (req, res) => {
  try {
    const repuesto = await Repuesto.findOne(
      scopeEmpresa(req, { _id: req.params.id, deletedAt: null }),
    );
    if (!repuesto)
      return res
        .status(404)
        .json({ success: false, message: "Repuesto no encontrado" });

    await repuesto.softDelete(req.user.userId);
    res.json({ success: true, message: "Repuesto eliminado" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ═══════════════════ MOVIMIENTOS (kardex) ═══════════════════

exports.crearMovimiento = async (req, res) => {
  try {
    const movimiento = await inventarioService.registrarMovimiento({
      ...req.body,
      usuario: req.user.username,
      empresa: esAdmin(req) ? req.body.empresa || null : req.user.empresaId,
    });

    res.status(201).json({ success: true, data: movimiento });
  } catch (error) {
    logger.error(`Error registrando movimiento: ${error.message}`);
    const status = error.message === "Repuesto no encontrado" ? 404 : 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

exports.listarMovimientos = async (req, res) => {
  try {
    const {
      repuesto,
      tipo,
      vehiculo,
      ordenTrabajo,
      desde,
      hasta,
      page = 1,
      limit = 50,
    } = req.query;

    const filtro = scopeEmpresa(req, {});
    if (repuesto) filtro.repuesto = repuesto;
    if (tipo) filtro.tipo = tipo;
    if (vehiculo) filtro.vehiculo = vehiculo;
    if (ordenTrabajo) filtro.ordenTrabajo = ordenTrabajo;
    if (desde || hasta) {
      filtro.createdAt = {};
      if (desde) filtro.createdAt.$gte = new Date(desde);
      if (hasta) filtro.createdAt.$lte = new Date(hasta);
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));

    const [movimientos, total] = await Promise.all([
      MovimientoInventario.find(filtro)
        .populate("repuesto", "nombre codigo unidad")
        .populate("ordenTrabajo", "numero")
        .populate("vehiculo", "placa")
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      MovimientoInventario.countDocuments(filtro),
    ]);

    res.json({
      success: true,
      data: movimientos,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    logger.error(`Error listando movimientos: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ═══════════════════ ALERTAS Y CONSUMOS ═══════════════════

/**
 * GET /api/inventario/alertas-stock
 * Repuestos activos con stock en o por debajo del mínimo.
 */
exports.alertasStock = async (req, res) => {
  try {
    const filtro = scopeEmpresa(req, {
      deletedAt: null,
      activo: true,
      $expr: { $lte: ["$stock", "$stockMinimo"] },
    });

    const repuestos = await Repuesto.find(filtro).sort({ stock: 1 }).lean();

    res.json({ success: true, total: repuestos.length, data: repuestos });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/inventario/consumos?vehiculo=&anio=
 * Consumo de repuestos (SALIDAS) agrupado por vehículo y año.
 */
exports.consumos = async (req, res) => {
  try {
    const match = { tipo: "SALIDA" };
    if (!esAdmin(req) && req.user.empresaId) {
      const mongoose = require("mongoose");
      match.empresa = new mongoose.Types.ObjectId(req.user.empresaId);
    }
    if (req.query.vehiculo) {
      const mongoose = require("mongoose");
      match.vehiculo = new mongoose.Types.ObjectId(req.query.vehiculo);
    }
    if (req.query.anio) {
      const anio = parseInt(req.query.anio);
      match.createdAt = {
        $gte: new Date(anio, 0, 1),
        $lt: new Date(anio + 1, 0, 1),
      };
    }

    const consumos = await MovimientoInventario.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            vehiculo: "$vehiculo",
            placa: "$placa",
            anio: { $year: "$createdAt" },
          },
          movimientos: { $sum: 1 },
          cantidadTotal: { $sum: "$cantidad" },
          costoTotal: {
            $sum: { $multiply: ["$cantidad", "$costoUnitario"] },
          },
        },
      },
      { $sort: { "_id.anio": -1, costoTotal: -1 } },
    ]);

    res.json({
      success: true,
      data: consumos.map((c) => ({
        vehiculo: c._id.vehiculo,
        placa: c._id.placa,
        anio: c._id.anio,
        movimientos: c.movimientos,
        cantidadTotal: c.cantidadTotal,
        costoTotal: c.costoTotal,
      })),
    });
  } catch (error) {
    logger.error(`Error consultando consumos: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};
