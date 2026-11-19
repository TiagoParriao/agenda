// Funções de data e texto usadas em várias telas.

const DIAS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

const doisDigitos = (n) => String(n).padStart(2, "0");

/** Data local no formato "AAAA-MM-DD". */
export function paraISO(data) {
  return `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}`;
}

/** "AAAA-MM-DD" -> Date (meio-dia local, para não sofrer com fuso). */
export function deISO(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d, 12);
}

export function hojeISO() {
  return paraISO(new Date());
}

export function isoValida(iso) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && paraISO(deISO(iso)) === iso;
}

export function somarDias(iso, n) {
  const d = deISO(iso);
  d.setDate(d.getDate() + n);
  return paraISO(d);
}

/** "2026-11-18" -> "18/11/2026" */
export function dataBR(iso) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export function diaDaSemana(iso) {
  return DIAS[deISO(iso).getDay()];
}

/** Escapa texto para inserir com segurança em HTML. */
export function esc(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
