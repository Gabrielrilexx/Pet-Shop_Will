// =====================================================================
// UsuarioService.ts — as REGRAS dos usuários
// ---------------------------------------------------------------------
// O service é a "cozinha": recebe o pedido do IpcRouter, aplica as
// regras e usa o repository para buscar ou gravar.
//
// Regra principal: o senha_hash NUNCA sai daqui para a tela. Mesmo
// sendo um hash (não dá para "desfazer"), quanto menos ele circula,
// menos chance de vazar. Por isso a tela recebe UsuarioSemSenha.
//
// Passo 6: só listar (o exemplo de ponta a ponta).
// Passo 9: cadastrar, editar, ativar/desativar e redefinir senha.
// =====================================================================

import type { Usuario, UsuarioSemSenha } from '../../shared/tipos';
import { UsuarioRepository } from '../repositories/UsuarioRepository';

export class UsuarioService {
  // Injeção de dependência: recebe o repository pronto (ou cria um).
  constructor(private readonly usuarios: UsuarioRepository = new UsuarioRepository()) {}

  /** Lista todos os usuários, sem o senha_hash. */
  async listar(): Promise<UsuarioSemSenha[]> {
    const lista = await this.usuarios.listar();
    return lista.map(UsuarioService.semSenha);
  }

  /**
   * Tira o senha_hash de um usuário.
   * O "...resto" junta todos os outros campos num objeto novo.
   * O "_" no nome avisa: "peguei, mas não vou usar".
   */
  static semSenha({ senha_hash: _senha, ...resto }: Usuario): UsuarioSemSenha {
    return resto;
  }
}
