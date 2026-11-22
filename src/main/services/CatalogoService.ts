// =====================================================================
// CatalogoService.ts — o "CHEF" das espécies e categorias
// ---------------------------------------------------------------------
// No restaurante, o garçom (IpcRouter) traz o pedido e o chef confere
// se ele faz sentido ANTES de mandar o estoquista (Repository) mexer
// na despensa. Aqui o chef confere:
//   - o nome veio preenchido?
//   - cabe na coluna (no máximo 50 letras, igual ao VARCHAR(50))?
//   - é cadastro novo (sem id) ou edição (com id)?
//
// Por que conferir aqui e não só na tela? Porque a tela pode ser
// burlada (DevTools). O Main é o porteiro de verdade.
//
// INJEÇÃO DE DEPENDÊNCIA: o Service não cria os repositories; ele os
// RECEBE prontos no constructor. Quem monta tudo é o arquivo de IPC
// (quando o Passo 6 do Caio existir):
//   new CatalogoService(new EspecieRepository(), new CategoriaRepository())
// Vantagem: dá para testar o Service com repositories "de mentira".
//
// Canais que vão usar este Service (contrato do Integrante 1):
//   especies:listar / especies:salvar / especies:excluir
//   categorias:listar / categorias:salvar / categorias:excluir
// =====================================================================

import type { Categoria, Especie } from '../../shared/tipos';
import type { EspecieRepository } from '../repositories/EspecieRepository';
import type { CategoriaRepository } from '../repositories/CategoriaRepository';
import { Validador } from '../security/Validador';
import { ErroDeNegocio } from '../security/ErroDeNegocio';

/** Tamanho máximo do nome: igual ao VARCHAR(50) do schema.sql. */
const TAMANHO_MAXIMO_NOME = 50;

export class CatalogoService {
  constructor(
    private readonly especies: EspecieRepository,
    private readonly categorias: CategoriaRepository,
  ) {}

  // -------------------------------------------------------------------
  // Espécies
  // -------------------------------------------------------------------

  /** Todas as espécies, em ordem de id. */
  async listarEspecies(): Promise<Especie[]> {
    return this.especies.listar();
  }

  /**
   * Sem id -> cadastra uma espécie nova.
   * Com id -> troca o nome da espécie que já existe.
   * Devolve o id (o novo ou o mesmo).
   *
   * "Partial" = "um Especie em que todos os campos são opcionais",
   * porque a tela pode mandar faltando coisa: quem confere somos nós.
   */
  async salvarEspecie(dados: Partial<Especie>): Promise<number> {
    const nome = CatalogoService.validarNome(dados?.nome);

    if (CatalogoService.temId(dados)) {
      const id = CatalogoService.validarId(dados.id);
      await this.especies.atualizar(id, { nome });
      return id;
    }
    return this.especies.inserir({ nome });
  }

  /** Exclui a espécie (o BaseRepository avisa se ela estiver em uso). */
  async excluirEspecie(id: number): Promise<void> {
    await this.especies.excluir(CatalogoService.validarId(id));
  }

  // -------------------------------------------------------------------
  // Categorias (mesma receita das espécies)
  // -------------------------------------------------------------------

  /** Todas as categorias, em ordem de id. */
  async listarCategorias(): Promise<Categoria[]> {
    return this.categorias.listar();
  }

  /** Sem id -> cadastra. Com id -> atualiza. Devolve o id. */
  async salvarCategoria(dados: Partial<Categoria>): Promise<number> {
    const nome = CatalogoService.validarNome(dados?.nome);

    if (CatalogoService.temId(dados)) {
      const id = CatalogoService.validarId(dados.id);
      await this.categorias.atualizar(id, { nome });
      return id;
    }
    return this.categorias.inserir({ nome });
  }

  /** Exclui a categoria (o BaseRepository avisa se ela estiver em uso). */
  async excluirCategoria(id: number): Promise<void> {
    await this.categorias.excluir(CatalogoService.validarId(id));
  }

  // -------------------------------------------------------------------
  // Ajudantes (private: só este Service usa). Ficam aqui uma vez só,
  // porque espécies e categorias seguem exatamente as mesmas regras.
  // -------------------------------------------------------------------

  /** Nome obrigatório e com no máximo 50 letras. Devolve sem espaços nas pontas. */
  private static validarNome(nome: unknown): string {
    const texto = Validador.obrigatorio(nome, 'Nome');
    Validador.tamanhoMaximo(texto, TAMANHO_MAXIMO_NOME, 'Nome');
    return texto;
  }

  /** "Tem id" = o campo veio e não está vazio. Sem id = cadastro novo. */
  private static temId(dados: { id?: unknown } | null | undefined): boolean {
    return dados?.id !== undefined && dados?.id !== null;
  }

  /**
   * O id precisa ser um número inteiro maior que zero (o banco começa
   * no 1). Qualquer outra coisa não aponta para nenhum registro.
   */
  private static validarId(id: unknown): number {
    const numero = Number(id);
    if (!Number.isInteger(numero) || numero <= 0) {
      throw new ErroDeNegocio('Registro não encontrado.');
    }
    return numero;
  }
}
