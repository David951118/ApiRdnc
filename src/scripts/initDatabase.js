require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const mongoose = require("mongoose");
const Configuracion = require("../models/Configuracion");

/**
 * Script simplificado para inicializar configuraciones
 */
async function initDatabase() {
  try {
    console.log("\n🔧 Inicializando configuraciones...\n");

    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });

    console.log("✅ Conectado a MongoDB\n");

    // Crear configuraciones
    console.log("📝 Configuraciones:");

    const configs = [
      {
        clave: "sync_nuevos_interval",
        valor: 15,
        descripcion: "Minutos entre consultas nuevos",
      },
      {
        clave: "sync_todos_interval",
        valor: 24,
        descripcion: "Horas entre consultas todos",
      },
      {
        clave: "monitor_interval",
        valor: 60,
        descripcion: "Segundos entre monitoreo",
      },
      {
        clave: "report_interval",
        valor: 30,
        descripcion: "Segundos entre envío RMM",
      },
      {
        clave: "geocerca_radio",
        valor: 300,
        descripcion: "Radio geocerca (metros)",
      },
      { clave: "rmm_limite_horas", valor: 72, descripcion: "Horas límite RMM" },
    ];

    for (const config of configs) {
      await Configuracion.findOneAndUpdate({ clave: config.clave }, config, {
        upsert: true,
      });
      console.log(`   ✅ ${config.clave} = ${config.valor}`);
    }

    console.log("\n📊 Resumen:");
    console.log(
      `   - Configuraciones: ${await Configuracion.countDocuments()}`
    );

    console.log("\n✅ Configuraciones inicializadas\n");

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  }
}

initDatabase();
