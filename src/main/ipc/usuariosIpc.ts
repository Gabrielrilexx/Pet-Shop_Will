// =====================================================================
// usuariosIpc.ts — os canais do módulo de usuários
// ---------------------------------------------------------------------
// Cada módulo tem um arquivo assim. Ele é o "cardápio" daquele módulo:
// liga cada canal (nome do pedido) a um método do Service, dizendo
// QUEM pode pedir. Quem confere login e perfil é o IpcRouter.
//
// Lembrete (ver README "Como criar um módulo"):
//   - o canal também precisa estar em src/shared/canais.ts;
//   - esta função é chamada UMA vez no src/main.ts.
// =====================================================================

import type { UsuarioSemSenha } from '../../shared/tipos';
import type { IpcRouter } from './IpcRouter';
import { UsuarioService } from '../services/UsuarioService';

export function registrarUsuariosIpc(router: IpcRouter): void {
  const service = new UsuarioService();

  // usuarios:listar -> só ADMIN (tabela de permissões da Arquitetura)
  router.registrar<void, UsuarioSemSenha[]>('usuarios:listar', ['ADMIN'], () =>
    service.listar(),
  );

  // Passo 9: usuarios:salvar, usuarios:excluir, usuarios:alterarAtivo e
  // usuarios:redefinirSenha entram aqui.
}
