// =====================================================================
// CnpjClient.ts — o "BALCÃO DA RECEITA" que preenche a ficha da empresa
// ---------------------------------------------------------------------
// Imagine um formulário de fornecedor em branco. Você entrega o CNPJ
// no balcão e recebe de volta a ficha já preenchida com razão social,
// cidade, UF e telefone. Esta classe faz isso pela BrasilAPI.
//
// Ela HERDA do HttpClient (Integrante 1): HTTPS, 5 segundos e mensagem
// amigável vêm de graça. O trabalho DELA é:
//   1. conferir o CNPJ ANTES de ir à internet;
//   2. buscar os dados;
//   3. conferir se veio o campo principal (razão social);
//   4. TRADUZIR os nomes da API para os nomes das nossas colunas
//      (municipio -> cidade, ddd_telefone_1 -> telefone);
//   5. trocar texto vazio ("") por null.
//
// LGPD: a BrasilAPI também manda nomes de SÓCIOS (lista "qsa"). Nós
// ignoramos esses dados de propósito: o que não guardamos, não vaza.
//
// Quem usa: o FornecedorService (Passo 4), no botão "Buscar CNPJ".
// =====================================================================

import type { Fornecedor } from '../../shared/tipos';
import { HttpClient } from './HttpClient';
import { ErroDeNegocio } from '../security/ErroDeNegocio';
import { Validador } from '../security/Validador';

/**
 * O formato da resposta da BrasilAPI, só com os campos que usamos.
 * Todo o resto (sócios, CNAEs, regime tributário...) é ignorado.
 * Tudo com "?" e "| null" porque a API pode não mandar o campo.
 */
interface RespostaBrasilApi {
  razao_social?: string | null;
  nome_fantasia?: string | null;
  ddd_telefone_1?: string | null;
  municipio?: string | null;
  uf?: string | null;
}

export class CnpjClient extends HttpClient {
  constructor() {
    // Vira a frase: "Não foi possível consultar o CNPJ agora. ..."
    super('o CNPJ');
  }

  /**
   * Busca os dados de uma empresa pelo CNPJ.
   *
   * Devolve um Fornecedor SEM o id (quem cria é o banco) e SEM o
   * importado (a Receita não sabe disso: quem marca é o ADMIN na tela).
   * "Omit" = "copie o tipo Fornecedor, menos estes campos".
   */
  async buscar(cnpj: string): Promise<Omit<Fornecedor, 'id' | 'importado'>> {
    // 1. Conferir o CNPJ antes de gastar uma ida à internet.
    //    O Validador aceita com ou sem pontuação e devolve só os
    //    14 números. Se estiver errado, ele mesmo lança "CNPJ inválido.".
    //    Bônus de segurança: na URL só entram números, nada mais.
    const cnpjLimpo = Validador.cnpj(cnpj);

    // 2. Buscar na internet (o CNPJ vai no final do endereço).
    //    O User-Agent é o "crachá" do programa: sem ele, a BrasilAPI
    //    responde 403 (proibido), porque acha que somos um robô anônimo.
    //    Testado em 22/11: sem crachá = 403, com crachá = 200.
    //    O nome é o mesmo que a Arquitetura usa no Nominatim.
    const resposta = await this.get<RespostaBrasilApi>(
      `https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`,
      { 'User-Agent': 'PetShopDAD/1.0' },
    );

    // 3. Sem razão social a resposta não serve (é coluna obrigatória)
    const razaoSocial = CnpjClient.textoOuNull(resposta?.razao_social);
    if (razaoSocial === null) {
      console.error('[CnpjClient] Resposta sem razão social:', resposta);
      throw new ErroDeNegocio(
        `Não foi possível consultar ${this.nomeServico} agora. ` +
          'Preencha manualmente ou tente de novo.',
      );
    }

    // 4 e 5. Montar a "ficha" com os NOSSOS nomes de coluna.
    //        À esquerda: nossa coluna. À direita: o campo da API.
    return {
      cnpj: cnpjLimpo,
      razao_social: razaoSocial,
      nome_fantasia: CnpjClient.textoOuNull(resposta.nome_fantasia),
      telefone: CnpjClient.textoOuNull(resposta.ddd_telefone_1),
      cidade: CnpjClient.textoOuNull(resposta.municipio),
      uf: CnpjClient.textoOuNull(resposta.uf),
    };
  }

  /**
   * Ajudante: tira os espaços das pontas e troca texto vazio por null.
   * Assim o banco guarda "não tem" (NULL) em vez de "tem um texto vazio".
   * Ex.: '' -> null, '  ' -> null, null -> null, 'SP' -> 'SP'
   */
  private static textoOuNull(v: unknown): string | null {
    const texto = String(v ?? '').trim();
    return texto === '' ? null : texto;
  }
}
