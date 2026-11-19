// Tela "Buscar paciente": procura pelo início de qualquer palavra do nome.
// O termo fica só na memória (nunca na URL: dado de paciente não vai para endereço).
import { store, escolherProfissional, profissionaisAtivos } from "./store.js";
import { buscarAgendamentos, horaCurta, mensagemErro } from "./agenda.js";
import { hojeISO, dataBR, deISO, esc } from "./util.js";

const CLASSE = {
  Agendado: "sit-agendado", Confirmado: "sit-confirmado", Atendido: "sit-atendido",
  Faltou: "sit-faltou", Cancelado: "sit-cancelado",
};
const SEMANA_CURTA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MAXIMO = 50;

let ultimoTermo = "";

export function montarBusca(el) {
  let temporizador = null;
  let sequencia = 0;
  let ativo = true;

  el.innerHTML = `
    <h2 class="titulo-tela">Buscar paciente</h2>
    <div class="campo-busca">
      <input id="campo-busca" type="search" placeholder="Digite parte do nome" autocomplete="off"
        autocapitalize="off" spellcheck="false" enterkeyhint="search" aria-label="Nome do paciente">
    </div>
    <p class="dica">Procura pelo começo de qualquer palavra do nome. Ex.: “silv” acha “Maria da Silva”.</p>
    <div id="resultados" aria-live="polite"></div>`;

  const campo = el.querySelector("#campo-busca");
  const saida = el.querySelector("#resultados");
  campo.value = ultimoTermo;

  campo.addEventListener("input", () => {
    ultimoTermo = campo.value;
    clearTimeout(temporizador);
    temporizador = setTimeout(buscar, 300);
  });
  campo.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { clearTimeout(temporizador); buscar(); campo.blur(); }
  });

  const aoClicar = (e) => {
    const item = e.target.closest("[data-dia]");
    if (!item || !el.contains(item)) return;
    if (store.profissionais.some((p) => p.id === item.dataset.prof)) escolherProfissional(item.dataset.prof);
    location.hash = `#/dia/${item.dataset.dia}`;
  };
  el.addEventListener("click", aoClicar);

  if (ultimoTermo.trim()) buscar();
  else setTimeout(() => campo.focus(), 50);

  return () => {
    ativo = false;
    clearTimeout(temporizador);
    el.removeEventListener("click", aoClicar);
  };

  async function buscar() {
    const termo = campo.value.trim();
    const minha = ++sequencia;
    if (termo.replace(/\s/g, "").length < 2) {
      saida.innerHTML = "";
      return;
    }
    saida.innerHTML = `<div class="carregando-bloco"><div class="spinner"></div></div>`;
    try {
      const lista = await buscarAgendamentos(termo, MAXIMO);
      if (!ativo || minha !== sequencia) return; // chegou uma busca mais nova
      mostrar(lista);
    } catch (erro) {
      console.error(erro);
      if (ativo && minha === sequencia) saida.innerHTML = `<div class="cartao em-breve">${esc(mensagemErro(erro))}</div>`;
    }
  }

  function mostrar(lista) {
    if (!lista.length) {
      saida.innerHTML = `<div class="cartao em-breve">Nenhum agendamento encontrado.</div>`;
      return;
    }
    const hoje = hojeISO();
    const proximas = lista.filter((a) => a.data >= hoje)
      .sort((a, b) => a.data.localeCompare(b.data) || a.hora.localeCompare(b.hora));
    const anteriores = lista.filter((a) => a.data < hoje)
      .sort((a, b) => b.data.localeCompare(a.data) || b.hora.localeCompare(a.hora));
    const variosProfs = profissionaisAtivos().length > 1;
    const nomeProf = (id) => store.profissionais.find((p) => p.id === id)?.nome || "";

    const item = (a) => {
      const sub = [horaCurta(a.hora), variosProfs ? nomeProf(a.profissionalId) : "", a.situacao, a.telefone]
        .filter(Boolean).join(" · ");
      return `
        <div class="linha ${CLASSE[a.situacao] || ""}">
          <button type="button" class="linha-principal" data-dia="${esc(a.data)}" data-prof="${esc(a.profissionalId)}">
            <span class="res-data"><strong>${esc(dataBR(a.data).slice(0, 5))}</strong>
              <small>${SEMANA_CURTA[deISO(a.data).getDay()]} · ${esc(a.data.slice(0, 4))}</small></span>
            <span class="info"><strong class="nome">${esc(a.paciente)}</strong><small>${esc(sub)}</small></span>
            ${a.encaixe ? `<span class="tag tag-encaixe">Encaixe</span>` : ""}
          </button>
        </div>`;
    };

    const bloco = (titulo, itens) => itens.length
      ? `<h3 class="sub-lista">${titulo} <span>(${itens.length})</span></h3><div class="lista">${itens.map(item).join("")}</div>`
      : "";

    saida.innerHTML = `
      ${bloco("Próximas", proximas)}
      ${bloco("Anteriores", anteriores)}
      ${lista.length >= MAXIMO ? `<p class="dica">Mostrando os ${MAXIMO} mais recentes. Digite mais do nome para refinar.</p>` : ""}`;
  }
}
