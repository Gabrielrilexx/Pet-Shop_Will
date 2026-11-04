// =====================================================================
// HttpClient.ts — a "MÃE" de todas as classes que chamam APIs
// ---------------------------------------------------------------------
// Ninguém usa o HttpClient direto (ele é "abstract"). Cada API tem a
// sua classe filha, que herda o método get() já com as proteções:
//
//   class ViaCepClient extends HttpClient {
//     constructor() { super('o ViaCEP'); }
//     async buscar(cep: string) {
//       return this.get<RespostaViaCep>(`https://viacep.com.br/ws/${cep}/json/`);
//     }
//   }
//
// Proteções que TODAS as APIs ganham de graça:
//   - só aceita HTTPS (dados criptografados no caminho);
//   - tempo limite de 5 segundos (o sistema não trava esperando);
//   - qualquer falha vira um ErroDeNegocio com mensagem amigável,
//     e o detalhe técnico fica só no console.
//
// ATENÇÃO: o get() só garante que a resposta chegou. Conferir se os
// CAMPOS vieram certos (ex.: o {"erro": true} do ViaCEP) é tarefa de
// cada classe filha, antes de salvar qualquer coisa no banco.
// =====================================================================

import { ErroDeNegocio } from '../security/ErroDeNegocio';

export abstract class HttpClient {
  /** Tempo máximo de espera por uma resposta: 5 segundos. */
  private static readonly TEMPO_LIMITE_MS = 5000;

  /**
   * nomeServico aparece na mensagem de erro. Escreva já com o artigo,
   * do jeito que fica bom na frase: 'o ViaCEP', 'a cotação do dólar'.
   */
  constructor(protected nomeServico: string) {}

  /**
   * Faz um GET e devolve o JSON da resposta.
   * "protected" = só as classes filhas podem chamar.
   */
  protected async get<T>(
    url: string,
    headers: Record<string, string> = {},
  ): Promise<T> {
    try {
      if (!url.startsWith('https://')) {
        throw new Error(`Endereço sem HTTPS recusado: ${url}`);
      }

      const resposta = await fetch(url, {
        headers: { Accept: 'application/json', ...headers },
        // Se passar de 5 s, o fetch é cancelado e cai no catch abaixo.
        signal: AbortSignal.timeout(HttpClient.TEMPO_LIMITE_MS),
      });

      if (!resposta.ok) {
        // ok é false para códigos como 404 (não achou) e 500 (erro deles)
        throw new Error(`A API respondeu com o código ${resposta.status}`);
      }

      return (await resposta.json()) as T;
    } catch (erro) {
      // Detalhe técnico: só no console, para quem está programando.
      console.error(`[HttpClient] Falha ao consultar ${this.nomeServico}:`, erro);

      // Mensagem para o usuário: amigável e sem detalhes internos.
      throw new ErroDeNegocio(
        `Não foi possível consultar ${this.nomeServico} agora. ` +
          'Preencha manualmente ou tente de novo.',
      );
    }
  }
}
