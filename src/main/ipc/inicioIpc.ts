// =====================================================================
// inicioIpc.ts — o canal da tela inicial
// ---------------------------------------------------------------------
// inicio:resumo -> ADMIN, ATENDENTE (tabela da Arquitetura).
// O perfil vem da Sessao (Main): o ATENDENTE recebe o estoque baixo
// sem custo e margem.
// =====================================================================

import type { IpcRouter } from './IpcRouter';
import { InicioService } from '../services/InicioService';
import type { ResumoInicio } from '../services/InicioService';
import { ProdutoRepository } from '../repositories/ProdutoRepository';
import { PedidoRepository } from '../repositories/PedidoRepository';

export function registrarInicioIpc(router: IpcRouter): void {
  const service = new InicioService(new ProdutoRepository(), new PedidoRepository());

  router.registrar<void, ResumoInicio>('inicio:resumo', ['ADMIN', 'ATENDENTE'], (_dados, usuario) =>
    service.resumo(usuario!.perfil),
  );
}
