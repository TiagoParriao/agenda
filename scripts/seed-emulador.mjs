// Cria dados de TESTE no emulador local (não toca no Firebase real).
// Roda sozinho pelo "npm run dev"; também pode ser chamado com "npm run seed".
//
// Contas de teste (só existem no emulador):
//   admin@teste.local       senha: teste123   -> admin, ativo
//   ana@teste.local         senha: teste123   -> funcionária, ativa
//   bia@teste.local         senha: teste123   -> funcionária, DESATIVADA (não pode entrar)
//   semcadastro@teste.local senha: teste123   -> tem login mas NÃO tem cadastro em "usuarios" (não pode entrar)

import { infoFeriado } from "../js/feriados.js";

const PROJETO = "demo-agenda";

// Mesmas regras de js/agenda.js (aquele arquivo importa o Firebase do navegador, por isso não é importado aqui).
const normalizar = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const prefixos = (nome) => {
  const lista = new Set();
  for (const p of normalizar(nome).split(" ")) for (let i = 1; i <= Math.min(p.length, 20); i++) lista.add(p.slice(0, i));
  return [...lista];
};
const AUTH = "http://127.0.0.1:9099";
const FIRESTORE = "http://127.0.0.1:8080";
const SENHA = "teste123";

export const CONTAS = [
  { email: "admin@teste.local", nome: "Admin Teste", papel: "admin", ativo: true },
  { email: "ana@teste.local", nome: "Ana", papel: "funcionaria", ativo: true },
  { email: "bia@teste.local", nome: "Bia", papel: "funcionaria", ativo: false },
  { email: "semcadastro@teste.local", nome: null },
];

async function criarLogin(email) {
  const url = (acao) => `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:${acao}?key=demo-chave`;
  const corpo = JSON.stringify({ email, password: SENHA, returnSecureToken: true });
  const headers = { "Content-Type": "application/json" };

  let r = await fetch(url("signUp"), { method: "POST", headers, body: corpo });
  if (!r.ok) r = await fetch(url("signInWithPassword"), { method: "POST", headers, body: corpo }); // já existia
  if (!r.ok) throw new Error(`Falha ao criar ${email}: ${await r.text()}`);
  return (await r.json()).localId;
}

function campo(valor) {
  if (valor instanceof Date) return { timestampValue: valor.toISOString() };
  if (typeof valor === "boolean") return { booleanValue: valor };
  if (typeof valor === "number") return Number.isInteger(valor) ? { integerValue: String(valor) } : { doubleValue: valor };
  if (valor === null) return { nullValue: null };
  if (Array.isArray(valor)) return { arrayValue: { values: valor.map(campo) } };
  if (typeof valor === "object") {
    return { mapValue: { fields: Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, campo(v)])) } };
  }
  return { stringValue: String(valor) };
}

async function gravarDoc(caminho, dados) {
  const r = await fetch(`${FIRESTORE}/v1/projects/${PROJETO}/databases/(default)/documents/${caminho}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer owner" }, // "owner" ignora as regras (só no emulador)
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, campo(v)])) }),
  });
  if (!r.ok) throw new Error(`Falha ao gravar ${caminho}: ${await r.text()}`);
}

// ------------------------------------------------------------------ agenda de exemplo

const HORARIO_PADRAO = Object.fromEntries([1, 2, 3, 4, 5].map((d) => [
  String(d), { inicio: "08:00", fim: "18:00", almocoInicio: "12:00", almocoFim: "14:00" },
]));

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Os próximos `n` dias úteis a partir de hoje (inclusive), pulando feriados. */
function proximosDiasUteis(n) {
  const dias = [];
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  while (dias.length < n) {
    const s = iso(d);
    if (d.getDay() >= 1 && d.getDay() <= 5 && infoFeriado(s)?.tipo !== "feriado") dias.push(s);
    d.setDate(d.getDate() + 1);
  }
  return dias;
}

function agendamento(uidCriador, nomeCriador, profissionalId, data, hora, paciente, situacao, extra = {}) {
  const agora = new Date();
  return {
    profissionalId, data, hora, encaixe: false,
    paciente, pacienteBusca: normalizar(paciente), pacientePrefixos: prefixos(paciente),
    telefone: "", situacao, obs: "",
    criadoPor: uidCriador, criadoPorNome: nomeCriador, criadoEm: agora,
    atualizadoPor: uidCriador, atualizadoPorNome: nomeCriador, atualizadoEm: agora,
    ...extra,
  };
}

export async function semear() {
  const uids = {};
  for (const conta of CONTAS) {
    const uid = await criarLogin(conta.email);
    uids[conta.email] = uid;
    if (conta.nome) {
      await gravarDoc(`usuarios/${uid}`, { nome: conta.nome, email: conta.email, papel: conta.papel, ativo: conta.ativo });
    }
  }

  await gravarDoc("config/clinica", { nome: "Consultório", intervaloMin: 30, horarioPadrao: HORARIO_PADRAO });
  await gravarDoc("profissionais/nayara", { nome: "Dra. Nayara", cor: "#0f6b5c", ativo: true, ordem: 1, horario: HORARIO_PADRAO });

  // Algumas consultas de exemplo nos próximos dois dias úteis (agenda da Dra. Nayara).
  const ana = uids["ana@teste.local"];
  const [dia1, dia2] = proximosDiasUteis(2);
  const P = "nayara";
  const exemplos = [
    agendamento(ana, "Ana", P, dia1, "08:00", "Maria da Silva", "Confirmado", { telefone: "(94) 99999-0001" }),
    agendamento(ana, "Ana", P, dia1, "08:30", "João Pereira", "Agendado", { telefone: "(94) 99999-0002" }),
    agendamento(ana, "Ana", P, dia1, "09:00", "Ana Clara Souza", "Atendido"),
    agendamento(ana, "Ana", P, dia1, "10:00", "Pedro Henrique Lima", "Faltou", { telefone: "(94) 99999-0004" }),
    agendamento(ana, "Ana", P, dia1, "10:30", "Lúcia Gomes", "Cancelado", { telefone: "(94) 99999-0005" }),
    agendamento(ana, "Ana", P, dia2, "09:00", "Maria da Silva", "Agendado", { telefone: "(94) 99999-0001" }),
  ];
  for (const a of exemplos) {
    await gravarDoc(`agendamentos/${P}_${a.data}_${a.hora.replace(":", "-")}`, a);
  }
  await gravarDoc("agendamentos/exemploEncaixe01", {
    ...agendamento(ana, "Ana", P, dia1, "09:15", "José Antônio", "Agendado", { telefone: "(94) 99999-0006" }),
    encaixe: true,
  });
  await gravarDoc("bloqueios/exemploBloqueio01", {
    profissionalId: P, data: dia1, horaInicio: "15:00", horaFim: "16:00", motivo: "Reunião",
    criadoPor: ana, criadoPorNome: "Ana", criadoEm: new Date(),
  });

  console.log(`\n✅ Dados de teste criados no emulador (consultas de exemplo em ${dia1} e ${dia2}). Contas em scripts/seed-emulador.mjs\n`);
}

if (process.argv[1]?.endsWith("seed-emulador.mjs")) { // rodado direto (npm run seed), não importado
  semear().catch((e) => { console.error(e); process.exit(1); });
}
