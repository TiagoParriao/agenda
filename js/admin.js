// Operações que só o admin faz: configuração da clínica, agendas (profissionais) e usuárias.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  initializeAuth, inMemoryPersistence, connectAuthEmulator, createUserWithEmailAndPassword, signOut,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  doc, collection, onSnapshot, setDoc, updateDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { app, db, usandoEmulador } from "./firebase.js";
import { exigirInternet, normalizar } from "./agenda.js";

// ---------------------------------------------------------------- clínica

// mergeFields: troca só os campos enviados, e cada um inteiro (um dia desmarcado no horário
// precisa sumir; com "merge" comum o Firestore misturaria o horário novo com o antigo).
const soEstesCampos = (campos) => ({ mergeFields: Object.keys(campos) });

export async function salvarConfig(campos) {
  exigirInternet();
  await setDoc(doc(db, "config", "clinica"), campos, soEstesCampos(campos));
}

// ---------------------------------------------------------------- profissionais

/** ID a partir do nome ("Dra. Nayara" -> "dra-nayara"), sem repetir os existentes. */
export function idParaProfissional(nome, existentes) {
  const base = normalizar(nome).replace(/ /g, "-").slice(0, 30) || "agenda";
  let id = base, n = 2;
  while (existentes.includes(id)) id = `${base}-${n++}`;
  return id;
}

export async function salvarProfissional(id, campos) {
  exigirInternet();
  await setDoc(doc(db, "profissionais", id), campos, soEstesCampos(campos));
}

// ---------------------------------------------------------------- usuárias

export function observarUsuarias(aoMudar, aoErro) {
  return onSnapshot(collection(db, "usuarios"), (s) => {
    aoMudar(s.docs
      .map((d) => ({ uid: d.id, ...d.data() }))
      .sort((a, b) => (b.ativo === true) - (a.ativo === true) || String(a.nome).localeCompare(String(b.nome))));
  }, aoErro);
}

// Uma segunda "instância" do Firebase, só na memória, para criar a conta nova
// sem desconectar o admin (criar conta normalmente já faz login nela).
let authSecundaria = null;
function obterAuthSecundaria() {
  if (!authSecundaria) {
    const appSecundario = initializeApp(app.options, "criar-usuarias");
    authSecundaria = initializeAuth(appSecundario, { persistence: inMemoryPersistence });
    if (usandoEmulador) connectAuthEmulator(authSecundaria, `http://${location.hostname}:9099`, { disableWarnings: true });
  }
  return authSecundaria;
}

export async function criarUsuaria({ nome, email, senha, papel }) {
  exigirInternet();
  const auth2 = obterAuthSecundaria();
  const cred = await createUserWithEmailAndPassword(auth2, email.trim(), senha);
  try {
    await setDoc(doc(db, "usuarios", cred.user.uid), {
      nome: nome.trim(), email: email.trim().toLowerCase(), papel, ativo: true, criadoEm: serverTimestamp(),
    });
  } finally {
    await signOut(auth2);
  }
  return cred.user.uid;
}

export async function atualizarUsuaria(uid, campos) {
  exigirInternet();
  await updateDoc(doc(db, "usuarios", uid), campos);
}

export function mensagemErroUsuaria(erro) {
  switch (erro?.code) {
    case "auth/email-already-in-use":
      // (Quem está na lista é barrado antes; chegar aqui = conta de login sem cadastro de usuária.)
      return "Esse e-mail já tem uma conta de login, mas não está na lista de usuárias. Resolva pelo Console do Firebase (passo a passo no README) ou use outro e-mail.";
    case "auth/invalid-email": return "Esse e-mail não parece válido.";
    case "auth/weak-password": return "A senha precisa ter pelo menos 6 caracteres.";
    case "auth/network-request-failed": return "Sem conexão com a internet.";
    case "permission-denied": return "Você não tem permissão para fazer isso.";
    default: return erro?.message?.startsWith("Sem conexão") ? erro.message : "Não deu certo. Tente de novo.";
  }
}

/** Senha provisória fácil de ditar: "Agenda" + 4 números + 2 letras. */
export function senhaProvisoria() {
  const n = new Uint32Array(3);
  crypto.getRandomValues(n);
  const letras = "abcdefghjkmnpqrstuvwxyz";
  return `Agenda${String(n[0] % 10000).padStart(4, "0")}${letras[n[1] % letras.length]}${letras[n[2] % letras.length]}`;
}
