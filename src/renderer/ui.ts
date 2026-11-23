// =====================================================================
// ui.ts — pequenas ferramentas de tela que TODAS as páginas usam
// ---------------------------------------------------------------------
// Ficam num lugar só para que todas as telas mostrem erros do mesmo
// jeito, peçam confirmação do mesmo jeito e protejam o HTML da mesma
// forma.
// =====================================================================

import { Modal } from 'bootstrap';

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
 * Abre uma janela (modal do Bootstrap) perguntando "tem certeza?".
 * Devolve true se a pessoa clicou no botão de confirmar; false se
 * cancelou, fechou no X, apertou Esc ou clicou fora.
 *
 *   if (await confirmar('Excluir cliente', `Excluir "${nome}"?`, 'Excluir')) { ... }
 *
 * O título e a mensagem entram com textContent (nunca viram HTML).
 */
export function confirmar(
  titulo: string,
  mensagem: string,
  textoBotao = 'Confirmar',
): Promise<boolean> {
  return new Promise((resolver) => {
    const caixa = document.createElement('div');
    caixa.className = 'modal fade';
    caixa.tabIndex = -1;
    caixa.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"></h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
          </div>
          <div class="modal-body"></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-danger" data-confirmar></button>
          </div>
        </div>
      </div>`;
    (caixa.querySelector('.modal-title') as HTMLElement).textContent = titulo;
    (caixa.querySelector('.modal-body') as HTMLElement).textContent = mensagem;
    const botao = caixa.querySelector('[data-confirmar]') as HTMLButtonElement;
    botao.textContent = textoBotao;

    document.body.append(caixa);
    const modal = new Modal(caixa);
    let confirmou = false;

    botao.addEventListener('click', () => {
      confirmou = true;
      modal.hide();
    });
    // Quando a janela termina de fechar (por qualquer motivo): responde e
    // remove a janela da página, para não acumular.
    caixa.addEventListener('hidden.bs.modal', () => {
      modal.dispose();
      caixa.remove();
      resolver(confirmou);
    });

    modal.show();
  });
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
