const User = require("../models/User");

// Crear Usuario
exports.create = async (req, res) => {
  try {
    const { role } = req.body;
    const currentUserRole = req.user.role; // Viene del token

    // Validar Jerarquía de Creación
    if (role === "SUPER_ADMIN" && currentUserRole !== "SUPER_ADMIN") {
      return res.status(403).json({
        success: false,
        error: "Permisos Insuficientes",
        message: "Solo un Super Admin puede crear otro Super Admin.",
      });
    }

    if (role === "ADMIN" && currentUserRole !== "SUPER_ADMIN") {
      return res.status(403).json({
        success: false,
        error: "Permisos Insuficientes",
        message: "Solo un Super Admin puede crear Administradores.",
      });
    }

    if (
      role === "USER" &&
      !["ADMIN", "SUPER_ADMIN"].includes(currentUserRole)
    ) {
      return res.status(403).json({
        success: false,
        error: "Permisos Insuficientes",
        message: "Debe ser al menos Admin para crear Usuarios.",
      });
    }

    const newUser = new User(req.body);
    newUser.createdBy = req.user._id;
    await newUser.save();

    // No devolver password
    const userResponse = newUser.toObject();
    delete userResponse.password;

    res.status(201).json({
      success: true,
      user: userResponse,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: "Usuario ya existe",
        message: "El username o email ya están registrados.",
      });
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

// Listar Usuarios (Solo Admins)
exports.getAll = async (req, res) => {
  try {
    const users = await User.find({}, "-password").sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
