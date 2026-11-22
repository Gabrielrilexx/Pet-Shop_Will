// =====================================================================
// ProdutoService.ts — o "CHEF" do cadastro de produtos
// ---------------------------------------------------------------------
// Confere a ficha do produto antes de ela ir para o banco e cuida de
// três regras do contrato do grupo:
//
//   1. ATENDENTE recebe a lista SEM custo e margem. O corte acontece
//      AQUI, no Main (esconder só na tela não basta: pelo DevTools dá
//      para ver tudo o que chegou). Quem não for ADMIN recebe cortado.
//
//   2. Produto em dólar: o Service SUGERE o preço
//        custo em reais = custo × cotação do dia
//        preço sugerido = custo em reais × (1 + margem / 100)
//      Só sugere. Quem decide e salva o preco_venda é o ADMIN.
//
//   3. Dinheiro com 2 casas decimais (o banco guarda DECIMAL(10,2)).
//
// INJEÇÃO DE DEPENDÊNCIA: recebe o repository e o CotacaoClient
// prontos (quem monta é o arquivo de IPC, no Passo 6 do Caio):
//   new ProdutoService(new ProdutoRepository(), new CotacaoClient())
//
// Canais (contrato do Integrante 1):
//   produtos:listar  -> ADMIN, ATENDENTE (ATENDENTE sem custo e margem)
//   produtos:salvar, produtos:excluir, produtos:cotacao -> ADMIN
// =====================================================================

import type { MoedaCusto, Perfil, Produto } from '../../shared/tipos';
import type { ProdutoRepository } from '../repositories/ProdutoRepository';
import type { CotacaoClient } from '../api/CotacaoClient';
import { Validador } from '../security/Validador';
import { ErroDeNegocio } from '../security/ErroDeNegocio';

/**
 * Produto do jeito que pode ir para a tela do ATENDENTE: igual ao
 * Produto, mas SEM custo e margem (mesma ideia do UsuarioSemSenha).
 */
export type ProdutoSemCusto = Omit<Produto, 'custo' | 'margem_percentual'>;

/** O que o botão "Calcular preço" devolve para a tela. */
export interface SugestaoDePreco {
  cotacao: number | null; // null quando o custo já está em reais
  custo_em_reais: number;
  preco_sugerido: number;
}

// Limites das colunas do schema.sql
const MAX_NOME = 120;
const MAX_DINHEIRO = 99999999.99; // DECIMAL(10,2)
const MAX_MARGEM = 999.99; // DECIMAL(5,2)

export class ProdutoService {
  constructor(
    private readonly produtos: ProdutoRepository,
    private readonly cotacaoClient: CotacaoClient,
  ) {}

  /**
   * Lista os produtos. ADMIN recebe tudo; qualquer outro perfil recebe
   * sem custo e margem. Quando o login do Caio existir, o IPC só passa
   * o perfil de quem está logado.
   */
  async listar(perfil: Perfil): Promise<Produto[] | ProdutoSemCusto[]> {
    const lista = await this.produtos.listar();
    if (perfil === 'ADMIN') {
      return lista;
    }
    // "Desmontar" cada produto: tira custo e margem e guarda o resto.
    // Os nomes com "_" na frente avisam: "peguei, mas não vou usar".
    return lista.map(({ custo: _custo, margem_percentual: _margem, ...resto }) => resto);
  }

  /**
   * Sem id -> cadastra (com o estoque inicial).
   * Com id -> atualiza o cadastro (o estoque NÃO muda aqui: veja o
   * comentário do ProdutoRepository.atualizar). Devolve o id.
   */
  async salvar(dados: Partial<Produto>): Promise<number> {
    const novo = dados?.id === undefined || dados?.id === null;
    const produto = ProdutoService.validar(dados, novo);

    if (!novo) {
      const id = ProdutoService.idObrigatorio(dados.id, 'Registro não encontrado.');
      await this.produtos.atualizar(id, produto);
      return id;
    }
    return this.produtos.inserir(produto);
  }

  /** Exclui (o BaseRepository avisa se algum pedido usa o produto). */
  async excluir(id: number): Promise<void> {
    await this.produtos.excluir(ProdutoService.idObrigatorio(id, 'Registro não encontrado.'));
  }

  /**
   * Botão "Calcular preço" (canal produtos:cotacao, só ADMIN).
   * Em reais: não chama a internet. Em dólar: busca a cotação do dia.
   * Não salva nada: é só uma sugestão para o ADMIN decidir.
   */
  async sugerirPreco(
    dados: Partial<Pick<Produto, 'custo' | 'moeda_custo' | 'margem_percentual'>>,
  ): Promise<SugestaoDePreco> {
    const custo = ProdutoService.dinheiro(dados?.custo, 'Custo', MAX_DINHEIRO);
    const margem = ProdutoService.dinheiro(dados?.margem_percentual, 'Margem', MAX_MARGEM);
    const moeda = ProdutoService.moeda(dados?.moeda_custo);

    // Em dólar, pergunta a cotação ao "cambista" (CotacaoClient)
    const cotacao = moeda === 'USD' ? await this.cotacaoClient.dolarHoje() : null;
    // Arredonda o custo em reais ANTES de calcular o preço: assim a
    // conta que aparece na tela "fecha" (59,49 × 1,40 = 83,29).
    const custoEmReais = ProdutoService.duasCasas(
      cotacao === null ? custo : custo * cotacao,
    );

    return {
      cotacao,
      custo_em_reais: custoEmReais,
      preco_sugerido: ProdutoService.duasCasas(custoEmReais * (1 + margem / 100)),
    };
  }

  // -------------------------------------------------------------------
  // Ajudantes (private: só este Service usa)
  // -------------------------------------------------------------------

  /** Confere e limpa todos os campos. Devolve a ficha pronta para o banco. */
  private static validar(dados: Partial<Produto>, novo: boolean): Omit<Produto, 'id'> {
    const nome = Validador.obrigatorio(dados?.nome, 'Nome');
    Validador.tamanhoMaximo(nome, MAX_NOME, 'Nome');
    const descricao = String(dados?.descricao ?? '').trim();

    const precoVenda = ProdutoService.dinheiro(dados?.preco_venda, 'Preço de venda', MAX_DINHEIRO);
    if (precoVenda <= 0) {
      throw new ErroDeNegocio('O campo Preço de venda deve ser maior que zero.');
    }

    return {
      nome,
      descricao: descricao === '' ? null : descricao,
      categoria_id: ProdutoService.idObrigatorio(dados?.categoria_id, 'Escolha a categoria.'),
      especie_id: ProdutoService.idObrigatorio(dados?.especie_id, 'Escolha a espécie.'),
      fornecedor_id: ProdutoService.idOpcional(dados?.fornecedor_id),
      moeda_custo: ProdutoService.moeda(dados?.moeda_custo),
      custo: ProdutoService.dinheiro(dados?.custo, 'Custo', MAX_DINHEIRO),
      margem_percentual: ProdutoService.dinheiro(dados?.margem_percentual, 'Margem', MAX_MARGEM),
      preco_venda: precoVenda,
      // Na edição o estoque não é gravado (o repository ignora), então
      // só exigimos o estoque inicial no cadastro de um produto novo.
      quantidade_estoque: novo
        ? ProdutoService.inteiro(dados?.quantidade_estoque, 'Estoque inicial')
        : 0,
      estoque_minimo: ProdutoService.inteiro(dados?.estoque_minimo, 'Estoque mínimo'),
    };
  }

  /** Valor em dinheiro (ou %): número, não negativo, dentro do limite, 2 casas. */
  private static dinheiro(v: unknown, campo: string, max: number): number {
    const numero = Validador.naoNegativo(v, campo); // aceita "10,50"
    if (numero > max) {
      throw new ErroDeNegocio(`O campo ${campo} está acima do valor máximo permitido.`);
    }
    return ProdutoService.duasCasas(numero);
  }

  /** Número inteiro, zero ou maior (estoque não tem "meia unidade"). */
  private static inteiro(v: unknown, campo: string): number {
    const numero = Validador.naoNegativo(v, campo);
    if (!Number.isInteger(numero)) {
      throw new ErroDeNegocio(`O campo ${campo} deve ser um número inteiro.`);
    }
    return numero;
  }

  /** Moeda do custo: só BRL ou USD. Vazio = BRL (o padrão do banco). */
  private static moeda(v: unknown): MoedaCusto {
    const texto = String(v ?? '').trim().toUpperCase();
    if (texto === '' || texto === 'BRL') return 'BRL';
    if (texto === 'USD') return 'USD';
    throw new ErroDeNegocio('Moeda do custo inválida. Use BRL ou USD.');
  }

  /** Id obrigatório: inteiro maior que zero; senão, lança a mensagem dada. */
  private static idObrigatorio(v: unknown, mensagem: string): number {
    const numero = Number(v);
    if (v === null || v === '' || !Number.isInteger(numero) || numero <= 0) {
      throw new ErroDeNegocio(mensagem);
    }
    return numero;
  }

  /** Fornecedor é opcional: vazio vira null. */
  private static idOpcional(v: unknown): number | null {
    if (v === undefined || v === null || v === '') return null;
    return ProdutoService.idObrigatorio(v, 'Fornecedor inválido.');
  }

  /**
   * Arredonda para 2 casas (centavos). O EPSILON corrige um defeito
   * dos números quebrados no computador: sem ele, 1.005 viraria 1.00.
   */
  private static duasCasas(valor: number): number {
    return Math.round((valor + Number.EPSILON) * 100) / 100;
  }
}
