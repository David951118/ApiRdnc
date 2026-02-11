const ContratoFuec = require("../models/ContratoFUEC");
const { getVehicleScope } = require("../utils/dataScope");

exports.create = async (req, res) => {
  try {
    const canManage = req.user.roles.some((r) => r.includes("ADMIN"));
    if (!canManage) {
      return res
        .status(403)
        .json({ message: "No tiene permisos para generar contratos" });
    }

    const contrato = new ContratoFuec(req.body);
    contrato.creadoPor = req.user ? req.user._id : null;
    await contrato.save();
    res.status(201).json(contrato);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    // Filtro de Seguridad (Scope)
    const scopeQuery = getVehicleScope(req);
    // Nota: El helper retorna { placa: ... }.
    // Pero ContratoFUEC no tiene 'placa' directo, tiene 'vehiculo' (Ref).
    // Si queremos filtrar contratos por scope, necesitamos poblar o filtrar por ID de vehículo si el helper nos diera IDs.
    // Como el helper da PLACAS, debemos hacer un truco:
    // 1. O buscar los IDs de esos vehículos.
    // 2. O filtrar en memoria (malo).
    // SOLUCIÓN RAPIDA: Si el user es CLIENTE, filtramos por la lista de placas en session.

    let query = {};
    const isAdmin = req.user.roles.some(
      (r) => r.includes("ADMIN") && !r.includes("CLIENTE"),
    );

    if (!isAdmin) {
      // Obtenemos los IDs de los vehículos permitidos desde Session
      const permitidos = req.session.vehiculosPermitidos || [];
      const idsPermitidos = permitidos.map((v) => v.id || v.vehiculoId); // IDs de Cellvi??

      // PROBLEMA: ContratoFUEC guarda _id de Mongo de la colección Vehiculos.
      // Cellvi nos da IDs de Cellvi.
      // Debemos buscar los Contratos donde el vehículo tenga una PLACA permitida.
      // Esto requiere un aggregate o 2 pasos.
      // Paso 1: Buscar Vehículos Mongo que coincidan con las placas permitidas
      if (permitidos.length > 0) {
        const placas = permitidos.map((v) => v.placa);
        // Esto es ineficiente pero seguro: Buscar IDs de vehiculos locales
        const Vehiculo = require("../models/Vehiculo");
        const misVehiculos = await Vehiculo.find({
          placa: { $in: placas },
        }).select("_id");
        const misVehiculosIds = misVehiculos.map((v) => v._id);

        query.vehiculo = { $in: misVehiculosIds };
      } else {
        return res.json([]); // No tiene carros asignados
      }
    }

    const contratos = await ContratoFuec.find(query)
      .sort({ consecutivo: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate("contratante", "razonSocial")
      .populate("vehiculo", "placa");

    res.json(contratos);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    const contrato = await ContratoFuec.findById(req.params.id)
      .populate("contratante")
      .populate("vehiculo") // Trae placa
      .populate("conductorPrincipal")
      .populate("ruta");

    if (!contrato)
      return res.status(404).json({ message: "Contrato no encontrado" });

    // Validar acceso
    const isAdmin = req.user.roles.some(
      (r) => r.includes("ADMIN") && !r.includes("CLIENTE"),
    );
    if (!isAdmin) {
      const permitidos = req.session.vehiculosPermitidos || [];
      const tieneAcceso = permitidos.some(
        (v) => v.placa === contrato.vehiculo?.placa,
      );

      if (!tieneAcceso)
        return res
          .status(403)
          .json({ message: "No tiene acceso a este contrato" });
    }

    res.json(contrato);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const canManage = req.user.roles.some((r) => r.includes("ADMIN"));
    if (!canManage)
      return res.status(403).json({ message: "No tiene permisos" });

    const contrato = await ContratoFuec.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true },
    );
    res.json(contrato);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const canManage = req.user.roles.some((r) => r.includes("ADMIN"));
    if (!canManage)
      return res.status(403).json({ message: "No tiene permisos" });

    await ContratoFuec.findByIdAndDelete(req.params.id);
    res.json({ message: "Contrato eliminado" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
