// Ambiente de testes local: liga o emulador do Firebase, serve o site e cria os dados de teste.
//   npm run dev   ->  site em http://127.0.0.1:5000   |   painel do emulador em http://127.0.0.1:4000
// Os dados do emulador somem quando ele é desligado (Ctrl+C) e voltam aos dados de teste no próximo "npm run dev".
import { spawn } from "node:child_process";
import { semear } from "./seed-emulador.mjs";

const FIREBASE_TOOLS = "firebase-tools@15.37.0";

const emulador = spawn(
  "npx",
  ["--yes", FIREBASE_TOOLS, "emulators:start", "--project", "demo-agenda"],
  { stdio: "inherit", shell: true }
);
emulador.on("exit", (codigo) => process.exit(codigo ?? 0));

async function esperar(url, limiteMs = 180_000) {
  const inicio = Date.now();
  while (Date.now() - inicio < limiteMs) {
    try { await fetch(url); return; } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`O emulador não respondeu em ${url}`);
}

try {
  await esperar("http://127.0.0.1:9099/");
  await esperar("http://127.0.0.1:8080/");
  await esperar("http://127.0.0.1:5000/");
  await semear();
  console.log("👉 Abra o site em http://127.0.0.1:5000  (Ctrl+C para desligar)\n");
} catch (e) {
  console.error(e);
}
