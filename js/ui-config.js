// Tela de Configurações (só admin): clínica, agendas, usuárias e mensagem do WhatsApp.
import { store, aoMudarStore, CONFIG_PADRAO, MSG_WHATSAPP_PADRAO } from "./store.js";
import { mensagemErro, horaCurta } from "./agenda.js";
import {
  salvarConfig, salvarProfissional, idParaProfissional,
  observarUsuarias, criarUsuaria, atualizarUsuaria, mensagemErroUsuaria, senhaProvisoria,
} from "./admin.js";
import { abrirModal, fecharModal, toast } from "./ui-modal.js";
import { montarMensagem } from "./whatsapp.js";
import { esc } from "./util.js";

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];
const INTERVALOS = [10, 15, 20, 30, 40, 45, 60];
const CORES = ["#0f6b5c", "#1e88e5", "#6b3fa0", "#d81b60", "#ef6c00", "#2e7d32", "#5d4037", "#455a64"];

function resumoHorario(horario) {
  const dias = ORDEM_DIAS.filter((d) => horario?.[d]);
  if (!dias.length) return "Sem dias de atendimento";
  const faixa = (h) => `${horaCurta(h.inicio)}–${horaCurta(h.fim)}${h.almocoInicio ? ` (almoço ${horaCurta(h.almocoInicio)}–${horaCurta(h.almocoFim)})` : ""}`;
  const faixas = new Set(dias.map((d) => faixa(horario[d])));
  const nomes = dias.map((d) => DIAS_CURTOS[d]).join(", ");
  return faixas.size === 1 ? `${nomes} · ${[...faixas][0]}` : `${nomes} · horários variados`;
}

// ---------------------------------------------------------------- editor de horário semanal

function htmlHorario(horario) {
  return `<div class="horario">
    ${ORDEM_DIAS.map((d) => {
      const h = horario?.[d];
      return `<div class="horario-dia" data-dia="${d}">
        <label class="horario-check"><input type="checkbox" data-campo="atende" ${h ? "checked" : ""}> ${DIAS[d]}</label>
        <div class="horario-campos" ${h ? "" : "hidden"}>
          <span>Das</span><input type="time" step="300" data-campo="inicio" value="${esc(h?.inicio || "08:00")}" aria-label="${DIAS[d]}: início">
          <span>às</span><input type="time" step="300" data-campo="fim" value="${esc(h?.fim || "18:00")}" aria-label="${DIAS[d]}: fim">
          <span>Almoço</span><input type="time" step="300" data-campo="almocoInicio" value="${esc(h ? h.almocoInicio || "" : "12:00")}" aria-label="${DIAS[d]}: início do almoço">
          <span>às</span><input type="time" step="300" data-campo="almocoFim" value="${esc(h ? h.almocoFim || "" : "14:00")}" aria-label="${DIAS[d]}: fim do almoço">
        </div>
      </div>`;
    }).join("")}
    <p class="dica">Deixe o almoço em branco se não houver pausa.</p>
    <button type="button" class="btn-link" data-copiar>Copiar o horário de segunda para os outros dias marcados</button>
  </div>`;
}

function ligarHorario(raiz) {
  raiz.addEventListener("change", (e) => {
    if (e.target.dataset.campo !== "atende") return;
    e.target.closest(".horario-dia").querySelector(".horario-campos").hidden = !e.target.checked;
  });
  raiz.querySelector("[data-copiar]").addEventListener("click", () => {
    const seg = raiz.querySelector('.horario-dia[data-dia="1"]');
    for (const dia of raiz.querySelectorAll(".horario-dia")) {
      if (dia === seg || !dia.querySelector('[data-campo="atende"]').checked) continue;
      for (const c of ["inicio", "fim", "almocoInicio", "almocoFim"]) {
        dia.querySelector(`[data-campo="${c}"]`).value = seg.querySelector(`[data-campo="${c}"]`).value;
      }
    }
    toast("Horário copiado. Confira e salve.");
  });
}

/** Lê o editor. Devolve { horario } ou { erro }. */
function lerHorario(raiz) {
  const horario = {};
  for (const dia of raiz.querySelectorAll(".horario-dia")) {
    const d = dia.dataset.dia;
    if (!dia.querySelector('[data-campo="atende"]').checked) continue;
    const v = (c) => dia.querySelector(`[data-campo="${c}"]`).value;
    const h = { inicio: v("inicio"), fim: v("fim") };
    const nome = DIAS[d];
    if (!h.inicio || !h.fim) return { erro: `${nome}: preencha o início e o fim.` };
    if (h.inicio >= h.fim) return { erro: `${nome}: o fim precisa ser depois do início.` };
    const ai = v("almocoInicio"), af = v("almocoFim");
    if (ai || af) {
      if (!ai || !af) return { erro: `${nome}: preencha o início e o fim do almoço (ou deixe os dois em branco).` };
      if (ai >= af) return { erro: `${nome}: o fim do almoço precisa ser depois do início.` };
      if (ai < h.inicio || af > h.fim) return { erro: `${nome}: o almoço precisa estar dentro do horário de atendimento.` };
      h.almocoInicio = ai;
      h.almocoFim = af;
    }
    horario[d] = h;
  }
  return { horario };
}

// ---------------------------------------------------------------- tela

export function montarConfig(el, perfil) {
  let usuarias = null;
  const pararUsuarias = observarUsuarias(
    (lista) => { usuarias = lista; render(); },
    (e) => { console.error(e); toast(mensagemErro(e), "erro"); });
  const pararStore = aoMudarStore(render);
  el.addEventListener("click", aoClicar);
  render();

  return () => {
    pararUsuarias();
    pararStore();
    el.removeEventListener("click", aoClicar);
  };

  function cfg() {
    return { ...CONFIG_PADRAO, ...(store.config || {}) };
  }

  function render() {
    if (!store.pronto) {
      el.innerHTML = `<div class="carregando-bloco"><div class="spinner"></div></div>`;
      return;
    }
    const c = cfg();
    const profs = store.profissionais;

    el.innerHTML = `
      <h2 class="titulo-tela">Configurações</h2>

      <section class="cartao secao">
        <div class="secao-topo"><h3>Clínica</h3><button type="button" class="btn" data-acao="clinica">Editar</button></div>
        <dl class="dados">
          <div><dt>Nome</dt><dd>${esc(c.nome)}</dd></div>
          <div><dt>Intervalo entre horários</dt><dd>${esc(c.intervaloMin)} minutos</dd></div>
          <div><dt>Horário padrão (para agendas novas)</dt><dd>${esc(resumoHorario(c.horarioPadrao))}</dd></div>
        </dl>
      </section>

      <section class="cartao secao">
        <div class="secao-topo"><h3>Agendas</h3><button type="button" class="btn" data-acao="novo-prof">+ Nova agenda</button></div>
        <p class="dica">Cada profissional (ou sala) tem a sua agenda e o seu horário.</p>
        ${profs.length ? `<div class="lista-config">${profs.map((p) => `
          <button type="button" class="item-config" data-acao="prof" data-id="${esc(p.id)}">
            <span class="bolinha" style="background:${esc(p.cor || CORES[0])}"></span>
            <span class="info"><strong>${esc(p.nome)}</strong><small>${esc(resumoHorario(p.horario))}</small></span>
            ${p.ativo === false ? `<span class="tag tag-inativo">Desativada</span>` : ""}
          </button>`).join("")}</div>`
        : `<p class="mensagem aviso">Nenhuma agenda cadastrada ainda. Crie a primeira para começar a marcar.</p>`}
      </section>

      <section class="cartao secao">
        <div class="secao-topo"><h3>Usuárias</h3><button type="button" class="btn" data-acao="nova-usuaria">+ Nova usuária</button></div>
        <p class="dica">Quem pode entrar no site. Desativar bloqueia o acesso na hora (o histórico continua).</p>
        ${usuarias === null ? `<div class="carregando-bloco"><div class="spinner"></div></div>` : `
        <div class="lista-config">${usuarias.map((u) => `
          <button type="button" class="item-config${u.ativo === true ? "" : " inativo"}" data-acao="usuaria" data-id="${esc(u.uid)}">
            <span class="info"><strong>${esc(u.nome || "(sem nome)")}${u.uid === perfil.uid ? " (você)" : ""}</strong><small>${esc(u.email || "")}</small></span>
            ${u.papel === "admin" ? `<span class="tag tag-admin">Admin</span>` : ""}
            ${u.ativo === true ? "" : `<span class="tag tag-inativo">Desativada</span>`}
          </button>`).join("")}</div>`}
      </section>

      <section class="cartao secao">
        <div class="secao-topo"><h3>Mensagem do WhatsApp</h3><button type="button" class="btn" data-acao="whatsapp">Editar</button></div>
        <p class="previa-msg">${esc(montarMensagem(c.msgWhatsApp, exemploValores(c)))}</p>
      </section>`;
  }

  function exemploValores(c) {
    return {
      paciente: "Maria", nomeCompleto: "Maria da Silva", profissional: store.profissionais[0]?.nome || "Dra. Fulana",
      data: "18/11", diaSemana: "quarta-feira", hora: "9h30", clinica: c.nome,
    };
  }

  function aoClicar(e) {
    const b = e.target.closest("[data-acao]");
    if (!b || !el.contains(b)) return;
    const { acao, id } = b.dataset;
    if (acao === "clinica") formClinica();
    else if (acao === "novo-prof") formProfissional(null);
    else if (acao === "prof") formProfissional(store.profissionais.find((p) => p.id === id));
    else if (acao === "nova-usuaria") formNovaUsuaria();
    else if (acao === "usuaria") formUsuaria(usuarias?.find((u) => u.uid === id));
    else if (acao === "whatsapp") formWhatsApp();
  }

  // ------------------------------------------------------------ helpers dos formulários

  function janela(titulo, corpo, textoBotao = "Salvar") {
    const dlg = abrirModal(`
      <form class="modal-form" novalidate>
        <header class="modal-topo">
          <div><h3>${titulo}</h3></div>
          <button type="button" class="btn-fechar" data-fechar aria-label="Fechar">×</button>
        </header>
        ${corpo}
        <p class="mensagem" data-msg role="status" aria-live="polite"></p>
        <div class="modal-botoes">
          <button type="submit" class="btn btn-primario">${textoBotao}</button>
          <button type="button" class="btn" data-fechar>Fechar</button>
        </div>
      </form>`);
    const form = dlg.querySelector("form");
    const aviso = (texto, tipo = "erro") => {
      const m = form.querySelector("[data-msg]");
      m.textContent = texto;
      m.className = "mensagem" + (texto ? ` ${tipo}` : "");
    };
    /** Liga o envio: `acao` devolve uma mensagem de erro (string), `false` (desistiu) ou nada (deu certo). */
    const aoEnviar = (acao, sucesso) => {
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const botao = form.querySelector('button[type="submit"]');
        botao.disabled = true;
        aviso("");
        try {
          const erro = await acao();
          if (erro === false) return;
          if (erro) { aviso(erro); return; }
          if (sucesso !== false) { fecharModal(); toast(sucesso || "Salvo."); }
        } catch (err) {
          console.error(err);
          aviso(err?.code?.startsWith("auth/") ? mensagemErroUsuaria(err) : mensagemErro(err));
        } finally {
          botao.disabled = false;
        }
      });
    };
    return { form, aviso, aoEnviar };
  }

  // ------------------------------------------------------------ clínica

  function formClinica() {
    const c = cfg();
    const { form, aoEnviar } = janela("Clínica", `
      <label for="c-nome">Nome da clínica</label>
      <input id="c-nome" name="nome" maxlength="60" value="${esc(c.nome)}" required>
      <p class="dica">Aparece no topo do site e na mensagem do WhatsApp.</p>

      <label for="c-intervalo">Intervalo entre horários</label>
      <select id="c-intervalo" name="intervalo">
        ${INTERVALOS.map((m) => `<option value="${m}" ${Number(c.intervaloMin) === m ? "selected" : ""}>${m} minutos</option>`).join("")}
      </select>
      <p class="dica">Vale para todas as agendas. Consultas já marcadas que não caírem na nova grade continuam aparecendo, com a etiqueta “fora do horário”.</p>

      <fieldset><legend>Horário padrão</legend>
        <p class="dica">Usado como ponto de partida ao criar uma agenda nova. Não muda as agendas que já existem.</p>
        ${htmlHorario(c.horarioPadrao)}
      </fieldset>`);
    ligarHorario(form.querySelector(".horario"));

    aoEnviar(async () => {
      const nome = form.elements.nome.value.trim();
      if (!nome) return "Digite o nome da clínica.";
      const { horario, erro } = lerHorario(form.querySelector(".horario"));
      if (erro) return erro;
      await salvarConfig({ nome, intervaloMin: Number(form.elements.intervalo.value), horarioPadrao: horario });
    }, "Configurações da clínica salvas.");
  }

  // ------------------------------------------------------------ agendas (profissionais)

  function formProfissional(p) {
    const novo = !p;
    const c = cfg();
    const cor = p?.cor || CORES[store.profissionais.length % CORES.length];
    const { form, aoEnviar } = janela(novo ? "Nova agenda" : "Agenda", `
      <label for="p-nome">Nome</label>
      <input id="p-nome" name="nome" maxlength="40" value="${esc(p?.nome || "")}" placeholder="Ex.: Dra. Nayara, Sala 2" required>

      <fieldset><legend>Cor</legend>
        <div class="cores">${CORES.map((k) => `
          <label class="cor" style="--cor:${k}"><input type="radio" name="cor" value="${k}" ${k === cor ? "checked" : ""}><span aria-label="Cor ${k}"></span></label>`).join("")}
        </div>
      </fieldset>

      ${novo ? "" : `
        <label class="opcao-linha"><input type="checkbox" name="ativo" ${p.ativo === false ? "" : "checked"}> Agenda ativa</label>
        <p class="dica">Desativar esconde a agenda das telas, mas guarda todas as consultas. Dá para reativar depois.</p>`}

      <fieldset><legend>Horário de atendimento</legend>
        ${htmlHorario(p?.horario || c.horarioPadrao)}
      </fieldset>`);
    ligarHorario(form.querySelector(".horario"));
    if (novo) setTimeout(() => form.elements.nome.focus(), 50);

    aoEnviar(async () => {
      const nome = form.elements.nome.value.trim();
      if (!nome) return "Digite o nome da agenda.";
      const { horario, erro } = lerHorario(form.querySelector(".horario"));
      if (erro) return erro;
      const campos = { nome, cor: new FormData(form).get("cor") || CORES[0], horario };
      if (novo) {
        const id = idParaProfissional(nome, store.profissionais.map((x) => x.id));
        const ordem = Math.max(0, ...store.profissionais.map((x) => x.ordem || 0)) + 1;
        await salvarProfissional(id, { ...campos, ativo: true, ordem });
      } else {
        const ativo = form.elements.ativo.checked;
        const outrasAtivas = store.profissionais.filter((x) => x.id !== p.id && x.ativo !== false).length;
        if (!ativo && p.ativo !== false && outrasAtivas === 0
          && !confirm("Esta é a única agenda ativa. Sem ela, ninguém consegue marcar. Desativar mesmo assim?")) return false;
        await salvarProfissional(p.id, { ...campos, ativo });
      }
    }, novo ? "Agenda criada." : "Agenda salva.");
  }

  // ------------------------------------------------------------ usuárias

  function formNovaUsuaria() {
    const { form, aviso, aoEnviar } = janela("Nova usuária", `
      <label for="u-nome">Nome</label>
      <input id="u-nome" name="nome" maxlength="40" placeholder="Como vai aparecer em “marcado por”" required>

      <label for="u-email">E-mail</label>
      <input id="u-email" name="email" type="email" inputmode="email" autocapitalize="off" spellcheck="false" required>
      <p class="dica">Use um e-mail que ela acesse: é por ele que chega o “Esqueci minha senha”.</p>

      <label for="u-senha">Senha provisória</label>
      <input id="u-senha" name="senha" value="${esc(senhaProvisoria())}" autocomplete="off" spellcheck="false" required minlength="6">
      <p class="dica">Passe essa senha para ela. Depois ela pode criar outra em “Esqueci minha senha”.</p>

      <fieldset class="opcoes"><legend>Papel</legend>
        <label class="opcao"><input type="radio" name="papel" value="funcionaria" checked> Funcionária — marca, edita, cancela, encaixa</label>
        <label class="opcao"><input type="radio" name="papel" value="admin"> Admin — tudo isso + Configurações</label>
      </fieldset>`, "Criar conta");
    setTimeout(() => form.elements.nome.focus(), 50);

    aoEnviar(async () => {
      const nome = form.elements.nome.value.trim();
      const email = form.elements.email.value.trim();
      const senha = form.elements.senha.value;
      if (!nome) return "Digite o nome.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Digite um e-mail válido.";
      if (senha.length < 6) return "A senha precisa ter pelo menos 6 caracteres.";
      if (usuarias?.some((u) => (u.email || "").toLowerCase() === email.toLowerCase())) {
        return "Esse e-mail já está na lista. Se estiver desativada, abra o nome dela e reative.";
      }
      await criarUsuaria({ nome, email, senha, papel: new FormData(form).get("papel") });
      // Mostra os dados para o admin repassar, em vez de fechar a janela.
      form.querySelectorAll("input, fieldset").forEach((x) => { x.disabled = true; });
      form.querySelector('button[type="submit"]').hidden = true;
      aviso(`Conta criada! Passe para ${nome}: entrar com o e-mail ${email} e a senha ${senha}.`, "ok");
    }, false);
  }

  function formUsuaria(u) {
    if (!u) return;
    const souEu = u.uid === perfil.uid;
    const { form, aoEnviar } = janela(esc(u.nome || "Usuária"), `
      <p class="dica" style="margin-top:0">${esc(u.email || "")}</p>
      <label for="u-nome">Nome</label>
      <input id="u-nome" name="nome" maxlength="40" value="${esc(u.nome || "")}" required>

      <fieldset class="opcoes" ${souEu ? "disabled" : ""}><legend>Papel</legend>
        <label class="opcao"><input type="radio" name="papel" value="funcionaria" ${u.papel !== "admin" ? "checked" : ""}> Funcionária</label>
        <label class="opcao"><input type="radio" name="papel" value="admin" ${u.papel === "admin" ? "checked" : ""}> Admin</label>
      </fieldset>

      <label class="opcao-linha"><input type="checkbox" name="ativo" ${u.ativo === true ? "checked" : ""} ${souEu ? "disabled" : ""}> Pode entrar no site (ativa)</label>
      ${souEu ? `<p class="dica">Você não pode desativar nem tirar o admin de você mesmo.</p>`
        : `<p class="dica">Desmarcar desconecta na hora, em qualquer aparelho. As consultas que ela marcou continuam.</p>`}`);

    aoEnviar(async () => {
      const nome = form.elements.nome.value.trim();
      if (!nome) return "Digite o nome.";
      const campos = { nome };
      if (!souEu) {
        campos.papel = new FormData(form).get("papel");
        campos.ativo = form.elements.ativo.checked;
      }
      await atualizarUsuaria(u.uid, campos);
    }, "Usuária salva.");
  }

  // ------------------------------------------------------------ WhatsApp

  function formWhatsApp() {
    const c = cfg();
    const { form, aoEnviar } = janela("Mensagem do WhatsApp", `
      <label for="w-msg">Texto da mensagem</label>
      <textarea id="w-msg" name="msg" rows="5" maxlength="600">${esc(c.msgWhatsApp)}</textarea>
      <p class="dica">Partes trocadas automaticamente:
        <code>{paciente}</code> (primeiro nome) <code>{nomeCompleto}</code> <code>{profissional}</code> <code>{data}</code> <code>{diaSemana}</code> <code>{hora}</code> <code>{clinica}</code></p>
      <p class="dica"><strong>Como fica:</strong></p>
      <p class="previa-msg" data-previa></p>
      <button type="button" class="btn-link" data-padrao>Voltar ao texto original</button>`);
    const campo = form.elements.msg;
    const previa = form.querySelector("[data-previa]");
    const atualizar = () => { previa.textContent = montarMensagem(campo.value, exemploValores(c)); };
    campo.addEventListener("input", atualizar);
    form.querySelector("[data-padrao]").addEventListener("click", () => { campo.value = MSG_WHATSAPP_PADRAO; atualizar(); });
    atualizar();

    aoEnviar(async () => {
      const msg = campo.value.trim();
      if (!msg) return "Escreva a mensagem.";
      await salvarConfig({ msgWhatsApp: msg });
    }, "Mensagem salva.");
  }
}
