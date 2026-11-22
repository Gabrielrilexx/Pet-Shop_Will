// =====================================================================
// FornecedorService.ts — o "CHEF" do cadastro de fornecedores
// ---------------------------------------------------------------------
// Confere a ficha da empresa ANTES de ela ir para o arquivo (banco):
//   - CNPJ válido (com dígito verificador) e só com os 14 números;
//   - razão social obrigatória;
//   - cada campo cabe na sua coluna (tamanhos do schema.sql);
//   - UF com 2 letras (SP, RJ...);
//   - campos opcionais vazios viram null ("não tem").
// E atende o botão "Buscar CNPJ": pede ao CnpjClient a ficha pronta
// para a tela preencher o formulário. Quem SALVA é sempre o ADMIN.
//
// INJEÇÃO DE DEPENDÊNCIA: recebe o repository e o CnpjClient prontos
// no constructor (quem monta é o arquivo de IPC, no Passo 6 do Caio):
//   new FornecedorService(new FornecedorRepository(), new CnpjClient())
//
// Canais (contrato do Integrante 1: fornecedores:* só para ADMIN):
//   fornecedores:listar / fornecedores:salvar / fornecedores:excluir /
//   fornecedores:buscarCnpj
// =====================================================================

import type { Fornecedor } from '../../shared/tipos';
import type { FornecedorRepository } from '../repositories/FornecedorRepository';
import type { CnpjClient } from '../api/CnpjClient';
import { Validador } from '../security/Validador';
import { ErroDeNegocio } from '../security/ErroDeNegocio';

// Tamanhos máximos: iguais às colunas do schema.sql
const MAX_RAZAO_SOCIAL = 150;
const MAX_NOME_FANTASIA = 150;
const MAX_TELEFONE = 20;
const MAX_CIDADE = 80;

export class FornecedorService {
  constructor(
    private readonly fornecedores: FornecedorRepository,
    private readonly cnpjClient: CnpjClient,
  ) {}

  /** Todos os fornecedores, em ordem de id. */
  async listar(): Promise<Fornecedor[]> {
    return this.fornecedores.listar();
  }

  /**
   * Sem id -> cadastra. Com id -> atualiza. Devolve o id.
   * Partial: a tela pode mandar campo faltando; quem confere somos nós.
   */
  async salvar(dados: Partial<Fornecedor>): Promise<number> {
    const fornecedor = FornecedorService.validar(dados);

    if (dados?.id !== undefined && dados?.id !== null) {
      const id = FornecedorService.validarId(dados.id);
      await this.fornecedores.atualizar(id, fornecedor);
      return id;
    }
    return this.fornecedores.inserir(fornecedor);
  }

  /** Exclui (o BaseRepository avisa se algum produto usa o fornecedor). */
  async excluir(id: number): Promise<void> {
    await this.fornecedores.excluir(FornecedorService.validarId(id));
  }

  /**
   * Botão "Buscar CNPJ": devolve a ficha da empresa para a tela
   * preencher. Não salva nada. O CnpjClient já valida o CNPJ e já
   * transforma qualquer falha da internet em mensagem amigável.
   */
  async buscarCnpj(cnpj: string): Promise<Omit<Fornecedor, 'id' | 'importado'>> {
    return this.cnpjClient.buscar(cnpj);
  }

  // -------------------------------------------------------------------
  // Ajudantes (private: só este Service usa)
  // -------------------------------------------------------------------

  /** Confere e limpa todos os campos. Devolve a ficha pronta para o banco. */
  private static validar(dados: Partial<Fornecedor>): Omit<Fornecedor, 'id'> {
    const razaoSocial = Validador.obrigatorio(dados?.razao_social, 'Razão social');
    Validador.tamanhoMaximo(razaoSocial, MAX_RAZAO_SOCIAL, 'Razão social');

    return {
      cnpj: Validador.cnpj(dados?.cnpj), // devolve só os 14 números
      razao_social: razaoSocial,
      nome_fantasia: FornecedorService.opcional(dados?.nome_fantasia, MAX_NOME_FANTASIA, 'Nome fantasia'),
      telefone: FornecedorService.opcional(dados?.telefone, MAX_TELEFONE, 'Telefone'),
      cidade: FornecedorService.opcional(dados?.cidade, MAX_CIDADE, 'Cidade'),
      uf: FornecedorService.uf(dados?.uf),
      // Só true é true. Qualquer outra coisa (undefined, "sim", 1) = false.
      importado: dados?.importado === true,
    };
  }

  /**
   * Campo opcional: vazio vira null; preenchido precisa caber na coluna.
   * Ex.: '' -> null, '  Limeira ' -> 'Limeira'
   */
  private static opcional(v: unknown, max: number, campo: string): string | null {
    const texto = Validador.tamanhoMaximo(v, max, campo); // já tira os espaços
    return texto === '' ? null : texto;
  }

  /** UF: vazia vira null; preenchida precisa ter 2 letras. Devolve em MAIÚSCULAS. */
  private static uf(v: unknown): string | null {
    const texto = String(v ?? '').trim().toUpperCase();
    if (texto === '') return null;
    if (!/^[A-Z]{2}$/.test(texto)) {
      throw new ErroDeNegocio('UF inválida. Use as 2 letras do estado (ex.: SP).');
    }
    return texto;
  }

  /** O id precisa ser um número inteiro maior que zero. */
  private static validarId(id: unknown): number {
    const numero = Number(id);
    if (!Number.isInteger(numero) || numero <= 0) {
      throw new ErroDeNegocio('Registro não encontrado.');
    }
    return numero;
  }
}
