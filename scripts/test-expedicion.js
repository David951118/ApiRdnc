/**
 * Prueba unitaria rápida del módulo de expedición RNDC (sin red, sin bd).
 * Uso: node scripts/test-expedicion.js
 */
require("dotenv").config();
const assert = require("assert");
const crypto = require("../src/utils/credencialCrypto");
const svc = require("../src/services/expedicionService");

let ok = 0;
function prueba(nombre, fn) {
  try {
    fn();
    ok++;
    console.log(`  ✔ ${nombre}`);
  } catch (e) {
    console.error(`  ✘ ${nombre}: ${e.message}`);
    process.exitCode = 1;
  }
}

console.log("— Cifrado de credenciales —");
prueba("roundtrip cifrar/descifrar", () => {
  const enc = crypto.cifrar("MiClave123*");
  assert.strictEqual(crypto.descifrar(enc), "MiClave123*");
});
prueba("cifrado no determinista (IV aleatorio)", () => {
  assert.notStrictEqual(crypto.cifrar("x"), crypto.cifrar("x"));
});
prueba("descifrar valor corrupto falla limpio", () => {
  assert.throws(() => crypto.descifrar("basura-sin-formato"));
});

console.log("— Construcción de XML del diccionario —");
prueba("variables en mayúsculas y escapadas", () => {
  const xml = svc.construirVariablesXML({
    numnitempresatransporte: "900301001",
    DESCRIPCION: "Trigo <blanco> & maiz",
  });
  assert.ok(xml.includes("<NUMNITEMPRESATRANSPORTE>900301001</NUMNITEMPRESATRANSPORTE>"));
  assert.ok(xml.includes("Trigo &lt;blanco&gt; &amp; maiz"));
});
prueba("omite vacíos, null y undefined", () => {
  const xml = svc.construirVariablesXML({ A: "", B: null, C: undefined, D: "1" });
  assert.ok(!xml.includes("<A>") && !xml.includes("<B>") && !xml.includes("<C>"));
  assert.ok(xml.includes("<D>1</D>"));
});
prueba("bloque REMESASMAN según guía oficial", () => {
  const bloque = svc.construirBloqueRemesas(["0001", "0020"]);
  assert.ok(bloque.includes('procesoid="43"'));
  assert.strictEqual(bloque.split("<REMESA>").length, 3);
  assert.ok(bloque.includes("<CONSECUTIVOREMESA>0001</CONSECUTIVOREMESA>"));
});

console.log(`\n${ok} pruebas OK${process.exitCode ? " (con fallos)" : ""}`);
