// Regras da agenda: gerar horários, ler e gravar agendamentos, bloqueios e fechamentos.
import {
  doc, collection, query, where, orderBy, limit, onSnapshot, getDocs, runTransaction,
  addDoc, setDoc, updateDoc, deleteDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { infoFeriado, nomeCurto } from "./feriados.js";

export const SITUACOES = ["Agendado", "Confirmado", "Atendido", "Faltou", "Cancelado"];

const DIAS_PLURAL = ["aos domingos", "às segundas", "às terças", "às quartas", "às quintas", "às sextas", "aos sábados"];

// ---------------------------------------------------------------- horas

export const minutos = (hora) => {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
};

export const deMinutos = (total) =>
  `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

/** "09:30" -> "9h30", "14:00" -> "14h" */
export function horaCurta(hora) {
  const [h, m] = hora.split(":");
  return `${Number(h)}h${m === "00" ? "" : m}`;
}

/**
 * Horários do dia a partir do horário do profissional.
 * horarioDia = { inicio, fim, almocoInicio?, almocoFim? }  (null = não atende)
 */
export function gerarGrade(horarioDia, intervaloMin) {
  if (!horarioDia?.inicio || !horarioDia?.fim) return [];
  const passo = Number(intervaloMin) || 30;
  const inicio = minutos(horarioDia.inicio);
  const fim = minutos(horarioDia.fim);
  const almocoIni = horarioDia.almocoInicio ? minutos(horarioDia.almocoInicio) : null;
  const almocoFim = horarioDia.almocoFim ? minutos(horarioDia.almocoFim) : null;
  const grade = [];
  for (let m = inicio; m + passo <= fim; m += passo) {
    const noAlmoco = almocoIni !== null && almocoFim !== null && m < almocoFim && m + passo > almocoIni;
    if (!noAlmoco) grade.push(deMinutos(m));
  }
  return grade;
}

/**
 * Situação de um dia para um profissional: está fechado (e por quê)? quais são os horários?
 * Usado pela tela do dia e pelo calendário do mês, para os dois mostrarem sempre o mesmo.
 */
export function estadoDoDia({ prof, iso, intervaloMin, fechClinica, fechProf }) {
  const diaSemana = new Date(`${iso}T12:00:00`).getDay();
  const horarioDia = prof.horario?.[diaSemana] || null;
  const feriado = infoFeriado(iso);

  let fechado = null;
  if (fechClinica) {
    fechado = { tipo: "manual", texto: `Clínica fechada — ${fechClinica.motivo}`, curto: fechClinica.motivo, alvo: "clinica", por: fechClinica.criadoPorNome };
  } else if (fechProf) {
    fechado = { tipo: "manual", texto: `Agenda de ${prof.nome} fechada — ${fechProf.motivo}`, curto: fechProf.motivo, alvo: prof.id, por: fechProf.criadoPorNome };
  } else if (feriado?.tipo === "feriado") {
    fechado = { tipo: "feriado", texto: `Clínica fechada — Feriado: ${feriado.nome}`, curto: nomeCurto(feriado.nome) };
  } else if (!horarioDia) {
    fechado = { tipo: "sem-atendimento", texto: `${prof.nome} não atende ${DIAS_PLURAL[diaSemana]}`, curto: "" };
  }

  const grade = fechado ? [] : gerarGrade(horarioDia, intervaloMin);
  return { horarioDia, feriado, fechado, grade };
}

/** Números de um dia: horários ocupados, livres, bloqueados e encaixes/extras. */
export function lotacao(grade, agendamentos, bloqueios) {
  const ativo = (a) => a && a.situacao !== "Cancelado";
  const normais = new Map(agendamentos.filter((a) => !a.encaixe).map((a) => [a.hora, a]));
  const bloqueado = (h) => bloqueios.some((b) => b.horaInicio <= h && h < b.horaFim);
  const naGrade = new Set(grade);
  const ocupados = grade.filter((h) => ativo(normais.get(h))).length;
  const bloqueados = grade.filter((h) => !ativo(normais.get(h)) && bloqueado(h)).length;
  const encaixes = agendamentos.filter((a) => a.encaixe && ativo(a)).length;
  const fora = agendamentos.filter((a) => !a.encaixe && ativo(a) && !naGrade.has(a.hora)).length;
  return { total: grade.length, ocupados, bloqueados, livres: grade.length - ocupados - bloqueados, encaixes, fora };
}

// ---------------------------------------------------------------- texto

/** Minúsculo, sem acento e sem símbolos: "José  D'Ávila" -> "jose d avila" */
export function normalizar(texto) {
  return String(texto || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Prefixos de cada palavra, para a busca "pelo início de qualquer palavra". */
export function prefixos(nome) {
  const lista = new Set();
  for (const palavra of normalizar(nome).split(" ")) {
    for (let i = 1; i <= Math.min(palavra.length, 20); i++) lista.add(palavra.slice(0, i));
  }
  return [...lista];
}

/** Máscara de telefone: (94) 99999-9999 ou (94) 9999-9999. */
export function mascaraTelefone(valor) {
  const d = String(valor || "").replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// ---------------------------------------------------------------- erros

export class ErroAgenda extends Error {
  constructor(codigo, mensagem) { super(mensagem); this.codigo = codigo; }
}

export function mensagemErro(erro) {
  if (erro instanceof ErroAgenda) return erro.message;
  switch (erro?.code) {
    case "permission-denied": return "Você não tem permissão para fazer isso.";
    case "unavailable":
    case "failed-precondition": return "Sem conexão com a internet. Tente de novo.";
    case "already-exists": return "Isso já foi feito por outra pessoa. Confira a tela.";
    default: return "Não deu certo. Tente de novo.";
  }
}

export function exigirInternet() {
  if (!navigator.onLine) throw new ErroAgenda("offline", "Sem conexão com a internet. Você pode ver a agenda, mas não pode alterar.");
}

// ---------------------------------------------------------------- leitura em tempo real

export const idHorario = (profId, data, hora) => `${profId}_${data}_${hora.replace(":", "-")}`;

/**
 * Observa tudo de um dia de um profissional. `aoMudar` recebe
 * { agendamentos, bloqueios, fechClinica, fechProf } sempre que algo muda (de qualquer celular).
 */
export function observarDia(profId, data, aoMudar, aoErro) {
  const estado = { agendamentos: null, bloqueios: null, fechClinica: undefined, fechProf: undefined };
  const avisar = () => {
    if (estado.agendamentos && estado.bloqueios && estado.fechClinica !== undefined && estado.fechProf !== undefined) {
      aoMudar({ ...estado });
    }
  };
  const lista = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }));

  const paradas = [
    onSnapshot(
      query(collection(db, "agendamentos"), where("profissionalId", "==", profId), where("data", "==", data)),
      (s) => { estado.agendamentos = lista(s); avisar(); }, aoErro),
    onSnapshot(
      query(collection(db, "bloqueios"), where("profissionalId", "==", profId), where("data", "==", data)),
      (s) => { estado.bloqueios = lista(s); avisar(); }, aoErro),
    onSnapshot(doc(db, "fechamentos", `${data}_clinica`),
      (s) => { estado.fechClinica = s.exists() ? { id: s.id, ...s.data() } : null; avisar(); }, aoErro),
    onSnapshot(doc(db, "fechamentos", `${data}_${profId}`),
      (s) => { estado.fechProf = s.exists() ? { id: s.id, ...s.data() } : null; avisar(); }, aoErro),
  ];
  return () => paradas.forEach((parar) => parar());
}

/**
 * Observa um mês inteiro ("AAAA-MM") de um profissional, para o calendário.
 * `aoMudar` recebe { agendamentos, bloqueios, fechamentos } (listas do mês todo).
 */
export function observarMes(profId, anoMes, aoMudar, aoErro) {
  const ini = `${anoMes}-01`, fim = `${anoMes}-31`;
  const estado = { agendamentos: null, bloqueios: null, fechamentos: null };
  const avisar = () => {
    if (estado.agendamentos && estado.bloqueios && estado.fechamentos) aoMudar({ ...estado });
  };
  const lista = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const doMes = (col, ...filtros) =>
    query(collection(db, col), ...filtros, where("data", ">=", ini), where("data", "<=", fim));

  const paradas = [
    onSnapshot(doMes("agendamentos", where("profissionalId", "==", profId)),
      (s) => { estado.agendamentos = lista(s); avisar(); }, aoErro),
    onSnapshot(doMes("bloqueios", where("profissionalId", "==", profId)),
      (s) => { estado.bloqueios = lista(s); avisar(); }, aoErro),
    onSnapshot(doMes("fechamentos"),
      (s) => { estado.fechamentos = lista(s).filter((f) => f.alvo === "clinica" || f.alvo === profId); avisar(); }, aoErro),
  ];
  return () => paradas.forEach((parar) => parar());
}

// ---------------------------------------------------------------- busca

/**
 * Agendamentos cujo nome tem palavras começando com cada palavra digitada
 * ("mar silv" acha "Maria da Silva"). Mais recentes primeiro.
 */
export async function buscarAgendamentos(termo, maximo = 50) {
  const palavras = normalizar(termo).split(" ").filter(Boolean).map((p) => p.slice(0, 20));
  if (!palavras.length) return [];
  // O banco filtra pela palavra mais longa (mais seletiva); as outras são conferidas aqui.
  const chave = palavras.reduce((a, b) => (b.length > a.length ? b : a));
  const snap = await getDocs(query(
    collection(db, "agendamentos"),
    where("pacientePrefixos", "array-contains", chave),
    orderBy("data", "desc"),
    limit(maximo),
  ));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((a) => palavras.every((p) => a.pacientePrefixos?.includes(p)));
}

/** Pacientes distintos já atendidos, com o telefone mais recente (para o autocompletar). */
export async function sugerirPacientes(termo, maximo = 6) {
  const pacientes = new Map();
  for (const a of await buscarAgendamentos(termo, 30)) {
    const atual = pacientes.get(a.pacienteBusca);
    if (!atual) pacientes.set(a.pacienteBusca, { paciente: a.paciente, telefone: a.telefone || "", ultima: a.data });
    else if (!atual.telefone && a.telefone) atual.telefone = a.telefone;
  }
  return [...pacientes.values()].slice(0, maximo);
}

// ---------------------------------------------------------------- gravação

function carimbo(perfil, criando) {
  const c = { atualizadoPor: perfil.uid, atualizadoPorNome: perfil.nome || "", atualizadoEm: serverTimestamp() };
  if (criando) Object.assign(c, { criadoPor: perfil.uid, criadoPorNome: perfil.nome || "", criadoEm: serverTimestamp() });
  return c;
}

const PARTICULAS = new Set(["da", "das", "de", "di", "do", "dos", "e"]);

/** "maria DA silva" -> "Maria da Silva" */
export function capitalizarNome(nome) {
  return nome.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR").split(" ")
    .map((p, i) => (i > 0 && PARTICULAS.has(p) ? p : p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1)))
    .join(" ");
}

function camposPaciente(f) {
  const paciente = capitalizarNome(f.paciente);
  return {
    paciente,
    pacienteBusca: normalizar(paciente),
    pacientePrefixos: prefixos(paciente),
    telefone: f.telefone || "",
    situacao: f.situacao,
    obs: (f.obs || "").trim(),
  };
}

/** Marca um horário normal. Falha se alguém ocupou antes; se havia um Cancelado, guarda-o no histórico. */
export async function marcar(perfil, profId, data, hora, f) {
  exigirInternet();
  const ref = doc(db, "agendamentos", idHorario(profId, data, hora));
  await runTransaction(db, async (tx) => {
    const atual = await tx.get(ref);
    if (atual.exists() && atual.data().situacao !== "Cancelado") {
      throw new ErroAgenda("ocupado", "Esse horário acabou de ser ocupado por outra pessoa.");
    }
    if (atual.exists()) {
      tx.set(doc(collection(db, "cancelados")), {
        ...atual.data(),
        idOriginal: atual.id,
        substituidoPor: perfil.uid,
        substituidoPorNome: perfil.nome || "",
        substituidoEm: serverTimestamp(),
      });
    }
    tx.set(ref, {
      profissionalId: profId, data, hora, encaixe: false,
      ...camposPaciente(f),
      ...carimbo(perfil, true),
    });
  });
}

export async function encaixar(perfil, profId, data, hora, f) {
  exigirInternet();
  await addDoc(collection(db, "agendamentos"), {
    profissionalId: profId, data, hora, encaixe: true,
    ...camposPaciente(f),
    ...carimbo(perfil, true),
  });
}

/** `restrito` = dia passado para funcionária: só situação e observação. */
export async function editar(perfil, ag, f, restrito) {
  exigirInternet();
  const campos = restrito
    ? { situacao: f.situacao, obs: (f.obs || "").trim() }
    : camposPaciente(f);
  await updateDoc(doc(db, "agendamentos", ag.id), { ...campos, ...carimbo(perfil, false) });
}

export async function cancelar(perfil, ag) {
  exigirInternet();
  await updateDoc(doc(db, "agendamentos", ag.id), { situacao: "Cancelado", ...carimbo(perfil, false) });
}

export async function excluir(ag) {
  exigirInternet();
  await deleteDoc(doc(db, "agendamentos", ag.id));
}

export async function bloquear(perfil, profId, data, horaInicio, horaFim, motivo) {
  exigirInternet();
  await addDoc(collection(db, "bloqueios"), {
    profissionalId: profId, data, horaInicio, horaFim, motivo: motivo.trim(),
    criadoPor: perfil.uid, criadoPorNome: perfil.nome || "", criadoEm: serverTimestamp(),
  });
}

export async function removerBloqueio(id) {
  exigirInternet();
  await deleteDoc(doc(db, "bloqueios", id));
}

/** alvo = "clinica" ou o ID do profissional. */
export async function fecharDia(perfil, data, alvo, motivo) {
  exigirInternet();
  await setDoc(doc(db, "fechamentos", `${data}_${alvo}`), {
    data, alvo, motivo: motivo.trim(),
    criadoPor: perfil.uid, criadoPorNome: perfil.nome || "", criadoEm: serverTimestamp(),
  });
}

export async function reabrirDia(data, alvo) {
  exigirInternet();
  await deleteDoc(doc(db, "fechamentos", `${data}_${alvo}`));
}
