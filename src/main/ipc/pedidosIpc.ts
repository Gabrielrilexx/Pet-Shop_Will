// =====================================================================
// pedidosIpc.ts — os canais de pedidos
// ---------------------------------------------------------------------
// Liga cada canal a um método do PedidoService. É o "cardápio da
// cozinha de pedidos": o garçom (IpcRouter) já conferiu o login e o
// perfil antes de chegar aqui, e já transforma qualquer erro numa
// resposta { ok: false, erro } (por isso NÃO tem try/catch aqui).
//
// Permissões (tabela do README):
//   pedidos:listar, pedidos:salvar, pedidos:confirmar,
//   pedidos:cancelar                  -> ADMIN, ATENDENTE
//   pedidos:excluir                   -> ADMIN
//
// O 2º parâmetro do handler é QUEM está logado (vem da Sessao, no
// Main). É dele que sai o usuario_id do pedido: a tela não consegue
// "fingir" ser outra pessoa. O "usuario!" é seguro porque nenhum canal
// aqui é PUBLICO (o IpcRouter já recusou quem não está logado).
//
// Autor: Integrante 4 (pedidos e entregas)
// =====================================================================

import type { IpcRouter } from './IpcRouter';
import { PedidoService } from '../services/PedidoService';
import type { PedidoParaSalvar } from '../services/PedidoService';
import type { PedidoComCliente } from '../repositories/PedidoRepository';
import { PedidoRepository } from '../repositories/PedidoRepository';
import { ItemPedidoRepository } from '../repositories/ItemPedidoRepository';
import { ProdutoRepository } from '../repositories/ProdutoRepository';
import { Database } from '../database/Database';

export function registrarPedidosIpc(router: IpcRouter): void {
    const itens = new ItemPedidoRepository();
    const service = new PedidoService(
        new PedidoRepository(itens),
        itens,
        new ProdutoRepository(), // do Integrante 3
        Database.instancia(),
    );

    router.registrar<void, PedidoComCliente[]>('pedidos:listar', ['ADMIN', 'ATENDENTE'], () =>
        service.listar(),
    );
    router.registrar<Partial<PedidoParaSalvar>, number>(
        'pedidos:salvar',
        ['ADMIN', 'ATENDENTE'],
        (dados, usuario) => service.salvar(dados, usuario!.id),
    );
    router.registrar<number, void>('pedidos:confirmar', ['ADMIN', 'ATENDENTE'], (id) =>
        service.confirmar(id),
    );
    router.registrar<number, void>('pedidos:cancelar', ['ADMIN', 'ATENDENTE'], (id) =>
        service.cancelar(id),
    );
    router.registrar<number, void>('pedidos:excluir', ['ADMIN'], (id) => service.excluir(id));
}