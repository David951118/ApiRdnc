const Tercero = require("../models/Tercero");

exports.create = async (req, res) => {
  try {
    const currentUserRoles = req.user.roles || [];
    const newRoles = req.body.roles || [];

    // Verificar si es CLIENTE_ADMIN (y no ADMIN)
    const isAdmin = currentUserRoles.some(
      (r) => r.includes("ADMIN") && !r.includes("CLIENTE"),
    );
    const isClienteAdmin = currentUserRoles.some((r) =>
      r.includes("CLIENTE_ADMIN"),
    );

    if (isClienteAdmin && !isAdmin) {
      // Restricción: No puede crear ADMINISTRATIVO ni otros ADMINS
      const forbiddenRoles = [
        "ADMINISTRATIVO",
        "ADMIN",
        "SUPER_ADMIN",
        "CLIENTE_ADMIN",
      ];
      const hasForbidden = newRoles.some((r) => forbiddenRoles.includes(r));

      if (hasForbidden) {
        return res.status(403).json({
          success: false,
          error: "Permisos Insuficientes",
          message:
            "Como Cliente Admin no puede crear roles Administrativos o de Admin.",
        });
      }
    }

    const tercero = new Tercero(req.body);

    // Si es Cliente Admin, amarrar el nuevo tercero a su empresa
    if (isClienteAdmin && !isAdmin && req.user.empresaId) {
      tercero.empresa = req.user.empresaId;
    }

    await tercero.save();
    res.status(201).json(tercero);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: "Duplicado",
        message: "Ya existe un tercero con esa identificación.",
      });
    }
    res.status(400).json({ message: error.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const { page = 1, limit = 50, search, rol } = req.query;
    const query = {};

    // --- SEGURIDAD Y ALCANCE (SCOPE) ---
    const currentUserRoles = req.user.roles || [];
    const isAdmin = currentUserRoles.some(
      (r) => r.includes("ADMIN") && !r.includes("CLIENTE"),
    );
    const isClienteAdmin = currentUserRoles.some((r) =>
      r.includes("CLIENTE_ADMIN"),
    );

    if (!isAdmin) {
      if (isClienteAdmin && req.user.empresaId) {
        // Un Cliente Admin ve a todos los de SU empresa
        query.empresa = req.user.empresaId;
      } else {
        // Un Conductor solo se ve a sí mismo
        if (req.user.terceroId) {
          query._id = req.user.terceroId;
        } else {
          query.usuarioCellvi = req.user.username;
        }
      }
    }

    if (search) {
      query.$text = { $search: search };
    }
    if (rol) {
      query.roles = rol;
    }

    const terceros = await Tercero.find(query)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Tercero.countDocuments(query);

    res.json({
      terceros,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    const { id } = req.params;
    let tercero;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      tercero = await Tercero.findById(id);
    } else {
      tercero = await Tercero.findOne({ identificacion: id });
    }

    if (!tercero)
      return res.status(404).json({ message: "Tercero no encontrado" });
    res.json(tercero);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getByEmpresa = async (req, res) => {
  try {
    const { empresaId } = req.params;

    // Validación de Seguridad: CLIENTE_ADMIN solo puede ver su propia empresa
    const currentUserRoles = req.user.roles || [];
    const isAdmin = currentUserRoles.some(
      (r) => r.includes("ADMIN") && !r.includes("CLIENTE"),
    );

    if (!isAdmin) {
      // Verificar si la empresa solicitada coincide con la del usuario logueado
      if (req.user.empresaId?.toString() !== empresaId) {
        return res
          .status(403)
          .json({
            message: "No tiene permisos para ver datos de esta empresa.",
          });
      }
    }

    const terceros = await Tercero.find({ empresa: empresaId });
    res.json(terceros);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getByUsuarioCellvi = async (req, res) => {
  try {
    const { usuarioCellvi } = req.params;

    // Seguridad: Un usuario normal solo puede consultar SU PROPIO usuarioCellvi
    const currentUserRoles = req.user.roles || [];
    const isAdmin = currentUserRoles.some(
      (r) => r.includes("ADMIN") && !r.includes("CLIENTE"),
    );

    if (!isAdmin && req.user.username !== usuarioCellvi) {
      return res
        .status(403)
        .json({ message: "No tiene permiso para consultar este usuario." });
    }

    const tercero = await Tercero.findOne({ usuarioCellvi }); // findOne porque es único
    if (!tercero)
      return res.status(404).json({ message: "Usuario no encontrado" });

    res.json(tercero);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserRoles = req.user.roles || [];
    const isClienteAdmin = currentUserRoles.some((r) =>
      r.includes("CLIENTE_ADMIN"),
    );
    const isAdmin = currentUserRoles.some(
      (r) => r.includes("ADMIN") && !r.includes("CLIENTE"),
    );

    // Validación de permisos para CLIENTE_ADMIN
    if (isClienteAdmin && !isAdmin) {
      const target = await Tercero.findById(id);
      if (!target)
        return res.status(404).json({ message: "Tercero no encontrado" });

      // No puede editar a sus superiores o iguales administrativos
      const protectedRoles = [
        "ADMIN",
        "SUPER_ADMIN",
        "ADMINISTRATIVO",
        "CLIENTE_ADMIN",
      ];
      const isProtected = target.roles.some((r) => protectedRoles.includes(r));

      if (isProtected) {
        return res.status(403).json({
          message: "No tiene permisos para editar este perfil de usuario.",
        });
      }
    }

    const tercero = await Tercero.findByIdAndUpdate(id, req.body, {
      new: true,
    });
    if (!tercero)
      return res.status(404).json({ message: "Tercero no encontrado" });
    res.json(tercero);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserRoles = req.user.roles || [];
    const isClienteAdmin = currentUserRoles.some((r) =>
      r.includes("CLIENTE_ADMIN"),
    );
    const isAdmin = currentUserRoles.some(
      (r) => r.includes("ADMIN") && !r.includes("CLIENTE"),
    );

    // Validación de permisos para CLIENTE_ADMIN
    if (isClienteAdmin && !isAdmin) {
      const target = await Tercero.findById(id);
      if (!target)
        return res.status(404).json({ message: "Tercero no encontrado" });

      const protectedRoles = [
        "ADMIN",
        "SUPER_ADMIN",
        "ADMINISTRATIVO",
        "CLIENTE_ADMIN",
      ];
      const isProtected = target.roles.some((r) => protectedRoles.includes(r));

      if (isProtected) {
        return res.status(403).json({
          message: "No tiene permisos para eliminar este perfil de usuario.",
        });
      }
    }

    const tercero = await Tercero.findByIdAndDelete(id);
    if (!tercero)
      return res.status(404).json({ message: "Tercero no encontrado" });
    res.json({ message: "Tercero eliminado" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
