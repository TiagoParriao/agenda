// Dados gerais carregados uma vez após o login e mantidos em tempo real:
// configuração da clínica e lista de profissionais.
import { doc, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db } from "./firebase.js";

export const MSG_WHATSAPP_PADRAO =
  "Olá, {paciente}! Confirmando sua consulta com {profissional} em {data} ({diaSemana}) às {hora}. Responda SIM para confirmar.";

const HORARIO_SEG_SEX = Object.fromEntries([1, 2, 3, 4, 5].map((d) => [
  String(d), { inicio: "08:00", fim: "18:00", almocoInicio: "12:00", almocoFim: "14:00" },
]));

export const CONFIG_PADRAO = {
  nome: "Agenda",
  intervaloMin: 30,
  horarioPadrao: HORARIO_SEG_SEX,
  msgWhatsApp: MSG_WHATSAPP_PADRAO,
};
const CHAVE_PROF = "agenda.profissional";

export const store = {
  config: null,
  profissionais: [], // [{ id, nome, cor, ativo, ordem, horario }]
  pronto: false,
};

const ouvintes = new Set();
const avisar = () => ouvintes.forEach((fn) => fn());

export function aoMudarStore(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

let paradas = [];

export function iniciarStore() {
  pararStore();
  let temConfig = false, temProfs = false;
  const atualizarPronto = () => { store.pronto = temConfig && temProfs; };

  paradas = [
    onSnapshot(doc(db, "config", "clinica"), (s) => {
      store.config = { ...CONFIG_PADRAO, ...(s.data() || {}) };
      temConfig = true; atualizarPronto(); avisar();
    }, (e) => console.error(e)),
    onSnapshot(collection(db, "profissionais"), (s) => {
      store.profissionais = s.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || String(a.nome).localeCompare(String(b.nome)));
      temProfs = true; atualizarPronto(); avisar();
    }, (e) => console.error(e)),
  ];
}

export function pararStore() {
  paradas.forEach((p) => p());
  paradas = [];
  store.config = null;
  store.profissionais = [];
  store.pronto = false;
}

export const profissionaisAtivos = () => store.profissionais.filter((p) => p.ativo !== false);

/** Profissional escolhido por último neste aparelho (ou o primeiro). */
export function profissionalSelecionado() {
  const ativos = profissionaisAtivos();
  let id = null;
  try { id = localStorage.getItem(CHAVE_PROF); } catch { /* sem armazenamento */ }
  return ativos.find((p) => p.id === id) || ativos[0] || null;
}

export function escolherProfissional(id) {
  try { localStorage.setItem(CHAVE_PROF, id); } catch { /* sem armazenamento */ }
  avisar();
}
