// =====================================================================
// GeocodificacaoClient.ts — o "CARTÓGRAFO" que acha a casa no mapa
// ---------------------------------------------------------------------
// Um endereço escrito ("Rua Senador Vergueiro, 120, Limeira, SP") não
// serve para medir distância. Precisamos do PONTO no mapa: latitude e
// longitude. Esta classe pergunta ao Nominatim (OpenStreetMap): "onde
// fica este endereço?" e anota as coordenadas.
//
// Ela HERDA do HttpClient (Integrante 1): HTTPS, 5 segundos e mensagem
// amigável vêm de graça. O trabalho DELA é:
//   1. montar o texto do endereço e protegê-lo para ir na URL;
//   2. respeitar a regra do Nominatim: no máximo 1 consulta por
//      segundo e sempre com o "crachá" User-Agent;
//   3. se não achar nada, tentar de novo SEM o número (decisão do
//      grupo: dúvida 4, opção b);
//   4. conferir se latitude e longitude são números de verdade.
//
// O que aprendemos testando a API no navegador (Passo 1, 23/11/2026):
//   - a resposta é uma LISTA; com o número ou sem ele, os resultados
//     foram iguais (o mapa de Limeira não tem a numeração das casas);
//   - "lat" e "lon" vêm como TEXTO ("-22.5670678"): é preciso converter;
//   - endereço que não existe: lista vazia [] e NÃO um erro.
//
// Quem usa: o ClienteService (Passo 5), ao salvar um cliente. Se esta
// classe lançar erro, o cliente é salvo SEM distância (NULL) e a tela
// avisa. Nunca um número inventado: distância errada = taxa errada.
// =====================================================================

import { HttpClient } from './HttpClient';
import { ErroDeNegocio } from '../security/ErroDeNegocio';

/** Um ponto no mapa. Os nomes são os mesmos das colunas do cliente. */
export interface Coordenadas {
  latitude: number;
  longitude: number;
}

/** O endereço que vai para o Nominatim (só os campos que ajudam a achar). */
export interface EnderecoParaMapa {
  logradouro: string;
  numero: string;
  cidade: string;
  uf: string;
}

/** Um item da lista que o Nominatim devolve, só com o que usamos. */
interface ResultadoNominatim {
  lat?: unknown; // vem como texto: "-22.5670678"
  lon?: unknown;
}

export class GeocodificacaoClient extends HttpClient {
  /**
   * Regra do Nominatim: no máximo 1 consulta por segundo.
   * Usamos 1,1 s: o relógio do computador não é exato (no teste, "1000 ms"
   * deu 999 ms), então a folga garante que nunca passamos do limite.
   */
  private static readonly INTERVALO_MINIMO_MS = 1100;

  /**
   * Quando foi a última consulta ao Nominatim (em milissegundos).
   * É "static": vale para o PROGRAMA INTEIRO, não para um objeto só.
   * Assim, mesmo que existam dois GeocodificacaoClient, a regra de
   * 1 por segundo é respeitada.
   */
  private static ultimaConsulta = 0;

  constructor() {
    // Vira a frase: "Não foi possível consultar o mapa agora. ..."
    super('o mapa');
  }

  /**
   * Descobre latitude e longitude de um endereço.
   *
   * Lança ErroDeNegocio se:
   *   - o endereço não for encontrado nem com nem sem o número;
   *   - o Nominatim estiver fora do ar ou demorar mais de 5 segundos.
   */
  async localizar(endereco: EnderecoParaMapa): Promise<Coordenadas> {
    const logradouro = endereco.logradouro.trim();
    const numero = endereco.numero.trim();
    const cidade = endereco.cidade.trim();
    const uf = endereco.uf.trim();

    // 1ª tentativa: com o número ("Rua X, 120, Limeira, SP")
    const comNumero = [logradouro, numero, cidade, uf].filter((parte) => parte !== '');
    let ponto = await this.consultar(comNumero.join(', '));

    // 2ª tentativa (só se a 1ª não achou nada): sem o número.
    // O consultar() já espera o 1 segundo obrigatório entre as duas.
    if (ponto === null && numero !== '') {
      const semNumero = [logradouro, cidade, uf].filter((parte) => parte !== '');
      ponto = await this.consultar(semNumero.join(', '));
    }

    if (ponto === null) {
      throw new ErroDeNegocio(
        'Endereço não encontrado no mapa. Confira a rua e a cidade.',
      );
    }
    return ponto;
  }

  /**
   * Faz UMA consulta ao Nominatim.
   * Devolve o primeiro ponto encontrado, ou null se a lista vier vazia.
   */
  private async consultar(texto: string): Promise<Coordenadas | null> {
    await GeocodificacaoClient.esperarAVez();

    // encodeURIComponent "embala" o texto para a URL: espaço vira %20,
    // vírgula vira %2C, e um "&" no nome da rua não quebra o endereço.
    // countrycodes=br: só procura no Brasil (existe "Rua São Paulo" em
    // Portugal também). limit=1: só precisamos do primeiro resultado.
    const url =
      'https://nominatim.openstreetmap.org/search' +
      `?q=${encodeURIComponent(texto)}&format=json&countrycodes=br&limit=1`;

    // User-Agent é o "crachá" do programa: o Nominatim exige.
    const resposta = await this.get<ResultadoNominatim[]>(url, {
      'User-Agent': 'PetShopDAD/1.0',
    });

    // Lista vazia [] = não achou. Não é erro da API: devolve null e quem
    // chamou decide (tentar sem o número ou desistir).
    if (!Array.isArray(resposta) || resposta.length === 0) {
      return null;
    }

    // lat e lon vêm como TEXTO: converter e conferir se viraram números
    // de verdade e dentro dos limites do planeta.
    const latitude = Number(resposta[0]?.lat);
    const longitude = Number(resposta[0]?.lon);
    if (!GeocodificacaoClient.coordenadaValida(latitude, longitude)) {
      console.error('[GeocodificacaoClient] Coordenadas estranhas:', resposta[0]);
      throw new ErroDeNegocio(
        `Não foi possível consultar ${this.nomeServico} agora. Tente de novo mais tarde.`,
      );
    }
    return { latitude, longitude };
  }

  /**
   * Garante 1 segundo entre uma consulta e outra (fila do caixa: quem
   * chega logo depois do anterior espera um pouco antes de ser atendido).
   */
  private static async esperarAVez(): Promise<void> {
    const agora = Date.now();
    const espera = GeocodificacaoClient.ultimaConsulta + GeocodificacaoClient.INTERVALO_MINIMO_MS - agora;
    // Marca a vez ANTES de esperar: se outra consulta chegar enquanto
    // esta espera, ela entra na fila depois desta.
    GeocodificacaoClient.ultimaConsulta = agora + Math.max(espera, 0);
    if (espera > 0) {
      await new Promise((acordar) => setTimeout(acordar, espera));
    }
  }

  /** Latitude entre -90 e 90, longitude entre -180 e 180, e números de verdade. */
  static coordenadaValida(latitude: number, longitude: number): boolean {
    return (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180
    );
  }
}
