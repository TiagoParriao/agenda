// Configuração do Firebase.
//
// - Testando no computador (localhost): usa o EMULADOR local (projeto "demo-agenda"),
//   nada vai para a internet.
// - Publicado no GitHub Pages: usa o projeto REAL. Na etapa de publicação, cole aqui
//   o firebaseConfig copiado do Console do Firebase (é normal ele ficar visível;
//   a segurança vem das regras do Firestore e do login).

export const firebaseConfigProducao = {
  apiKey: "COLE_AQUI",
  authDomain: "COLE_AQUI",
  projectId: "COLE_AQUI",
  storageBucket: "COLE_AQUI",
  messagingSenderId: "COLE_AQUI",
  appId: "COLE_AQUI",
};

export const firebaseConfigEmulador = {
  apiKey: "demo-chave",
  authDomain: "demo-agenda.firebaseapp.com",
  projectId: "demo-agenda",
};
