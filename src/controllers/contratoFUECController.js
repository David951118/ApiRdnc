const ContratoFuec = require("../models/ContratoFUEC");
const Vehiculo = require("../models/Vehiculo");
const Ruta = require("../models/Ruta");
const Documento = require("../models/Documento");
const logger = require("../config/logger");

function getRoles(req) {
  const rolesUpper = (req.user?.roles || []).map((r) => r.toUpperCase());
  return {
    isAdmin: rolesUpper.includes("ADMIN"),
    isClienteAdmin: rolesUpper.includes("CLIENTE_ADMIN"),
  };
}

// Helper: obtener IDs de vehiculos permitidos para no-admins
async function getVehiculosScope(req) {
  const permitidos = req.session?.vehiculosPermitidos || [];
  if (!permitidos.length) return null; // sin acceso
  const placas = permitidos.map((v) => v.placa);
  const vehiculos = await Vehiculo.find({ placa: { $in: placas } })
    .select("_id")
    .lean();
  return vehiculos.map((v) => v._id);
}

/**
 * Crear Contrato FUEC (ADMIN o CLIENTE_ADMIN)
 *
 * Lógica de Ruta flexible:
 *  - Si body.ruta es un OBJETO  → se crea la ruta inline y se vincula
 *  - Si body.ruta es un STRING  → usa ID de ruta existente
 *  - Sin ruta                   → contrato sin ruta
 *
 * datosSnapshot se auto-construye desde documentos ya cargados del vehículo y conductor.
 * Si el usuario envía datosSnapshot manual, sus campos tienen PRIORIDAD sobre los del sistema.
 */
exports.create = async (req, res) => {
  try {
    const { isAdmin, isClienteAdmin } = getRoles(req);
    if (!isAdmin && !isClienteAdmin) {
      return res.status(403).json({
        success: false,
        message: "No tiene permisos para generar contratos",
      });
    }

    const body = { ...req.body };

    // 1. Ruta inline
    if (body.ruta && typeof body.ruta === "object" && !body.ruta._id) {
      try {
        const nuevaRuta = new Ruta(body.ruta);
        nuevaRuta.creadoPor = req.user?.userId || null;
        if (isClienteAdmin && !isAdmin && req.user?.empresaId) {
          nuevaRuta.empresa = req.user.empresaId;
        }
        await nuevaRuta.save();
        body.ruta = nuevaRuta._id;
      } catch (rutaErr) {
        return res.status(400).json({
          success: false,
          message: `Error creando ruta inline: ${rutaErr.message}`,
        });
      }
    }

    // 2. Auto-construir datosSnapshot desde documentos existentes del vehículo/conductor
    if (body.vehiculo || body.conductorPrincipal) {
      // Documentos vigentes/por vencer del vehículo
      const docsVehiculo = body.vehiculo
        ? await Documento.find({
            entidadId: body.vehiculo,
            entidadModelo: "Vehiculo",
            deletedAt: null,
            estado: { $in: ["VIGENTE", "POR_VENCER"] },
          })
            .sort({ fechaVencimiento: -1 })
            .lean()
        : [];

      // Licencia del conductor principal
      const docsConductor = body.conductorPrincipal
        ? await Documento.find({
            entidadId: body.conductorPrincipal,
            entidadModelo: "Tercero",
            tipoDocumento: "LICENCIA_CONDUCCION",
            deletedAt: null,
            estado: { $in: ["VIGENTE", "POR_VENCER"] },
          })
            .sort({ fechaVencimiento: -1 })
            .lean()
        : [];

      // Mapear el más reciente de cada tipo
      const byType = {};
      [...docsVehiculo, ...docsConductor].forEach((d) => {
        if (!byType[d.tipoDocumento]) byType[d.tipoDocumento] = d;
      });

      // Construir snapshot automático
      const autoSnapshot = {};

      if (byType["SOAT"]) {
        const d = byType["SOAT"];
        autoSnapshot.soat = {
          numero: d.numero,
          vigencia: d.fechaVencimiento,
          aseguradora: d.entidadEmisora,
        };
      }
      if (byType["TECNOMECANICA"]) {
        const d = byType["TECNOMECANICA"];
        autoSnapshot.tecnomecanica = {
          numero: d.numero,
          vigencia: d.fechaVencimiento,
          cda: d.entidadEmisora,
        };
      }
      if (byType["POLIZA_RCE"]) {
        const d = byType["POLIZA_RCE"];
        autoSnapshot.rce = {
          numero: d.numero,
          vigencia: d.fechaVencimiento,
          aseguradora: d.entidadEmisora,
        };
      }
      if (byType["POLIZA_RCC"]) {
        const d = byType["POLIZA_RCC"];
        autoSnapshot.rcc = {
          numero: d.numero,
          vigencia: d.fechaVencimiento,
          aseguradora: d.entidadEmisora,
        };
      }
      if (byType["TARJETA_OPERACION"]) {
        const d = byType["TARJETA_OPERACION"];
        autoSnapshot.tarjetaOperacion = {
          numero: d.numero,
          vigencia: d.fechaVencimiento,
        };
      }
      if (byType["LICENCIA_CONDUCCION"]) {
        const d = byType["LICENCIA_CONDUCCION"];
        autoSnapshot.licenciaConductor = {
          numero: d.numero,
          vigencia: d.fechaVencimiento,
        };
      }

      // Merge: el snapshot manual del usuario tiene prioridad campo a campo
      body.datosSnapshot = Object.assign(
        {},
        autoSnapshot,
        body.datosSnapshot || {},
      );
    }

    // 3. Crear contrato
    const contrato = new ContratoFuec(body);
    contrato.creadoPor = req.user?.userId || null;
    await contrato.save();

    const populated = await ContratoFuec.findById(contrato._id)
      .populate("vehiculo", "placa numeroInterno")
      .populate("conductorPrincipal", "nombres apellidos")
      .populate("contratante", "razonSocial nombres apellidos")
      .populate("ruta");

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    logger.error(`Error creando contrato: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

// Listar contratos
exports.getAll = async (req, res) => {
  try {
    const { page = 1, limit = 20, estado, includeDeleted = false } = req.query;
    const { isAdmin, isClienteAdmin } = getRoles(req);

    const query = {};

    if (!includeDeleted || includeDeleted === "false") {
      query.deletedAt = null;
    }

    if (!isAdmin) {
      if (isClienteAdmin && req.user.empresaId) {
        // CLIENTE_ADMIN: vehículos de su empresa
        const vehiculos = await Vehiculo.find({
          empresaAfiliadora: req.user.empresaId,
        })
          .select("_id")
          .lean();
        query.vehiculo = { $in: vehiculos.map((v) => v._id) };
      } else {
        // CLIENTE normal: solo sus vehículos permitidos
        const ids = await getVehiculosScope(req);
        if (!ids || ids.length === 0) {
          return res.json({
            success: true,
            data: [],
            pagination: { page: 1, limit: parseInt(limit), total: 0, pages: 0 },
          });
        }
        query.vehiculo = { $in: ids };
      }
    }

    if (estado) query.estado = estado;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const contratos = await ContratoFuec.find(query)
      .sort({ consecutivo: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .populate("contratante", "razonSocial nombres apellidos")
      .populate("vehiculo", "placa numeroInterno")
      .populate("conductorPrincipal", "nombres apellidos")
      .lean();

    const total = await ContratoFuec.countDocuments(query);

    res.json({
      success: true,
      data: contratos,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error(`Error listando contratos: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Obtener uno por ID
exports.getOne = async (req, res) => {
  try {
    const { isAdmin, isClienteAdmin } = getRoles(req);

    const contrato = await ContratoFuec.findOne({
      _id: req.params.id,
      deletedAt: null,
    })
      .populate("contratante")
      .populate("vehiculo")
      .populate("conductorPrincipal")
      .populate("conductoresAuxiliares")
      .populate("ruta");

    if (!contrato)
      return res
        .status(404)
        .json({ success: false, message: "Contrato no encontrado" });

    if (!isAdmin) {
      if (isClienteAdmin) {
        // Verificar que el vehículo pertenece a su empresa
        if (
          contrato.vehiculo?.empresaAfiliadora?.toString() !==
          req.user.empresaId?.toString()
        ) {
          return res.status(403).json({
            success: false,
            message: "No tiene acceso a este contrato",
          });
        }
      } else {
        // CLIENTE: verificar contra sus vehículos permitidos
        const permitidos = req.session?.vehiculosPermitidos || [];
        const tieneAcceso = permitidos.some(
          (v) => v.placa === contrato.vehiculo?.placa,
        );
        if (!tieneAcceso)
          return res.status(403).json({
            success: false,
            message: "No tiene acceso a este contrato",
          });
      }
    }

    res.json({ success: true, data: contrato });
  } catch (error) {
    logger.error(`Error obteniendo contrato: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Actualizar (ADMIN o CLIENTE_ADMIN)
exports.update = async (req, res) => {
  try {
    const { isAdmin, isClienteAdmin } = getRoles(req);
    if (!isAdmin && !isClienteAdmin)
      return res.status(403).json({
        success: false,
        message: "No tiene permisos para editar contratos",
      });

    const contrato = await ContratoFuec.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!contrato)
      return res
        .status(404)
        .json({ success: false, message: "Contrato no encontrado" });

    Object.assign(contrato, req.body);
    await contrato.save();
    res.json({ success: true, data: contrato });
  } catch (error) {
    logger.error(`Error actualizando contrato: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

// Soft Delete (ADMIN o CLIENTE_ADMIN)
exports.softDelete = async (req, res) => {
  try {
    const { isAdmin, isClienteAdmin } = getRoles(req);
    if (!isAdmin && !isClienteAdmin)
      return res.status(403).json({
        success: false,
        message: "No tiene permisos para eliminar contratos",
      });

    const contrato = await ContratoFuec.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!contrato)
      return res
        .status(404)
        .json({ success: false, message: "Contrato no encontrado" });

    await contrato.softDelete(req.user?.userId || null);
    res.json({
      success: true,
      message: "Contrato eliminado temporalmente",
      data: contrato,
    });
  } catch (error) {
    logger.error(`Error soft-delete contrato: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Restaurar (ADMIN o CLIENTE_ADMIN)
exports.restore = async (req, res) => {
  try {
    const { isAdmin, isClienteAdmin } = getRoles(req);
    if (!isAdmin && !isClienteAdmin)
      return res.status(403).json({
        success: false,
        message: "No tiene permisos para restaurar contratos",
      });

    const contrato = await ContratoFuec.findById(req.params.id);
    if (!contrato)
      return res
        .status(404)
        .json({ success: false, message: "Contrato no encontrado" });
    if (!contrato.deletedAt)
      return res
        .status(400)
        .json({ success: false, message: "El contrato no está eliminado" });

    await contrato.restore();
    res.json({ success: true, message: "Contrato restaurado", data: contrato });
  } catch (error) {
    logger.error(`Error restaurando contrato: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Hard Delete (Solo ADMIN)
exports.hardDelete = async (req, res) => {
  try {
    const contrato = await ContratoFuec.findByIdAndDelete(req.params.id);
    if (!contrato)
      return res
        .status(404)
        .json({ success: false, message: "Contrato no encontrado" });
    res.json({ success: true, message: "Contrato eliminado permanentemente" });
  } catch (error) {
    logger.error(`Error hard-delete contrato: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};
