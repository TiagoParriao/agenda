// Inicializa o Firebase (app, autenticação e banco) uma única vez.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  initializeFirestore,
  connectFirestoreEmulator,
  persistentLocalCache,
  persistentMultipleTabManager,
  terminate,
  clearIndexedDbPersistence,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firebaseConfigProducao, firebaseConfigEmulador } from "./firebase-config.js";

const host = location.hostname;
export const usandoEmulador = host === "localhost" || host === "127.0.0.1";

export const configurado =
  usandoEmulador || !Object.values(firebaseConfigProducao).includes("COLE_AQUI");

export const app = initializeApp(usandoEmulador ? firebaseConfigEmulador : firebaseConfigProducao);

export const auth = getAuth(app);
auth.languageCode = "pt-BR"; // e-mail de "esqueci minha senha" em português

// Cache local persistente: a agenda já carregada continua visível sem internet.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

if (usandoEmulador) {
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
}

/** Apaga a cópia local da agenda (cache do Firestore). Depois disso a página precisa ser recarregada. */
export async function apagarDadosLocais() {
  await terminate(db);
  await clearIndexedDbPersistence(db);
}
