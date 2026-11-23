// =====================================================================
// InicioPage.ts — a tela inicial ("quadro de avisos" da loja)
// ---------------------------------------------------------------------
// Na entrada da cozinha de um restaurante tem um quadro com o que
// importa AGORA. Aqui o quadro mostra:
//   1. os pedidos de HOJE, somados em reais, por situação
//      (abertos, confirmados, em rota, entregues, cancelados);
//   2. os produtos com estoque ABAIXO do mínimo (hora de repor!).
//
// Tudo vem num pedido só ao Main: inicio:resumo (InicioService).
// ADMIN e ATENDENTE veem esta tela. O ATENDENTE recebe o estoque baixo
// sem custo e margem (cortado no Main) e esta tela nem usa esses campos.
//
// Mesmo padrão das outras telas: nada de onclick="..." no HTML, todo
// texto do banco passa pelo escapar(), erros vêm de resposta.erro.
// =====================================================================

import type { Produto, StatusPedido } from '../../shared/tipos';
import { escapar, mostrarAlerta } from '../ui';

/** O formato do inicio:resumo (o mesmo do ResumoInicio, no Main). */
interface Resumo {
  estoque_baixo: Pick<Produto, 'id' | 'nome' | 'quantidade_estoque' | 'estoque_minimo'>[];
  pedidos_hoje: { status: StatusPedido; total: number }[];
}

// Como cada situação aparece na tela (nome e cor do Bootstrap)
const APARENCIA: Record<StatusPedido, { nome: string; cor: string }> = {
  ABERTO: { nome: 'Abertos', cor: 'secondary' },
  CONFIRMADO: { nome: 'Confirmados', cor: 'primary' },
  EM_ROTA: { nome: 'Em rota', cor: 'info' },
  ENTREGUE: { nome: 'Entregues', cor: 'success' },
  CANCELADO: { nome: 'Cancelados', cor: 'danger' },
};

const REAL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export class InicioPage {
  private app!: HTMLElement;

  async render(app: HTMLElement): Promise<void> {
    this.app = app;
    const hoje = new Date().toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });

    app.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h2 class="h4 mb-0">Início</h2>
          <div class="text-secondary small">${escapar(hoje)}</div>
        </div>
        <button type="button" id="inicio-atualizar" class="btn btn-outline-primary">Atualizar</button>
      </div>
      <div id="inicio-alerta"></div>

      <h3 class="h6 text-secondary mb-2">Pedidos de hoje (em R$)</h3>
      <div id="inicio-pedidos" class="row g-3 mb-4"></div>

      <h3 class="h6 text-secondary mb-2">Estoque abaixo do mínimo</h3>
      <div id="inicio-estoque">
        <div class="text-secondary">Carregando...</div>
      </div>`;

    this.el('inicio-atualizar').addEventListener('click', () => void this.carregar());
    await this.carregar();
  }

  /** Pede o resumo ao Main e redesenha o quadro. */
  private async carregar(): Promise<void> {
    const botao = this.el('inicio-atualizar') as HTMLButtonElement;
    botao.disabled = true;
    const resposta = await window.api.chamar<Resumo>('inicio:resumo');
    botao.disabled = false;

    if (!resposta.ok) {
      mostrarAlerta(this.el('inicio-alerta'), 'danger', resposta.erro);
      return;
    }
    this.el('inicio-alerta').replaceChildren(); // limpa um erro antigo
    this.desenharPedidos(resposta.dados.pedidos_hoje);
    this.desenharEstoque(resposta.dados.estoque_baixo);
  }

  /** Um "cartão" por situação, com o total em reais. */
  private desenharPedidos(pedidos: Resumo['pedidos_hoje']): void {
    this.el('inicio-pedidos').innerHTML = pedidos
      .map(({ status, total }) => {
        const { nome, cor } = APARENCIA[status] ?? { nome: status, cor: 'secondary' };
        return `
          <div class="col-6 col-md">
            <div class="card border-${cor} h-100">
              <div class="card-body py-3">
                <div class="small text-${cor} fw-semibold">${escapar(nome)}</div>
                <div class="fs-5">${REAL.format(total)}</div>
              </div>
            </div>
          </div>`;
      })
      .join('');
  }

  /** A lista do que precisa ser reposto (ou um "tudo certo"). */
  private desenharEstoque(produtos: Resumo['estoque_baixo']): void {
    const caixa = this.el('inicio-estoque');
    if (produtos.length === 0) {
      mostrarAlerta(caixa, 'success', 'Nenhum produto abaixo do estoque mínimo. 👍');
      return;
    }

    const linhas = produtos
      .map((p) => {
        const falta = p.estoque_minimo - p.quantidade_estoque;
        return `
          <tr>
            <td>⚠️ ${escapar(p.nome)}</td>
            <td class="text-end"><span class="badge text-bg-danger">${p.quantidade_estoque}</span></td>
            <td class="text-end">${p.estoque_minimo}</td>
            <td class="text-end">${falta}</td>
          </tr>`;
      })
      .join('');

    caixa.innerHTML = `
      <div class="table-responsive">
      <table class="table table-striped align-middle bg-white border mb-0">
        <thead>
          <tr>
            <th>Produto</th>
            <th class="text-end">Em estoque</th>
            <th class="text-end">Mínimo</th>
            <th class="text-end">Faltam</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
      </div>`;
  }

  private el(id: string): HTMLElement {
    return this.app.querySelector(`#${id}`) as HTMLElement;
  }
}
