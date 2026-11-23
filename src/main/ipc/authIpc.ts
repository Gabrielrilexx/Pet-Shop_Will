// =====================================================================
// authIpc.ts — os canais de login
// ---------------------------------------------------------------------
//   auth:login -> PUBLICO (é o único canal que funciona sem login, claro)
//   auth:sair  -> qualquer usuário logado
//   auth:atual -> qualquer usuário logado. A tela chama ao abrir: se
//                 voltar ok, alguém já está logado (ex.: a página
//                 recarregou); se voltar erro, mostra a tela de login.
// =====================================================================

import type { UsuarioSemSenha } from '../../shared/tipos';
import type { IpcRouter } from './IpcRouter';
import { AuthService } from '../services/AuthService';

export function registrarAuthIpc(router: IpcRouter): void {
  const auth = new AuthService();

  router.registrar<unknown, UsuarioSemSenha>('auth:login', 'PUBLICO', (dados) =>
    auth.login(dados),
  );

  router.registrar<void, void>('auth:sair', ['ADMIN', 'ATENDENTE'], async () =>
    auth.sair(),
  );

  // O "!" diz ao TypeScript: "aqui o usuário com certeza existe" (o
  // IpcRouter já recusou quem não está logado antes de chegar aqui).
  router.registrar<void, UsuarioSemSenha>(
    'auth:atual',
    ['ADMIN', 'ATENDENTE'],
    async (_dados, usuario) => auth.atual(usuario!),
  );
}
