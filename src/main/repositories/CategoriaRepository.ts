// =====================================================================
// CategoriaRepository.ts — o "ESTOQUISTA" da prateleira de categorias
// ---------------------------------------------------------------------
// Irmão gêmeo do EspecieRepository: mesma ideia, outra prateleira.
// É o único que escreve SQL na tabela "categoria" (ração, brinquedo,
// acessório...).
//
// Herda do BaseRepository (Integrante 1): listar(), buscarPorId() e
// excluir() já vêm prontos. Aqui ficam só inserir e atualizar.
//
// O banco ignora acentos e maiúsculas (COLLATE ..._ai_ci) e o nome é
// UNIQUE: "Ração", "racao" e "RAÇÃO" contam como o MESMO nome.
// =====================================================================

import type { Categoria } from '../../shared/tipos';
import { Database } from '../database/Database';
import { BaseRepository } from './BaseRepository';
import { ErroDeNegocio } from '../security/ErroDeNegocio';

export class CategoriaRepository extends BaseRepository<Categoria> {
  constructor() {
    super(Database.instancia(), 'categoria'); // nome da tabela FIXO
  }

  /** Insere uma categoria e devolve o id que o banco criou. */
  async inserir(dados: Omit<Categoria, 'id'>): Promise<number> {
    try {
      const resultado = await this.db.executar(
        'INSERT INTO categoria (nome) VALUES (?)',
        [dados.nome],
      );
      return resultado.insertId;
    } catch (erro) {
      if (this.ehErroDeDuplicidade(erro)) {
        throw new ErroDeNegocio('Já existe uma categoria com esse nome.');
      }
      throw erro;
    }
  }

  /** Troca o nome da categoria que tem esse id. */
  async atualizar(id: number, dados: Omit<Categoria, 'id'>): Promise<void> {
    let linhasAlteradas: number;
    try {
      const resultado = await this.db.executar(
        'UPDATE categoria SET nome = ? WHERE id = ?',
        [dados.nome, id],
      );
      linhasAlteradas = resultado.affectedRows;
    } catch (erro) {
      if (this.ehErroDeDuplicidade(erro)) {
        throw new ErroDeNegocio('Já existe uma categoria com esse nome.');
      }
      throw erro;
    }

    if (linhasAlteradas === 0) {
      throw new ErroDeNegocio('Registro não encontrado.');
    }
  }
}
