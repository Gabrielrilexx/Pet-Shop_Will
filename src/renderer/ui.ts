// =====================================================================
// ui.ts — pequenas ferramentas de tela que TODAS as páginas usam
// ---------------------------------------------------------------------
// Ficam num lugar só para que todas as telas mostrem erros do mesmo
// jeito e protejam o HTML da mesma forma.
// =====================================================================

export type TipoAlerta = 'success' | 'danger' | 'warning' | 'info';

/**
 * Mostra um alerta do Bootstrap dentro de "container" (troca o que
 * estava lá). Usa textContent: a mensagem NUNCA vira HTML.
 *
 *   mostrarAlerta(caixa, 'danger', resposta.erro);
 */
export function mostrarAlerta(
  container: HTMLElement,
  tipo: TipoAlerta,
  mensagem: string,
): void {
  const alerta = document.createElement('div');
  alerta.className = `alert alert-${tipo}`;
  alerta.setAttribute('role', 'alert');
  alerta.textContent = mensagem;
  container.replaceChildren(alerta);
}

/**
 * Troca os caracteres especiais do HTML por versões "inofensivas".
 * Use em TODO texto que vem de dados antes de montar HTML com crase:
 *
 *   `<td>${escapar(cliente.nome)}</td>`
 *
 * Assim, um nome como "<script>...</script>" aparece como texto e
 * nunca vira código (ataque chamado XSS).
 */
export function escapar(texto: unknown): string {
  return String(texto ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
