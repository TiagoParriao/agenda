// Feriados nacionais (fixos + móveis pela Páscoa) e pontos facultativos.
// Sem dependências: usado pelo site e pelo script de dados de teste.

const FIXOS = {
  "01-01": "Confraternização Universal",
  "04-21": "Tiradentes",
  "05-01": "Dia do Trabalho",
  "09-07": "Independência do Brasil",
  "10-12": "Nossa Senhora Aparecida",
  "11-02": "Finados",
  "11-15": "Proclamação da República",
  "11-20": "Dia da Consciência Negra",
  "12-25": "Natal",
};

// Nomes curtos para caber no quadradinho do calendário.
const CURTOS = {
  "Confraternização Universal": "Ano Novo",
  "Dia do Trabalho": "Trabalho",
  "Independência do Brasil": "Independência",
  "Nossa Senhora Aparecida": "Aparecida",
  "Proclamação da República": "República",
  "Dia da Consciência Negra": "Consc. Negra",
  "Sexta-feira Santa": "Sexta Santa",
  "Corpus Christi": "Corpus Christi",
};
export const nomeCurto = (nome) => CURTOS[nome] || nome;

const doisDigitos = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
function pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia, 12);
}

function deslocar(data, dias) {
  const d = new Date(data);
  d.setDate(d.getDate() + dias);
  return d;
}

const cache = new Map();

/** Map "AAAA-MM-DD" -> { nome, tipo: "feriado" | "facultativo" } para o ano. */
export function feriadosDoAno(ano) {
  if (cache.has(ano)) return cache.get(ano);
  const mapa = new Map();
  for (const [mmdd, nome] of Object.entries(FIXOS)) mapa.set(`${ano}-${mmdd}`, { nome, tipo: "feriado" });

  const p = pascoa(ano);
  mapa.set(iso(deslocar(p, -2)), { nome: "Sexta-feira Santa", tipo: "feriado" });
  mapa.set(iso(deslocar(p, -48)), { nome: "Carnaval", tipo: "facultativo" });
  mapa.set(iso(deslocar(p, -47)), { nome: "Carnaval", tipo: "facultativo" });
  mapa.set(iso(deslocar(p, 60)), { nome: "Corpus Christi", tipo: "facultativo" });

  cache.set(ano, mapa);
  return mapa;
}

/** { nome, tipo } ou null. */
export function infoFeriado(dataISO) {
  return feriadosDoAno(Number(dataISO.slice(0, 4))).get(dataISO) || null;
}
