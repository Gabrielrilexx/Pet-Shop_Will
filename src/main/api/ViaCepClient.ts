// =====================================================================
// ViaCepClient.ts — o "TELEFONEMA AOS CORREIOS" que preenche o endereço
// ---------------------------------------------------------------------
// O atendente pergunta o CEP ao cliente no WhatsApp. Em vez de digitar
// rua, bairro e cidade, ele "liga para os Correios" (o ViaCEP), fala o
// CEP e anota o endereço que voltar. Esta classe é esse telefonema.
//
// Ela HERDA do HttpClient (Integrante 1): HTTPS, 5 segundos e mensagem
// amigável vêm de graça. O trabalho DELA é:
//   1. conferir o CEP ANTES de ir à internet (Validador.cep);
//   2. buscar o endereço;
//   3. conferir se o CEP existe: o ViaCEP NÃO dá erro 404 para CEP
//      inexistente; ele responde normalmente com {"erro": "true"};
//   4. conferir se vieram os campos obrigatórios (cidade e UF);
//   5. TRADUZIR os nomes da API para os nomes das nossas colunas
//      (localidade -> cidade).
//
// O que aprendemos testando a API no navegador (Passo 1, 23/11/2026):
//   - CEP inexistente: {"erro": "true"} (o valor vem como TEXTO, entre
//     aspas). Versões antigas mandavam true (sem aspas). Por isso aqui
//     conferimos só se o campo "erro" EXISTE, não o valor dele;
//   - CEP com 7 dígitos: HTTP 400 com uma página HTML. Nunca chega a
//     acontecer, porque o Validador barra antes;
//   - o "complemento" do ViaCEP é a FAIXA de números da rua que usa o
//     CEP (ex.: "de 0502/503 a 1060/1061"), NÃO o apto do cliente. Por
//     isso ele é ignorado.
//
// Quem usa: o ClienteService (Passo 5), no botão "Buscar CEP".
// =====================================================================

import type { Cliente } from '../../shared/tipos';
import { HttpClient } from './HttpClient';
import { ErroDeNegocio } from '../security/ErroDeNegocio';
import { Validador } from '../security/Validador';

/**
 * O formato da resposta do ViaCEP, só com os campos que usamos.
 * Todo o resto (ibge, ddd, gia, siafi, complemento...) é ignorado.
 * Tudo com "?" porque a API pode não mandar o campo.
 */
interface RespostaViaCep {
  erro?: unknown; // "true" hoje, true antigamente: só importa se EXISTE
  logradouro?: string | null;
  bairro?: string | null;
  localidade?: string | null; // é a nossa coluna "cidade"
  uf?: string | null;
}

/**
 * O que o buscar() devolve: um pedaço do Cliente, com os NOSSOS nomes
 * de coluna. "Pick" = "pegue do tipo Cliente só estes campos".
 */
export type EnderecoDoCep = Pick<Cliente, 'cep' | 'logradouro' | 'bairro' | 'cidade' | 'uf'>;

export class ViaCepClient extends HttpClient {
  constructor() {
    // Vira a frase: "Não foi possível consultar o ViaCEP agora. ..."
    super('o ViaCEP');
  }

  /**
   * Busca o endereço de um CEP.
   *
   * ATENÇÃO: cidade com CEP único (cidade pequena) vem SEM rua e SEM
   * bairro. Nesse caso logradouro e bairro voltam como texto vazio (''),
   * e o atendente completa à mão na tela.
   */
  async buscar(cep: string): Promise<EnderecoDoCep> {
    // 1. Conferir o CEP antes de gastar uma ida à internet.
    //    Aceita com ou sem traço e devolve só os 8 números. Se estiver
    //    errado, o próprio Validador lança "CEP inválido. Ele deve ter
    //    8 números.". Bônus de segurança: na URL só entram números.
    const cepLimpo = Validador.cep(cep);

    // 2. Buscar na internet (o CEP vai no meio do endereço).
    const resposta = await this.get<RespostaViaCep>(
      `https://viacep.com.br/ws/${cepLimpo}/json/`,
    );

    // 3. CEP com formato certo, mas que não existe: o ViaCEP responde
    //    {"erro": "true"}. Basta o campo "erro" existir.
    if (resposta !== null && typeof resposta === 'object' && 'erro' in resposta) {
      throw new ErroDeNegocio('CEP não encontrado.');
    }

    // 4. Sem cidade ou sem UF a resposta não serve (são colunas
    //    obrigatórias). Uma resposta assim é "estranha": tratamos como
    //    API com problema, e o atendente pode preencher à mão.
    const cidade = ViaCepClient.texto(resposta?.localidade);
    const uf = ViaCepClient.texto(resposta?.uf).toUpperCase();
    if (cidade === '' || uf.length !== 2) {
      console.error('[ViaCepClient] Resposta sem cidade ou UF válida:', resposta);
      throw new ErroDeNegocio(
        `Não foi possível consultar ${this.nomeServico} agora. ` +
          'Preencha manualmente ou tente de novo.',
      );
    }

    // 5. Montar o endereço com os NOSSOS nomes de coluna.
    //    À esquerda: nossa coluna. À direita: o campo da API.
    //    O CEP devolvido é o NOSSO (só números), não o "13480-001" da API.
    return {
      cep: cepLimpo,
      logradouro: ViaCepClient.texto(resposta.logradouro),
      bairro: ViaCepClient.texto(resposta.bairro),
      cidade,
      uf,
    };
  }

  /**
   * Ajudante: transforma qualquer coisa em texto sem espaços nas pontas.
   * Ex.: '  Centro ' -> 'Centro', null -> '', undefined -> ''
   */
  private static texto(v: unknown): string {
    return String(v ?? '').trim();
  }
}
