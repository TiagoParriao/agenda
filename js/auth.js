// Login, logout, "esqueci minha senha" e acompanhamento do perfil da usuária.
import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { auth, db } from "./firebase.js";

const MENSAGENS = {
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/wrong-password": "E-mail ou senha incorretos.",
  "auth/user-not-found": "E-mail ou senha incorretos.",
  "auth/invalid-email": "Esse e-mail não parece válido.",
  "auth/missing-password": "Digite a senha.",
  "auth/missing-email": "Digite o e-mail.",
  "auth/user-disabled": "Essa conta foi desativada. Fale com o administrador.",
  "auth/too-many-requests": "Muitas tentativas. Espere alguns minutos e tente de novo.",
  "auth/network-request-failed": "Sem conexão com a internet.",
};

export function mensagemDeErro(erro) {
  return MENSAGENS[erro?.code] || "Não deu certo. Tente de novo.";
}

export function entrar(email, senha) {
  return signInWithEmailAndPassword(auth, email.trim(), senha);
}

export function sair() {
  return signOut(auth);
}

export function esqueciSenha(email) {
  return sendPasswordResetEmail(auth, email.trim());
}

/**
 * Acompanha a sessão. Chama `aoMudar` com um destes estados:
 *  { estado: "deslogado" }
 *  { estado: "bloqueado" }                 conta sem cadastro em "usuarios" ou desativada
 *  { estado: "logado", perfil }            perfil = { uid, nome, email, papel, ativo }
 *  { estado: "erro", erro }
 * O perfil é observado em tempo real: se o admin desativar a conta, a pessoa sai na hora.
 */
export function observarSessao(aoMudar) {
  let pararPerfil = null;
  let foiBloqueada = false;

  onAuthStateChanged(auth, (user) => {
    if (pararPerfil) { pararPerfil(); pararPerfil = null; }
    if (!user) {
      aoMudar({ estado: foiBloqueada ? "bloqueado" : "deslogado" });
      foiBloqueada = false;
      return;
    }

    pararPerfil = onSnapshot(
      doc(db, "usuarios", user.uid),
      { includeMetadataChanges: true },
      (snap) => {
        const dados = snap.data();
        const liberada = dados?.ativo === true;
        // O cache do aparelho pode estar velho: só bloqueia depois de confirmar com o servidor.
        // (Se estiver liberada no cache, entra — é o que permite ver a agenda sem internet.)
        if (!liberada && snap.metadata.fromCache) return;
        if (!liberada) {
          foiBloqueada = true;
          signOut(auth); // dispara onAuthStateChanged(null) -> estado "bloqueado"
          return;
        }
        aoMudar({ estado: "logado", perfil: { uid: user.uid, email: user.email, ...dados } });
      },
      (erro) => aoMudar({ estado: "erro", erro })
    );
  });
}
