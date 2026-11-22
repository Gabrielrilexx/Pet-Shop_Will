// =====================================================================
// ItemPedidoRepository.ts — o "ESTOQUISTA" DOS ITENS DE CADA PEDIDO
// ---------------------------------------------------------------------
// Cada linha de item_pedido é um produto dentro de um pedido, como cada
// linha de uma comanda de restaurante ("2x Ração 15kg a R$ 195,00").
// Só esta classe escreve SQL na tabela item_pedido.
//
// Por que alguns métodos recebem "con"?
//   O pedido e os itens são gravados JUNTOS, numa transação ("tudo ou
//   nada"). A transação acontece numa conexão específica, a "con",
//   como uma compra num caixa específico do supermercado. Um item
//   gravado em outra conexão (this.db.executar) ficaria FORA da compra:
//   se a transação desistisse, ele continuaria gravado. Por isso, quem
//   roda dentro da transação recebe a "con" e usa con.execute(...).
//   É o mesmo padrão do ProdutoRepository.baixarEstoque(con, ...).
//
// Quem usa: PedidoRepository (inserirComItens e atualizarComItens) e,
// no Passo 5, o PedidoService (para confirmar e cancelar).
//
// Autor: Integrante 4 (pedidos e entregas)
// =====================================================================

import { Database } from '../database/Database';
import type { PoolConnection, ResultadoExecucao } from '../database/Database';
import { BaseRepository } from './BaseRepository';
import type { ItemPedido } from '../../shared/tipos';

// O mesmo INSERT serve para os dois jeitos de gravar um item (com e
// sem transação). Escrito uma vez só, para os dois nunca ficarem
// diferentes um do outro.
const SQL_INSERIR =
    'INSERT INTO item_pedido (pedido_id, produto_id, quantidade, preco_unitario) ' +
    'VALUES (?, ?, ?, ?)';

export class ItemPedidoRepository extends BaseRepository<ItemPedido> {
    constructor() {
        super(Database.instancia(), 'item_pedido'); // nome da tabela FIXO
    }

    // -------------------------------------------------------------------
    // Obrigatórios (a "mãe" BaseRepository exige que toda filha tenha)
    // -------------------------------------------------------------------

    /** Insere um item avulso (fora de transação) e devolve o id gerado. */
    async inserir(dados: Omit<ItemPedido, 'id'>): Promise<number> {
        const resultado = await this.db.executar(
            SQL_INSERIR,
            ItemPedidoRepository.parametros(dados),
        );
        return resultado.insertId;
    }

    /** Muda a quantidade e o preço de um item. */
    async atualizar(id: number, dados: Omit<ItemPedido, 'id'>): Promise<void> {
        // pedido_id e produto_id não mudam: trocar o produto de um item é,
        // na prática, apagar um item e criar outro.
        await this.db.executar(
            'UPDATE item_pedido SET quantidade = ?, preco_unitario = ? WHERE id = ?',
            [dados.quantidade, dados.preco_unitario, id],
        );
    }

    // -------------------------------------------------------------------
    // Métodos próprios da minha parte
    // -------------------------------------------------------------------

    /** Todos os itens de um pedido, na ordem em que foram adicionados. */
    async listarPorPedido(pedidoId: number): Promise<ItemPedido[]> {
        return this.db.consultar<ItemPedido>(
            'SELECT * FROM item_pedido WHERE pedido_id = ? ORDER BY id',
            [pedidoId],
        );
    }

    /**
     * Insere um item DENTRO de uma transação (usa a "con" recebida).
     * Devolve o id gerado.
     */
    async inserirNaTransacao(
        con: PoolConnection,
        dados: Omit<ItemPedido, 'id'>,
    ): Promise<number> {
        const [resultado] = await con.execute(
            SQL_INSERIR,
            ItemPedidoRepository.parametros(dados),
        );
        // con.execute devolve um tipo genérico do mysql2; aqui dizemos ao
        // TypeScript que, num INSERT, a resposta tem o formato do
        // ResultadoExecucao do Caio (insertId e affectedRows).
        return (resultado as ResultadoExecucao).insertId;
    }

    /**
     * Apaga TODOS os itens de um pedido, dentro de uma transação.
     * Usado ao editar um pedido aberto: os itens antigos saem e os novos
     * entram, tudo na mesma "compra".
     */
    async excluirPorPedido(con: PoolConnection, pedidoId: number): Promise<void> {
        await con.execute('DELETE FROM item_pedido WHERE pedido_id = ?', [pedidoId]);
    }

    // -------------------------------------------------------------------
    // Ajudante interno
    // -------------------------------------------------------------------

    /** Os valores do item na MESMA ordem dos "?" do SQL_INSERIR. */
    private static parametros(dados: Omit<ItemPedido, 'id'>) {
        return [dados.pedido_id, dados.produto_id, dados.quantidade, dados.preco_unitario];
    }
}