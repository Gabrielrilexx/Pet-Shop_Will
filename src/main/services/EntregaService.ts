// =====================================================================
// EntregaService.ts — o "DESPACHANTE" DOS MOTOBOYS
// ---------------------------------------------------------------------
// No restaurante, é quem fica na porta da cozinha com a prancheta:
// entrega o pacote ao motoboy, anota a hora da saída e, quando ele
// volta, anota se deu certo ou não. Conhece as REGRAS da entrega:
//
//   SAIR        pedido CONFIRMADO + motoboy ATIVO + cliente com distância
//               -> cria a entrega (EM_ROTA), calcula a taxa e grava no
//                  pedido: total = subtotal + taxa. Pedido -> EM_ROTA.
//   ENTREGUE    entrega -> ENTREGUE (com o horário). Pedido -> ENTREGUE.
//   NÃO DEU     entrega -> NAO_ENTREGUE (com o motivo, obrigatório).
//               Pedido volta para CONFIRMADO e a taxa volta a ZERO: o
//               pedido pode sair de novo, até com outro motoboy, e a
//               tentativa que falhou fica no histórico com o valor dela.
//
//   Taxa = distância do cliente (km) x valor por km do motoboy.
//
// Cada ação acontece numa TRANSAÇÃO (tudo ou nada) com o pedido
// TRAVADO (FOR UPDATE): dois atendentes não despacham o mesmo pedido.
//
// Usa repositories de três integrantes (injeção de dependência):
//   PedidoRepository, EntregaRepository  -> meus
//   EntregadorRepository, ClienteRepository -> Integrante 2
//
// Canais (entregasIpc.ts): entregas:* -> ADMIN, ATENDENTE.
// Passo 7: historico() mostra todas as tentativas de um pedido.
//
// Autor: Integrante 4 (pedidos e entregas)
// =====================================================================

import type { Database, PoolConnection } from '../database/Database';
import type { PedidoRepository } from '../repositories/PedidoRepository';
import type {
    EntregaRepository,
    EntregaNaRua,
    EntregaDoHistorico,
} from '../repositories/EntregaRepository';
import type { EntregadorRepository } from '../repositories/EntregadorRepository';
import type { ClienteRepository } from '../repositories/ClienteRepository';
import { ErroDeNegocio } from '../security/ErroDeNegocio';
import { Validador } from '../security/Validador';
import type { Pedido } from '../../shared/tipos';

/** O que a tela manda no entregas:sair (a taxa NÃO vem: o Main calcula). */
export interface SaidaParaEntrega {
    pedido_id: number;
    entregador_id: number;
    observacao: string | null;
}

/** O que a tela manda no entregas:naoEntregue. */
export interface NaoEntregaInformada {
    id: number; // id da ENTREGA
    observacao: string; // o motivo (obrigatório)
}

// Limite da coluna entrega.observacao (VARCHAR(255) no schema.sql)
const MAX_OBSERVACAO = 255;

export class EntregaService {
    constructor(
        private readonly db: Database,
        private readonly pedidos: PedidoRepository,
        private readonly entregas: EntregaRepository,
        private readonly entregadores: EntregadorRepository,
        private readonly clientes: ClienteRepository,
    ) { }

    /** As entregas na rua agora, com os nomes do cliente e do motoboy. */
    async listarEmRota(): Promise<EntregaNaRua[]> {
        return this.entregas.listarEmRotaComNomes();
    }

    /**
     * HISTÓRICO (Passo 7): todas as tentativas de entrega de um pedido,
     * da primeira para a última. "As tentativas anteriores ficam no
     * histórico" (regra da arquitetura): aqui é onde a tela as enxerga.
     */
    async historico(id: unknown): Promise<EntregaDoHistorico[]> {
        const pedidoId = EntregaService.idInteiro(id, 'Pedido');
        if (!(await this.pedidos.buscarPorId(pedidoId))) {
            throw new ErroDeNegocio('Pedido não encontrado.');
        }
        return this.entregas.listarHistoricoDoPedido(pedidoId);
    }

    // ===================================================================
    // SAIR: pedido CONFIRMADO -> EM_ROTA, com a taxa calculada
    // ===================================================================

    /** Despacha o pedido com um motoboy. Devolve o id da entrega criada. */
    async sair(dados: Partial<SaidaParaEntrega>): Promise<number> {
        const pedidoId = EntregaService.idInteiro(dados?.pedido_id, 'Pedido');
        const entregadorId = EntregaService.idInteiro(dados?.entregador_id, 'Entregador');
        const obs = Validador.tamanhoMaximo(dados?.observacao, MAX_OBSERVACAO, 'Observação');

        return this.db.transacao(async (con) => {
            // 1. O pedido existe e está CONFIRMADO? (e fica travado até o fim)
            const pedido = await this.buscarPedidoOuFalhar(con, pedidoId);
            if (pedido.status !== 'CONFIRMADO') {
                throw new ErroDeNegocio(
                    `Só sai para entrega um pedido CONFIRMADO (este está ${pedido.status}).`,
                );
            }

            // 2. O motoboy existe e está ATIVO? (a tela já esconde os inativos,
            //    mas a tela pode ter sido alterada: quem garante é aqui)
            const entregador = await this.entregadores.buscarPorId(entregadorId);
            if (!entregador) {
                throw new ErroDeNegocio('Entregador não encontrado.');
            }
            if (!entregador.ativo) {
                throw new ErroDeNegocio(`${entregador.nome} está inativo e não pode sair com pedidos.`);
            }

            // 3. O cliente tem distância calculada? Sem ela, não dá para cobrar
            //    a taxa (e nunca inventamos uma distância: taxa errada é prejuízo).
            const cliente = await this.clientes.buscarPorId(pedido.cliente_id);
            if (!cliente) {
                throw new ErroDeNegocio('Cliente do pedido não encontrado.');
            }
            if (cliente.distancia_km === null) {
                throw new ErroDeNegocio(
                    `O cliente "${cliente.nome}" está sem distância calculada. ` +
                    'Edite o endereço dele na tela de Clientes para recalcular.',
                );
            }

            // 4. Taxa = distância x valor por km, arredondada em centavos.
            const taxa = Math.round(cliente.distancia_km * entregador.valor_por_km * 100) / 100;

            // 5. Grava tudo no MESMO "caixa": a entrega, a taxa no pedido e o status.
            const entregaId = await this.entregas.inserirNaTransacao(con, {
                pedido_id: pedidoId,
                entregador_id: entregadorId,
                distancia_km: cliente.distancia_km, // copiada: se o endereço mudar, esta saída não muda
                valor_entrega: taxa,
                observacao: obs === '' ? null : obs,
            });
            await this.pedidos.atualizarTaxa(con, pedidoId, taxa);
            await this.mudarStatusOuFalhar(con, pedidoId, 'CONFIRMADO', 'EM_ROTA');
            return entregaId;
        });
    }

    // ===================================================================
    // ENTREGUE: entrega e pedido -> ENTREGUE
    // ===================================================================

    async registrarEntregue(id: unknown): Promise<void> {
        const entregaId = EntregaService.idInteiro(id, 'Entrega');
        const entrega = await this.buscarEntregaOuFalhar(entregaId);

        await this.db.transacao(async (con) => {
            // Trava o PEDIDO primeiro (a mesma ordem de sempre: pedido, depois o resto).
            await this.buscarPedidoOuFalhar(con, entrega.pedido_id);
            const mudou = await this.entregas.registrarEntregue(con, entregaId);
            if (!mudou) {
                throw new ErroDeNegocio('Esta entrega já foi finalizada. Atualize a tela.');
            }
            await this.mudarStatusOuFalhar(con, entrega.pedido_id, 'EM_ROTA', 'ENTREGUE');
        });
    }

    // ===================================================================
    // NÃO ENTREGUE: entrega -> NAO_ENTREGUE; pedido volta para CONFIRMADO
    // ===================================================================

    async registrarNaoEntregue(dados: Partial<NaoEntregaInformada>): Promise<void> {
        const entregaId = EntregaService.idInteiro(dados?.id, 'Entrega');
        const motivo = Validador.obrigatorio(dados?.observacao, 'Motivo');
        Validador.tamanhoMaximo(motivo, MAX_OBSERVACAO, 'Motivo');
        const entrega = await this.buscarEntregaOuFalhar(entregaId);

        await this.db.transacao(async (con) => {
            await this.buscarPedidoOuFalhar(con, entrega.pedido_id);
            const mudou = await this.entregas.registrarNaoEntregue(con, entregaId, motivo);
            if (!mudou) {
                throw new ErroDeNegocio('Esta entrega já foi finalizada. Atualize a tela.');
            }
            // Decisão do grupo (opção A): pedido CONFIRMADO não tem taxa.
            // A próxima saída grava a taxa nova.
            await this.pedidos.atualizarTaxa(con, entrega.pedido_id, 0);
            await this.mudarStatusOuFalhar(con, entrega.pedido_id, 'EM_ROTA', 'CONFIRMADO');
        });
    }

    // ===================================================================
    // Ajudantes internos
    // ===================================================================

    /** Busca e TRAVA o pedido (FOR UPDATE); se não existir, avisa. */
    private async buscarPedidoOuFalhar(con: PoolConnection, id: number): Promise<Pedido> {
        const pedido = await this.pedidos.buscarParaAlterar(con, id);
        if (!pedido) {
            throw new ErroDeNegocio('Pedido não encontrado.');
        }
        return pedido;
    }

    private async buscarEntregaOuFalhar(id: number) {
        const entrega = await this.entregas.buscarPorId(id);
        if (!entrega) {
            throw new ErroDeNegocio('Entrega não encontrada.');
        }
        return entrega;
    }

    /** Muda o status pela "catraca"; se alguém mudou antes, desfaz tudo. */
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

    /** Número inteiro maior que zero (um id). */
    private static idInteiro(valor: unknown, campo: string): number {
        const numero = Validador.positivo(valor, campo);
        if (!Number.isInteger(numero)) {
            throw new ErroDeNegocio(`O campo ${campo} deve ser um número inteiro.`);
        }
        return numero;
    }
}