// Configuração do Firebase.
//
// - Testando no computador (localhost): usa o EMULADOR local (projeto "demo-agenda"),
//   nada vai para a internet.
// - Publicado no GitHub Pages: usa o projeto REAL. Na etapa de publicação, cole aqui
//   o firebaseConfig copiado do Console do Firebase (é normal ele ficar visível;
//   a segurança vem das regras do Firestore e do login).

export const firebaseConfigProducao = {
  apiKey: "AIzaSyB0mKF8tBkCOLhUAd8nNF5EJD-kUQhFZa8",
  authDomain: "agenda-consultorio-6a5cb.firebaseapp.com",
  projectId: "agenda-consultorio-6a5cb",
  storageBucket: "agenda-consultorio-6a5cb.firebasestorage.app",
  messagingSenderId: "650307684600",
  appId: "1:650307684600:web:61c1dd1755882b968b530d",
};

export const firebaseConfigEmulador = {
  apiKey: "demo-chave",
  authDomain: "demo-agenda.firebaseapp.com",
  projectId: "demo-agenda",
};
