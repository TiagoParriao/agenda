// Abas de profissional (só aparecem quando há mais de um ativo).
// O clique é tratado por cada tela: data-acao="prof" data-id="<id>".
import { profissionaisAtivos } from "./store.js";
import { esc } from "./util.js";

export function htmlAbas(profAtual) {
  const ativos = profissionaisAtivos();
  if (ativos.length < 2) return "";
  return `<div class="abas" role="tablist">${ativos.map((p) => `
    <button type="button" role="tab" class="aba${p.id === profAtual?.id ? " ativa" : ""}" aria-selected="${p.id === profAtual?.id}"
      data-acao="prof" data-id="${esc(p.id)}" style="--cor:${esc(p.cor || "#0f6b5c")}">${esc(p.nome)}</button>`).join("")}
  </div>`;
}
