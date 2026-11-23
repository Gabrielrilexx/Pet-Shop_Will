// =====================================================================
// PedidoRepository.ts — o "ESTOQUISTA" DOS PEDIDOS
// ---------------------------------------------------------------------
// Só esta classe escreve SQL na tabela pedido. Ela grava, busca e
// resume os pedidos que chegam pelo WhatsApp.
//
// O método mais importante é o inserirComItens: o pedido e os itens
// dele são gravados numa TRANSAÇÃO, como uma compra no caixa do
// supermercado. Os produtos passam um por um, mas só no fim se decide:
// ou paga tudo (COMMIT), ou desiste de tudo (ROLLBACK). Nunca fica um
// pedido gravado pela metade, com só alguns dos itens.
//
// O que esta classe NÃO faz (fica para o PedidoService, Passos 4 e 5):
//   - conferir regras ("só edita pedido ABERTO", "precisa de itens");
//   - mudar o status (confirmar mexe no estoque, e isso tem regras).
// O repository só sabe guardar e buscar, como o estoquista que não
// decide o cardápio, só pega e guarda o que o chef pede.
//
// Autor: Integrante 4 (pedidos e entregas)
// =====================================================================

import { Database } from '../database/Database';
import type { PoolConnection, ResultadoExecucao } from '../database/Database';
import { BaseRepository } from './BaseRepository';
import { ItemPedidoRepository } from './ItemPedidoRepository';
import { ErroDeNegocio } from '../security/ErroDeNegocio';
import type { ItemPedido, Pedido, StatusPedido } from '../../shared/tipos';

/**
 * Um item do jeito que chega para ser gravado junto com o pedido:
 * sem o "id" (o banco cria) e sem o "pedido_id" (o pedido ainda nem
 * existe quando o item é montado; o inserirComItens preenche).
 */
export type ItemNovo = Omit<ItemPedido, 'id' | 'pedido_id'>;

/** Um pedido do jeito que a LISTA mostra: com o nome do cliente junto. */
export type PedidoComCliente = Pedido & { cliente_nome: string };

// Código de erro do MySQL para "não pode apagar: outro registro aponta
// para este" (aqui: a tabela entrega aponta para o pedido, com RESTRICT).
const ERRO_EM_USO = 1451;

// data_pedido não aparece: o banco preenche sozinho (DEFAULT
// CURRENT_TIMESTAMP).
const SQL_INSERIR =
    'INSERT INTO pedido ' +
    '(cliente_id, usuario_id, status, subtotal, taxa_entrega, total, observacao) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?)';

// status e usuario_id ficam de fora DE PROPÓSITO (ver o atualizar).
const SQL_ATUALIZAR =
    'UPDATE pedido SET cliente_id = ?, subtotal = ?, taxa_entrega = ?, ' +
    'total = ?, observacao = ? WHERE id = ?';

export class PedidoRepository extends BaseRepository<Pedido> {
    // O repository dos itens que este pedido usa. Ele é RECEBIDO no
    // constructor (injeção de dependência): se ninguém mandar um, cria o
    // padrão. Assim, num teste, daria para entregar uma versão de mentira.
    private readonly itens: ItemPedidoRepository;

    constructor(itens: ItemPedidoRepository = new ItemPedidoRepository()) {
        super(Database.instancia(), 'pedido'); // nome da tabela FIXO
        this.itens = itens;
    }

    // -------------------------------------------------------------------
    // Obrigatórios (a "mãe" BaseRepository exige que toda filha tenha)
    // -------------------------------------------------------------------

    /** Grava SÓ o pedido, sem itens, e devolve o id gerado. */
    async inserir(dados: Omit<Pedido, 'id'>): Promise<number> {
        const resultado = await this.db.executar(
            SQL_INSERIR,
            PedidoRepository.parametrosInserir(dados),
        );
        return resultado.insertId;
    }

    /**
     * Atualiza cliente, valores e observação de um pedido.
     * NÃO muda o status: confirmar, cancelar e sair para entrega têm
     * regras (e mexem no estoque), então têm métodos próprios. Se este
     * método mudasse o status, daria para "confirmar" sem baixar estoque.
     * NÃO muda o usuario_id: quem registrou o pedido não muda depois.
     */
    async atualizar(id: number, dados: Omit<Pedido, 'id'>): Promise<void> {
        await this.db.executar(
            SQL_ATUALIZAR,
            PedidoRepository.parametrosAtualizar(id, dados),
        );
    }

    // -------------------------------------------------------------------
    // Pedido + itens juntos (transação: tudo ou nada)
    // -------------------------------------------------------------------

    /**
     * Grava o pedido E os itens numa transação só.
     * Devolve o id do pedido novo.
     * Se qualquer item falhar (produto inexistente, quantidade 0...),
     * NADA fica gravado: nem o pedido, nem os itens anteriores.
     */
    async inserirComItens(
        pedido: Omit<Pedido, 'id'>,
        itens: ItemNovo[],
    ): Promise<number> {
        return this.db.transacao(async (con) => {
            // 1. Grava o pedido NESTE caixa e anota o número que ele ganhou.
            const pedidoId = await PedidoRepository.inserirNaTransacao(con, pedido);

            // 2. Grava cada item no MESMO caixa, já com o número do pedido.
            //    "for...of" com await: um item de cada vez, em ordem.
            for (const item of itens) {
                await this.itens.inserirNaTransacao(con, { ...item, pedido_id: pedidoId });
            }

            // 3. Chegou aqui sem erro: o Database.transacao faz o COMMIT.
            return pedidoId;
        });
    }

    /**
     * Edita um pedido e TROCA todos os itens dele, numa transação só:
     * atualiza o pedido, apaga os itens antigos e grava os novos.
     * Se algo falhar, o pedido continua exatamente como estava.
     */
    async atualizarComItens(
        id: number,
        pedido: Omit<Pedido, 'id'>,
        itens: ItemNovo[],
        con?: PoolConnection,
    ): Promise<void> {
        // A "con" é opcional (mesma ideia do listarPorPedido): quem JÁ
        // está numa transação (o PedidoService, que travou o pedido para
        // conferir se ele ainda está ABERTO) passa a sua. Sem "con", esta
        // função abre a própria transação, como antes.
        const trocar = async (c: PoolConnection): Promise<void> => {
            await c.execute(SQL_ATUALIZAR, PedidoRepository.parametrosAtualizar(id, pedido));
            await this.itens.excluirPorPedido(c, id);
            for (const item of itens) {
                await this.itens.inserirNaTransacao(c, { ...item, pedido_id: id });
            }
        };
        if (con) {
            await trocar(con);
        } else {
            await this.db.transacao(trocar);
        }
    }

    // -------------------------------------------------------------------
    // Lista e exclusão (Passo 4)
    // -------------------------------------------------------------------

    /**
     * Todos os pedidos, do mais novo para o mais antigo, já com o NOME
     * do cliente. JOIN = "junte cada pedido com a linha do cliente que
     * tem o mesmo id", como grampear a ficha do cliente na comanda.
     */
    async listarComCliente(): Promise<PedidoComCliente[]> {
        return this.db.consultar<PedidoComCliente>(
            'SELECT p.*, c.nome AS cliente_nome ' +
            'FROM pedido p ' +
            'JOIN cliente c ON c.id = p.cliente_id ' +
            'ORDER BY p.data_pedido DESC, p.id DESC',
        );
    }

    /**
     * Exclui o pedido SÓ SE ele estiver ABERTO ou CANCELADO (a condição
     * fica no próprio DELETE, como a catraca do mudarStatus: ninguém
     * consegue confirmar o pedido "no meio" da exclusão).
     * Devolve true se excluiu. Os itens vão junto (CASCADE do schema).
     * Se o pedido tiver entregas, o banco recusa (RESTRICT) e a
     * mensagem vira uma frase para o atendente.
     */
    async excluirSeAbertoOuCancelado(id: number): Promise<boolean> {
        try {
            const resultado = await this.db.executar(
                "DELETE FROM pedido WHERE id = ? AND status IN ('ABERTO', 'CANCELADO')",
                [id],
            );
            return resultado.affectedRows === 1;
        } catch (erro) {
            if ((erro as { errno?: number } | null)?.errno === ERRO_EM_USO) {
                throw new ErroDeNegocio('Este pedido já teve entregas e não pode ser excluído.');
            }
            throw erro;
        }
    }

    // -------------------------------------------------------------------
    // Mudança de status (usado pelo PedidoService, dentro de transação)
    // -------------------------------------------------------------------

    /**
     * Busca o pedido DENTRO da transação e o TRAVA até ela terminar
     * (FOR UPDATE). Enquanto um atendente confirma o pedido 12, outro
     * que tente cancelar o mesmo pedido 12 espera na fila, como a porta
     * de um provador ocupado: só entra quando o primeiro sair.
     * Devolve null se o pedido não existir.
     */
    async buscarParaAlterar(con: PoolConnection, id: number): Promise<Pedido | null> {
        const [linhas] = await con.execute('SELECT * FROM pedido WHERE id = ? FOR UPDATE', [id]);
        return (linhas as Pedido[])[0] ?? null;
    }

    /**
     * Muda o status de "de" para "para", SÓ SE o pedido ainda estiver
     * em "de" (a mesma "catraca" do registrarEntregue das entregas).
     * Devolve true se mudou. As REGRAS (quem pode virar o quê) ficam no
     * PedidoService; aqui só garantimos que ninguém pulou na frente.
     */
    async mudarStatus(
        con: PoolConnection,
        id: number,
        de: StatusPedido,
        para: StatusPedido,
    ): Promise<boolean> {
        const [resultado] = await con.execute(
            'UPDATE pedido SET status = ? WHERE id = ? AND status = ?',
            [para, id, de],
        );
        return (resultado as ResultadoExecucao).affectedRows === 1;
    }

    // -------------------------------------------------------------------
    // Contrato com o Integrante 3 (tela inicial)
    // -------------------------------------------------------------------

    /**
     * Resumo dos pedidos de HOJE: uma linha por status, com a soma em
     * reais. Status sem pedido hoje não aparece (a tela trata como 0).
     * Exemplo: [{ status: 'ABERTO', total: 250 }, { status: 'ENTREGUE', total: 410.5 }]
     */
    async resumoDeHoje(): Promise<{ status: string; total: number }[]> {
        // "De hoje" = da meia-noite de hoje até antes da meia-noite de
        // amanhã. Comparar a coluna direto (sem DATE(data_pedido)) deixa o
        // MySQL usar um índice no futuro, se um dia a tabela crescer.
        // total = soma em REAIS dos pedidos de hoje com esse status.
        return this.db.consultar<{ status: string; total: number }>(
            'SELECT status, SUM(total) AS total ' +
            'FROM pedido ' +
            'WHERE data_pedido >= CURDATE() ' +
            '  AND data_pedido < CURDATE() + INTERVAL 1 DAY ' +
            'GROUP BY status ' +
            'ORDER BY status',
        );
    }

    // -------------------------------------------------------------------
    // Ajudantes internos
    // -------------------------------------------------------------------

    /** Grava o pedido usando a conexão da transação ("con"). */
    private static async inserirNaTransacao(
        con: PoolConnection,
        dados: Omit<Pedido, 'id'>,
    ): Promise<number> {
        const [resultado] = await con.execute(SQL_INSERIR, PedidoRepository.parametrosInserir(dados));
        return (resultado as ResultadoExecucao).insertId;
    }

    /** Valores na MESMA ordem dos "?" do SQL_INSERIR. */
    private static parametrosInserir(dados: Omit<Pedido, 'id'>) {
        return [
            dados.cliente_id,
            dados.usuario_id,
            dados.status,
            dados.subtotal,
            dados.taxa_entrega,
            dados.total,
            dados.observacao,
        ];
    }

    /** Valores na MESMA ordem dos "?" do SQL_ATUALIZAR (o id vai por último). */
    private static parametrosAtualizar(id: number, dados: Omit<Pedido, 'id'>) {
        return [
            dados.cliente_id,
            dados.subtotal,
            dados.taxa_entrega,
            dados.total,
            dados.observacao,
            id,
        ];
    }
}