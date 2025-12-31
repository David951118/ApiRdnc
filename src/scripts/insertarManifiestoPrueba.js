require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});
const mongoose = require("mongoose");
const Manifiesto = require("../models/Manifiesto");

/**
 * Script para insertar manifiesto de prueba
 * Basado en respuesta real del RNDC
 */
async function insertarManifiestoPrueba() {
  try {
    console.log("\n📝 Insertando manifiesto de prueba...\n");

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Conectado a MongoDB\n");

    // Datos del manifiesto real
    const manifiestoData = {
      ingresoidManifiesto: "111689831",
      numManifiesto: "000010749",
      nitEmpresaTransporte: "9005081044",
      placa: "GTY872",
      fechaExpedicion: new Date("2025-11-28"),
      estado: "activo",
      puntosControl: [
        {
          codigoPunto: 1,
          codigoMunicipio: "19142000",
          direccion: "KM 7 VIA SANTANDER CALOTO",
          latitud: 3.05398,
          longitud: -76.43338,
          radio: 300,
          // Ajustar fecha de cita a HOY para poder probar
          fechaCita: new Date(), // Hoy
          horaCita: "14:00", // 2 PM
          tiempoPactado: 240,
          estado: "pendiente",
          ajuste: false,
        },
        {
          codigoPunto: 2,
          codigoMunicipio: "25286000",
          direccion:
            "PARQUE INDUSTRIAL SAN DIEGO KM1.5 VIA FUNZA SIBERIA-BODEGA H6",
          latitud: 4.72192,
          longitud: -74.19599,
          radio: 300,
          // Mañana
          fechaCita: new Date(Date.now() + 24 * 60 * 60 * 1000),
          horaCita: "08:00",
          tiempoPactado: 240,
          estado: "pendiente",
          ajuste: false,
        },
      ],
      datosOriginales: {
        ingresoidmanifiesto: "111689831",
        numnitempresatransporte: "9005081044",
        fechaexpedicionmanifiesto: "28/11/2025",
        codigoempresa: "3486",
        nummanifiestocarga: "000010749",
        numplaca: "GTY872",
      },
    };

    // Insertar o actualizar
    const manifiesto = await Manifiesto.findOneAndUpdate(
      { ingresoidManifiesto: manifiestoData.ingresoidManifiesto },
      manifiestoData,
      { upsert: true, new: true }
    );

    console.log("✅ Manifiesto insertado/actualizado:");
    console.log(`   ID: ${manifiesto.ingresoidManifiesto}`);
    console.log(`   Número: ${manifiesto.numManifiesto}`);
    console.log(`   Placa: ${manifiesto.placa}`);
    console.log(`   Estado: ${manifiesto.estado}`);
    console.log(`\n   Puntos de control:`);

    manifiesto.puntosControl.forEach((p, idx) => {
      console.log(`   ${idx + 1}. Código ${p.codigoPunto}: ${p.direccion}`);
      console.log(`      Coords: ${p.latitud}, ${p.longitud}`);
      console.log(
        `      Fecha cita: ${p.fechaCita.toLocaleDateString()} ${p.horaCita}`
      );
      console.log(`      Estado: ${p.estado}`);
    });

    console.log(
      `\n📊 Total manifiestos en BD: ${await Manifiesto.countDocuments()}`
    );
    console.log("\n✅ Listo para pruebas\n");

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

insertarManifiestoPrueba();
