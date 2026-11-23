// =====================================================================
// RotaClient.ts — o "GPS DO MOTOBOY" que mede o caminho pela rua
// ---------------------------------------------------------------------
// Medir em linha reta (como um passarinho voando) dá um número menor
// que o real: o motoboy precisa seguir as ruas, contornar quarteirões
// e respeitar a mão de direção. Esta classe pergunta ao OSRM (o GPS do
// OpenStreetMap): "quantos metros de rua tem da loja até este ponto?".
//
// Ela HERDA do HttpClient (Integrante 1): HTTPS, 5 segundos e mensagem
// amigável vêm de graça. O trabalho DELA é:
//   1. pegar o ponto de partida (a loja) no .env;
//   2. montar a URL na ordem que o OSRM exige: LONGITUDE,LATITUDE
//      (ao contrário do costume!);
//   3. conferir a resposta: só vale se "code" for "Ok" e vier uma rota
//      com uma distância que seja número de verdade;
//   4. converter metros em quilômetros, com 2 casas decimais.
//
// O que aprendemos testando a API no navegador (Passo 1, 23/11/2026):
//   - deu certo: {"code":"Ok","routes":[{"distance":1237.8, ...}]}
//     (a distância vem em METROS e já como número, sem aspas);
//   - deu errado: o "code" muda ("InvalidQuery", "InvalidUrl"...) e
//     não dá para prever todos. Por isso só aceitamos "Ok".
//
// Quem usa: o ClienteService (Passo 5), logo depois do
// GeocodificacaoClient. Se esta classe lançar erro, o cliente é salvo
// SEM distância (NULL) e a tela avisa. Nunca um número inventado.
// =====================================================================

import { HttpClient } from './HttpClient';
import { ErroDeNegocio } from '../security/ErroDeNegocio';
import { GeocodificacaoClient } from './GeocodificacaoClient';
import type { Coordenadas } from './GeocodificacaoClient';

/** A resposta do OSRM, só com os campos que usamos. */
interface RespostaOsrm {
  code?: unknown; // "Ok" quando deu certo
  routes?: { distance?: unknown }[]; // distance em METROS
}

export class RotaClient extends HttpClient {
  /**
   * Maior distância que cabe na coluna distancia_km (DECIMAL(6,2)).
   * Um número maior que isso é resposta estranha (e o banco recusaria).
   */
  private static readonly MAIOR_DISTANCIA_KM = 9999.99;

  constructor() {
    // Vira a frase: "Não foi possível consultar a rota agora. ..."
    super('a rota');
  }

  /**
   * Distância PELA RUA, em km, da loja até o ponto do cliente.
   * Ex.: 1237.8 metros -> 1.24
   */
  async distanciaDaLojaKm(destino: Coordenadas): Promise<number> {
    const loja = RotaClient.coordenadasDaLoja();

    if (!GeocodificacaoClient.coordenadaValida(destino.latitude, destino.longitude)) {
      throw new ErroDeNegocio('Coordenadas do cliente inválidas.');
    }

    // ATENÇÃO: o OSRM quer LONGITUDE primeiro, depois LATITUDE.
    // Formato: /driving/lonOrigem,latOrigem;lonDestino,latDestino
    // overview=false: não precisamos do desenho da rota, só da distância.
    const url =
      'https://router.project-osrm.org/route/v1/driving/' +
      `${loja.longitude},${loja.latitude};${destino.longitude},${destino.latitude}` +
      '?overview=false';

    const resposta = await this.get<RespostaOsrm>(url);

    // Só aceita resposta que diz "Ok" e traz uma distância de verdade
    const metros = Number(resposta?.routes?.[0]?.distance);
    if (resposta?.code !== 'Ok' || !Number.isFinite(metros) || metros < 0) {
      console.error('[RotaClient] Resposta sem rota válida:', resposta);
      throw new ErroDeNegocio(
        `Não foi possível consultar ${this.nomeServico} agora. Tente de novo mais tarde.`,
      );
    }

    // Metros -> km com 2 casas (a coluna é DECIMAL(6,2)).
    // 1237.8 / 1000 = 1.2378 -> * 100 = 123.78 -> arredonda 124 -> / 100 = 1.24
    const km = Math.round((metros / 1000) * 100) / 100;
    if (km > RotaClient.MAIOR_DISTANCIA_KM) {
      console.error('[RotaClient] Distância fora do esperado (km):', km);
      throw new ErroDeNegocio('Distância calculada fora do esperado. Confira o endereço.');
    }
    return km;
  }

  /**
   * Lê LOJA_LAT e LOJA_LON do .env (o .env é carregado pelo Database.ts
   * assim que o programa abre). Se faltar ou estiver errado, avisa no
   * console para quem programa e lança erro para a tela.
   */
  private static coordenadasDaLoja(): Coordenadas {
    const latitude = Number(process.env.LOJA_LAT);
    const longitude = Number(process.env.LOJA_LON);
    // Number('') dá 0, que é um número "válido": por isso conferimos
    // também se o texto existe.
    if (
      !process.env.LOJA_LAT ||
      !process.env.LOJA_LON ||
      !GeocodificacaoClient.coordenadaValida(latitude, longitude)
    ) {
      console.error('[RotaClient] LOJA_LAT/LOJA_LON ausentes ou inválidas no .env');
      throw new ErroDeNegocio('Coordenadas da loja não configuradas. Avise o administrador.');
    }
    return { latitude, longitude };
  }
}
