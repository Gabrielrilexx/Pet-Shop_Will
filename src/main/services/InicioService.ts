// =====================================================================
// InicioService.ts — o "QUADRO DE AVISOS" da tela inicial
// ---------------------------------------------------------------------
// Na entrada da cozinha de um restaurante tem um quadro com o que
// importa AGORA: o que está acabando na despensa e como foi o dia.
// Este Service monta esse quadro juntando duas informações que já
// existem:
//   - produtos com estoque baixo  -> ProdutoRepository (Integrante 3)
//   - pedidos de hoje por status  -> PedidoRepository  (Integrante 4)
//
// A tela inicial também é aberta pelo ATENDENTE, então o estoque baixo
// passa pela MESMA regra do ProdutoService: só o ADMIN vê custo e margem.
//
// INJEÇÃO DE DEPENDÊNCIA: recebe os dois repositories prontos:
//   new InicioService(new ProdutoRepository(), new PedidoRepository())
//
// Canal (contrato do Integrante 1): inicio:resumo -> ADMIN, ATENDENTE
// =====================================================================

import type { Perfil, Produto, StatusPedido } from '../../shared/tipos';
import type { ProdutoRepository } from '../repositories/ProdutoRepository';
import type { PedidoRepository } from '../repositories/PedidoRepository';
import { ProdutoService } from './ProdutoService';
import type { ProdutoSemCusto } from './ProdutoService';

/** O que a tela inicial recebe. */
export interface ResumoInicio {
  estoque_baixo: Produto[] | ProdutoSemCusto[];
  pedidos_hoje: { status: StatusPedido; total: number }[];
}

// Os 5 status de pedido, na ordem em que acontecem (schema.sql)
const STATUS_DO_PEDIDO: StatusPedido[] = [
  'ABERTO',
  'CONFIRMADO',
  'EM_ROTA',
  'ENTREGUE',
  'CANCELADO',
];

export class InicioService {
  constructor(
    private readonly produtos: ProdutoRepository,
    private readonly pedidos: PedidoRepository,
  ) {}

  /** Monta o quadro da tela inicial para quem está logado. */
  async resumo(perfil: Perfil): Promise<ResumoInicio> {
    // As duas perguntas ao banco não dependem uma da outra, então são
    // feitas AO MESMO TEMPO (Promise.all), como pedir duas coisas para
    // dois atendentes em vez de esperar um terminar para chamar o outro.
    const [estoqueBaixo, pedidosHoje] = await Promise.all([
      this.produtos.listarEstoqueBaixo(),
      this.pedidos.resumoDeHoje(),
    ]);

    return {
      estoque_baixo: ProdutoService.paraOPerfil(estoqueBaixo, perfil),
      // O resumoDeHoje só traz os status que tiveram pedido hoje.
      // Aqui completamos com 0 os que faltam: a tela recebe sempre os
      // 5 status, na mesma ordem, e não precisa "adivinhar" nada.
      pedidos_hoje: STATUS_DO_PEDIDO.map((status) => ({
        status,
        total: pedidosHoje.find((linha) => linha.status === status)?.total ?? 0,
      })),
    };
  }
}
