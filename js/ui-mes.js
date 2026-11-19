// Calendário do mês: lotação de cada dia do profissional selecionado, feriados e dias fechados.
import { store, aoMudarStore, profissionalSelecionado, escolherProfissional } from "./store.js";
import { observarMes, estadoDoDia, lotacao, mensagemErro } from "./agenda.js";
import { htmlAbas } from "./ui-abas.js";
import { hojeISO, esc } from "./util.js";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
const SEMANA_LONGA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

const p2 = (n) => String(n).padStart(2, "0");

export function anoMesValido(am) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(am || "");
}

function somarMeses(anoMes, n) {
  const [a, m] = anoMes.split("-").map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`;
}

/** Monta o calendário de `anoMes` ("AAAA-MM") em `el`. Devolve a função que desmonta. */
export function montarMes(el, anoMes, perfil) {
  const hoje = hojeISO();
  const mesAtual = hoje.slice(0, 7);
  let dados = null, erro = null, profAtual = null, parar = null;

  function assinar() {
    const prof = profissionalSelecionado();
    const id = prof?.id ?? null;
    if (id === profAtual && (parar || !id)) return;
    parar?.();
    parar = null; dados = null; erro = null; profAtual = id;
    if (id) {
      parar = observarMes(id, anoMes,
        (d) => { dados = d; erro = null; render(); },
        (e) => { console.error(e); erro = e; render(); });
    }
  }

  const pararStore = aoMudarStore(() => { assinar(); render(); });
  const aoClicar = (e) => {
    const aba = e.target.closest('[data-acao="prof"]');
    if (aba && el.contains(aba)) escolherProfissional(aba.dataset.id);
  };
  el.addEventListener("click", aoClicar);
  assinar();
  render();

  return () => {
    pararStore();
    parar?.();
    el.removeEventListener("click", aoClicar);
  };

  function render() {
    if (!store.pronto) {
      el.innerHTML = `<div class="carregando-bloco"><div class="spinner"></div></div>`;
      return;
    }
    const prof = profissionalSelecionado();
    const [ano, mes] = anoMes.split("-").map(Number);

    const topo = `${htmlAbas(prof)}
      <div class="navegacao">
        <a class="btn btn-seta" href="#/mes/${somarMeses(anoMes, -1)}" aria-label="Mês anterior">‹</a>
        <div class="titulo"><h2>${MESES[mes - 1]} ${ano}</h2>${prof ? `<small>${esc(prof.nome)}</small>` : ""}</div>
        <a class="btn btn-seta" href="#/mes/${somarMeses(anoMes, 1)}" aria-label="Próximo mês">›</a>
      </div>
      ${anoMes === mesAtual ? "" : `<div class="barra-dia"><a class="btn" href="#/mes/${mesAtual}">Hoje</a></div>`}`;

    if (!prof) {
      el.innerHTML = topo + `<div class="cartao em-breve">Nenhuma agenda cadastrada.</div>`;
      return;
    }
    if (erro) {
      el.innerHTML = topo + `<div class="cartao em-breve">Não foi possível carregar o mês. ${esc(mensagemErro(erro))}</div>`;
      return;
    }

    // Agrupa os dados do mês por dia.
    const porDia = (lista) => {
      const mapa = new Map();
      for (const item of lista || []) {
        if (!mapa.has(item.data)) mapa.set(item.data, []);
        mapa.get(item.data).push(item);
      }
      return mapa;
    };
    const ags = porDia(dados?.agendamentos);
    const blqs = porDia(dados?.bloqueios);
    const fechs = new Map((dados?.fechamentos || []).map((f) => [`${f.data}_${f.alvo}`, f]));
    const intervalo = Number(store.config?.intervaloMin) || 30;

    const diasNoMes = new Date(ano, mes, 0).getDate();
    const primeiroDiaSemana = new Date(ano, mes - 1, 1).getDay();
    const celulas = [];
    for (let i = 0; i < primeiroDiaSemana; i++) celulas.push(`<div class="cal-vazio" aria-hidden="true"></div>`);

    let totalMes = 0;
    for (let d = 1; d <= diasNoMes; d++) {
      const iso = `${anoMes}-${p2(d)}`;
      const { fechado, feriado, grade } = estadoDoDia({
        prof, iso, intervaloMin: intervalo,
        fechClinica: fechs.get(`${iso}_clinica`), fechProf: fechs.get(`${iso}_${prof.id}`),
      });
      const lot = lotacao(grade, ags.get(iso) || [], blqs.get(iso) || []);
      const extras = lot.encaixes + lot.fora;
      totalMes += lot.ocupados + extras;

      const classes = ["cal-dia"];
      if (fechado) classes.push("fechado");
      if (iso < hoje) classes.push("passado");
      if (iso === hoje) classes.push("hoje");
      if (feriado?.tipo === "facultativo" && !fechado) classes.push("facultativo");
      if (!fechado && lot.total && lot.livres === 0) classes.push("lotado");

      let meio = "";
      let rotulo = "";
      const selo = dados && extras ? `<span class="cal-extra">+${extras}</span>` : "";
      if (!dados) {
        meio = "";
      } else if (fechado) {
        meio = (fechado.curto ? `<span class="cal-rotulo">${esc(fechado.curto)}</span>` : "")
          + (selo ? `<span class="cal-linha">${selo}</span>` : "");
        rotulo = fechado.texto;
      } else {
        const pct = lot.total ? Math.round(((lot.ocupados + lot.bloqueados) / lot.total) * 100) : 0;
        meio = `<span class="cal-linha"><span class="cal-cont">${lot.ocupados}/${lot.total}</span>${selo}</span>
                <span class="cal-barra"><i style="width:${pct}%"></i></span>`;
        rotulo = `${lot.ocupados} de ${lot.total} horários ocupados, ${lot.livres} livres`;
        if (feriado?.tipo === "facultativo") rotulo += `. Ponto facultativo: ${feriado.nome}`;
      }
      if (dados && extras) rotulo += `. Mais ${extras} encaixe${extras === 1 ? "" : "s"}`;

      celulas.push(`
        <a class="${classes.join(" ")}" href="#/dia/${iso}"
           aria-label="${d} de ${MESES[mes - 1].toLowerCase()}, ${SEMANA_LONGA[(primeiroDiaSemana + d - 1) % 7]}${rotulo ? `. ${esc(rotulo)}` : ""}">
          <span class="cal-num">${d}</span>
          ${meio}
        </a>`);
    }

    el.innerHTML = topo + `
      <div class="cal">
        <div class="cal-semana" aria-hidden="true">${SEMANA.map((s) => `<span>${s}</span>`).join("")}</div>
        <div class="cal-grade">${celulas.join("")}</div>
        ${dados ? "" : `<div class="cal-carregando"><div class="spinner"></div></div>`}
      </div>
      ${dados ? `<p class="resumo cal-total">${totalMes} consulta${totalMes === 1 ? "" : "s"} marcada${totalMes === 1 ? "" : "s"} neste mês (sem contar canceladas).</p>` : ""}
      <div class="cal-legenda">
        <span><i class="lg lg-barra"></i> horários ocupados</span>
        <span><i class="lg lg-extra">+2</i> encaixes</span>
        <span><i class="lg lg-fechado"></i> fechado / sem atendimento</span>
        <span><i class="lg lg-facultativo"></i> ponto facultativo</span>
      </div>`;
  }
}
