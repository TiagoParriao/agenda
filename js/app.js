// Ponto de entrada: login, roteamento por hash (#/dia/AAAA-MM-DD, #/mes, #/busca, #/config).
import { configurado, usandoEmulador, apagarDadosLocais } from "./firebase.js";
import { entrar, sair, esqueciSenha, observarSessao, mensagemDeErro } from "./auth.js";
import { hojeISO, isoValida } from "./util.js";
import { store, iniciarStore, pararStore, aoMudarStore } from "./store.js";
import { fecharModal } from "./ui-modal.js";
import { montarDia } from "./ui-dia.js";
import { montarMes, anoMesValido } from "./ui-mes.js";
import { montarBusca } from "./ui-busca.js";
import { montarConfig } from "./ui-config.js";

const $ = (seletor) => document.querySelector(seletor);

// localStorage pode não existir (modo privado etc.): nunca deixa o site quebrar por isso.
const lerLocal = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravarLocal = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };
const removerLocal = (k) => { try { localStorage.removeItem(k); } catch { /* sem armazenamento */ } };
const CHAVE_DADOS = "agenda.temDadosLocais";
const CHAVE_MSG = "agenda.motivoSaida";

const estado = {
  perfil: null,       // { uid, nome, email, papel, ativo }
  desmontar: null,    // limpa os ouvintes da tela atual
};

aoMudarStore(() => {
  $("#topo-nome-clinica").textContent = store.config?.nome || "Agenda";
});

export const ehAdmin = () => estado.perfil?.papel === "admin";

// ---------------------------------------------------------------- telas

function mostrarTela(qual) {
  for (const id of ["carregando", "tela-login", "tela-app"]) {
    $("#" + id).hidden = id !== qual;
  }
}

function mensagemLogin(texto, tipo = "") {
  const el = $("#login-msg");
  el.textContent = texto;
  el.className = "mensagem" + (tipo ? " " + tipo : "");
}

// ---------------------------------------------------------------- login

$("#form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#login-email").value;
  const senha = $("#login-senha").value;
  if (!email.trim() || !senha) { mensagemLogin("Preencha o e-mail e a senha.", "erro"); return; }

  const botao = $("#btn-entrar");
  botao.disabled = true;
  botao.textContent = "Entrando…";
  mensagemLogin("");
  try {
    await entrar(email, senha);
    $("#login-senha").value = "";
  } catch (erro) {
    mensagemLogin(mensagemDeErro(erro), "erro");
  } finally {
    botao.disabled = false;
    botao.textContent = "Entrar";
  }
});

$("#btn-esqueci").addEventListener("click", async () => {
  const email = $("#login-email").value.trim();
  if (!email) {
    mensagemLogin("Digite seu e-mail no campo acima e toque de novo em “Esqueci minha senha”.", "aviso");
    $("#login-email").focus();
    return;
  }
  try {
    await esqueciSenha(email);
    mensagemLogin("Se esse e-mail estiver cadastrado, vai chegar uma mensagem para criar uma senha nova. Olhe também a caixa de spam.", "ok");
  } catch (erro) {
    mensagemLogin(mensagemDeErro(erro), "erro");
  }
});

$("#btn-ver-senha").addEventListener("click", () => {
  const campo = $("#login-senha");
  const mostrar = campo.type === "password";
  campo.type = mostrar ? "text" : "password";
  $("#btn-ver-senha").textContent = mostrar ? "Ocultar" : "Mostrar";
  $("#btn-ver-senha").setAttribute("aria-label", mostrar ? "Ocultar senha" : "Mostrar senha");
});

$("#btn-sair").addEventListener("click", () => sair());

// ---------------------------------------------------------------- sessão

observarSessao((sessao) => {
  if (sessao.estado === "logado") {
    const primeiraVez = !estado.perfil;
    estado.perfil = sessao.perfil;
    $("#topo-usuario-nome").textContent = sessao.perfil.nome || sessao.perfil.email;
    $("#menu-config").hidden = !ehAdmin();
    gravarLocal(CHAVE_DADOS, "1");
    mostrarTela("tela-app");
    if (primeiraVez) {
      mensagemLogin("");
      iniciarStore();
      rotear();
    }
    return;
  }

  desmontarTela();
  fecharModal();
  pararStore();
  estado.perfil = null;
  $("#conteudo").innerHTML = "";
  if (sessao.estado === "erro") console.error(sessao.erro);

  // LGPD: ao sair (ou ser desativada), apaga a cópia da agenda guardada neste aparelho.
  // Isso exige recarregar a página; a mensagem a mostrar depois vai pelo sessionStorage.
  if (lerLocal(CHAVE_DADOS)) {
    removerLocal(CHAVE_DADOS);
    try { sessionStorage.setItem(CHAVE_MSG, sessao.estado); } catch { /* sem armazenamento */ }
    mostrarTela("carregando");
    apagarDadosLocais()
      .catch((e) => console.warn("Não foi possível apagar o cache local:", e))
      .finally(() => location.reload());
    return;
  }

  mostrarTela("tela-login");
  let motivo = sessao.estado;
  try { motivo = sessionStorage.getItem(CHAVE_MSG) || motivo; sessionStorage.removeItem(CHAVE_MSG); } catch { /* idem */ }
  if (motivo === "bloqueado") {
    mensagemLogin("Sua conta não está liberada ou foi desativada. Fale com o administrador.", "erro");
  } else if (motivo === "erro") {
    mensagemLogin("Não foi possível carregar seus dados. Verifique a internet e tente de novo.", "erro");
  }
});

// ---------------------------------------------------------------- roteamento

function irPara(hash, substituir = false) {
  if (substituir) {
    history.replaceState(null, "", hash);
    rotear();
  } else {
    location.hash = hash;
  }
}

function desmontarTela() {
  if (estado.desmontar) { estado.desmontar(); estado.desmontar = null; }
}

function rotear() {
  if (!estado.perfil) return;
  const [tela, parametro] = location.hash.replace(/^#\/?/, "").split("/");
  desmontarTela();
  fecharModal();

  switch (tela) {
    case "dia":
      if (!isoValida(parametro || "")) return irPara(`#/dia/${hojeISO()}`, true);
      estado.desmontar = montarDia($("#conteudo"), parametro, estado.perfil);
      break;
    case "mes":
      if (!anoMesValido(parametro)) return irPara(`#/mes/${hojeISO().slice(0, 7)}`, true);
      estado.desmontar = montarMes($("#conteudo"), parametro, estado.perfil);
      break;
    case "busca":
      estado.desmontar = montarBusca($("#conteudo"));
      break;
    case "config":
      if (!ehAdmin()) return irPara(`#/dia/${hojeISO()}`, true);
      estado.desmontar = montarConfig($("#conteudo"), estado.perfil);
      break;
    default:
      return irPara(`#/dia/${hojeISO()}`, true);
  }

  for (const link of document.querySelectorAll(".menu a")) {
    link.classList.toggle("ativo", link.dataset.rota === tela);
  }
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", rotear);

// ---------------------------------------------------------------- telas (provisórias na etapa 1)


// ---------------------------------------------------------------- avisos gerais

function atualizarOffline() {
  $("#aviso-offline").hidden = navigator.onLine;
  document.body.classList.toggle("offline", !navigator.onLine);
}
window.addEventListener("online", atualizarOffline);
window.addEventListener("offline", atualizarOffline);
atualizarOffline();

$("#selo-teste").hidden = !usandoEmulador;

// ---------------------------------------------------------------- app no celular (PWA)

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("Service worker não registrado:", e));
  });
}

// Android/Chrome: oferece "Instalar" (no iPhone é pelo menu Compartilhar → Adicionar à Tela de Início).
const CHAVE_INSTALAR = "agenda.naoInstalar";
let pedidoInstalacao = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  pedidoInstalacao = e;
  if (!lerLocal(CHAVE_INSTALAR)) $("#convite-instalar").hidden = false;
});
window.addEventListener("appinstalled", () => { $("#convite-instalar").hidden = true; });
$("#btn-instalar").addEventListener("click", async () => {
  $("#convite-instalar").hidden = true;
  if (!pedidoInstalacao) return;
  pedidoInstalacao.prompt();
  await pedidoInstalacao.userChoice.catch(() => null);
  pedidoInstalacao = null;
});
$("#btn-instalar-nao").addEventListener("click", () => {
  $("#convite-instalar").hidden = true;
  gravarLocal(CHAVE_INSTALAR, "1");
});

if (!configurado) {
  mostrarTela("tela-login");
  mensagemLogin("O Firebase ainda não foi configurado neste site (js/firebase-config.js).", "erro");
  $("#btn-entrar").disabled = true;
}
