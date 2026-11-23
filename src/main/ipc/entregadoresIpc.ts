// =====================================================================
// entregadoresIpc.ts — os canais de entregadores
// ---------------------------------------------------------------------
// É o "cardápio" do garçom (IpcRouter) para o módulo de entregadores:
// liga cada canal a um método do EntregadorService e diz QUEM pode
// pedir. Também monta o Service (injeção de dependência).
//
// Permissões (tabela do README):
//   entregadores:listar  -> ADMIN e ATENDENTE (ATENDENTE recebe sem CPF)
//   entregadores:salvar, entregadores:excluir -> só ADMIN
//
// Não tem try/catch aqui de propósito: o IpcRouter já faz isso.
// =====================================================================

import type { Entregador } from '../../shared/tipos';
import type { IpcRouter } from './IpcRouter';
import { EntregadorService } from '../services/EntregadorService';
import type { EntregadorSemCpf } from '../services/EntregadorService';
import { EntregadorRepository } from '../repositories/EntregadorRepository';

export function registrarEntregadoresIpc(router: IpcRouter): void {
  const service = new EntregadorService(new EntregadorRepository());

  // O 2º parâmetro é quem está logado: o Service corta o CPF conforme o
  // perfil. O "!" diz ao TypeScript "aqui sempre tem usuário": o
  // IpcRouter só chega neste ponto se houver login com perfil permitido.
  router.registrar<void, Entregador[] | EntregadorSemCpf[]>(
    'entregadores:listar',
    ['ADMIN', 'ATENDENTE'],
    (_dados, usuario) => service.listar(usuario!.perfil),
  );
  router.registrar<Partial<Entregador>, number>('entregadores:salvar', ['ADMIN'], (dados) =>
    service.salvar(dados),
  );
  router.registrar<number, void>('entregadores:excluir', ['ADMIN'], (id) =>
    service.excluir(id),
  );
}
