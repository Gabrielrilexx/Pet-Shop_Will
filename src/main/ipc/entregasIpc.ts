// =====================================================================
// entregasIpc.ts — os canais de entregas
// ---------------------------------------------------------------------
// Liga cada canal a um método do EntregaService. O garçom (IpcRouter)
// já conferiu o login e o perfil, e já transforma qualquer erro numa
// resposta { ok: false, erro } (por isso NÃO tem try/catch aqui).
//
// Permissões (tabela do README): entregas:* -> ADMIN, ATENDENTE
//
// Autor: Integrante 4 (pedidos e entregas)
// =====================================================================

import type { IpcRouter } from './IpcRouter';
import { Database } from '../database/Database';
import { EntregaService } from '../services/EntregaService';
import type { NaoEntregaInformada, SaidaParaEntrega } from '../services/EntregaService';
import type { EntregaNaRua } from '../repositories/EntregaRepository';
import { EntregaRepository } from '../repositories/EntregaRepository';
import { PedidoRepository } from '../repositories/PedidoRepository';
import { EntregadorRepository } from '../repositories/EntregadorRepository'; // Integrante 2
import { ClienteRepository } from '../repositories/ClienteRepository'; // Integrante 2

export function registrarEntregasIpc(router: IpcRouter): void {
    const service = new EntregaService(
        Database.instancia(),
        new PedidoRepository(),
        new EntregaRepository(),
        new EntregadorRepository(),
        new ClienteRepository(),
    );

    router.registrar<void, EntregaNaRua[]>('entregas:listarEmRota', ['ADMIN', 'ATENDENTE'], () =>
        service.listarEmRota(),
    );
    router.registrar<Partial<SaidaParaEntrega>, number>('entregas:sair', ['ADMIN', 'ATENDENTE'], (dados) =>
        service.sair(dados),
    );
    router.registrar<number, void>('entregas:entregue', ['ADMIN', 'ATENDENTE'], (id) =>
        service.registrarEntregue(id),
    );
    router.registrar<Partial<NaoEntregaInformada>, void>(
        'entregas:naoEntregue',
        ['ADMIN', 'ATENDENTE'],
        (dados) => service.registrarNaoEntregue(dados),
    );
}