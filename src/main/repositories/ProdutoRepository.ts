// =====================================================================
// ProdutoRepository.ts — o "ESTOQUISTA" da prateleira de produtos
// ---------------------------------------------------------------------
// Só esta classe escreve SQL na tabela "produto". Além do cadastro
// (inserir e atualizar), ela cuida da peça mais delicada do sistema:
// tirar e devolver produtos do estoque quando um pedido é confirmado
// ou cancelado (métodos usados pelo Integrante 4).
//
// A REGRA DE OURO DO ESTOQUE: a conta é feita DENTRO do banco, num
// comando só. Pense em dois caixas de supermercado vendendo o último
// saco de ração ao mesmo tempo:
//   ERRADO  -> cada caixa olha a prateleira ("tem 1"), subtrai e anota.
//              Os dois veem "1" e os dois vendem: estoque -1.
//   CERTO   -> "tire 1 SÓ SE ainda tiver pelo menos 1", num movimento.
//              O banco atende um caixa de cada vez nessa linha: o
//              primeiro consegue, o segundo recebe "não deu".
//
// Por que baixarEstoque e devolverEstoque recebem "con"?
//   Eles rodam DENTRO da transação do pedido ("tudo ou nada"). A
//   transação existe numa conexão específica, a "con". Se usássemos
//   this.db.executar, a baixa ficaria FORA da transação: se o pedido
//   desse erro depois, o estoque continuaria baixado.
// =====================================================================

import type { Produto } from '../../shared/tipos';
import { Database } from '../database/Database';
import type { PoolConnection, ResultadoExecucao, ValorSql } from '../database/Database';
import { BaseRepository } from './BaseRepository';
import { ErroDeNegocio } from '../security/ErroDeNegocio';

// Código de erro do MySQL para "a categoria/espécie/fornecedor que você
// informou não existe" (chave estrangeira apontando para o nada).
const ERRO_REFERENCIA_INEXISTENTE = 1452;

export class ProdutoRepository extends BaseRepository<Produto> {
  constructor() {
    super(Database.instancia(), 'produto'); // nome da tabela FIXO
  }

  // -------------------------------------------------------------------
  // Cadastro (usado pelo ProdutoService no Passo 5)
  // -------------------------------------------------------------------

  /** Insere um produto e devolve o id que o banco criou. */
  async inserir(dados: Omit<Produto, 'id'>): Promise<number> {
    try {
      // Os valores vão na MESMA ordem das colunas (11 colunas, 11 "?")
      const resultado = await this.db.executar(
        'INSERT INTO produto (nome, descricao, categoria_id, especie_id, ' +
          'fornecedor_id, moeda_custo, custo, margem_percentual, preco_venda, ' +
          'quantidade_estoque, estoque_minimo) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          ...ProdutoRepository.dadosDoCadastro(dados),
          dados.quantidade_estoque,
          dados.estoque_minimo,
        ],
      );
      return resultado.insertId;
    } catch (erro) {
      ProdutoRepository.traduzirErro(erro);
    }
  }

  /**
   * Atualiza o cadastro do produto que tem esse id.
   *
   * ATENÇÃO: NÃO mexe em quantidade_estoque, de propósito. Se a tela
   * de edição gravasse o estoque que estava aberto nela, apagaria as
   * baixas que os pedidos fizeram enquanto o ADMIN editava (é o
   * problema do "ler, subtrair e gravar"). O estoque só muda por
   * contas feitas dentro do banco (baixarEstoque e devolverEstoque).
   */
  async atualizar(id: number, dados: Omit<Produto, 'id'>): Promise<void> {
    let linhasAlteradas: number;
    try {
      const resultado = await this.db.executar(
        'UPDATE produto SET nome = ?, descricao = ?, categoria_id = ?, ' +
          'especie_id = ?, fornecedor_id = ?, moeda_custo = ?, custo = ?, ' +
          'margem_percentual = ?, preco_venda = ?, estoque_minimo = ? ' +
          'WHERE id = ?',
        [...ProdutoRepository.dadosDoCadastro(dados), dados.estoque_minimo, id],
      );
      linhasAlteradas = resultado.affectedRows;
    } catch (erro) {
      ProdutoRepository.traduzirErro(erro);
    }

    if (linhasAlteradas === 0) {
      throw new ErroDeNegocio('Registro não encontrado.');
    }
  }

  // -------------------------------------------------------------------
  // Estoque (contrato com o Integrante 4: confirmar e cancelar pedido)
  // -------------------------------------------------------------------

  /**
   * Tira "quantidade" unidades do estoque, SÓ SE houver o suficiente.
   * Devolve true se tirou; false se não havia estoque (ou o produto
   * não existe). Quem decide o que fazer com o false é o PedidoService.
   *
   * Usa a "con" da transação do pedido, nunca o pool.
   */
  async baixarEstoque(
    con: PoolConnection,
    produtoId: number,
    quantidade: number,
  ): Promise<boolean> {
    // Uma quantidade negativa SOMARIA ao estoque (5 - (-3) = 8).
    // Esta trava impede isso, mesmo se alguém esquecer de validar antes.
    ProdutoRepository.conferirQuantidade(quantidade);

    // A condição "quantidade_estoque >= ?" fica no WHERE: conferir e
    // tirar acontecem no MESMO comando. Se não houver estoque, o
    // UPDATE simplesmente não encontra a linha (0 linhas alteradas).
    const [resultado] = await con.execute(
      'UPDATE produto SET quantidade_estoque = quantidade_estoque - ? ' +
        'WHERE id = ? AND quantidade_estoque >= ?',
      [quantidade, produtoId, quantidade],
    );
    return (resultado as ResultadoExecucao).affectedRows === 1;
  }

  /**
   * Devolve "quantidade" unidades ao estoque (cancelamento de um
   * pedido CONFIRMADO). Usa a "con" da transação do pedido.
   */
  async devolverEstoque(
    con: PoolConnection,
    produtoId: number,
    quantidade: number,
  ): Promise<void> {
    ProdutoRepository.conferirQuantidade(quantidade);

    const [resultado] = await con.execute(
      'UPDATE produto SET quantidade_estoque = quantidade_estoque + ? ' +
        'WHERE id = ?',
      [quantidade, produtoId],
    );

    // Se o produto não existir, NÃO podemos fingir que deu certo: o
    // erro faz a transação inteira do cancelamento ser desfeita.
    if ((resultado as ResultadoExecucao).affectedRows !== 1) {
      throw new ErroDeNegocio('Produto não encontrado ao devolver o estoque.');
    }
  }

  // -------------------------------------------------------------------
  // Tela inicial (contrato do Integrante 1)
  // -------------------------------------------------------------------

  /**
   * Produtos com estoque ABAIXO do mínimo, em ordem de nome.
   * "Abaixo" = MENOR que o mínimo (regra escrita no exemplo.sql): com
   * estoque 5 e mínimo 5, ainda não é alerta.
   * Não tem "?" porque nenhum valor vem de fora: a comparação é entre
   * duas colunas da própria tabela.
   */
  async listarEstoqueBaixo(): Promise<Produto[]> {
    return this.db.consultar<Produto>(
      'SELECT * FROM produto WHERE quantidade_estoque < estoque_minimo ORDER BY nome',
    );
  }

  // -------------------------------------------------------------------
  // Ajudantes internos (private: só esta classe usa)
  // -------------------------------------------------------------------

  /**
   * Os 9 primeiros valores do cadastro, na MESMA ordem das colunas
   * do INSERT e do UPDATE (do nome até o preco_venda).
   */
  private static dadosDoCadastro(dados: Omit<Produto, 'id'>): ValorSql[] {
    return [
      dados.nome,
      dados.descricao,
      dados.categoria_id,
      dados.especie_id,
      dados.fornecedor_id,
      dados.moeda_custo,
      dados.custo,
      dados.margem_percentual,
      dados.preco_venda,
    ];
  }

  /** Quantidade de estoque precisa ser um número inteiro maior que zero. */
  private static conferirQuantidade(quantidade: number): void {
    if (!Number.isInteger(quantidade) || quantidade <= 0) {
      throw new ErroDeNegocio('A quantidade deve ser um número inteiro maior que zero.');
    }
  }

  /**
   * Troca o erro técnico do MySQL por uma frase clara, quando dá.
   * "never" = esta função SEMPRE lança um erro (nunca termina normal).
   */
  private static traduzirErro(erro: unknown): never {
    const errno = (erro as { errno?: number } | null)?.errno;
    if (errno === ERRO_REFERENCIA_INEXISTENTE) {
      throw new ErroDeNegocio('Categoria, espécie ou fornecedor não encontrado.');
    }
    throw erro; // qualquer outro erro segue adiante sem mudar
  }
}
