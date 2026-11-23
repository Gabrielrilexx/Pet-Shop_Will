// =====================================================================
// PedidosPage.ts — o "BALCÃO DE ATENDIMENTO" DOS PEDIDOS
// ---------------------------------------------------------------------
// É a tela onde o atendente trabalha com os pedidos que chegam pelo
// WhatsApp. Uma página só, com duas partes:
//   1. a LISTA de pedidos, com um filtro por status (como a pilha de
//      comandas presas no balcão, que dá para separar por cor) e os
//      botões de cada pedido: Confirmar, Cancelar e Excluir;
//   2. o FORMULÁRIO de novo pedido, que aparece ao clicar em "Novo
//      pedido": escolher o cliente, adicionar produtos (vendo o
//      estoque), conferir o subtotal e salvar.
//
// Tudo passa pelo window.api.chamar(...) (o "balcão" do preload):
//   pedidos:listar / salvar / confirmar / cancelar / excluir  (meus)
//   produtos:listar  (Integrante 3)   auth:atual  (Integrante 1)
//
// PROVISÓRIO: a lista de CLIENTES ainda é fixa (os 4 clientes do
// database/exemplo.sql, com os ids conferidos no banco), porque o canal
// clientes:listar do Integrante 2 ainda não existe. Quando existir,
// troque o trecho marcado com "TROCAR QUANDO EXISTIR clientes:listar".
//
// Regras de segurança desta tela (README, Passo 6):
//   - nada de onclick="..." no HTML: os botões são ligados pelo código;
//   - todo texto que vem de dados passa pelo escapar() do ui.ts;
//   - a conferência de estoque AQUI é só conforto para o atendente:
//     quem decide de verdade é o Main (PedidoService). Pelo mesmo
//     motivo, a tela NÃO manda o preço: o Main lê o preço do banco.
//
// Autor: Integrante 4 (pedidos e entregas)
// =====================================================================

import type { Cliente, Pedido, Perfil, Produto, StatusPedido, UsuarioSemSenha } from '../../shared/tipos';
import { confirmar, escapar, mostrarAlerta } from '../ui';
import type { TipoAlerta } from '../ui';

// ---------------------------------------------------------------------
// Os formatos que ESTA TELA usa (Pick = "pegue só estes campos").
// A tela não precisa do custo nem da margem do produto: o ATENDENTE
// nem recebe esses campos (o Main corta antes de mandar).
// ---------------------------------------------------------------------
type ClienteNaTela = Pick<Cliente, 'id' | 'nome'>;
type ProdutoNaTela = Pick<Produto, 'id' | 'nome' | 'preco_venda' | 'quantidade_estoque'>;
/** Um pedido como o pedidos:listar devolve: com o nome do cliente junto. */
type PedidoNaLista = Pedido & { cliente_nome: string };

/** Uma linha do formulário de novo pedido (nome e preço são só para mostrar). */
interface ItemNaTela {
    produto_id: number;
    nome: string;
    quantidade: number;
    preco_unitario: number;
}

// =====================================================================
// TROCAR QUANDO EXISTIR clientes:listar (Integrante 2)
// Os 4 clientes do exemplo.sql, com os ids conferidos no banco
// (SELECT id, nome FROM cliente) em 23/11/2026.
// =====================================================================
const CLIENTES_PROVISORIOS: ClienteNaTela[] = [
    { id: 1, nome: 'Ana Souza' },
    { id: 2, nome: 'Bruno Lima' },
    { id: 3, nome: 'Carla Mendes' },
    { id: 4, nome: 'Diego Rocha' },
];

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
    private perfil: Perfil = 'ATENDENTE'; // na dúvida, o perfil com MENOS botões
    private clientes: ClienteNaTela[] = [];
    private produtos: ProdutoNaTela[] = [];
    private pedidos: PedidoNaLista[] = [];
    private itens: ItemNaTela[] = []; // os itens do pedido que está sendo montado

    /** Desenha a página dentro do <main id="app"> (contrato do Integrante 1). */
    async render(app: HTMLElement): Promise<void> {
        this.app = app;
        app.innerHTML = this.montarHtml();
        this.ligarEventos();

        // Quem está logado? Só para decidir se o botão "Excluir" aparece.
        // (Esconder o botão é conforto: o Main recusa o ATENDENTE de qualquer jeito.)
        const atual = await window.api.chamar<UsuarioSemSenha>('auth:atual');
        if (atual.ok) this.perfil = atual.dados.perfil;

        // TROCAR QUANDO EXISTIR clientes:listar:
        //   const r = await window.api.chamar<Cliente[]>('clientes:listar');
        this.clientes = CLIENTES_PROVISORIOS;
        this.desenharOpcoesDeClientes();

        await Promise.all([this.carregarProdutos(), this.carregarPedidos()]);
    }

    // ===================================================================
    // 1. O "ESQUELETO" DA PÁGINA (HTML com Bootstrap)
    // ===================================================================

    private montarHtml(): string {
        const opcoesStatus = Object.entries(STATUS)
            .map(([valor, s]) => `<option value="${valor}">${s.rotulo}</option>`)
            .join('');

        return `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h2 class="h4 mb-0">Pedidos</h2>
        <button type="button" id="pedidos-novo" class="btn btn-primary">+ Novo pedido</button>
      </div>

      <div id="pedidos-alerta"></div>

      <!-- ============ FORMULÁRIO DE NOVO PEDIDO (começa escondido) ============ -->
      <div id="pedidos-formulario" class="card mb-4 d-none">
        <div class="card-header fw-semibold">Novo pedido</div>
        <div class="card-body">
          <div class="mb-3">
            <label for="pedidos-cliente" class="form-label">Cliente</label>
            <select id="pedidos-cliente" class="form-select"></select>
            <div class="form-text">Provisório: os clientes do exemplo, até existir o cadastro de clientes.</div>
          </div>

          <div class="row g-2 align-items-end mb-3">
            <div class="col-md-7">
              <label for="pedidos-produto" class="form-label">Produto</label>
              <select id="pedidos-produto" class="form-select"></select>
            </div>
            <div class="col-md-2">
              <label for="pedidos-quantidade" class="form-label">Quantidade</label>
              <input id="pedidos-quantidade" type="number" min="1" step="1" value="1" class="form-control">
            </div>
            <div class="col-md-3 d-grid">
              <button type="button" id="pedidos-adicionar" class="btn btn-outline-primary">Adicionar item</button>
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
            <span class="text-secondary">Taxa de entrega: calculada na saída do motoboy</span>
            <span class="fw-semibold">Subtotal: <span id="pedidos-subtotal">R$ 0,00</span></span>
          </div>

          <div class="mb-3">
            <label for="pedidos-observacao" class="form-label">Observação (opcional)</label>
            <textarea id="pedidos-observacao" class="form-control" rows="2" maxlength="255"></textarea>
          </div>

          <div class="d-flex justify-content-end gap-2">
            <button type="button" id="pedidos-cancelar-form" class="btn btn-outline-secondary">Fechar</button>
            <button type="button" id="pedidos-salvar" class="btn btn-success">Salvar pedido</button>
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
          <tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Status</th>
              <th class="text-end">Total</th><th></th></tr>
        </thead>
        <tbody id="pedidos-lista">
          <tr><td colspan="6" class="text-secondary">Carregando...</td></tr>
        </tbody>
      </table>`;
    }

    // ===================================================================
    // 2. LIGAR OS BOTÕES (o "fio" entre o clique e o que acontece)
    // ===================================================================

    private ligarEventos(): void {
        this.el('pedidos-filtro').addEventListener('change', () => this.desenharLista());
        this.el('pedidos-novo').addEventListener('click', () => this.abrirFormulario());
        this.el('pedidos-cancelar-form').addEventListener('click', () => this.fecharFormulario());
        this.el('pedidos-adicionar').addEventListener('click', () => this.adicionarItem());
        this.el('pedidos-salvar').addEventListener('click', () => void this.salvar());

        // Botões "Remover" de cada item do formulário (delegação de eventos):
        // UM "ouvido" na tabela, que descobre o botão pelo data-indice.
        this.el('pedidos-itens').addEventListener('click', (evento) => {
            const botao = (evento.target as HTMLElement).closest<HTMLElement>('[data-indice]');
            if (botao) {
                this.itens.splice(Number(botao.dataset.indice), 1); // tira 1 item daquela posição
                this.desenharItens();
            }
        });

        // Botões de cada pedido da lista (mesma ideia, padrão da UsuariosPage):
        // data-acao diz O QUE fazer; data-id diz COM QUAL pedido.
        this.el('pedidos-lista').addEventListener('click', (evento) => {
            const botao = (evento.target as HTMLElement).closest<HTMLButtonElement>('button[data-acao]');
            if (botao) void this.executarAcao(botao.dataset.acao ?? '', Number(botao.dataset.id));
        });
    }

    // ===================================================================
    // 3. BUSCAR DADOS NO MAIN
    // ===================================================================

    private async carregarPedidos(): Promise<void> {
        const resposta = await window.api.chamar<PedidoNaLista[]>('pedidos:listar');
        if (!resposta.ok) {
            this.el('pedidos-lista').innerHTML = '';
            this.alerta('danger', resposta.erro);
            return;
        }
        this.pedidos = resposta.dados;
        this.desenharLista();
    }

    private async carregarProdutos(): Promise<void> {
        const resposta = await window.api.chamar<ProdutoNaTela[]>('produtos:listar');
        if (!resposta.ok) {
            this.alerta('danger', resposta.erro);
            return;
        }
        this.produtos = resposta.dados;
        this.desenharOpcoesDeProdutos();
    }

    // ===================================================================
    // 4. A LISTA DE PEDIDOS
    // ===================================================================

    private desenharLista(): void {
        const filtro = this.el<HTMLSelectElement>('pedidos-filtro').value;
        const visiveis = filtro ? this.pedidos.filter((p) => p.status === filtro) : this.pedidos;

        this.el('pedidos-lista').innerHTML =
            visiveis.length === 0
                ? '<tr><td colspan="6" class="text-center text-secondary">Nenhum pedido com esse status.</td></tr>'
                : visiveis.map((p) => this.linha(p)).join('');
    }

    /** O HTML de uma linha. Cada botão só aparece quando a ação faz sentido. */
    private linha(p: PedidoNaLista): string {
        const s = STATUS[p.status];
        // A data atravessa o IPC como Date; "new Date(...)" garante, mesmo se vier como texto.
        const data = p.data_pedido ? dataHora.format(new Date(p.data_pedido)) : '-';

        const botoes: string[] = [];
        if (p.status === 'ABERTO') {
            botoes.push(this.botao('confirmar', p.id, 'Confirmar', 'success'));
        }
        if (p.status === 'ABERTO' || p.status === 'CONFIRMADO') {
            botoes.push(this.botao('cancelar', p.id, 'Cancelar', 'warning'));
        }
        if (this.perfil === 'ADMIN' && (p.status === 'ABERTO' || p.status === 'CANCELADO')) {
            botoes.push(this.botao('excluir', p.id, 'Excluir', 'danger'));
        }

        return `
      <tr>
        <td>${p.id}</td>
        <td>${data}</td>
        <td>${escapar(p.cliente_nome)}</td>
        <td><span class="badge text-bg-${s.cor}">${s.rotulo}</span></td>
        <td class="text-end">${reais.format(p.total)}</td>
        <td class="text-end text-nowrap">${botoes.join(' ')}</td>
      </tr>`;
    }

    private botao(acao: string, id: number, texto: string, cor: string): string {
        return `<button type="button" class="btn btn-sm btn-outline-${cor}" data-acao="${acao}" data-id="${id}">${texto}</button>`;
    }

    /** Decide o que fazer conforme o botão clicado na lista. */
    private async executarAcao(acao: string, id: number): Promise<void> {
        const pedido = this.pedidos.find((p) => p.id === id);
        if (!pedido) return;
        const quem = `pedido nº ${id} (${pedido.cliente_nome})`;

        if (acao === 'confirmar') {
            await this.enviar('pedidos:confirmar', id, `O ${quem} foi confirmado e o estoque foi baixado.`);
        }
        if (acao === 'cancelar') {
            const extra = pedido.status === 'CONFIRMADO' ? ' Os produtos voltam para o estoque.' : '';
            if (await confirmar('Cancelar pedido', `Cancelar o ${quem}?${extra}`, 'Cancelar pedido')) {
                await this.enviar('pedidos:cancelar', id, `O ${quem} foi cancelado.`);
            }
        }
        if (acao === 'excluir') {
            if (await confirmar('Excluir pedido', `Excluir o ${quem}? Esta ação não pode ser desfeita.`, 'Excluir')) {
                await this.enviar('pedidos:excluir', id, `O ${quem} foi excluído.`);
            }
        }
    }

    /**
     * Manda uma ação ao Main. Deu certo: mostra a mensagem e recarrega a
     * lista E os produtos (confirmar e cancelar mudam o estoque).
     */
    private async enviar(canal: string, id: number, sucesso: string): Promise<void> {
        const resposta = await window.api.chamar<void>(canal, id);
        if (!resposta.ok) {
            this.alerta('danger', resposta.erro);
            return;
        }
        this.alerta('success', sucesso);
        await Promise.all([this.carregarPedidos(), this.carregarProdutos()]);
    }

    // ===================================================================
    // 5. O FORMULÁRIO DE NOVO PEDIDO
    // ===================================================================

    private desenharOpcoesDeClientes(): void {
        const opcoes = this.clientes
            .map((c) => `<option value="${c.id}">${escapar(c.nome)}</option>`)
            .join('');
        this.el('pedidos-cliente').innerHTML = `<option value="">Escolha o cliente...</option>${opcoes}`;
    }

    /** Produto sem estoque aparece, mas desabilitado (não dá para escolher). */
    private desenharOpcoesDeProdutos(): void {
        const opcoes = this.produtos
            .map((p) => {
                const semEstoque = p.quantidade_estoque <= 0;
                const texto =
                    `${p.nome} — ${reais.format(p.preco_venda)} ` +
                    (semEstoque ? '(sem estoque)' : `(estoque: ${p.quantidade_estoque})`);
                return `<option value="${p.id}" ${semEstoque ? 'disabled' : ''}>${escapar(texto)}</option>`;
            })
            .join('');
        this.el('pedidos-produto').innerHTML = `<option value="">Escolha o produto...</option>${opcoes}`;
    }

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
        if (!produto) return this.alerta('warning', 'Escolha um produto.');
        if (!Number.isInteger(quantidade) || quantidade < 1) {
            return this.alerta('warning', 'A quantidade precisa ser um número inteiro maior que zero.');
        }

        // Se o produto já está na lista, a quantidade nova SOMA com a que
        // já foi adicionada, e a soma não pode passar do estoque.
        const existente = this.itens.find((i) => i.produto_id === produtoId);
        const disponivel = produto.quantidade_estoque - (existente?.quantidade ?? 0);
        if (quantidade > disponivel) {
            return this.alerta(
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
        this.el('pedidos-itens').innerHTML =
            this.itens.length === 0
                ? '<tr><td colspan="5" class="text-center text-secondary">Nenhum item adicionado.</td></tr>'
                : this.itens
                    .map(
                        (item, indice) => `
            <tr>
              <td>${escapar(item.nome)}</td>
              <td class="text-end">${item.quantidade}</td>
              <td class="text-end">${reais.format(item.preco_unitario)}</td>
              <td class="text-end">${reais.format(item.quantidade * item.preco_unitario)}</td>
              <td class="text-end">
                <button type="button" class="btn btn-sm btn-outline-danger" data-indice="${indice}">Remover</button>
              </td>
            </tr>`,
                    )
                    .join('');

        this.el('pedidos-subtotal').textContent = reais.format(this.subtotal());
    }

    /** Soma de quantidade x preço (só para mostrar: o Main recalcula). */
    private subtotal(): number {
        const soma = this.itens.reduce((acc, i) => acc + i.quantidade * i.preco_unitario, 0);
        return Math.round(soma * 100) / 100;
    }

    private async salvar(): Promise<void> {
        const clienteId = Number(this.el<HTMLSelectElement>('pedidos-cliente').value);
        const observacao = this.el<HTMLTextAreaElement>('pedidos-observacao').value.trim();

        if (!clienteId) return this.alerta('warning', 'Escolha o cliente.');
        if (this.itens.length === 0) return this.alerta('warning', 'Adicione pelo menos um item.');

        // Só o id do produto e a quantidade. O PREÇO não vai: o Main lê do
        // banco. O usuário também não vai: o Main sabe quem está logado.
        const pedido = {
            cliente_id: clienteId,
            observacao: observacao || null,
            itens: this.itens.map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade })),
        };

        // Desliga o botão enquanto espera: dois cliques não criam dois pedidos.
        const botao = this.el<HTMLButtonElement>('pedidos-salvar');
        botao.disabled = true;
        try {
            const resposta = await window.api.chamar<number>('pedidos:salvar', pedido);
            if (!resposta.ok) {
                this.alerta('danger', resposta.erro);
                return;
            }
            this.fecharFormulario();
            this.alerta('success', `Pedido nº ${resposta.dados} registrado como ABERTO.`);
            await this.carregarPedidos();
        } finally {
            botao.disabled = false; // "finally" = religa dando certo ou não
        }
    }

    // ===================================================================
    // 6. AJUDANTES
    // ===================================================================

    /** Busca um elemento da página pelo id; dá erro claro se não achar. */
    private el<T extends HTMLElement = HTMLElement>(id: string): T {
        const elemento = this.app.querySelector<T>(`#${id}`);
        if (!elemento) throw new Error(`Elemento #${id} não encontrado na página de pedidos.`);
        return elemento;
    }

    /** Mostra um aviso usando o mostrarAlerta do ui.ts (Integrante 1). */
    private alerta(tipo: TipoAlerta, mensagem: string): void {
        mostrarAlerta(this.el('pedidos-alerta'), tipo, mensagem);
    }

    private limparAlerta(): void {
        this.el('pedidos-alerta').replaceChildren();
    }
}