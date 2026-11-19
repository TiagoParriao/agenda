// Janela (modal) e avisos rápidos (toast).

const dialogo = document.getElementById("modal");

dialogo.addEventListener("click", (e) => {
  if (e.target.closest("[data-fechar]")) fecharModal();
});
// O evento "close" chega um instante depois: se outra janela já foi aberta nesse meio-tempo, não apaga.
dialogo.addEventListener("close", () => { if (!dialogo.open) dialogo.innerHTML = ""; });

/** Abre a janela com o HTML dado e devolve o elemento <dialog>. */
export function abrirModal(html) {
  dialogo.innerHTML = html;
  if (!dialogo.open) dialogo.showModal();
  return dialogo;
}

export function fecharModal() {
  if (dialogo.open) dialogo.close();
}

let temporizador = null;

export function toast(texto, tipo = "ok") {
  const el = document.getElementById("toast");
  el.textContent = texto;
  el.className = `toast ${tipo} visivel`;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => el.classList.remove("visivel"), 3200);
}
