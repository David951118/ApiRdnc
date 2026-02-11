const Preoperacional = require("../models/Preoperacional");
const { getVehicleScope } = require("../utils/dataScope");

exports.create = async (req, res) => {
  try {
    const check = new Preoperacional(req.body);
    await check.save();
    res.status(201).json(check);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getByVehiculo = async (req, res) => {
  try {
    const { vehiculoId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // Verificar Acceso (Scope)
    const roles = req.user.roles || [];
    const isAdmin = roles.some(
      (r) => r.includes("ADMIN") && !r.includes("CLIENTE"),
    );

    if (!isAdmin) {
      // Verificar si el usuario tiene permiso sobre este ID de vehículo
      const permitidos = req.session.vehiculosPermitidos || [];
      // Cellvi retorna { id: XYZ, placa: AAA123 } o { vehiculoId: XYZ ... }
      const tieneAcceso = permitidos.some(
        (v) => v.id == vehiculoId || v.vehiculoId == vehiculoId,
      );

      if (!tieneAcceso) {
        return res
          .status(403)
          .json({
            message:
              "No tiene permisos para ver preoperacionales de este vehículo",
          });
      }
    }

    const checks = await Preoperacional.find({ vehiculo: vehiculoId })
      .sort({ fecha: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate("conductor", "nombres apellidos");

    res.json(checks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    const check = await Preoperacional.findById(req.params.id)
      .populate("vehiculo")
      .populate("conductor");

    if (!check) return res.status(404).json({ message: "No encontrado" });

    // Validar acceso al vehículo del check
    const roles = req.user.roles || [];
    const isAdmin = roles.some(
      (r) => r.includes("ADMIN") && !r.includes("CLIENTE"),
    );

    if (!isAdmin && check.vehiculo) {
      const permitidos = req.session.vehiculosPermitidos || [];
      // Asumimos que check.vehiculo.placa existe si se pobló, si no check.vehiculo es el ID
      const placaVehiculo = check.vehiculo.placa;
      // Si no pobló placa (porque falla populate), validamos por ID

      const tieneAcceso = permitidos.some(
        (v) =>
          (placaVehiculo && v.placa === placaVehiculo) ||
          v.id == check.vehiculo._id ||
          v.vehiculoId == check.vehiculo._id,
      );

      if (!tieneAcceso)
        return res
          .status(403)
          .json({ message: "Acceso denegado a este registro." });
    }

    res.json(check);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update & Delete: Solo ADMIN
exports.update = async (req, res) => {
  try {
    const isAdmin = req.user.roles.some(
      (r) => r.includes("ADMIN") && !r.includes("CLIENTE"),
    );
    if (!isAdmin)
      return res
        .status(403)
        .json({ message: "Solo Administradores pueden editar." });

    const check = await Preoperacional.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true },
    );
    res.json(check);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const isAdmin = req.user.roles.some(
      (r) => r.includes("ADMIN") && !r.includes("CLIENTE"),
    );
    if (!isAdmin)
      return res
        .status(403)
        .json({ message: "Solo Administradores pueden eliminar." });

    await Preoperacional.findByIdAndDelete(req.params.id);
    res.json({ message: "Eliminado correctamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
