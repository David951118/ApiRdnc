const mongoose = require("mongoose");

/**
 * Conecta a la base de datos MongoDB
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // Opciones recomendadas para evitar advertencias
    });

    console.log(`✅ MongoDB conectado: ${conn.connection.host}`);

    // Eventos de conexión
    mongoose.connection.on("connected", () => {
      console.log("📡 Mongoose conectado a la BD");
    });

    mongoose.connection.on("error", (err) => {
      console.error("❌ Error de conexión a MongoDB:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.log("📴 Mongoose desconectado");
    });

    // Manejo de cierre gracioso
    process.on("SIGINT", async () => {
      await mongoose.connection.close();
      console.log(
        "🔌 Conexión a MongoDB cerrada por terminación de la aplicación"
      );
      process.exit(0);
    });

    return conn;
  } catch (error) {
    console.error("❌ Error al conectar a MongoDB:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
