const { MongoClient } = require("mongodb");
const fs = require("fs");

const ATLAS_URI =
  "mongodb+srv://dsmontes95_db_user:yP96tcDcVJBD6o4i@cluster0.xfrdfum.mongodb.net/?appName=Cluster0";
const COLLECTIONS = [
  "configuracions",
  "manifiestos",
  "registrormms",
  "rndclogs",
  "asignaciones",
];

async function exportData() {
  console.log("🚀 Exportando datos de Atlas...");
  const client = new MongoClient(ATLAS_URI);
  const data = {};

  try {
    await client.connect();
    const db = client.db();

    for (const col of COLLECTIONS) {
      console.log(`Leyendo ${col}...`);
      data[col] = await db.collection(col).find({}).toArray();
      console.log(`  - ${data[col].length} documentos.`);
    }

    fs.writeFileSync("atlas-dump.json", JSON.stringify(data, null, 2));
    console.log("✅ Archivo atlas-dump.json creado exitosamente.");
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

exportData();
