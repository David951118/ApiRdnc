/**
 * Prueba E2E del módulo de EXPEDICIÓN contra el AMBIENTE DE PRUEBAS oficial
 * del RNDC (plc.mintransporte.gov.co), con la credencial real de la empresa.
 *
 * Uso:
 *   node scripts/probar-expedicion-e2e.js setup        # empresa + credencial + verificación
 *   node scripts/probar-expedicion-e2e.js tercero      # proceso 11 (conductor + remitente + destinatario)
 *   node scripts/probar-expedicion-e2e.js vehiculo     # proceso 12
 *   node scripts/probar-expedicion-e2e.js remesa       # proceso 3
 *   node scripts/probar-expedicion-e2e.js manifiesto   # proceso 4
 *   node scripts/probar-expedicion-e2e.js aceptacion   # proceso 73
 *   node scripts/probar-expedicion-e2e.js anular-manifiesto
 *   node scripts/probar-expedicion-e2e.js anular-remesa
 *
 * El estado (consecutivos, ids locales) se guarda en scripts/.e2e-state.json
 * para encadenar fases. Credencial vía variables de entorno:
 *   E2E_RNDC_USER / E2E_RNDC_PASS / E2E_RNDC_NIT  (solo para 'setup')
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const Empresa = require("../src/models/Empresa");
const CredencialRndc = require("../src/models/CredencialRndc");
const { cifrar } = require("../src/utils/credencialCrypto");
const svc = require("../src/services/expedicionService");
const RemesaExpedida = require("../src/models/RemesaExpedida");
const ManifiestoExpedido = require("../src/models/ManifiestoExpedido");

const STATE_FILE = path.join(__dirname, ".e2e-state.json");
const NIT_EMPRESA = process.env.E2E_RNDC_NIT || "9018560564";
// NIT que se envía al RNDC en NUMNITEMPRESATRANSPORTE: SIN dígito de
// verificación (el RNDC rechaza el NIT con DV — error VEH005)
const NIT_WS = process.env.E2E_RNDC_NIT_WS || "901856056";

function leerEstado() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}
function guardarEstado(patch) {
  const estado = { ...leerEstado(), ...patch };
  fs.writeFileSync(STATE_FILE, JSON.stringify(estado, null, 2));
  return estado;
}

/** dd/mm/aaaa */
function fecha(diasDesdeHoy = 0) {
  const d = new Date(Date.now() + diasDesdeHoy * 86400000);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

// ── Datos REALES del cliente (Las Marías) para prueba en producción ──
const CONDUCTOR = {
  CODTIPOIDTERCERO: "C",
  NUMIDTERCERO: "98343988",
  NOMIDTERCERO: "JAIME HERNANDO",
  PRIMERAPELLIDOIDTERCERO: "ARTEAGA",
  SEGUNDOAPELLIDOIDTERCERO: "CORAL",
  NUMTELEFONOCONTACTO: "3122286094",
  NOMENCLATURADIRECCION: "MZ 6 CS 18 B COLINAS DE NORTE",
  CODMUNICIPIORNDC: "52356000", // Ipiales
  CODCATEGORIALICENCIACONDUCCION: "C2",
  NUMLICENCIACONDUCCION: "98343988",
  FECHAVENCIMIENTOLICENCIA: fecha(365),
};

// Remitente/destinatario: la misma persona natural con dos sedes, para no
// tocar el maestro del NIT de la empresa. Sedes numéricas según guía V5.
const REMITENTE = {
  CODTIPOIDTERCERO: "C",
  NUMIDTERCERO: "98343988",
  NOMIDTERCERO: "JAIME HERNANDO",
  PRIMERAPELLIDOIDTERCERO: "ARTEAGA",
  SEGUNDOAPELLIDOIDTERCERO: "CORAL",
  CODSEDETERCERO: "1",
  NOMSEDETERCERO: "PRINCIPAL IPIALES",
  NUMTELEFONOCONTACTO: "3122286094",
  NOMENCLATURADIRECCION: "MZ 6 CS 18 B COLINAS DE NORTE",
  CODMUNICIPIORNDC: "52356000", // Ipiales
};

const DESTINATARIO = {
  CODTIPOIDTERCERO: "C",
  NUMIDTERCERO: "98343988",
  NOMIDTERCERO: "JAIME HERNANDO",
  PRIMERAPELLIDOIDTERCERO: "ARTEAGA",
  SEGUNDOAPELLIDOIDTERCERO: "CORAL",
  CODSEDETERCERO: "2",
  NOMSEDETERCERO: "BODEGA PASTO",
  NUMTELEFONOCONTACTO: "3122286094",
  NOMENCLATURADIRECCION: "CALLE 18 25 30 CENTRO",
  CODMUNICIPIORNDC: "52001000", // Pasto
};

const VEHICULO = {
  NUMPLACA: "JZX281",
  CODCONFIGURACIONUNIDADCARGA: "2", // camión rígido 2 ejes
  CODMARCAVEHICULOCARGA: "1", // Chevrolet
  CODLINEAVEHICULOCARGA: "373",
  ANOFABRICACIONVEHICULOCARGA: "2014",
  CODTIPOCOMBUSTIBLE: "1",
  PESOVEHICULOVACIO: "4500",
  CODTIPOCARROCERIA: "0",
  CODTIPOIDPROPIETARIO: "C",
  NUMIDPROPIETARIO: "98343988",
  CODTIPOIDTENEDOR: "C",
  NUMIDTENEDOR: "98343988",
  NUMSEGUROSOAT: "SOAT123456789",
  FECHAVENCIMIENTOSOAT: fecha(180),
  NUMNITASEGURADORASOAT: "8600096786", // Seguros del Estado
};

function variablesRemesa() {
  return {
    // El ejemplo oficial usa CODOPERACIONTRANSPORTE numérico y
    // CODNATURALEZACARGA G (carga general) en la remesa
    CODOPERACIONTRANSPORTE: "1",
    CODNATURALEZACARGA: "G",
    CANTIDADCARGADA: "5000",
    UNIDADMEDIDACAPACIDAD: "1", // kilogramos
    CODTIPOEMPAQUE: "10",
    MERCANCIAREMESA: "000201",
    DESCRIPCIONCORTAPRODUCTO: "VIVERES VARIOS PRUEBA",
    CODTIPOIDREMITENTE: REMITENTE.CODTIPOIDTERCERO,
    NUMIDREMITENTE: REMITENTE.NUMIDTERCERO,
    CODSEDEREMITENTE: REMITENTE.CODSEDETERCERO,
    CODTIPOIDDESTINATARIO: DESTINATARIO.CODTIPOIDTERCERO,
    NUMIDDESTINATARIO: DESTINATARIO.NUMIDTERCERO,
    CODSEDEDESTINATARIO: DESTINATARIO.CODSEDETERCERO,
    CODTIPOIDPROPIETARIO: REMITENTE.CODTIPOIDTERCERO,
    NUMIDPROPIETARIO: REMITENTE.NUMIDTERCERO,
    CODSEDEPROPIETARIO: REMITENTE.CODSEDETERCERO,
    HORASPACTOCARGA: "4",
    MINUTOSPACTOCARGA: "0",
    HORASPACTODESCARGUE: "3",
    MINUTOSPACTODESCARGUE: "0",
  };
}

function variablesManifiesto(consecutivoRemesa) {
  return {
    CODOPERACIONTRANSPORTE: "G",
    FECHAEXPEDICIONMANIFIESTO: fecha(0),
    CODMUNICIPIOORIGENMANIFIESTO: "52356000", // Ipiales
    CODMUNICIPIODESTINOMANIFIESTO: "52001000", // Pasto
    CODIDTITULARMANIFIESTO: "C",
    NUMIDTITULARMANIFIESTO: "98343988",
    NUMPLACA: VEHICULO.NUMPLACA,
    CODIDCONDUCTOR: CONDUCTOR.CODTIPOIDTERCERO,
    NUMIDCONDUCTOR: CONDUCTOR.NUMIDTERCERO,
    VALORFLETEPACTADOVIAJE: "1800000",
    RETENCIONICAMANIFIESTOCARGA: "3", // por mil (ejemplo oficial)
    VALORANTICIPOMANIFIESTO: "0",
    CODMUNICIPIOPAGOSALDO: "52356000", // Ipiales
    FECHAPAGOSALDOMANIFIESTO: fecha(8),
    CODRESPONSABLEPAGOCARGUE: "E",
    CODRESPONSABLEPAGODESCARGUE: "E",
    ACEPTACIONELECTRONICA: "SI",
    OBSERVACIONES: "PRUEBA INTEGRACION CELLVI",
  };
}

function imprimir(titulo, resultado) {
  console.log(`\n═══ ${titulo} ═══`);
  const { remesa, manifiesto, ...resto } = resultado || {};
  console.log(JSON.stringify(resto, null, 2));
  if (remesa) console.log(`(remesa local: ${remesa._id} estado=${remesa.estado})`);
  if (manifiesto) console.log(`(manifiesto local: ${manifiesto._id} estado=${manifiesto.estado})`);
}

async function main() {
  const fase = process.argv[2];
  if (!fase) {
    console.error("Indique la fase: setup|tercero|vehiculo|remesa|manifiesto|aceptacion|anular-manifiesto|anular-remesa");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const estado = leerEstado();

  if (fase === "setup") {
    const usuario = process.env.E2E_RNDC_USER;
    const pass = process.env.E2E_RNDC_PASS;
    if (!usuario || !pass) {
      console.error("Defina E2E_RNDC_USER y E2E_RNDC_PASS en el entorno");
      process.exit(1);
    }
    const empresa = await Empresa.findOneAndUpdate(
      { nit: NIT_EMPRESA },
      {
        $setOnInsert: {
          nit: NIT_EMPRESA,
          razonSocial: "LAS MARIAS S.A.S.",
          nombreComercial: "Las Marías",
        },
      },
      { upsert: true, new: true },
    );
    console.log(`Empresa: ${empresa._id} (${empresa.razonSocial})`);

    // E2E_RNDC_MODO=prod → producción real (el ambiente de pruebas del RNDC
    // usa una foto vieja de producción donde no existen estos usuarios)
    const modoPruebas = process.env.E2E_RNDC_MODO !== "prod";
    await CredencialRndc.findOneAndUpdate(
      { empresa: empresa._id },
      {
        $set: {
          nitEmpresaTransporte: NIT_WS,
          usuarioWS: usuario,
          passwordCifrada: cifrar(pass),
          modoPruebas,
          estado: "ACTIVA",
        },
        $setOnInsert: { creadoPor: "e2e-script" },
      },
      { upsert: true, new: true },
    );
    console.log(`Credencial guardada (modoPruebas=${modoPruebas})`);
    guardarEstado({ empresaId: String(empresa._id) });

    const verif = await svc.verificarCredencial(empresa._id);
    imprimir("VERIFICACION CREDENCIAL", verif);
  }

  const empresaId = leerEstado().empresaId;
  if (!empresaId && fase !== "setup") {
    console.error("Ejecute primero la fase 'setup'");
    process.exit(1);
  }

  if (fase === "tercero") {
    imprimir("TERCERO CONDUCTOR", await svc.registrarTercero(empresaId, CONDUCTOR, "e2e"));
    imprimir("TERCERO REMITENTE (sede 01)", await svc.registrarTercero(empresaId, REMITENTE, "e2e"));
    imprimir("TERCERO DESTINATARIO (sede 02)", await svc.registrarTercero(empresaId, DESTINATARIO, "e2e"));
  }

  if (fase === "vehiculo") {
    imprimir("VEHICULO", await svc.registrarVehiculo(empresaId, VEHICULO, "e2e"));
  }

  if (fase === "remesa") {
    const consecutivo = process.argv[3] || `CLV${Date.now().toString().slice(-8)}`;
    const r = await svc.expedirRemesa(empresaId, consecutivo, variablesRemesa(), "e2e");
    imprimir(`REMESA ${consecutivo}`, r);
    if (r.success) guardarEstado({ consecutivoRemesa: consecutivo, remesaId: String(r.remesa._id) });
  }

  if (fase === "manifiesto") {
    const st = leerEstado();
    if (!st.consecutivoRemesa) {
      console.error("No hay remesa radicada en el estado. Corra la fase 'remesa' primero.");
      process.exit(1);
    }
    const num = process.argv[3] || `MCLV${Date.now().toString().slice(-8)}`;
    const r = await svc.expedirManifiesto(
      empresaId,
      num,
      [st.consecutivoRemesa],
      variablesManifiesto(st.consecutivoRemesa),
      "e2e",
    );
    imprimir(`MANIFIESTO ${num}`, r);
    if (r.success) guardarEstado({ numManifiesto: num, manifiestoId: String(r.manifiesto._id) });
  }

  if (fase === "aceptacion") {
    const st = leerEstado();
    imprimir("CONSULTA ACEPTACION", await svc.consultarAceptacion(empresaId, st.manifiestoId));
  }

  if (fase === "anular-manifiesto") {
    const st = leerEstado();
    imprimir(
      "ANULAR MANIFIESTO",
      await svc.anularManifiesto(empresaId, st.manifiestoId, "Prueba de integracion - anulacion controlada", "e2e"),
    );
  }

  if (fase === "anular-remesa") {
    const st = leerEstado();
    imprimir(
      "ANULAR REMESA",
      await svc.anularRemesa(empresaId, st.remesaId, "Prueba de integracion - anulacion controlada", "e2e"),
    );
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
