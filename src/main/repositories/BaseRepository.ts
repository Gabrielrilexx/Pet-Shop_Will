// =====================================================================
// BaseRepository.ts — a "MÃE" de todos os repositories
// ---------------------------------------------------------------------
// Um repository é o "estoquista" de UMA tabela: só ele busca e grava
// dados nela. Muitas operações são iguais em todas as tabelas
// (listar, buscar pelo id, excluir), então ficam escritas UMA vez aqui.
// O que muda de tabela para tabela (inserir e atualizar, porque cada
// uma tem colunas diferentes) cada filha escreve do seu jeito.
//
// Como uma filha fica (exemplo):
//
//   export class EspecieRepository extends BaseRepository<Especie> {
//     constructor() {
//       super(Database.instancia(), 'especie'); // nome da tabela FIXO
//     }
//     async inserir(dados: Omit<Especie, 'id'>): Promise<number> {
//       const r = await this.db.executar(
//         'INSERT INTO especie (nome) VALUES (?)', [dados.nome]);
//       return r.insertId;
//     }
//     async atualizar(id: number, dados: Omit<Especie, 'id'>): Promise<void> {
//       await this.db.executar(
//         'UPDATE especie SET nome = ? WHERE id = ?', [dados.nome, id]);
//     }
//   }
// =====================================================================

import { Database } from '../database/Database';
import { ErroDeNegocio } from '../security/ErroDeNegocio';

// Códigos de erro do MySQL para "não pode apagar: outro registro
// aponta para este" (chave estrangeira com ON DELETE RESTRICT).
const ERROS_DE_CHAVE_ESTRANGEIRA = [1451, 1217];

// Código de erro do MySQL para "valor repetido numa coluna UNIQUE"
// (ex.: e-mail, CPF ou CNPJ que já existe).
const ERRO_DE_DUPLICIDADE = 1062;

export abstract class BaseRepository<T extends { id: number }> {
  constructor(
    protected db: Database,
    protected tabela: string,
  ) {
    // O nome da tabela entra no SQL como TEXTO (placeholder "?" não
    // funciona para nome de tabela). Por isso ele é fixo na classe filha
    // e, por garantia, aqui só aceitamos letras minúsculas e "_".
    if (!/^[a-z_]+$/.test(tabela)) {
      throw new Error(`Nome de tabela inválido: ${tabela}`);
    }
  }

  /** Todas as linhas da tabela, em ordem de id. */
  async listar(): Promise<T[]> {
    return this.db.consultar<T>(`SELECT * FROM ${this.tabela} ORDER BY id`);
  }

  /** Uma linha pelo id, ou null se não existir. */
  async buscarPorId(id: number): Promise<T | null> {
    const linhas = await this.db.consultar<T>(
      `SELECT * FROM ${this.tabela} WHERE id = ?`,
      [id],
    );
    return linhas[0] ?? null; // "??" = se não veio nada, usa null
  }

  /**
   * Exclui pelo id.
   * Se outro registro depende deste (ex.: espécie usada por um produto),
   * o MySQL recusa, e transformamos isso numa mensagem amigável.
   */
  async excluir(id: number): Promise<void> {
    try {
      const resultado = await this.db.executar(
        `DELETE FROM ${this.tabela} WHERE id = ?`,
        [id],
      );
      if (resultado.affectedRows === 0) {
        throw new ErroDeNegocio('Registro não encontrado.');
      }
    } catch (erro) {
      if (BaseRepository.ehErroDeChaveEstrangeira(erro)) {
        throw new ErroDeNegocio(
          'Este registro está em uso e não pode ser excluído.',
        );
      }
      throw erro; // qualquer outro erro segue adiante sem mudar
    }
  }

  // -------------------------------------------------------------------
  // "abstract" = a mãe só diz QUE existe; cada filha É OBRIGADA a
  // escrever COMO funciona. Se esquecer, o TypeScript acusa erro.
  // -------------------------------------------------------------------

  /** Insere e devolve o id gerado. */
  abstract inserir(dados: Omit<T, 'id'>): Promise<number>;

  /** Atualiza a linha que tem esse id. */
  abstract atualizar(id: number, dados: Omit<T, 'id'>): Promise<void>;

  /**
   * Confere se o erro veio de um valor repetido numa coluna UNIQUE.
   * Use no inserir/atualizar da filha para trocar o erro técnico por
   * uma mensagem que o usuário entenda:
   *
   *   try {
   *     ... INSERT ...
   *   } catch (erro) {
   *     if (this.ehErroDeDuplicidade(erro)) {
   *       throw new ErroDeNegocio('Já existe um fornecedor com esse CNPJ.');
   *     }
   *     throw erro;
   *   }
   */
  protected ehErroDeDuplicidade(erro: unknown): boolean {
    return BaseRepository.codigoDoErro(erro) === ERRO_DE_DUPLICIDADE;
  }

  /** Confere se o erro veio do MySQL por causa de chave estrangeira. */
  private static ehErroDeChaveEstrangeira(erro: unknown): boolean {
    const errno = BaseRepository.codigoDoErro(erro);
    return errno !== undefined && ERROS_DE_CHAVE_ESTRANGEIRA.includes(errno);
  }

  /** Lê o número do erro do MySQL (errno), se existir. */
  private static codigoDoErro(erro: unknown): number | undefined {
    return (erro as { errno?: number } | null)?.errno;
  }
}
