// =====================================================================
// CotacaoClient.ts — o "CAMBISTA" que diz quanto vale o dólar hoje
// ---------------------------------------------------------------------
// Pense numa casa de câmbio: você pergunta "quanto está o dólar?" e
// ela responde um número. Esta classe faz essa pergunta para a
// AwesomeAPI (pela internet) e devolve só o número que nos interessa.
//
// Ela HERDA do HttpClient (Integrante 1), então já ganha de graça:
// só HTTPS, tempo limite de 5 segundos e mensagem amigável se a
// internet falhar. O trabalho DELA é só:
//   1. saber o endereço da API;
//   2. abrir as "caixas" do JSON até o campo certo (USDBRL -> bid);
//   3. conferir se o valor faz sentido antes de devolver.
//
// Quem usa: o ProdutoService (Passo 5), para mostrar o custo em reais
// e SUGERIR o preço de venda. A cotação nunca troca o preço sozinha.
// =====================================================================

import { HttpClient } from './HttpClient';
import { ErroDeNegocio } from '../security/ErroDeNegocio';

/**
 * O formato da resposta da AwesomeAPI, só com o que usamos.
 * Os "?" dizem: "pode ser que não venha". Assim o TypeScript nos
 * OBRIGA a tratar o caso de a API mandar algo diferente do esperado.
 * Repare que o bid é string: a API manda o número entre aspas.
 */
interface RespostaAwesomeApi {
  USDBRL?: {
    bid?: string;
  };
}

export class CotacaoClient extends HttpClient {
  /** Endereço fixo da API (o mesmo que você abriu no navegador). */
  private static readonly URL =
    'https://economia.awesomeapi.com.br/json/last/USD-BRL';

  constructor() {
    // Com artigo, porque vira a frase:
    // "Não foi possível consultar a cotação do dólar agora. ..."
    super('a cotação do dólar');
  }

  /**
   * Devolve quanto vale 1 dólar em reais agora (ex.: 5.9488).
   * Se a internet falhar, o get() do HttpClient já lança o ErroDeNegocio.
   */
  async dolarHoje(): Promise<number> {
    // Passos 1 e 2 da receita: buscar a resposta na internet
    const resposta = await this.get<RespostaAwesomeApi>(CotacaoClient.URL);

    // Passos 3 e 4: abrir as caixas (resposta -> USDBRL -> bid) e
    // converter o TEXTO "5.9488" no NÚMERO 5.9488.
    // O "?." quer dizer: "se a caixa não existir, pare e dê undefined",
    // em vez de travar o programa.
    const cotacao = Number(resposta?.USDBRL?.bid);

    // Passo 5: conferir se faz sentido.
    // Number(undefined) dá NaN ("não é um número") e Number("") dá 0.
    // Nenhum dos dois pode virar preço de produto.
    if (!Number.isFinite(cotacao) || cotacao <= 0) {
      // Detalhe técnico só no console, igual ao HttpClient faz
      console.error('[CotacaoClient] Resposta sem cotação válida:', resposta);
      throw new ErroDeNegocio(
        `Não foi possível consultar ${this.nomeServico} agora. ` +
          'Preencha manualmente ou tente de novo.',
      );
    }

    // Passo 6: devolver o número
    return cotacao;
  }
}
