require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});
const mongoose = require("mongoose");

/**
 * Test simple de conexión a MongoDB
 */
async function testConnection() {
  try {
    console.log("\n🔍 Probando conexión a MongoDB...\n");

    const uri = process.env.MONGODB_URI;
    console.log("URI (primeros 50 caracteres):", uri.substring(0, 50) + "...");
    console.log("URI length:", uri.length);

    // Intentar conectar
    console.log("\n⏳ Conectando...");
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });

    console.log("✅ ¡Conexión exitosa!\n");

    // Listar bases de datos
    const admin = mongoose.connection.db.admin();
    const { databases } = await admin.listDatabases();

    console.log("📊 Bases de datos disponibles:");
    databases.forEach((db) => {
      console.log(
        `   - ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`
      );
    });

    // Listar colecciones de la BD actual
    const collections = await mongoose.connection.db
      .listCollections()
      .toArray();
    console.log(
      `\n📁 Colecciones en la BD actual (${mongoose.connection.name}):`
    );
    if (collections.length === 0) {
      console.log("   (vacía - no hay colecciones)");
    } else {
      collections.forEach((col) => {
        console.log(`   - ${col.name}`);
      });
    }

    console.log("\n✅ Test completado\n");

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error de conexión:");
    console.error("   Mensaje:", error.message);
    console.error("   Código:", error.code);

    if (error.message.includes("bad auth")) {
      console.error("\n💡 Sugerencias:");
      console.error(
        "   1. Verifica que el usuario y contraseña sean correctos"
      );
      console.error(
        "   2. Si la contraseña tiene caracteres especiales, asegúrate de escaparlos"
      );
      console.error("      Ejemplo: @ = %40, # = %23, etc.");
      console.error(
        "   3. Verifica que el usuario tenga permisos en la base de datos"
      );
    }

    console.log();
    process.exit(1);
  }
}

testConnection();
