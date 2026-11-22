// =====================================================================
// PedidosPage.ts — o "BALCÃO DE ATENDIMENTO" DOS PEDIDOS
// ---------------------------------------------------------------------
// É a tela onde o atendente trabalha com os pedidos que chegam pelo
// WhatsApp. Uma página só, com duas partes:
//   1. a LISTA de pedidos, com um filtro por status (como a pilha de
//      comandas presas no balcão, que dá para separar por cor);
//   2. o FORMULÁRIO de novo pedido, que aparece ao clicar em "Novo
//      pedido": escolher o cliente, adicionar produtos (vendo o
//      estoque), conferir o subtotal e salvar.
//
// ESTADO ATUAL (PROVISÓRIO): a tela ainda NÃO conversa com o sistema,
// porque o IpcRouter e o window.api do Integrante 1 (Passo 6) ainda não
// existem. Por isso ela usa DADOS DE EXEMPLO fixos, copiados do
// database/exemplo.sql, e mostra uma faixa amarela avisando isso.
// No Passo 4, cada trecho marcado com "TROCAR NO PASSO 4" vira uma
// chamada window.api.chamar(...).
//
// Regras de segurança desta tela:
//   - nada de onclick="..." no HTML: os botões são ligados pelo código
//     (addEventListener), porque a Content-Security-Policy do Electron
//     bloqueia código escrito dentro do HTML;
//   - todo texto que vem de dados (nome de cliente, produto...) passa
//     pelo escapar() antes de entrar no HTML, para um nome como
//     "<script>..." aparecer como texto e não virar código;
//   - a conferência de estoque AQUI é só conforto para o atendente.
//     Quem decide de verdade é o Main (PedidoService), porque a tela
//     pode ser burlada pelo DevTools.
//
// Autor: Integrante 4 (pedidos e entregas)
// =====================================================================

import type { Cliente, Pedido, Produto, StatusPedido } from '../../shared/tipos';

// ---------------------------------------------------------------------
// Os formatos que ESTA TELA usa. São "recortes" das interfaces do
// tipos.ts (Pick = "pegue só estes campos"): a tela não precisa, nem
// deve receber, o custo e a margem do produto, por exemplo.
// ---------------------------------------------------------------------
type ClienteNaTela = Pick<Cliente, 'id' | 'nome' | 'distancia_km'>;
type ProdutoNaTela = Pick<Produto, 'id' | 'nome' | 'preco_venda' | 'quantidade_estoque'>;

/** Uma linha do formulário de novo pedido (o nome e o preço são só para mostrar). */
interface ItemNaTela {
    produto_id: number;
    nome: string;
    quantidade: number;
    preco_unitario: number;
}

// =====================================================================
// DADOS PROVISÓRIOS — TROCAR NO PASSO 4
// Copiados do database/exemplo.sql só para enxergar a tela. Os ids aqui
// são de mentira: no banco de verdade podem ser outros números.
// =====================================================================
const CLIENTES_PROVISORIOS: ClienteNaTela[] = [
    { id: 1, nome: 'Ana Souza', distancia_km: 2.1 },
    { id: 2, nome: 'Bruno Lima', distancia_km: 1.4 },
    { id: 3, nome: 'Carla Mendes', distancia_km: 2.8 },
    { id: 4, nome: 'Diego Rocha', distancia_km: null },
];

const PRODUTOS_PROVISORIOS: ProdutoNaTela[] = [
    { id: 1, nome: 'Ração Premium Cão Adulto 15kg', preco_venda: 195.0, quantidade_estoque: 20 },
    { id: 2, nome: 'Ração Gato Castrado 10kg', preco_venda: 156.0, quantidade_estoque: 15 },
    { id: 3, nome: 'Alpiste 500g', preco_venda: 9.8, quantidade_estoque: 30 },
    { id: 4, nome: 'Bolinha de Borracha', preco_venda: 9.6, quantidade_estoque: 40 },
    { id: 5, nome: 'Coleira Ajustável M', preco_venda: 22.5, quantidade_estoque: 25 },
    { id: 6, nome: 'Ração para Peixes Tropicais 50g', preco_venda: 12.0, quantidade_estoque: 3 },
    { id: 7, nome: 'Arranhador para Gatos', preco_venda: 63.0, quantidade_estoque: 0 },
    { id: 8, nome: 'Antipulgas Importado (cães)', preco_venda: 94.5, quantidade_estoque: 12 },
    { id: 9, nome: 'Vermífugo Importado (gatos)', preco_venda: 67.3, quantidade_estoque: 8 },
];

const PEDIDOS_PROVISORIOS: Pedido[] = [
    {
        id: 1, cliente_id: 1, usuario_id: 1, data_pedido: new Date(2026, 10, 22, 9, 15),
        status: 'ENTREGUE', subtotal: 390, taxa_entrega: 4.2, total: 394.2, observacao: null
    },
    {
        id: 2, cliente_id: 2, usuario_id: 1, data_pedido: new Date(2026, 10, 22, 10, 40),
        status: 'EM_ROTA', subtotal: 94.5, taxa_entrega: 3.5, total: 98, observacao: 'Apto 12'
    },
    {
        id: 3, cliente_id: 3, usuario_id: 1, data_pedido: new Date(2026, 10, 22, 11, 5),
        status: 'CONFIRMADO', subtotal: 156, taxa_entrega: 0, total: 156, observacao: null
    },
    {
        id: 4, cliente_id: 4, usuario_id: 1, data_pedido: new Date(2026, 10, 22, 11, 30),
        status: 'ABERTO', subtotal: 19.2, taxa_entrega: 0, total: 19.2, observacao: null
    },
];
// ======================== fim dos dados provisórios ===================

/** Como cada status aparece na tela (texto e cor do Bootstrap). */
const STATUS: Record<StatusPedido, { rotulo: string; cor: string }> = {
    ABERTO: { rotulo: 'Aberto', cor: 'secondary' },
    CONFIRMADO: { rotulo: 'Confirmado', cor: 'primary' },
    EM_ROTA: { rotulo: 'Em rota', cor: 'warning' },
    ENTREGUE: { rotulo: 'Entregue', cor: 'success' },
    CANCELADO: { rotulo: 'Cancelado', cor: 'danger' },
};

// Formatadores do jeito brasileiro: "R$ 1.234,50" e "22/11/2026 11:30".
const reais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export class PedidosPage {
    // "!" = "prometo que vou preencher antes de usar" (é preenchido no render).
    private app!: HTMLElement;
    private clientes: ClienteNaTela[] = [];
    private produtos: ProdutoNaTela[] = [];
    private pedidos: Pedido[] = [];
    private itens: ItemNaTela[] = []; // os itens do pedido que está sendo montado

    /** Desenha a página dentro do <main id="app"> (contrato do Integrante 1). */
    async render(app: HTMLElement): Promise<void> {
        this.app = app;

        // TROCAR NO PASSO 4: buscar no sistema com window.api.chamar(...)
        // ('clientes:listar', 'produtos:listar' e 'pedidos:listar').
        this.clientes = CLIENTES_PROVISORIOS;
        this.produtos = PRODUTOS_PROVISORIOS;
        this.pedidos = [...PEDIDOS_PROVISORIOS]; // cópia, para não estragar o original

        app.innerHTML = this.montarHtml();
        this.ligarEventos();
        this.desenharLista();
    }

    // ===================================================================
    // 1. O "ESQUELETO" DA PÁGINA (HTML com Bootstrap)
    // ===================================================================

    private montarHtml(): string {
        const opcoesStatus = Object.entries(STATUS)
            .map(([valor, s]) => `<option value="${valor}">${s.rotulo}</option>`)
            .join('');

        const opcoesClientes = this.clientes
            .map((c) => `<option value="${c.id}">${escapar(c.nome)}</option>`)
            .join('');

        // Produto sem estoque aparece, mas desabilitado (não dá para escolher).
        const opcoesProdutos = this.produtos
            .map((p) => {
                const semEstoque = p.quantidade_estoque <= 0;
                const texto = `${p.nome} — ${reais.format(p.preco_venda)} ` +
                    (semEstoque ? '(sem estoque)' : `(estoque: ${p.quantidade_estoque})`);
                return `<option value="${p.id}" ${semEstoque ? 'disabled' : ''}>${escapar(texto)}</option>`;
            })
            .join('');

        return `
      <div class="container-fluid py-3">
        <div class="alert alert-warning py-2 small">
          <strong>Dados de exemplo (provisório).</strong>
          Esta tela ainda não está ligada ao sistema: nada é salvo no banco.
        </div>

        <div class="d-flex justify-content-between align-items-center mb-3">
          <h2 class="h4 mb-0">Pedidos</h2>
          <button id="pedidos-novo" class="btn btn-primary">+ Novo pedido</button>
        </div>

        <div id="pedidos-alerta"></div>

        <!-- ============ FORMULÁRIO DE NOVO PEDIDO (começa escondido) ============ -->
        <div id="pedidos-formulario" class="card mb-4 d-none">
          <div class="card-header fw-semibold">Novo pedido</div>
          <div class="card-body">
            <div class="mb-3">
              <label for="pedidos-cliente" class="form-label">Cliente</label>
              <select id="pedidos-cliente" class="form-select">
                <option value="">Escolha o cliente...</option>
                ${opcoesClientes}
              </select>
            </div>

            <div class="row g-2 align-items-end mb-3">
              <div class="col-md-7">
                <label for="pedidos-produto" class="form-label">Produto</label>
                <select id="pedidos-produto" class="form-select">
                  <option value="">Escolha o produto...</option>
                  ${opcoesProdutos}
                </select>
              </div>
              <div class="col-md-2">
                <label for="pedidos-quantidade" class="form-label">Quantidade</label>
                <input id="pedidos-quantidade" type="number" min="1" step="1" value="1" class="form-control">
              </div>
              <div class="col-md-3 d-grid">
                <button id="pedidos-adicionar" class="btn btn-outline-primary">Adicionar item</button>
              </div>
            </div>

            <table class="table table-sm align-middle">
              <thead>
                <tr><th>Produto</th><th class="text-end">Qtd.</th>
                    <th class="text-end">Preço un.</th><th class="text-end">Total</th><th></th></tr>
              </thead>
              <tbody id="pedidos-itens"></tbody>
            </table>

            <div class="d-flex justify-content-end gap-4 mb-3">
              <span class="text-muted">Taxa de entrega: calculada na saída do motoboy</span>
              <span class="fw-semibold">Subtotal: <span id="pedidos-subtotal">R$ 0,00</span></span>
            </div>

            <div class="mb-3">
              <label for="pedidos-observacao" class="form-label">Observação (opcional)</label>
              <textarea id="pedidos-observacao" class="form-control" rows="2" maxlength="255"></textarea>
            </div>

            <div class="d-flex justify-content-end gap-2">
              <button id="pedidos-cancelar" class="btn btn-outline-secondary">Cancelar</button>
              <button id="pedidos-salvar" class="btn btn-success">Salvar pedido</button>
            </div>
          </div>
        </div>

        <!-- ============ LISTA DE PEDIDOS ============ -->
        <div class="d-flex align-items-center gap-2 mb-2">
          <label for="pedidos-filtro" class="form-label mb-0">Status:</label>
          <select id="pedidos-filtro" class="form-select form-select-sm w-auto">
            <option value="">Todos</option>
            ${opcoesStatus}
          </select>
        </div>

        <table class="table table-hover align-middle">
          <thead>
            <tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Status</th><th class="text-end">Total</th></tr>
          </thead>
          <tbody id="pedidos-lista"></tbody>
        </table>
      </div>`;
    }

    // ===================================================================
    // 2. LIGAR OS BOTÕES (o "fio" entre o clique e o que acontece)
    // ===================================================================

    private ligarEventos(): void {
        this.el('pedidos-filtro').addEventListener('change', () => this.desenharLista());
        this.el('pedidos-novo').addEventListener('click', () => this.abrirFormulario());
        this.el('pedidos-cancelar').addEventListener('click', () => this.fecharFormulario());
        this.el('pedidos-adicionar').addEventListener('click', () => this.adicionarItem());
        this.el('pedidos-salvar').addEventListener('click', () => this.salvar());

        // Botões "Remover" de cada item: em vez de ligar um por um (eles são
        // criados e apagados toda hora), ligamos UM "ouvido" na tabela toda
        // e descobrimos qual botão foi clicado pelo data-indice dele.
        this.el('pedidos-itens').addEventListener('click', (evento) => {
            const botao = (evento.target as HTMLElement).closest<HTMLElement>('[data-indice]');
            if (botao) {
                this.itens.splice(Number(botao.dataset.indice), 1); // tira 1 item daquela posição
                this.desenharItens();
            }
        });
    }

    // ===================================================================
    // 3. A LISTA DE PEDIDOS
    // ===================================================================

    private desenharLista(): void {
        const filtro = this.el<HTMLSelectElement>('pedidos-filtro').value;
        const visiveis = filtro ? this.pedidos.filter((p) => p.status === filtro) : this.pedidos;

        this.el('pedidos-lista').innerHTML = visiveis.length === 0
            ? '<tr><td colspan="5" class="text-center text-muted">Nenhum pedido com esse status.</td></tr>'
            : visiveis
                .map((p) => {
                    const s = STATUS[p.status];
                    const data = p.data_pedido ? dataHora.format(p.data_pedido) : '';
                    return `
              <tr>
                <td>${p.id}</td>
                <td>${data}</td>
                <td>${escapar(this.nomeDoCliente(p.cliente_id))}</td>
                <td><span class="badge text-bg-${s.cor}">${s.rotulo}</span></td>
                <td class="text-end">${reais.format(p.total)}</td>
              </tr>`;
                })
                .join('');
    }

    // ===================================================================
    // 4. O FORMULÁRIO DE NOVO PEDIDO
    // ===================================================================

    private abrirFormulario(): void {
        this.itens = [];
        this.el<HTMLSelectElement>('pedidos-cliente').value = '';
        this.el<HTMLSelectElement>('pedidos-produto').value = '';
        this.el<HTMLInputElement>('pedidos-quantidade').value = '1';
        this.el<HTMLTextAreaElement>('pedidos-observacao').value = '';
        this.limparAlerta();
        this.desenharItens();
        this.el('pedidos-formulario').classList.remove('d-none'); // mostra
    }

    private fecharFormulario(): void {
        this.el('pedidos-formulario').classList.add('d-none'); // esconde
    }

    /** Coloca o produto escolhido na lista de itens, conferindo o estoque. */
    private adicionarItem(): void {
        const produtoId = Number(this.el<HTMLSelectElement>('pedidos-produto').value);
        const quantidade = Number(this.el<HTMLInputElement>('pedidos-quantidade').value);
        const produto = this.produtos.find((p) => p.id === produtoId);

        // Conferências na ordem em que o atendente erraria.
        if (!produto) return this.mostrarAlerta('warning', 'Escolha um produto.');
        if (!Number.isInteger(quantidade) || quantidade < 1) {
            return this.mostrarAlerta('warning', 'A quantidade precisa ser um número inteiro maior que zero.');
        }

        // Se o produto já está na lista, a quantidade nova SOMA com a que
        // já foi adicionada, e a soma não pode passar do estoque.
        const existente = this.itens.find((i) => i.produto_id === produtoId);
        const jaAdicionado = existente?.quantidade ?? 0;
        const disponivel = produto.quantidade_estoque - jaAdicionado;
        if (quantidade > disponivel) {
            return this.mostrarAlerta(
                'warning',
                `Só há ${disponivel} unidade(s) disponível(is) de "${produto.nome}".`,
            );
        }

        if (existente) {
            existente.quantidade += quantidade;
        } else {
            this.itens.push({
                produto_id: produto.id,
                nome: produto.nome,
                quantidade,
                preco_unitario: produto.preco_venda,
            });
        }

        this.limparAlerta();
        this.el<HTMLInputElement>('pedidos-quantidade').value = '1';
        this.desenharItens();
    }

    /** Redesenha a tabela de itens e o subtotal. */
    private desenharItens(): void {
        this.el('pedidos-itens').innerHTML = this.itens.length === 0
            ? '<tr><td colspan="5" class="text-center text-muted">Nenhum item adicionado.</td></tr>'
            : this.itens
                .map((item, indice) => `
            <tr>
              <td>${escapar(item.nome)}</td>
              <td class="text-end">${item.quantidade}</td>
              <td class="text-end">${reais.format(item.preco_unitario)}</td>
              <td class="text-end">${reais.format(item.quantidade * item.preco_unitario)}</td>
              <td class="text-end">
                <button class="btn btn-sm btn-outline-danger" data-indice="${indice}">Remover</button>
              </td>
            </tr>`)
                .join('');

        this.el('pedidos-subtotal').textContent = reais.format(this.subtotal());
    }

    /** Soma de quantidade x preço de todos os itens. */
    private subtotal(): number {
        // reduce = "passe por todos, acumulando um valor" (começa em 0).
        const soma = this.itens.reduce((acc, i) => acc + i.quantidade * i.preco_unitario, 0);
        return Math.round(soma * 100) / 100; // arredonda para centavos
    }

    private salvar(): void {
        const clienteId = Number(this.el<HTMLSelectElement>('pedidos-cliente').value);
        const observacao = this.el<HTMLTextAreaElement>('pedidos-observacao').value.trim();

        if (!clienteId) return this.mostrarAlerta('warning', 'Escolha o cliente.');
        if (this.itens.length === 0) return this.mostrarAlerta('warning', 'Adicione pelo menos um item.');

        // O que a tela vai mandar ao sistema no Passo 4. Repare: só o id do
        // produto e a quantidade. O PREÇO não vai: quem define o preço é o
        // Main, lendo do banco (a tela poderia ser alterada pelo DevTools).
        const pedido = {
            cliente_id: clienteId,
            observacao: observacao || null,
            itens: this.itens.map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade })),
        };

        // TROCAR NO PASSO 4: const resposta = await window.api.chamar('pedidos:salvar', pedido);
        // Por enquanto, só mostramos na lista (de mentira) e no console.
        console.log('[provisório] pedido que seria enviado:', pedido);
        const subtotal = this.subtotal();
        this.pedidos.push({
            id: Math.max(0, ...this.pedidos.map((p) => p.id)) + 1,
            cliente_id: clienteId,
            usuario_id: 1,
            data_pedido: new Date(),
            status: 'ABERTO',
            subtotal,
            taxa_entrega: 0,
            total: subtotal,
            observacao: pedido.observacao,
        });

        this.fecharFormulario();
        this.desenharLista();
        this.mostrarAlerta('success', 'Pedido registrado como ABERTO (provisório: ainda não foi salvo no banco).');
    }

    // ===================================================================
    // 5. AJUDANTES
    // ===================================================================

    /** Busca um elemento da página pelo id; dá erro claro se não achar. */
    private el<T extends HTMLElement = HTMLElement>(id: string): T {
        const elemento = this.app.querySelector<T>(`#${id}`);
        if (!elemento) throw new Error(`Elemento #${id} não encontrado na página de pedidos.`);
        return elemento;
    }

    private nomeDoCliente(id: number): string {
        return this.clientes.find((c) => c.id === id)?.nome ?? `Cliente ${id}`;
    }

    /** Mostra um aviso Bootstrap (warning, danger ou success). */
    private mostrarAlerta(tipo: 'warning' | 'danger' | 'success', mensagem: string): void {
        const caixa = document.createElement('div');
        caixa.className = `alert alert-${tipo}`;
        caixa.textContent = mensagem; // textContent: o texto nunca vira HTML
        this.el('pedidos-alerta').replaceChildren(caixa);
    }

    private limparAlerta(): void {
        this.el('pedidos-alerta').replaceChildren();
    }
}

/**
 * Troca os caracteres especiais do HTML por "códigos" seguros.
 * Um cliente chamado <b>Ana</b> aparece com os sinais < e >, em vez de
 * virar texto em negrito (ou, pior, um <script> que roda código).
 */
function escapar(texto: string): string {
    return texto
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}