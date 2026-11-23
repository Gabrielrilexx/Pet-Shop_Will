// =====================================================================
// EntregadorService.ts — o "CHEF" do cadastro de motoboys
// ---------------------------------------------------------------------
// Confere a ficha do motoboy ANTES de ela ir para a pasta (banco):
//   - CPF válido (com dígito verificador) e só com os 11 números;
//   - nome e telefone obrigatórios, cabendo na coluna;
//   - placa no formato antigo (ABC1234) ou Mercosul (ABC1D23);
//   - valor por km maior que zero;
//   - ativo: sim ou não.
//
// LGPD (o CPF é dado sensível):
//   - o ADMIN recebe a lista com o CPF MASCARADO (***.456.789-**);
//   - o ATENDENTE recebe a lista SEM o campo cpf: o corte é feito AQUI,
//     no Main, e não só escondido na tela (pelo DevTools daria para ver);
//   - depois de salvo, o CPF completo nunca mais volta para a tela.
//     Ao editar, o campo vem vazio: deixar vazio = manter o CPF atual
//     (decisão do grupo: dúvida 3, opção a);
//   - nada de console.log com CPF.
//
// INJEÇÃO DE DEPENDÊNCIA: recebe o repository pronto no constructor
// (quem monta é o entregadoresIpc.ts).
//
// Canais (tabela de permissões do README):
//   entregadores:listar  -> ADMIN e ATENDENTE (ATENDENTE recebe sem CPF)
//   entregadores:salvar, entregadores:excluir -> só ADMIN
// =====================================================================

import type { Entregador, Perfil } from '../../shared/tipos';
import type { EntregadorRepository } from '../repositories/EntregadorRepository';
import { Validador } from '../security/Validador';
import { ErroDeNegocio } from '../security/ErroDeNegocio';

/**
 * Entregador do jeito que pode ir para a tela do ATENDENTE: igual ao
 * Entregador, mas SEM o cpf (mesma ideia do ProdutoSemCusto e do
 * UsuarioSemSenha). Decisão do grupo: dúvida 2, opção a.
 */
export type EntregadorSemCpf = Omit<Entregador, 'cpf'>;

// Limites das colunas do schema.sql
const MAX_NOME = 100;
const MAX_TELEFONE = 20;
const MAX_VALOR_POR_KM = 9999.99; // DECIMAL(6,2)

/**
 * Placa de moto: 3 letras + 1 número + 1 letra OU número + 2 números.
 *   ABC1234 (modelo antigo)  e  ABC1D23 (Mercosul)
 */
const FORMATO_PLACA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

export class EntregadorService {
  constructor(private readonly entregadores: EntregadorRepository) {}

  /**
   * Lista os entregadores (ativos e inativos), cortada conforme o perfil.
   * O IPC passa o perfil de quem está logado.
   */
  async listar(perfil: Perfil): Promise<Entregador[] | EntregadorSemCpf[]> {
    return EntregadorService.paraOPerfil(await this.entregadores.listar(), perfil);
  }

  /**
   * A REGRA do corte, escrita UMA vez só:
   *   ADMIN -> recebe tudo, mas com o CPF MASCARADO;
   *   qualquer outro perfil -> recebe SEM o campo cpf.
   * Na dúvida, corta ("falhar fechado"), igual ao ProdutoService.
   */
  static paraOPerfil(lista: Entregador[], perfil: Perfil): Entregador[] | EntregadorSemCpf[] {
    if (perfil === 'ADMIN') {
      return lista.map((e) => ({ ...e, cpf: EntregadorService.mascararCpf(e.cpf) }));
    }
    // "Desmontar" cada entregador: tira o cpf e guarda o resto.
    // O "_" na frente avisa: "peguei, mas não vou usar".
    return lista.map(({ cpf: _cpf, ...resto }) => resto);
  }

  /**
   * "12345678909" -> "***.456.789-**"
   * Mostra só os 6 números do meio: dá para o dono conferir de quem é,
   * sem expor o documento inteiro na tela.
   */
  static mascararCpf(cpf: string): string {
    const d = Validador.somenteDigitos(cpf);
    if (d.length !== 11) return '***.***.***-**';
    return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  }

  /**
   * Sem id -> cadastra. Com id -> atualiza. Devolve o id.
   * Partial: a tela pode mandar campo faltando; quem confere somos nós.
   */
  async salvar(dados: Partial<Entregador>): Promise<number> {
    const ficha = EntregadorService.validar(dados);

    // Cadastro novo: o CPF é obrigatório
    if (dados?.id === undefined || dados?.id === null) {
      return this.entregadores.inserir({ ...ficha, cpf: Validador.cpf(dados?.cpf) });
    }

    // Edição: CPF vazio = manter o atual (dúvida 3, opção a)
    const id = EntregadorService.validarId(dados.id);
    const atual = await this.entregadores.buscarPorId(id);
    if (atual === null) {
      throw new ErroDeNegocio('Registro não encontrado.');
    }
    const cpfDigitado = String(dados.cpf ?? '').trim();
    const cpf = cpfDigitado === '' ? atual.cpf : Validador.cpf(cpfDigitado);

    await this.entregadores.atualizar(id, { ...ficha, cpf });
    return id;
  }

  /**
   * Exclui um entregador. Antes, pergunta ao banco se ele já fez
   * entregas: se fez, orienta a DESATIVAR (o histórico precisa ficar).
   * O RESTRICT do banco continua como 2ª trava.
   */
  async excluir(id: number): Promise<void> {
    const idValido = EntregadorService.validarId(id);
    if (await this.entregadores.possuiEntregas(idValido)) {
      throw new ErroDeNegocio(
        'Entregador tem entregas registradas e não pode ser excluído. ' +
          'Desative-o para tirar da lista de saída.',
      );
    }
    await this.entregadores.excluir(idValido);
  }

  // -------------------------------------------------------------------
  // Ajudantes (private: só este Service usa)
  // -------------------------------------------------------------------

  /** Confere e limpa os campos (menos o CPF, que depende de novo/edição). */
  private static validar(dados: Partial<Entregador>): Omit<Entregador, 'id' | 'cpf'> {
    return {
      nome: EntregadorService.texto(dados?.nome, MAX_NOME, 'Nome'),
      telefone: EntregadorService.texto(dados?.telefone, MAX_TELEFONE, 'Telefone'),
      placa_moto: EntregadorService.placa(dados?.placa_moto),
      valor_por_km: EntregadorService.valorPorKm(dados?.valor_por_km),
      // Só true é true. Qualquer outra coisa (undefined, "sim", 1) = false.
      ativo: dados?.ativo === true,
    };
  }

  /** Campo obrigatório que precisa caber na coluna. Devolve sem espaços nas pontas. */
  private static texto(v: unknown, max: number, campo: string): string {
    const texto = Validador.obrigatorio(v, campo);
    return Validador.tamanhoMaximo(texto, max, campo);
  }

  /**
   * Placa: aceita "abc-1234", "ABC 1D23"... e devolve "ABC1234" /
   * "ABC1D23" (maiúsculas, sem traço e sem espaço).
   */
  private static placa(v: unknown): string {
    const placa = String(v ?? '').toUpperCase().replace(/[\s-]/g, '');
    if (!FORMATO_PLACA.test(placa)) {
      throw new ErroDeNegocio('Placa inválida. Use o formato ABC1234 ou ABC1D23.');
    }
    return placa;
  }

  /** Maior que zero, cabendo no DECIMAL(6,2). Aceita "2,50". Arredonda para 2 casas. */
  private static valorPorKm(v: unknown): number {
    const valor = Validador.positivo(v, 'Valor por km');
    if (valor > MAX_VALOR_POR_KM) {
      throw new ErroDeNegocio('O campo Valor por km deve ser no máximo 9999,99.');
    }
    return Math.round(valor * 100) / 100;
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
