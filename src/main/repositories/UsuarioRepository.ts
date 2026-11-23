// =====================================================================
// UsuarioRepository.ts — o "ESTOQUISTA" da tabela usuario
// ---------------------------------------------------------------------
// Só ele mexe na tabela usuario. listar(), buscarPorId() e excluir()
// vêm prontos do BaseRepository; aqui ficam o inserir e o atualizar.
//
// ATENÇÃO: este repository devolve o usuário COM o senha_hash, porque
// o login (Passo 7) precisa dele para conferir a senha. Quem tira o
// hash antes de mandar para a tela é o UsuarioService.
// =====================================================================

import type { Usuario } from '../../shared/tipos';
import { Database } from '../database/Database';
import { BaseRepository } from './BaseRepository';
import { ErroDeNegocio } from '../security/ErroDeNegocio';

export class UsuarioRepository extends BaseRepository<Usuario> {
  constructor() {
    super(Database.instancia(), 'usuario'); // nome da tabela FIXO
  }

  /** Insere um usuário e devolve o id. O criado_em o banco preenche. */
  async inserir(dados: Omit<Usuario, 'id'>): Promise<number> {
    try {
      const resultado = await this.db.executar(
        'INSERT INTO usuario (nome, email, senha_hash, perfil, ativo) ' +
          'VALUES (?, ?, ?, ?, ?)',
        [dados.nome, dados.email, dados.senha_hash, dados.perfil, dados.ativo],
      );
      return resultado.insertId;
    } catch (erro) {
      if (this.ehErroDeDuplicidade(erro)) {
        throw new ErroDeNegocio('Já existe um usuário com esse e-mail.');
      }
      throw erro;
    }
  }

  /**
   * Atualiza nome, e-mail, perfil e ativo.
   * NÃO mexe na senha de propósito: trocar senha é uma ação separada
   * (redefinirSenha, Passo 9), para nunca gravar um hash por engano.
   */
  async atualizar(id: number, dados: Omit<Usuario, 'id'>): Promise<void> {
    let linhasAlteradas: number;
    try {
      const resultado = await this.db.executar(
        'UPDATE usuario SET nome = ?, email = ?, perfil = ?, ativo = ? WHERE id = ?',
        [dados.nome, dados.email, dados.perfil, dados.ativo, id],
      );
      linhasAlteradas = resultado.affectedRows;
    } catch (erro) {
      if (this.ehErroDeDuplicidade(erro)) {
        throw new ErroDeNegocio('Já existe um usuário com esse e-mail.');
      }
      throw erro;
    }

    if (linhasAlteradas === 0) {
      throw new ErroDeNegocio('Registro não encontrado.');
    }
  }
}
