// =====================================================================
// EspecieRepository.ts — o "ESTOQUISTA" da prateleira de espécies
// ---------------------------------------------------------------------
// Num supermercado, cada prateleira tem um estoquista: só ele coloca,
// troca ou tira produtos dali. Este repository é o único que escreve
// SQL na tabela "especie" (cachorro, gato, peixe...).
//
// Ele HERDA do BaseRepository (Integrante 1), então já ganha pronto:
//   - listar()       -> todas as espécies
//   - buscarPorId()  -> uma espécie (ou null)
//   - excluir()      -> apaga; se algum produto usa a espécie, o banco
//                       recusa e vira "Este registro está em uso..."
// Aqui escrevemos só o que muda de tabela para tabela: inserir e
// atualizar (cada tabela tem colunas diferentes).
//
// O banco ignora acentos e maiúsculas (COLLATE ..._ai_ci) e o nome é
// UNIQUE: "Gato", "gato" e "GATO" contam como o MESMO nome.
// =====================================================================

import type { Especie } from '../../shared/tipos';
import { Database } from '../database/Database';
import { BaseRepository } from './BaseRepository';
import { ErroDeNegocio } from '../security/ErroDeNegocio';

export class EspecieRepository extends BaseRepository<Especie> {
  constructor() {
    super(Database.instancia(), 'especie'); // nome da tabela FIXO
  }

  /** Insere uma espécie e devolve o id que o banco criou. */
  async inserir(dados: Omit<Especie, 'id'>): Promise<number> {
    try {
      // O "?" é um espaço reservado: o valor vai separado do SQL.
      // Assim ninguém consegue "injetar" comandos pelo nome digitado.
      const resultado = await this.db.executar(
        'INSERT INTO especie (nome) VALUES (?)',
        [dados.nome],
      );
      return resultado.insertId;
    } catch (erro) {
      // Nome repetido: trocamos o erro técnico (1062) por uma frase clara
      if (this.ehErroDeDuplicidade(erro)) {
        throw new ErroDeNegocio('Já existe uma espécie com esse nome.');
      }
      throw erro; // qualquer outro erro segue adiante sem mudar
    }
  }

  /** Troca o nome da espécie que tem esse id. */
  async atualizar(id: number, dados: Omit<Especie, 'id'>): Promise<void> {
    let linhasAlteradas: number;
    try {
      const resultado = await this.db.executar(
        'UPDATE especie SET nome = ? WHERE id = ?',
        [dados.nome, id],
      );
      linhasAlteradas = resultado.affectedRows;
    } catch (erro) {
      if (this.ehErroDeDuplicidade(erro)) {
        throw new ErroDeNegocio('Já existe uma espécie com esse nome.');
      }
      throw erro;
    }

    // Nenhuma linha com esse id: alguém pode ter excluído enquanto a
    // tela estava aberta. Mesma mensagem que o excluir() do Caio usa.
    if (linhasAlteradas === 0) {
      throw new ErroDeNegocio('Registro não encontrado.');
    }
  }
}
