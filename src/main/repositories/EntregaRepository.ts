// =====================================================================
// EntregaRepository.ts — o "LIVRO DE SAÍDAS" DOS MOTOBOYS
// ---------------------------------------------------------------------
// Cada linha da tabela entrega é uma SAÍDA de um pedido com um motoboy,
// como uma linha no caderno da portaria: "pedido 12 saiu com o João às
// 14h05; voltou entregue às 14h30". Só esta classe escreve SQL na
// tabela entrega.
//
// A vida de uma entrega:
//   EM_ROTA ──> ENTREGUE       (deu certo: grava o horário da entrega)
//      └─────> NAO_ENTREGUE    (cliente ausente, endereço errado...)
// Uma entrega NAO_ENTREGUE nunca é "reaberta": o pedido sai de novo
// com uma NOVA entrega, e a tentativa antiga fica no histórico.
//
// Regras que esta classe garante:
//   - toda entrega nasce EM_ROTA, com o horário de saída de AGORA;
//   - os horários vêm do relógio do BANCO (NOW()), como o relógio da
//     parede da loja: todo mundo anota pelo mesmo relógio, mesmo que o
//     computador de alguém esteja com a hora errada;
//   - só uma entrega EM_ROTA pode virar ENTREGUE ou NAO_ENTREGUE.
//
// O que fica para o EntregaService (Passo 6): mudar o status do PEDIDO
// junto, calcular a taxa e escolher só entregador ativo.
//
// Autor: Integrante 4 (pedidos e entregas)
// =====================================================================

import { Database } from '../database/Database';
import type { PoolConnection, ResultadoExecucao } from '../database/Database';
import { BaseRepository } from './BaseRepository';
import type { Entrega } from '../../shared/tipos';

/**
 * O que quem chama manda na hora da SAÍDA: sem id (o banco cria), sem
 * status (é sempre EM_ROTA) e sem horários (o banco anota com NOW()).
 * Assim ninguém consegue criar uma entrega "já entregue" por engano.
 */
export type EntregaNova = Omit<Entrega, 'id' | 'status' | 'saiu_em' | 'entregue_em'>;

/** Uma entrega do jeito que a tela de Entregas mostra: com os nomes juntos. */
export type EntregaNaRua = Entrega & { cliente_nome: string; entregador_nome: string };

// Toda entrega nasce assim: EM_ROTA e com o horário de agora.
// 'EM_ROTA' e NOW() estão escritos no próprio SQL (não são "?"):
// não vêm de fora, então não há risco de SQL injection.
const SQL_INSERIR =
    'INSERT INTO entrega ' +
    '(pedido_id, entregador_id, distancia_km, valor_entrega, observacao, status, saiu_em) ' +
    "VALUES (?, ?, ?, ?, ?, 'EM_ROTA', NOW())";

export class EntregaRepository extends BaseRepository<Entrega> {
    constructor() {
        super(Database.instancia(), 'entrega'); // nome da tabela FIXO
    }

    // -------------------------------------------------------------------
    // Obrigatórios (a "mãe" BaseRepository exige que toda filha tenha)
    // -------------------------------------------------------------------

    /**
     * Grava uma entrega avulsa (fora de transação) e devolve o id.
     * Mesmo que alguém mande status ou horários, eles são IGNORADOS:
     * a entrega nasce EM_ROTA, com o horário de agora (decisão 4).
     */
    async inserir(dados: Omit<Entrega, 'id'>): Promise<number> {
        const resultado = await this.db.executar(
            SQL_INSERIR,
            EntregaRepository.parametros(dados),
        );
        return resultado.insertId;
    }

    /**
     * Corrige entregador, distância, valor e observação.
     * NÃO muda o status nem os horários: isso só acontece pelos métodos
     * registrarEntregue e registrarNaoEntregue, que têm regras.
     */
    async atualizar(id: number, dados: Omit<Entrega, 'id'>): Promise<void> {
        await this.db.executar(
            'UPDATE entrega SET entregador_id = ?, distancia_km = ?, valor_entrega = ?, ' +
            'observacao = ? WHERE id = ?',
            [dados.entregador_id, dados.distancia_km, dados.valor_entrega, dados.observacao, id],
        );
    }

    // -------------------------------------------------------------------
    // Dentro de transação (o Service muda o pedido na mesma "compra")
    // -------------------------------------------------------------------

    /** SAÍDA: cria a entrega EM_ROTA, usando a conexão da transação. */
    async inserirNaTransacao(con: PoolConnection, dados: EntregaNova): Promise<number> {
        const [resultado] = await con.execute(SQL_INSERIR, EntregaRepository.parametros(dados));
        return (resultado as ResultadoExecucao).insertId;
    }

    /**
     * DEU CERTO: marca ENTREGUE e grava o horário da entrega.
     * Devolve true se mudou; false se a entrega não estava EM_ROTA
     * (já tinha sido marcada antes, por exemplo, ou não existe).
     * Mesmo padrão do baixarEstoque do Integrante 3: a condição fica no
     * WHERE, então dois cliques ao mesmo tempo não marcam duas vezes.
     */
    async registrarEntregue(con: PoolConnection, id: number): Promise<boolean> {
        const [resultado] = await con.execute(
            "UPDATE entrega SET status = 'ENTREGUE', entregue_em = NOW() " +
            "WHERE id = ? AND status = 'EM_ROTA'",
            [id],
        );
        return (resultado as ResultadoExecucao).affectedRows === 1;
    }

    /**
     * NÃO DEU: marca NAO_ENTREGUE e grava o motivo.
     * Se o motivo vier vazio (null), a observação da saída é mantida
     * (COALESCE = "use o primeiro valor que não for vazio").
     * Devolve true se mudou; false se a entrega não estava EM_ROTA.
     */
    async registrarNaoEntregue(
        con: PoolConnection,
        id: number,
        observacao: string | null,
    ): Promise<boolean> {
        const [resultado] = await con.execute(
            "UPDATE entrega SET status = 'NAO_ENTREGUE', observacao = COALESCE(?, observacao) " +
            "WHERE id = ? AND status = 'EM_ROTA'",
            [observacao, id],
        );
        return (resultado as ResultadoExecucao).affectedRows === 1;
    }

    // -------------------------------------------------------------------
    // Consultas
    // -------------------------------------------------------------------

    /** Histórico de tentativas de um pedido, da mais antiga para a mais nova. */
    async listarPorPedido(pedidoId: number): Promise<Entrega[]> {
        return this.db.consultar<Entrega>(
            'SELECT * FROM entrega WHERE pedido_id = ? ORDER BY saiu_em, id',
            [pedidoId],
        );
    }

    /** A entrega desse pedido que está NA RUA agora, ou null se não houver. */
    async buscarEmRotaPorPedido(pedidoId: number): Promise<Entrega | null> {
        const linhas = await this.db.consultar<Entrega>(
            "SELECT * FROM entrega WHERE pedido_id = ? AND status = 'EM_ROTA' " +
            'ORDER BY id DESC LIMIT 1',
            [pedidoId],
        );
        return linhas[0] ?? null;
    }

    /** Todas as entregas na rua agora (tela de entregas), as mais antigas primeiro. */
    async listarEmRota(): Promise<Entrega[]> {
        return this.db.consultar<Entrega>(
            "SELECT * FROM entrega WHERE status = 'EM_ROTA' ORDER BY saiu_em, id",
        );
    }

    /**
     * As entregas na rua agora, já com o NOME do cliente e do motoboy.
     * Dois JOINs: entrega -> pedido -> cliente, e entrega -> entregador
     * (como grampear na ficha de saída a comanda e o crachá do motoboy).
     */
    async listarEmRotaComNomes(): Promise<EntregaNaRua[]> {
        return this.db.consultar<EntregaNaRua>(
            'SELECT e.*, c.nome AS cliente_nome, en.nome AS entregador_nome ' +
            'FROM entrega e ' +
            'JOIN pedido p ON p.id = e.pedido_id ' +
            'JOIN cliente c ON c.id = p.cliente_id ' +
            'JOIN entregador en ON en.id = e.entregador_id ' +
            "WHERE e.status = 'EM_ROTA' " +
            'ORDER BY e.saiu_em, e.id',
        );
    }

    // -------------------------------------------------------------------
    // Ajudante interno
    // -------------------------------------------------------------------

    /** Valores na MESMA ordem dos "?" do SQL_INSERIR. */
    private static parametros(dados: EntregaNova) {
        return [
            dados.pedido_id,
            dados.entregador_id,
            dados.distancia_km,
            dados.valor_entrega,
            dados.observacao,
        ];
    }
}