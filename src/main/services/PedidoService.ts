// =====================================================================
// PedidoService.ts — o "CHEF" DOS PEDIDOS
// ---------------------------------------------------------------------
// No restaurante, os repositories são os estoquistas (só pegam e
// guardam) e o service é o CHEF: ele conhece as REGRAS e decide o que
// pode e o que não pode. É aqui que mora a regra mais importante do
// cliente: "nenhum pedido sai sem estoque".
//
// Passo 5 (este arquivo, por enquanto):
//   - confirmar(): ABERTO -> CONFIRMADO, dando baixa no estoque de TODOS
//     os itens de uma vez. Se faltar UM, nada é baixado.
//   - cancelar(): ABERTO ou CONFIRMADO -> CANCELADO. Se já tinha baixado
//     o estoque (CONFIRMADO), devolve tudo.
//
// Tudo acontece dentro de UMA transação ("tudo ou nada"), como uma
// compra no caixa: os itens passam um por um, mas se um deles não tiver
// estoque, a compra inteira é cancelada e as baixas anteriores voltam
// sozinhas (ROLLBACK). Quem faz o COMMIT/ROLLBACK é o Database.transacao
// do Integrante 1.
//
// Erros com mensagem para o atendente usam ErroDeNegocio: o IpcRouter
// (Passo 6 do Integrante 1) manda essa mensagem para a tela. Qualquer
// outro erro vira "Erro inesperado".
//
// Ainda vão entrar aqui: salvar (Passo 4) e a lista por status (Passo 7).
//
// Autor: Integrante 4 (pedidos e entregas)
// =====================================================================

import { Database } from '../database/Database';
import type { PoolConnection } from '../database/Database';
import { PedidoRepository } from '../repositories/PedidoRepository';
import { ItemPedidoRepository } from '../repositories/ItemPedidoRepository';
import { ProdutoRepository } from '../repositories/ProdutoRepository';
import { ErroDeNegocio } from '../security/ErroDeNegocio';
import type { Pedido } from '../../shared/tipos';

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
    // CONFIRMAR: ABERTO -> CONFIRMADO, com baixa de estoque
    // ===================================================================

    /**
     * Confirma o pedido: confere e baixa o estoque de TODOS os itens.
     * Se faltar estoque de qualquer item, NADA é baixado e o pedido
     * continua ABERTO (a transação é desfeita).
     */
    async confirmar(pedidoId: number): Promise<void> {
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
    async cancelar(pedidoId: number): Promise<void> {
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