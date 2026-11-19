// Tela do dia: horários de um profissional, marcar, editar, cancelar, encaixe, bloqueio e fechar dia.
import { store, aoMudarStore, profissionalSelecionado, escolherProfissional } from "./store.js";
import {
  observarDia, estadoDoDia, lotacao, horaCurta, minutos, deMinutos, normalizar, mascaraTelefone, SITUACOES, sugerirPacientes,
  marcar, encaixar, editar, cancelar, excluir, bloquear, removerBloqueio, fecharDia, reabrirDia, mensagemErro,
} from "./agenda.js";
import { abrirModal, fecharModal, toast } from "./ui-modal.js";
import { htmlAbas } from "./ui-abas.js";
import { montarMensagem, valoresDoAgendamento, linkWhatsApp } from "./whatsapp.js";
import { hojeISO, somarDias, dataBR, diaDaSemana, esc } from "./util.js";

const CLASSE = {
  Agendado: "sit-agendado",
  Confirmado: "sit-confirmado",
  Atendido: "sit-atendido",
  Faltou: "sit-faltou",
  Cancelado: "sit-cancelado",
};

function quando(ts) {
  const d = ts?.toDate?.();
  if (!d) return "agora";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} às ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Monta a tela do dia em `el`. Devolve a função que desmonta (para os ouvintes). */
export function montarDia(el, iso, perfil) {
  const admin = perfil.papel === "admin";
  const hoje = hojeISO();
  const passado = iso < hoje;
  const podeCriar = admin || !passado;

  let dados = null;      // { agendamentos, bloqueios, fechClinica, fechProf }
  let erro = null;
  let profAtual = null;
  let pararDia = null;
  let visao = null;      // resultado de calcular() da última renderização

  function assinar() {
    const prof = profissionalSelecionado();
    const id = prof?.id ?? null;
    if (id === profAtual && (pararDia || !id)) return;
    pararDia?.();
    pararDia = null; dados = null; erro = null; profAtual = id;
    if (id) {
      pararDia = observarDia(id, iso,
        (d) => { dados = d; erro = null; render(); },
        (e) => { console.error(e); erro = e; render(); });
    }
  }

  const pararStore = aoMudarStore(() => { assinar(); render(); });
  el.addEventListener("click", aoClicar);
  assinar();
  render();

  return () => {
    pararStore();
    pararDia?.();
    el.removeEventListener("click", aoClicar);
  };

  // ------------------------------------------------------------ cálculo da grade

  function calcular(prof) {
    const intervalo = Number(store.config?.intervaloMin) || 30;
    const { horarioDia, feriado, fechado, grade } = estadoDoDia({
      prof, iso, intervaloMin: intervalo, fechClinica: dados?.fechClinica, fechProf: dados?.fechProf,
    });
    const agendamentos = dados?.agendamentos || [];
    const bloqueios = dados?.bloqueios || [];
    const normais = new Map(agendamentos.filter((a) => !a.encaixe).map((a) => [a.hora, a]));
    const bloqueioDe = (hora) => bloqueios.find((b) => b.horaInicio <= hora && hora < b.horaFim) || null;
    const naGrade = new Set(grade);
    const dentroDeHorario = (hora) => grade.some((h) => minutos(h) <= minutos(hora) && minutos(hora) < minutos(h) + intervalo);

    const linhas = grade.map((hora) => ({ tipo: "horario", hora, ag: normais.get(hora) || null, bloqueio: bloqueioDe(hora) }));
    for (const ag of agendamentos) {
      if (ag.encaixe) linhas.push({ tipo: "encaixe", hora: ag.hora, ag, fora: !fechado && !dentroDeHorario(ag.hora) });
      else if (!naGrade.has(ag.hora)) linhas.push({ tipo: "horario", hora: ag.hora, ag, fora: !fechado });
    }
    const peso = (l) => (l.tipo === "encaixe" ? 1 : 0);
    linhas.sort((a, b) => a.hora.localeCompare(b.hora) || peso(a) - peso(b)
      || (a.ag?.criadoEm?.toMillis?.() ?? 0) - (b.ag?.criadoEm?.toMillis?.() ?? 0));

    const { ocupados, livres, encaixes } = lotacao(grade, agendamentos, bloqueios);
    return { intervalo, horarioDia, feriado, fechado, grade, linhas, ocupados, livres, encaixes };
  }

  // ------------------------------------------------------------ desenho

  function cabecalho(prof) {
    return `${htmlAbas(prof)}
      <div class="navegacao">
        <a class="btn btn-seta" href="#/dia/${somarDias(iso, -1)}" aria-label="Dia anterior">‹</a>
        <div class="titulo">
          <h2>${esc(diaDaSemana(iso))}</h2>
          <small>${esc(dataBR(iso))}${iso === hoje ? " · hoje" : ""}</small>
        </div>
        <a class="btn btn-seta" href="#/dia/${somarDias(iso, 1)}" aria-label="Próximo dia">›</a>
      </div>
      <div class="barra-dia">
        ${iso === hoje ? "" : `<a class="btn" href="#/dia/${hoje}">Hoje</a>`}
        <a class="btn" href="#/mes/${iso.slice(0, 7)}">Mês</a>
      </div>`;
  }

  function render() {
    if (!store.pronto) {
      el.innerHTML = `<div class="carregando-bloco"><div class="spinner"></div></div>`;
      return;
    }
    const prof = profissionalSelecionado();
    if (!prof) {
      el.innerHTML = cabecalho(null) + `<div class="cartao em-breve">Nenhuma agenda cadastrada.
        ${admin ? "Cadastre um profissional em Config." : "Fale com o administrador."}</div>`;
      return;
    }
    if (erro) {
      el.innerHTML = cabecalho(prof) + `<div class="cartao em-breve">Não foi possível carregar a agenda. ${esc(mensagemErro(erro))}</div>`;
      return;
    }
    if (!dados) {
      el.innerHTML = cabecalho(prof) + `<div class="carregando-bloco"><div class="spinner"></div></div>`;
      return;
    }

    visao = calcular(prof);
    const v = visao;
    const faixas = [];
    if (v.fechado) {
      faixas.push(`<div class="faixa faixa-fechado">
        <div><strong>${esc(v.fechado.texto)}</strong>
        <small>${v.fechado.por ? `Fechado por ${esc(v.fechado.por)}. ` : ""}Ainda dá para marcar encaixes.</small></div>
        ${v.fechado.alvo && podeCriar ? `<button type="button" class="btn" data-acao="reabrir" data-alvo="${esc(v.fechado.alvo)}">Reabrir</button>` : ""}
      </div>`);
    } else if (v.feriado?.tipo === "facultativo") {
      faixas.push(`<div class="faixa faixa-info"><strong>Ponto facultativo — ${esc(v.feriado.nome)}</strong><small>A agenda está aberta normalmente.</small></div>`);
    }
    if (passado && !admin) {
      faixas.push(`<div class="faixa faixa-info"><small>Este dia já passou: dá para mudar só a situação e a observação.</small></div>`);
    }

    const acoes = `
      <div class="acoes-dia">
        ${podeCriar ? `<button type="button" class="btn btn-encaixe-geral" data-acao="encaixe">+ Encaixe</button>` : ""}
        ${podeCriar && !v.fechado ? `<button type="button" class="btn" data-acao="bloquear">Bloquear horário</button>` : ""}
        ${podeCriar && !v.fechado ? `<button type="button" class="btn" data-acao="fechar">Fechar dia</button>` : ""}
        ${v.linhas.length ? `<button type="button" class="btn" data-acao="imprimir">Imprimir dia</button>` : ""}
      </div>`;

    const resumo = v.grade.length || v.encaixes
      ? `<p class="resumo">${v.ocupados} marcado${v.ocupados === 1 ? "" : "s"} · ${v.livres} livre${v.livres === 1 ? "" : "s"}${v.encaixes ? ` · ${v.encaixes} encaixe${v.encaixes === 1 ? "" : "s"}` : ""}</p>`
      : "";

    const lista = v.linhas.length
      ? `<div class="lista">${v.linhas.map(htmlLinha).join("")}</div>`
      : `<div class="cartao em-breve">Nenhum horário neste dia.</div>`;

    el.innerHTML = cabecalho(prof) + faixas.join("") + acoes + resumo + lista;
  }

  function htmlLinha(l) {
    const hora = `<span class="hora">${horaCurta(l.hora)}</span>`;
    const tags = [
      l.tipo === "encaixe" ? `<span class="tag tag-encaixe">Encaixe</span>` : "",
      l.fora ? `<span class="tag tag-fora">fora do horário</span>` : "",
    ].join("");

    let classe = "linha";
    let principal;
    if (l.ag) {
      const a = l.ag;
      const cancelado = a.situacao === "Cancelado";
      const sub = cancelado
        ? (l.tipo === "horario" && !l.fora && podeCriar ? "Cancelado · livre para marcar" : "Cancelado")
        : `${a.situacao}${a.telefone ? ` · ${a.telefone}` : ""}`;
      classe += ` ${CLASSE[a.situacao] || ""}`;
      principal = `<button type="button" class="linha-principal" data-acao="abrir" data-id="${esc(a.id)}">
          ${hora}<span class="info"><strong class="nome">${esc(a.paciente)}</strong><small>${esc(sub)}</small></span>${tags}
        </button>`;
    } else if (l.bloqueio) {
      const b = l.bloqueio;
      classe += " bloqueado";
      principal = `<button type="button" class="linha-principal" data-acao="ver-bloqueio" data-id="${esc(b.id)}">
          ${hora}<span class="info"><strong>Bloqueado</strong><small>${esc(b.motivo)} (${horaCurta(b.horaInicio)}–${horaCurta(b.horaFim)})</small></span>
        </button>`;
    } else {
      classe += " livre";
      principal = podeCriar
        ? `<button type="button" class="linha-principal" data-acao="marcar" data-hora="${l.hora}">
            ${hora}<span class="info"><span class="txt-livre">Livre</span></span><span class="mais" aria-hidden="true">+</span>
          </button>`
        : `<div class="linha-principal">${hora}<span class="info"><span class="txt-livre">Livre</span></span></div>`;
    }
    if (l.tipo === "encaixe") classe += " linha-encaixe";

    const ocupado = (l.ag && l.ag.situacao !== "Cancelado") || l.bloqueio;
    const botaoEncaixe = podeCriar && l.tipo === "horario" && ocupado
      ? `<button type="button" class="btn-encaixe" data-acao="encaixe" data-hora="${l.hora}" aria-label="Encaixe às ${horaCurta(l.hora)}">+ Encaixe</button>`
      : "";
    return `<div class="${classe}">${principal}${botaoEncaixe}</div>`;
  }

  // ------------------------------------------------------------ cliques na tela

  async function aoClicar(e) {
    const alvo = e.target.closest("[data-acao]");
    if (!alvo || !el.contains(alvo)) return;
    const { acao, id, hora } = alvo.dataset;

    if (acao === "prof") return escolherProfissional(id);
    if (acao === "marcar") return formulario({ modo: "novo", hora });
    if (acao === "encaixe") return formulario({ modo: "encaixe", hora: hora || sugestaoEncaixe() });
    if (acao === "abrir") {
      const ag = dados?.agendamentos.find((a) => a.id === id);
      if (ag) formulario({ modo: "editar", ag });
      return;
    }
    if (acao === "ver-bloqueio") {
      const b = dados?.bloqueios.find((x) => x.id === id);
      if (b) verBloqueio(b);
      return;
    }
    if (acao === "imprimir") return imprimirDia();
    if (acao === "bloquear") return formBloqueio();
    if (acao === "fechar") return formFechar();
    if (acao === "reabrir") {
      if (!confirm("Reabrir este dia para marcações?")) return;
      try { await reabrirDia(iso, alvo.dataset.alvo); toast("Dia reaberto."); }
      catch (err) { toast(mensagemErro(err), "erro"); }
    }
  }

  function sugestaoEncaixe() {
    if (iso === hoje) {
      const agora = new Date();
      const m = Math.ceil((agora.getHours() * 60 + agora.getMinutes()) / 5) * 5;
      return deMinutos(Math.min(m, 23 * 60 + 55));
    }
    return visao?.grade[0] || "08:00";
  }

  // ------------------------------------------------------------ formulário do agendamento

  function formulario({ modo, hora, ag }) {
    const prof = profissionalSelecionado();
    if (!prof) return;
    const editando = modo === "editar";
    const restrito = editando && passado && !admin;
    const h = ag?.hora || hora;
    const situacao = ag?.situacao || "Agendado";
    const titulo = editando ? (ag.encaixe ? "Encaixe" : "Consulta") : (modo === "encaixe" ? "Novo encaixe" : "Marcar horário");
    const subtitulo = `${diaDaSemana(iso)}, ${dataBR(iso)}${modo === "encaixe" ? "" : ` às ${horaCurta(h)}`} · ${prof.nome}`;

    const linkZap = editando && ag.telefone && ag.situacao !== "Cancelado"
      ? linkWhatsApp(ag.telefone, montarMensagem(store.config?.msgWhatsApp, valoresDoAgendamento(ag, prof, store.config)))
      : null;

    let meta = "";
    if (editando) {
      meta = `Marcado por ${esc(ag.criadoPorNome || "?")} em ${quando(ag.criadoEm)}`;
      const criado = ag.criadoEm?.toMillis?.() ?? 0;
      const alterado = ag.atualizadoEm?.toMillis?.() ?? 0;
      if (alterado - criado > 2000) meta += `<br>Alterado por ${esc(ag.atualizadoPorNome || "?")} em ${quando(ag.atualizadoEm)}`;
    }

    const dlg = abrirModal(`
      <form class="modal-form" novalidate>
        <header class="modal-topo">
          <div><h3>${titulo}</h3><small>${esc(subtitulo)}</small></div>
          <button type="button" class="btn-fechar" data-fechar aria-label="Fechar">×</button>
        </header>

        ${modo === "encaixe" ? `
          <label for="f-hora">Hora do encaixe</label>
          <input id="f-hora" name="hora" type="time" step="300" value="${esc(h)}" required>` : ""}

        <label for="f-paciente">Paciente</label>
        <div class="autocompletar">
          <input id="f-paciente" name="paciente" maxlength="120" autocomplete="off" autocapitalize="words"
            role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="f-sugestoes"
            value="${esc(ag?.paciente || "")}" ${restrito ? "disabled" : ""} required>
          <div id="f-sugestoes" class="sugestoes" role="listbox" hidden></div>
        </div>

        <label for="f-telefone">Telefone <span class="opcional">(opcional)</span></label>
        <input id="f-telefone" name="telefone" type="tel" inputmode="numeric" autocomplete="off"
          placeholder="(94) 99999-9999" value="${esc(ag?.telefone || "")}" ${restrito ? "disabled" : ""}>

        <fieldset class="situacoes">
          <legend>Situação</legend>
          ${SITUACOES.filter((s) => editando || s !== "Cancelado").map((s) => `
            <label class="chip ${CLASSE[s]}">
              <input type="radio" name="situacao" value="${s}" ${s === situacao ? "checked" : ""}><span>${s}</span>
            </label>`).join("")}
        </fieldset>

        <label for="f-obs">Observação <span class="opcional">(opcional)</span></label>
        <textarea id="f-obs" name="obs" rows="2" maxlength="500">${esc(ag?.obs || "")}</textarea>
        <p class="dica-lgpd">Não escreva diagnóstico nem informação clínica.</p>

        ${meta ? `<p class="meta">${meta}</p>` : ""}
        <p class="mensagem" data-msg role="status" aria-live="polite"></p>

        <div class="modal-botoes">
          <button type="submit" class="btn btn-primario">${editando ? "Salvar" : "Marcar"}</button>
          <button type="button" class="btn" data-fechar>Fechar</button>
        </div>

        ${linkZap ? `<a class="btn btn-largo btn-whatsapp" href="${esc(linkZap)}" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>
            Mandar confirmação no WhatsApp</a>` : ""}

        ${editando ? `<div class="modal-extra">
          ${ag.situacao === "Cancelado" && !ag.encaixe && podeCriar
            ? `<button type="button" class="btn btn-largo" data-x="reaproveitar">Marcar outro paciente neste horário</button>` : ""}
          ${ag.situacao !== "Cancelado" ? `<button type="button" class="btn-link perigo" data-x="cancelar">Cancelar esta consulta</button>` : ""}
          ${admin ? `<button type="button" class="btn-link perigo" data-x="excluir">Excluir definitivamente</button>` : ""}
        </div>` : ""}
      </form>`);

    const form = dlg.querySelector("form");
    const campo = (nome) => form.elements[nome];
    const aviso = (texto) => {
      const m = form.querySelector("[data-msg]");
      m.textContent = texto;
      m.className = "mensagem" + (texto ? " erro" : "");
    };

    campo("telefone").addEventListener("input", (e) => { e.target.value = mascaraTelefone(e.target.value); });
    if (!restrito) ligarAutocompletar(form);
    if (!editando) setTimeout(() => campo("paciente").focus(), 50);

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = {
        paciente: campo("paciente").value.trim(),
        telefone: campo("telefone").value,
        situacao: new FormData(form).get("situacao"),
        obs: campo("obs").value,
      };
      if (!restrito && !f.paciente) return aviso("Digite o nome do paciente.");
      if (!restrito && f.telefone && f.telefone.replace(/\D/g, "").length < 10) return aviso("Telefone incompleto: use DDD + número.");
      let horaFinal = h;
      if (modo === "encaixe") {
        horaFinal = campo("hora").value;
        if (!/^\d{2}:\d{2}$/.test(horaFinal)) return aviso("Informe a hora do encaixe.");
      }

      // Mesmo paciente já marcado neste dia (com este profissional)? Avisa, mas deixa marcar.
      if (!restrito && (!editando || normalizar(f.paciente) !== ag.pacienteBusca)) {
        const nome = normalizar(f.paciente);
        const repetido = (dados?.agendamentos || []).find((a) => a.id !== ag?.id && a.situacao !== "Cancelado" && a.pacienteBusca === nome);
        if (repetido && !confirm(`${repetido.paciente} já está marcado(a) às ${horaCurta(repetido.hora)} neste dia. Marcar mesmo assim?`)) return;
      }

      const botao = form.querySelector('button[type="submit"]');
      botao.disabled = true;
      botao.textContent = "Salvando…";
      aviso("");
      try {
        if (modo === "novo") await marcar(perfil, prof.id, iso, h, f);
        else if (modo === "encaixe") await encaixar(perfil, prof.id, iso, horaFinal, f);
        else await editar(perfil, ag, f, restrito);
        fecharModal();
        toast(editando ? "Alterações salvas." : "Horário marcado.");
      } catch (err) {
        console.error(err);
        aviso(mensagemErro(err));
        botao.disabled = false;
        botao.textContent = editando ? "Salvar" : "Marcar";
      }
    });

    form.addEventListener("click", async (ev) => {
      const x = ev.target.closest("[data-x]")?.dataset.x;
      if (!x) return;
      try {
        if (x === "reaproveitar") {
          formulario({ modo: "novo", hora: ag.hora });
        } else if (x === "cancelar") {
          if (!confirm(`Cancelar a consulta de ${ag.paciente}?${ag.encaixe ? "" : " O horário fica livre para outro paciente."}`)) return;
          await cancelar(perfil, ag);
          fecharModal();
          toast("Consulta cancelada.");
        } else if (x === "excluir") {
          if (!confirm(`Excluir definitivamente a consulta de ${ag.paciente}? Isso não pode ser desfeito.`)) return;
          await excluir(ag);
          fecharModal();
          toast("Consulta excluída.");
        }
      } catch (err) {
        console.error(err);
        aviso(mensagemErro(err));
      }
    });
  }

  // ------------------------------------------------------------ imprimir

  /** Monta uma folha limpa do dia e abre a impressão (no celular dá para salvar em PDF e compartilhar). */
  function imprimirDia() {
    const prof = profissionalSelecionado();
    const v = visao;
    if (!prof || !v) return;
    const linhas = v.linhas.map((l) => {
      const a = l.ag;
      const situacao = a ? a.situacao : (l.bloqueio ? `Bloqueado: ${l.bloqueio.motivo}` : "");
      const marcas = [l.tipo === "encaixe" ? "encaixe" : "", l.fora ? "fora do horário" : ""].filter(Boolean).join(", ");
      return `<tr class="${a?.situacao === "Cancelado" ? "cancelado" : ""}">
        <td>${horaCurta(l.hora)}${marcas ? `<br><small>${marcas}</small>` : ""}</td>
        <td>${a ? esc(a.paciente) : ""}</td>
        <td>${a ? esc(a.telefone || "") : ""}</td>
        <td>${esc(situacao)}</td>
        <td>${a ? esc(a.obs || "") : ""}</td>
      </tr>`;
    }).join("");

    const folha = document.getElementById("impressao");
    folha.innerHTML = `
      <h1>${esc(store.config?.nome || "Agenda")} — ${esc(prof.nome)}</h1>
      <p>${esc(diaDaSemana(iso))}, ${esc(dataBR(iso))}${v.fechado ? ` · ${esc(v.fechado.texto)}` : ""}
        · ${v.ocupados} marcado(s), ${v.livres} livre(s)${v.encaixes ? `, ${v.encaixes} encaixe(s)` : ""}</p>
      <table>
        <thead><tr><th>Hora</th><th>Paciente</th><th>Telefone</th><th>Situação</th><th>Observação</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <p class="rodape">Impresso em ${new Date().toLocaleString("pt-BR")} por ${esc(perfil.nome || "")}. Contém dados pessoais: guarde com cuidado.</p>`;
    const limpar = () => { folha.innerHTML = ""; window.removeEventListener("afterprint", limpar); };
    window.addEventListener("afterprint", limpar);
    window.print();
  }

  // ------------------------------------------------------------ autocompletar do paciente

  /** Ao digitar o nome, sugere pacientes de agendamentos anteriores e preenche o telefone. */
  function ligarAutocompletar(form) {
    const nome = form.elements.paciente;
    const telefone = form.elements.telefone;
    const caixa = form.querySelector("#f-sugestoes");
    let temporizador = null, sequencia = 0, itens = [];

    const esconder = () => { caixa.hidden = true; nome.setAttribute("aria-expanded", "false"); };
    const escolher = (i) => {
      const s = itens[i];
      if (!s) return;
      nome.value = s.paciente;
      if (s.telefone && !telefone.value) telefone.value = s.telefone;
      esconder();
    };

    nome.addEventListener("input", () => {
      clearTimeout(temporizador);
      const termo = nome.value.trim();
      if (termo.replace(/\s/g, "").length < 2) { esconder(); return; }
      temporizador = setTimeout(async () => {
        const minha = ++sequencia;
        try {
          const lista = await sugerirPacientes(termo);
          if (minha !== sequencia || !form.isConnected) return;
          // Não sugere se o nome digitado já é exatamente o único resultado.
          itens = lista.filter((s) => !(lista.length === 1 && normalizar(s.paciente) === normalizar(nome.value)));
          if (!itens.length) { esconder(); return; }
          caixa.innerHTML = itens.map((s, i) => `
            <button type="button" class="sugestao" role="option" data-i="${i}">
              <strong>${esc(s.paciente)}</strong>
              <small>${esc([s.telefone, `última vez ${dataBR(s.ultima)}`].filter(Boolean).join(" · "))}</small>
            </button>`).join("");
          caixa.hidden = false;
          nome.setAttribute("aria-expanded", "true");
        } catch (e) {
          console.error(e);
          esconder();
        }
      }, 250);
    });

    // pointerdown + preventDefault: escolhe sem tirar o foco do campo (senão o "blur" fecha a lista antes).
    caixa.addEventListener("pointerdown", (e) => {
      const b = e.target.closest("[data-i]");
      if (!b) return;
      e.preventDefault();
      escolher(Number(b.dataset.i));
    });
    caixa.addEventListener("click", (e) => {
      const b = e.target.closest("[data-i]");
      if (b) escolher(Number(b.dataset.i)); // teclado / leitores de tela
    });
    nome.addEventListener("blur", () => setTimeout(esconder, 150));
    nome.addEventListener("keydown", (e) => { if (e.key === "Escape" && !caixa.hidden) { e.preventDefault(); esconder(); } });
  }

  // ------------------------------------------------------------ bloqueios

  function formBloqueio() {
    const prof = profissionalSelecionado();
    const { grade, intervalo } = visao;
    if (!grade.length) return;
    const fins = grade.map((h) => deMinutos(minutos(h) + intervalo));
    const opcoes = (lista, sel) => lista.map((h) => `<option value="${h}" ${h === sel ? "selected" : ""}>${horaCurta(h)}</option>`).join("");

    const dlg = abrirModal(`
      <form class="modal-form" novalidate>
        <header class="modal-topo">
          <div><h3>Bloquear horário</h3><small>${esc(diaDaSemana(iso))}, ${dataBR(iso)} · ${esc(prof.nome)}</small></div>
          <button type="button" class="btn-fechar" data-fechar aria-label="Fechar">×</button>
        </header>
        <div class="duas-colunas">
          <div><label for="b-ini">De</label><select id="b-ini" name="ini">${opcoes(grade, grade[0])}</select></div>
          <div><label for="b-fim">Até</label><select id="b-fim" name="fim">${opcoes(fins, fins[0])}</select></div>
        </div>
        <label for="b-motivo">Motivo</label>
        <input id="b-motivo" name="motivo" maxlength="100" placeholder="Ex.: reunião, curso, médico" required>
        <p class="dica">Horários bloqueados não aceitam marcação normal, só encaixe. Consultas já marcadas continuam.</p>
        <p class="mensagem" data-msg role="status"></p>
        <div class="modal-botoes">
          <button type="submit" class="btn btn-primario">Bloquear</button>
          <button type="button" class="btn" data-fechar>Fechar</button>
        </div>
      </form>`);

    const form = dlg.querySelector("form");
    const ini = form.elements.ini, fim = form.elements.fim;
    ini.addEventListener("change", () => {
      if (fim.value <= ini.value) fim.value = deMinutos(minutos(ini.value) + intervalo);
    });
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const msg = form.querySelector("[data-msg]");
      const motivo = form.elements.motivo.value.trim();
      if (fim.value <= ini.value) { msg.textContent = "O fim precisa ser depois do início."; msg.className = "mensagem erro"; return; }
      if (!motivo) { msg.textContent = "Escreva o motivo."; msg.className = "mensagem erro"; return; }
      try {
        await bloquear(perfil, prof.id, iso, ini.value, fim.value, motivo);
        fecharModal();
        toast("Horário bloqueado.");
      } catch (err) {
        msg.textContent = mensagemErro(err); msg.className = "mensagem erro";
      }
    });
  }

  function verBloqueio(b) {
    const dlg = abrirModal(`
      <div class="modal-form">
        <header class="modal-topo">
          <div><h3>Horário bloqueado</h3><small>${horaCurta(b.horaInicio)} às ${horaCurta(b.horaFim)} · ${esc(dataBR(iso))}</small></div>
          <button type="button" class="btn-fechar" data-fechar aria-label="Fechar">×</button>
        </header>
        <p><strong>Motivo:</strong> ${esc(b.motivo)}</p>
        <p class="meta">Bloqueado por ${esc(b.criadoPorNome || "?")} em ${quando(b.criadoEm)}</p>
        <p class="mensagem" data-msg role="status"></p>
        <div class="modal-botoes">
          ${podeCriar ? `<button type="button" class="btn btn-primario" data-x="desbloquear">Remover bloqueio</button>` : ""}
          <button type="button" class="btn" data-fechar>Fechar</button>
        </div>
      </div>`);
    dlg.querySelector('[data-x="desbloquear"]')?.addEventListener("click", async () => {
      try {
        await removerBloqueio(b.id);
        fecharModal();
        toast("Bloqueio removido.");
      } catch (err) {
        const m = dlg.querySelector("[data-msg]");
        m.textContent = mensagemErro(err); m.className = "mensagem erro";
      }
    });
  }

  // ------------------------------------------------------------ fechar dia

  function formFechar() {
    const prof = profissionalSelecionado();
    const marcados = (dados?.agendamentos || []).filter((a) => a.situacao !== "Cancelado").length;
    const dlg = abrirModal(`
      <form class="modal-form" novalidate>
        <header class="modal-topo">
          <div><h3>Fechar dia</h3><small>${esc(diaDaSemana(iso))}, ${dataBR(iso)}</small></div>
          <button type="button" class="btn-fechar" data-fechar aria-label="Fechar">×</button>
        </header>
        <fieldset class="opcoes">
          <legend>O que fica fechado?</legend>
          <label class="opcao"><input type="radio" name="alvo" value="${esc(prof.id)}" checked> Só a agenda de ${esc(prof.nome)}</label>
          <label class="opcao"><input type="radio" name="alvo" value="clinica"> A clínica toda (todas as agendas)</label>
        </fieldset>
        <label for="x-motivo">Motivo</label>
        <input id="x-motivo" name="motivo" maxlength="100" placeholder="Ex.: férias, folga, recesso" required>
        ${marcados ? `<p class="mensagem aviso">Há ${marcados} consulta${marcados === 1 ? "" : "s"} marcada${marcados === 1 ? "" : "s"} neste dia. Elas continuam marcadas: avise os pacientes ou cancele.</p>` : ""}
        <p class="mensagem" data-msg role="status"></p>
        <div class="modal-botoes">
          <button type="submit" class="btn btn-primario">Fechar dia</button>
          <button type="button" class="btn" data-fechar>Voltar</button>
        </div>
      </form>`);
    const form = dlg.querySelector("form");
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const msg = form.querySelector("[data-msg]");
      const motivo = form.elements.motivo.value.trim();
      if (!motivo) { msg.textContent = "Escreva o motivo."; msg.className = "mensagem erro"; return; }
      try {
        await fecharDia(perfil, iso, new FormData(form).get("alvo"), motivo);
        fecharModal();
        toast("Dia fechado.");
      } catch (err) {
        msg.textContent = mensagemErro(err); msg.className = "mensagem erro";
      }
    });
  }
}
