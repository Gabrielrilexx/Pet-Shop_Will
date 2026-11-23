
// =====================================================================
// PedidoService.ts — o "CHEF" DOS PEDIDOS
// ---------------------------------------------------------------------
// No restaurante, os repositories são os estoquistas (só pegam e
// guardam) e o service é o CHEF: ele conhece as REGRAS e decide o que
// pode e o que não pode. É aqui que mora a regra mais importante do
// cliente: "nenhum pedido sai sem estoque".
//
// Passo 4:
//   - listar(): todos os pedidos, com o nome do cliente.
//   - salvar(): cria (ou edita, se ainda ABERTO) um pedido. O PREÇO de
//     cada item é lido do BANCO, nunca da tela.
//   - excluir(): só ADMIN; só pedido ABERTO ou CANCELADO e sem entregas.
// Passo 5:
//   - confirmar(): ABERTO -> CONFIRMADO, dando baixa no estoque de TODOS
//     os itens de uma vez. Se faltar UM, nada é baixado.
//   - cancelar(): ABERTO ou CONFIRMADO -> CANCELADO. Se já tinha baixado
//     o estoque (CONFIRMADO), devolve tudo.
//
// Confirmar e cancelar acontecem dentro de UMA transação ("tudo ou nada"), como uma
// compra no caixa: os itens passam um por um, mas se um deles não tiver
// estoque, a compra inteira é cancelada e as baixas anteriores voltam
// sozinhas (ROLLBACK). Quem faz o COMMIT/ROLLBACK é o Database.transacao
// do Integrante 1.
//
// Erros com mensagem para o atendente usam ErroDeNegocio: o IpcRouter
// (Passo 6 do Integrante 1) manda essa mensagem para a tela. Qualquer
// outro erro vira "Erro inesperado".
//
// Canais (pedidosIpc.ts): pedidos:listar, pedidos:salvar,
// pedidos:confirmar, pedidos:cancelar -> ADMIN e ATENDENTE;
// pedidos:excluir -> só ADMIN.
//
// Autor: Integrante 4 (pedidos e entregas)
// =====================================================================

import { Database } from '../database/Database';
import type { PoolConnection } from '../database/Database';
import { PedidoRepository } from '../repositories/PedidoRepository';
import type { ItemNovo, PedidoComCliente } from '../repositories/PedidoRepository';
import { ItemPedidoRepository } from '../repositories/ItemPedidoRepository';
import { ProdutoRepository } from '../repositories/ProdutoRepository';
import { ErroDeNegocio } from '../security/ErroDeNegocio';
import { Validador } from '../security/Validador';
import type { Pedido } from '../../shared/tipos';

/**
 * O que a TELA manda no pedidos:salvar. Repare no que NÃO vem: o preço,
 * o usuário e o status. O preço é lido do banco, o usuário vem da
 * Sessao (quem está logado) e todo pedido novo nasce ABERTO.
 * "id" só vem quando é uma edição.
 */
export interface PedidoParaSalvar {
    id?: number | null;
    cliente_id: number;
    observacao: string | null;
    itens: { produto_id: number; quantidade: number }[];
}

// Limite da coluna pedido.observacao (VARCHAR(255) no schema.sql)
const MAX_OBSERVACAO = 255;
// Código de erro do MySQL para "o registro apontado não existe"
// (aqui: um cliente_id que não está na tabela cliente).
const ERRO_REFERENCIA_INEXISTENTE = 1452;

export class PedidoService {
    private readonly db: Database;
    private readonly pedidos: PedidoRepository;
    private readonly itens: ItemPedidoRepository;
    private readonly produtos: ProdutoRepository;

    // Injeção de dependência: o service RECEBE os repositories de que
    // precisa (o ProdutoRepository é do Integrante 3). Se ninguém mandar,
    // usa os padrões. Num teste, daria para entregar versões de mentira.
    constructor(
        pedidos: PedidoRepository = new PedidoRepository(),
        itens: ItemPedidoRepository = new ItemPedidoRepository(),
        produtos: ProdutoRepository = new ProdutoRepository(),
        db: Database = Database.instancia(),
    ) {
        this.pedidos = pedidos;
        this.itens = itens;
        this.produtos = produtos;
        this.db = db;
    }

    // ===================================================================
    // LISTAR (Passo 4)
    // ===================================================================

    /** Todos os pedidos, do mais novo para o mais antigo, com o nome do cliente. */
    async listar(): Promise<PedidoComCliente[]> {
        return this.pedidos.listarComCliente();
    }

    // ===================================================================
    // SALVAR (Passo 4): cria um pedido novo ou edita um ABERTO
    // ===================================================================

    /**
     * Confere tudo o que veio da tela, busca o preço de cada produto NO
     * BANCO e grava o pedido com os itens (tudo ou nada).
     * usuarioId = quem está logado (vem do IpcRouter, nunca da tela).
     * Devolve o id do pedido.
     */
    async salvar(dados: Partial<PedidoParaSalvar>, usuarioId: number): Promise<number> {
        // 1. Conferir os campos (a tela pode ter sido alterada pelo DevTools).
        const clienteId = PedidoService.idInteiro(dados.cliente_id, 'Cliente');
        const observacao = Validador.tamanhoMaximo(dados.observacao, MAX_OBSERVACAO, 'Observação');
        const quantidades = PedidoService.juntarItens(dados.itens);

        // 2. Montar os itens com o preço DO BANCO (o preço de hoje fica
        //    gravado no item: se o produto ficar mais caro amanhã, este
        //    pedido continua com o valor certo).
        const itens: ItemNovo[] = [];
        for (const [produtoId, quantidade] of quantidades) {
            const produto = await this.produtos.buscarPorId(produtoId);
            if (!produto) {
                throw new ErroDeNegocio(`Produto ${produtoId} não encontrado.`);
            }
            itens.push({ produto_id: produtoId, quantidade, preco_unitario: produto.preco_venda });
        }

        // 3. Subtotal = soma de quantidade x preço, arredondado em centavos.
        //    A taxa de entrega só existe quando o motoboy sai (Passo 6).
        const soma = itens.reduce((acc, i) => acc + i.quantidade * i.preco_unitario, 0);
        const subtotal = Math.round(soma * 100) / 100;
        const pedido: Omit<Pedido, 'id'> = {
            cliente_id: clienteId,
            usuario_id: usuarioId,
            status: 'ABERTO',
            subtotal,
            taxa_entrega: 0,
            total: subtotal,
            observacao: observacao === '' ? null : observacao,
        };

        // 4. Gravar. O banco recusa um cliente_id que não existe (1452):
        //    transformamos isso numa frase para o atendente.
        try {
            if (dados.id === undefined || dados.id === null) {
                return await this.pedidos.inserirComItens(pedido, itens);
            }
            const id = PedidoService.idInteiro(dados.id, 'Pedido');
            await this.db.transacao(async (con) => {
                // Trava o pedido e confere: só pedido ABERTO pode ser editado
                // (um CONFIRMADO já baixou estoque com os itens antigos).
                const atual = await this.buscarOuFalhar(con, id);
                if (atual.status !== 'ABERTO') {
                    throw new ErroDeNegocio(
                        `Só é possível editar um pedido ABERTO (este está ${atual.status}).`,
                    );
                }
                await this.pedidos.atualizarComItens(id, pedido, itens, con);
            });
            return id;
        } catch (erro) {
            if ((erro as { errno?: number } | null)?.errno === ERRO_REFERENCIA_INEXISTENTE) {
                throw new ErroDeNegocio('Cliente não encontrado.');
            }
            throw erro;
        }
    }

    // ===================================================================
    // EXCLUIR (Passo 4): só ABERTO ou CANCELADO, sem entregas
    // ===================================================================

    async excluir(id: unknown): Promise<void> {
        const pedidoId = PedidoService.idInteiro(id, 'Pedido');
        const pedido = await this.pedidos.buscarPorId(pedidoId);
        if (!pedido) {
            throw new ErroDeNegocio('Pedido não encontrado.');
        }
        if (pedido.status !== 'ABERTO' && pedido.status !== 'CANCELADO') {
            throw new ErroDeNegocio(
                `Só é possível excluir um pedido ABERTO ou CANCELADO (este está ${pedido.status}). ` +
                'Cancele o pedido antes.',
            );
        }
        // A "catraca" do repository confere o status de novo, no mesmo
        // comando do DELETE: se alguém confirmou o pedido neste meio-tempo,
        // ele NÃO é apagado.
        const excluiu = await this.pedidos.excluirSeAbertoOuCancelado(pedidoId);
        if (!excluiu) {
            throw new ErroDeNegocio('O pedido foi alterado por outra pessoa. Atualize a tela e tente de novo.');
        }
    }

    // ===================================================================
    // CONFIRMAR: ABERTO -> CONFIRMADO, com baixa de estoque
    // ===================================================================

    /**
     * Confirma o pedido: confere e baixa o estoque de TODOS os itens.
     * Se faltar estoque de qualquer item, NADA é baixado e o pedido
     * continua ABERTO (a transação é desfeita).
     */
    async confirmar(id: unknown): Promise<void> {
        const pedidoId = PedidoService.idInteiro(id, 'Pedido'); // a tela pode mandar qualquer coisa
        await this.db.transacao(async (con) => {
            // 1. Pegar o pedido e travá-lo (ninguém mexe nele até terminarmos).
            const pedido = await this.buscarOuFalhar(con, pedidoId);

            // 2. Regra: só confirma pedido ABERTO.
            if (pedido.status !== 'ABERTO') {
                throw new ErroDeNegocio(
                    `Só é possível confirmar um pedido ABERTO (este está ${pedido.status}).`,
                );
            }

            // 3. Regra: pedido sem itens não pode ser confirmado.
            const itens = await this.itens.listarPorPedido(pedidoId, con);
            if (itens.length === 0) {
                throw new ErroDeNegocio('O pedido não tem itens.');
            }

            // 4. Baixar o estoque de cada item, sempre na MESMA ordem (pelo id
            //    do produto). Assim, dois pedidos confirmados ao mesmo tempo
            //    "andam na mesma fila" e não ficam um esperando o outro.
            const emOrdem = [...itens].sort((a, b) => a.produto_id - b.produto_id);
            for (const item of emOrdem) {
                const baixou = await this.produtos.baixarEstoque(con, item.produto_id, item.quantidade);
                if (!baixou) {
                    // Lançar o erro aqui faz o Database.transacao dar ROLLBACK:
                    // as baixas dos itens anteriores são desfeitas.
                    const produto = await this.produtos.buscarPorId(item.produto_id);
                    const nome = produto?.nome ?? `produto ${item.produto_id}`;
                    throw new ErroDeNegocio(
                        `Estoque insuficiente de "${nome}" (pedido: ${item.quantidade}). ` +
                        'Nenhum item foi baixado; o pedido continua ABERTO.',
                    );
                }
            }

            // 5. Tudo baixado: o pedido vira CONFIRMADO.
            await this.mudarStatusOuFalhar(con, pedidoId, 'ABERTO', 'CONFIRMADO');
        });
    }

    // ===================================================================
    // CANCELAR: ABERTO ou CONFIRMADO -> CANCELADO (devolve o estoque)
    // ===================================================================

    /**
     * Cancela o pedido. Se ele estava CONFIRMADO (estoque já baixado),
     * devolve as quantidades. Pedido EM_ROTA, ENTREGUE ou já CANCELADO
     * não pode ser cancelado.
     */
    async cancelar(id: unknown): Promise<void> {
        const pedidoId = PedidoService.idInteiro(id, 'Pedido'); // a tela pode mandar qualquer coisa
        await this.db.transacao(async (con) => {
            const pedido = await this.buscarOuFalhar(con, pedidoId);

            if (pedido.status !== 'ABERTO' && pedido.status !== 'CONFIRMADO') {
                throw new ErroDeNegocio(
                    `Só é possível cancelar um pedido ABERTO ou CONFIRMADO (este está ${pedido.status}).`,
                );
            }

            // Pedido ABERTO nunca baixou estoque: não há nada para devolver.
            if (pedido.status === 'CONFIRMADO') {
                const itens = await this.itens.listarPorPedido(pedidoId, con);
                const emOrdem = [...itens].sort((a, b) => a.produto_id - b.produto_id);
                for (const item of emOrdem) {
                    await this.produtos.devolverEstoque(con, item.produto_id, item.quantidade);
                }
            }

            await this.mudarStatusOuFalhar(con, pedidoId, pedido.status, 'CANCELADO');
        });
    }

    // ===================================================================
    // Ajudantes internos
    // ===================================================================

    /** Número inteiro maior que zero (um id ou uma quantidade). */
    private static idInteiro(valor: unknown, campo: string): number {
        const numero = Validador.positivo(valor, campo);
        if (!Number.isInteger(numero)) {
            throw new ErroDeNegocio(`O campo ${campo} deve ser um número inteiro.`);
        }
        return numero;
    }

    /**
     * Confere a lista de itens e JUNTA produtos repetidos: "2 rações" e
     * depois "1 ração" viram um item só com 3 rações.
     * Map = um "caderno de anotações" do tipo produto -> quantidade.
     */
    private static juntarItens(itens: unknown): Map<number, number> {
        if (!Array.isArray(itens) || itens.length === 0) {
            throw new ErroDeNegocio('Adicione pelo menos um item ao pedido.');
        }
        const quantidades = new Map<number, number>();
        for (const item of itens as { produto_id?: unknown; quantidade?: unknown }[]) {
            const produtoId = PedidoService.idInteiro(item?.produto_id, 'Produto');
            const quantidade = PedidoService.idInteiro(item?.quantidade, 'Quantidade');
            quantidades.set(produtoId, (quantidades.get(produtoId) ?? 0) + quantidade);
        }
        return quantidades;
    }

    /** Busca e trava o pedido; se não existir, avisa o atendente. */
    private async buscarOuFalhar(con: PoolConnection, pedidoId: number): Promise<Pedido> {
        const pedido = await this.pedidos.buscarParaAlterar(con, pedidoId);
        if (!pedido) {
            throw new ErroDeNegocio('Pedido não encontrado.');
        }
        return pedido;
    }

    /**
     * Muda o status pela "catraca" do repository. Como o pedido está
     * travado, isso sempre deveria dar certo; se não der, desfazemos tudo
     * em vez de deixar o banco pela metade.
     */
    private async mudarStatusOuFalhar(
        con: PoolConnection,
        pedidoId: number,
        de: Pedido['status'],
        para: Pedido['status'],
    ): Promise<void> {
        const mudou = await this.pedidos.mudarStatus(con, pedidoId, de, para);
        if (!mudou) {
            throw new ErroDeNegocio('O pedido foi alterado por outra pessoa. Atualize a tela e tente de novo.');
        }
    }
}