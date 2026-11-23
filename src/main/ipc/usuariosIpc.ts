// =====================================================================
// usuariosIpc.ts — os canais do módulo de usuários
// ---------------------------------------------------------------------
// Cada módulo tem um arquivo assim. Ele é o "cardápio" daquele módulo:
// liga cada canal (nome do pedido) a um método do Service, dizendo
// QUEM pode pedir. Quem confere login e perfil é o IpcRouter.
//
// usuarios:* -> só ADMIN (tabela de permissões da Arquitetura).
//
// O "usuario!" é seguro: como nenhum canal aqui é PUBLICO, o IpcRouter
// já recusou quem não está logado antes de chegar aqui.
// =====================================================================

import type { UsuarioSemSenha } from '../../shared/tipos';
import type { IpcRouter } from './IpcRouter';
import { UsuarioService } from '../services/UsuarioService';

export function registrarUsuariosIpc(router: IpcRouter): void {
  const service = new UsuarioService();

  router.registrar<void, UsuarioSemSenha[]>('usuarios:listar', ['ADMIN'], () =>
    service.listar(),
  );

  router.registrar<unknown, number>('usuarios:salvar', ['ADMIN'], (dados, usuario) =>
    service.salvar(dados, usuario!),
  );

  router.registrar<unknown, void>('usuarios:alterarAtivo', ['ADMIN'], (dados, usuario) =>
    service.alterarAtivo(dados, usuario!),
  );

  router.registrar<unknown, void>('usuarios:redefinirSenha', ['ADMIN'], (dados) =>
    service.redefinirSenha(dados),
  );

  router.registrar<unknown, void>('usuarios:excluir', ['ADMIN'], (id, usuario) =>
    service.excluir(id, usuario!),
  );
}
