// Mensagem de confirmação pelo WhatsApp.
import { MSG_WHATSAPP_PADRAO } from "./store.js";
import { horaCurta } from "./agenda.js";
import { dataBR, diaDaSemana } from "./util.js";

/** Troca {campos} do modelo pelos valores. Campos desconhecidos ficam como estão. */
export function montarMensagem(modelo, valores) {
  return String(modelo || MSG_WHATSAPP_PADRAO).replace(/\{(\w+)\}/g, (tudo, chave) => valores[chave] ?? tudo);
}

/** Valores de um agendamento para a mensagem. {paciente} = primeiro nome; {nomeCompleto} = nome todo. */
export function valoresDoAgendamento(ag, profissional, config) {
  return {
    paciente: ag.paciente.split(" ")[0],
    nomeCompleto: ag.paciente,
    profissional: profissional?.nome || "",
    data: dataBR(ag.data).slice(0, 5),
    diaSemana: diaDaSemana(ag.data).toLowerCase(),
    hora: horaCurta(ag.hora),
    clinica: config?.nome || "",
  };
}

/** Link wa.me com o número (DDI 55 do Brasil) e o texto pronto. null se o telefone não servir. */
export function linkWhatsApp(telefone, texto) {
  let digitos = String(telefone || "").replace(/\D/g, "");
  if (digitos.length === 10 || digitos.length === 11) digitos = "55" + digitos;
  if (digitos.length < 12) return null;
  return `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`;
}
