require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});
const mongoose = require("mongoose");
const Manifiesto = require("../models/Manifiesto");

/**
 * Script simplificado para insertar manifiestos de prueba
 * Los inserta sin validación, luego el servicio de asignación los procesará
 */

const manifestosPrueba = [
  {
    ingresoidManifiesto: "112071237",
    numManifiesto: "BOGPA120",
    nitEmpresaTransporte: "9014151507",
    placa: "UPR738",
    fechaExpedicion: new Date("2025-12-09"),
    vehiculoAsignado: false,
    esMonitoreable: false,
    motivoNoMonitoreable: "Pendiente de validación",
    estado: "activo",
    puntosControl: [
      {
        codigoPunto: 1,
        codigoMunicipio: "11001000",
        direccion: "DG 21 BIS 70  42",
        latitud: 4.6534647,
        longitud: -74.1237146,
        radio: 300,
        fechaCita: new Date("2025-12-09"),
        horaCita: "11:08",
        tiempoPactado: 120,
        estado: "pendiente",
      },
      {
        codigoPunto: 2,
        codigoMunicipio: "8001000",
        direccion: "DIRECCIÓN CALLE 42  46   227 BARRIO ABAJO",
        latitud: 10.9887454,
        longitud: -74.7820646,
        radio: 300,
        fechaCita: new Date("2025-12-12"),
        horaCita: "11:08",
        tiempoPactado: 120,
        estado: "pendiente",
      },
    ],
  },
  {
    ingresoidManifiesto: "112073610",
    numManifiesto: "BOGPA122",
    nitEmpresaTransporte: "9014151507",
    placa: "LGL594",
    fechaExpedicion: new Date("2025-12-09"),
    vehiculoAsignado: false,
    esMonitoreable: false,
    motivoNoMonitoreable: "Pendiente de validación",
    estado: "activo",
    puntosControl: [
      {
        codigoPunto: 1,
        codigoMunicipio: "11001000",
        direccion: "DG 21 BIS 70  42",
        latitud: 4.6534647,
        longitud: -74.1237146,
        radio: 300,
        fechaCita: new Date("2025-12-09"),
        horaCita: "11:55",
        tiempoPactado: 120,
        estado: "pendiente",
      },
      {
        codigoPunto: 2,
        codigoMunicipio: "68001000",
        direccion: "CARRERA 16 9 31 BARRIO COMUNEROS",
        latitud: 7.1365623,
        longitud: -73.1328371,
        radio: 300,
        fechaCita: new Date("2025-12-12"),
        horaCita: "11:55",
        tiempoPactado: 120,
        estado: "pendiente",
      },
    ],
  },
  {
    ingresoidManifiesto: "112073912",
    numManifiesto: "BOGPA121",
    nitEmpresaTransporte: "9014151507",
    placa: "JSL850",
    fechaExpedicion: new Date("2025-12-09"),
    vehiculoAsignado: false,
    esMonitoreable: false,
    motivoNoMonitoreable: "Pendiente de validación",
    estado: "activo",
    puntosControl: [
      {
        codigoPunto: 1,
        codigoMunicipio: "11001000",
        direccion: "DG 21 BIS 70  42",
        latitud: 4.6534647,
        longitud: -74.1237146,
        radio: 300,
        fechaCita: new Date("2025-12-09"),
        horaCita: "11:39",
        tiempoPactado: 240,
        estado: "pendiente",
      },
      {
        codigoPunto: 2,
        codigoMunicipio: "76892000",
        direccion: "CARRERA 32 9 69 BODEGA 9 CONJUNTO INDUSTRIAL GLEA",
        latitud: 3.5109,
        longitud: -76.5216,
        radio: 300,
        fechaCita: new Date("2025-12-12"),
        horaCita: "11:39",
        tiempoPactado: 240,
        estado: "pendiente",
      },
    ],
  },
  {
    ingresoidManifiesto: "112075325",
    numManifiesto: "BOGPA123",
    nitEmpresaTransporte: "9014151507",
    placa: "LUN646",
    fechaExpedicion: new Date("2025-12-09"),
    vehiculoAsignado: false,
    esMonitoreable: false,
    motivoNoMonitoreable: "Pendiente de validación",
    estado: "activo",
    puntosControl: [
      {
        codigoPunto: 1,
        codigoMunicipio: "11001000",
        direccion: "DG 21 BIS 70  42",
        latitud: 4.6534647,
        longitud: -74.1237146,
        radio: 300,
        fechaCita: new Date("2025-12-09"),
        horaCita: "12:18",
        tiempoPactado: 240,
        estado: "pendiente",
      },
      {
        codigoPunto: 2,
        codigoMunicipio: "17001000",
        direccion: "CRA  25  24 42",
        latitud: 5.0743694,
        longitud: -75.5081167,
        radio: 300,
        fechaCita: new Date("2025-12-12"),
        horaCita: "12:18",
        tiempoPactado: 240,
        estado: "pendiente",
      },
    ],
  },
  {
    ingresoidManifiesto: "112077261",
    numManifiesto: "BOGPA124",
    nitEmpresaTransporte: "9014151507",
    placa: "EYX387",
    fechaExpedicion: new Date("2025-12-09"),
    vehiculoAsignado: false,
    esMonitoreable: false,
    motivoNoMonitoreable: "Pendiente de validación",
    estado: "activo",
    puntosControl: [
      {
        codigoPunto: 1,
        codigoMunicipio: "11001000",
        direccion: "DG 21 BIS 70  42",
        latitud: 4.6534647,
        longitud: -74.1237146,
        radio: 300,
        fechaCita: new Date("2025-12-09"),
        horaCita: "12:55",
        tiempoPactado: 120,
        estado: "pendiente",
      },
      {
        codigoPunto: 2,
        codigoMunicipio: "63001000",
        direccion: "CALLE 21 NO  28 41 BARRIO SAN JOSÉ ARMENIA Q",
        latitud: 4.5411344,
        longitud: -75.6861832,
        radio: 300,
        fechaCita: new Date("2025-12-12"),
        horaCita: "12:55",
        tiempoPactado: 120,
        estado: "pendiente",
      },
    ],
  },
];

async function insertarManifiestos() {
  try {
    console.log("\n📝 INSERTANDO MANIFIESTOS DE PRUEBA\n");
    console.log("=".repeat(60));

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Conectado a MongoDB\n");

    let nuevos = 0;
    let actualizados = 0;

    for (const manifiesto of manifestosPrueba) {
      const resultado = await Manifiesto.findOneAndUpdate(
        { ingresoidManifiesto: manifiesto.ingresoidManifiesto },
        manifiesto,
        { upsert: true, new: true, rawResult: true }
      );

      if (resultado.lastErrorObject.upserted) {
        nuevos++;
        console.log(
          `✅ Nuevo: ${manifiesto.numManifiesto} (${manifiesto.placa})`
        );
      } else {
        actualizados++;
        console.log(
          `🔄 Actualizado: ${manifiesto.numManifiesto} (${manifiesto.placa})`
        );
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("Resumen:");
    console.log(`  Total: ${manifestosPrueba.length}`);
    console.log(`  ✅ Nuevos: ${nuevos}`);
    console.log(`  🔄 Actualizados: ${actualizados}`);
    console.log("=".repeat(60));

    console.log("\n✅ Manifiestos insertados exitosamente");
    console.log(
      "💡 Ejecuta el servicio de asignación para validar y asignar vehículos\n"
    );

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

insertarManifiestos();
