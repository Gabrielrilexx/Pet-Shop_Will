// =====================================================================
// FornecedorRepository.ts — o "ESTOQUISTA" da pasta de fornecedores
// ---------------------------------------------------------------------
// Pense num arquivo de fichas de empresas: cada ficha é um fornecedor
// (de quem a loja compra). Só esta classe escreve SQL na tabela
// "fornecedor".
//
// Herda do BaseRepository (Integrante 1): listar(), buscarPorId() e
// excluir() já vêm prontos. O excluir() já avisa "Este registro está
// em uso..." se algum produto for desse fornecedor.
//
// O CNPJ é UNIQUE no banco: duas fichas com o mesmo CNPJ não entram.
// =====================================================================

import type { Fornecedor } from '../../shared/tipos';
import { Database } from '../database/Database';
import type { ValorSql } from '../database/Database';
import { BaseRepository } from './BaseRepository';
import { ErroDeNegocio } from '../security/ErroDeNegocio';

export class FornecedorRepository extends BaseRepository<Fornecedor> {
  constructor() {
    super(Database.instancia(), 'fornecedor'); // nome da tabela FIXO
  }

  /** Insere um fornecedor e devolve o id que o banco criou. */
  async inserir(dados: Omit<Fornecedor, 'id'>): Promise<number> {
    try {
      const resultado = await this.db.executar(
        'INSERT INTO fornecedor (cnpj, razao_social, nome_fantasia, ' +
          'telefone, cidade, uf, importado) VALUES (?, ?, ?, ?, ?, ?, ?)',
        FornecedorRepository.valores(dados),
      );
      return resultado.insertId;
    } catch (erro) {
      // CNPJ repetido: frase combinada no contrato do grupo
      if (this.ehErroDeDuplicidade(erro)) {
        throw new ErroDeNegocio('Já existe um fornecedor com esse CNPJ.');
      }
      throw erro;
    }
  }

  /** Atualiza a ficha do fornecedor que tem esse id. */
  async atualizar(id: number, dados: Omit<Fornecedor, 'id'>): Promise<void> {
    let linhasAlteradas: number;
    try {
      const resultado = await this.db.executar(
        'UPDATE fornecedor SET cnpj = ?, razao_social = ?, nome_fantasia = ?, ' +
          'telefone = ?, cidade = ?, uf = ?, importado = ? WHERE id = ?',
        [...FornecedorRepository.valores(dados), id],
      );
      linhasAlteradas = resultado.affectedRows;
    } catch (erro) {
      if (this.ehErroDeDuplicidade(erro)) {
        throw new ErroDeNegocio('Já existe um fornecedor com esse CNPJ.');
      }
      throw erro;
    }

    if (linhasAlteradas === 0) {
      throw new ErroDeNegocio('Registro não encontrado.');
    }
  }

  /** Os 7 valores na MESMA ordem das colunas do INSERT e do UPDATE. */
  private static valores(dados: Omit<Fornecedor, 'id'>): ValorSql[] {
    return [
      dados.cnpj,
      dados.razao_social,
      dados.nome_fantasia,
      dados.telefone,
      dados.cidade,
      dados.uf,
      dados.importado,
    ];
  }
}
