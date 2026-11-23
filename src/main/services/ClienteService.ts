// =====================================================================
// ClienteService.ts — o "CHEF" do cadastro de clientes
// ---------------------------------------------------------------------
// Na analogia do restaurante, o Service é a cozinha: recebe o pedido
// do garçom (IpcRouter), confere os ingredientes e prepara o prato.
// Aqui ficam as REGRAS do cliente:
//   - conferir e limpar cada campo ANTES de ir para o banco;
//   - calcular a distância da loja até a casa do cliente (Nominatim +
//     OSRM) quando ela é nova, quando o endereço muda ou quando ela
//     ainda está vazia (decisão do grupo: dúvida 5, opção a);
//   - se a API de mapas falhar: salvar SEM distância (NULL) e avisar.
//     Nunca um número inventado: distância errada = taxa errada.
//
// SEGURANÇA: latitude, longitude e distancia_km NUNCA vêm da tela. Se
// alguém mandar uma distância pelo DevTools, ela é ignorada: o valor é
// sempre calculado aqui no Main. Senão daria para baratear a taxa.
//
// INJEÇÃO DE DEPENDÊNCIA: recebe o repository e os 3 clientes de API
// prontos no constructor (quem monta é o clientesIpc.ts):
//   new ClienteService(new ClienteRepository(), new ViaCepClient(),
//                      new GeocodificacaoClient(), new RotaClient())
//
// Canais (tabela de permissões do README):
//   clientes:listar / clientes:salvar / clientes:buscarCep -> ADMIN e ATENDENTE
//   clientes:excluir -> só ADMIN
// =====================================================================

import type { Cliente } from '../../shared/tipos';
import type { ClienteRepository } from '../repositories/ClienteRepository';
import type { ViaCepClient, EnderecoDoCep } from '../api/ViaCepClient';
import type { GeocodificacaoClient, Coordenadas } from '../api/GeocodificacaoClient';
import type { RotaClient } from '../api/RotaClient';
import { Validador } from '../security/Validador';
import { ErroDeNegocio } from '../security/ErroDeNegocio';

// Tamanhos máximos: iguais às colunas do schema.sql
const MAX_NOME = 100;
const MAX_TELEFONE = 20;
const MAX_LOGRADOURO = 150;
const MAX_NUMERO = 10;
const MAX_COMPLEMENTO = 60;
const MAX_BAIRRO = 80;
const MAX_CIDADE = 80;

/** Os campos que a TELA pode mandar (o resto é calculado aqui). */
type DadosDaTela = Omit<Cliente, 'id' | 'latitude' | 'longitude' | 'distancia_km'>;

/** A parte do cliente que o mapa calcula. */
type Localizacao = Pick<Cliente, 'latitude' | 'longitude' | 'distancia_km'>;

/**
 * O que o clientes:salvar devolve para a tela:
 *   id    -> o id do cliente (novo ou o mesmo, se editou);
 *   aviso -> null se deu tudo certo; um texto se o cliente foi salvo
 *            SEM distância (a tela mostra em amarelo).
 */
export interface ClienteSalvo {
  id: number;
  aviso: string | null;
}

export class ClienteService {
  /** Aviso quando o Nominatim ou o OSRM não respondem (fora do ar, sem internet...). */
  private static readonly AVISO_SERVICO_FORA =
    'Cliente salvo, mas não foi possível calcular a distância agora (serviço de mapas ' +
    'indisponível). Salve o cliente de novo mais tarde para tentar outra vez.';

  constructor(
    private readonly clientes: ClienteRepository,
    private readonly viaCep: ViaCepClient,
    private readonly geocodificacao: GeocodificacaoClient,
    private readonly rota: RotaClient,
  ) {}

  /**
   * Todos os clientes, em ordem de id.
   * Mesma lista para ADMIN e ATENDENTE: o cliente não tem CPF nem outro
   * dado que só o dono possa ver (minimização da LGPD).
   */
  async listar(): Promise<Cliente[]> {
    return this.clientes.listar();
  }

  /**
   * Botão "Buscar CEP": devolve o endereço para a tela preencher.
   * Não salva nada. O ViaCepClient já valida o CEP e já transforma
   * qualquer falha da internet em mensagem amigável.
   */
  async buscarCep(cep: string): Promise<EnderecoDoCep> {
    return this.viaCep.buscar(cep);
  }

  /**
   * Sem id -> cadastra. Com id -> atualiza.
   * Partial: a tela pode mandar campo faltando; quem confere somos nós.
   */
  async salvar(dados: Partial<Cliente>): Promise<ClienteSalvo> {
    // 1. Conferir e limpar os campos da tela (lança erro se algo estiver errado)
    const ficha = ClienteService.validar(dados);

    // 2. Cadastro novo: sempre calcula a distância
    if (dados?.id === undefined || dados?.id === null) {
      const { localizacao, aviso } = await this.calcularLocalizacao(ficha);
      const id = await this.clientes.inserir({ ...ficha, ...localizacao });
      return { id, aviso };
    }

    // 3. Edição: buscar como o cliente está HOJE no banco, para comparar
    const id = ClienteService.validarId(dados.id);
    const atual = await this.clientes.buscarPorId(id);
    if (atual === null) {
      throw new ErroDeNegocio('Registro não encontrado.');
    }

    // 4. Recalcular só quando precisa (dúvida 5, opção a):
    //    o endereço do mapa mudou OU a distância ainda está vazia.
    //    Cada cálculo gasta 2 a 3 consultas na internet.
    if (ClienteService.enderecoMudou(atual, ficha) || atual.distancia_km === null) {
      const { localizacao, aviso } = await this.calcularLocalizacao(ficha);
      await this.clientes.atualizar(id, { ...ficha, ...localizacao });
      return { id, aviso };
    }

    // 5. Endereço igual e distância já calculada: mantém a que já existe
    await this.clientes.atualizar(id, {
      ...ficha,
      latitude: atual.latitude,
      longitude: atual.longitude,
      distancia_km: atual.distancia_km,
    });
    return { id, aviso: null };
  }

  /**
   * Exclui um cliente. Se ele tiver pedidos, o banco recusa (RESTRICT)
   * e o BaseRepository avisa "Este registro está em uso...".
   */
  async excluir(id: number): Promise<void> {
    await this.clientes.excluir(ClienteService.validarId(id));
  }

  // -------------------------------------------------------------------
  // Ajudantes (private: só este Service usa)
  // -------------------------------------------------------------------

  /**
   * Endereço -> ponto no mapa -> distância pela rua.
   * NUNCA lança erro: se a internet falhar, devolve tudo null e um aviso.
   * A loja não pode deixar de cadastrar um cliente porque um site caiu.
   */
  private async calcularLocalizacao(
    ficha: DadosDaTela,
  ): Promise<{ localizacao: Localizacao; aviso: string | null }> {
    const vazio: Localizacao = { latitude: null, longitude: null, distancia_km: null };

    // Etapa 1: endereço -> latitude/longitude (Nominatim)
    let ponto: Coordenadas | null;
    try {
      ponto = await this.geocodificacao.localizar(ficha);
    } catch (erro) {
      ClienteService.registrarFalha('mapa', erro);
      return { localizacao: vazio, aviso: ClienteService.AVISO_SERVICO_FORA };
    }
    if (ponto === null) {
      return {
        localizacao: vazio,
        aviso:
          'Cliente salvo, mas o endereço não foi encontrado no mapa e ficou sem distância. ' +
          'Confira a rua e a cidade e salve de novo.',
      };
    }

    // Etapa 2: loja -> cliente, pela rua (OSRM)
    try {
      const km = await this.rota.distanciaDaLojaKm(ponto);
      return { localizacao: { ...ponto, distancia_km: km }, aviso: null };
    } catch (erro) {
      ClienteService.registrarFalha('rota', erro);
      // O ponto no mapa é verdadeiro: guardamos. Só a distância fica vazia.
      return {
        localizacao: { ...ponto, distancia_km: null },
        aviso: ClienteService.AVISO_SERVICO_FORA,
      };
    }
  }

  /** Detalhe técnico da falha: só no terminal, nunca na tela. */
  private static registrarFalha(etapa: string, erro: unknown): void {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    console.error(`[ClienteService] Distância não calculada (etapa: ${etapa}): ${motivo}`);
  }

  /**
   * Mudou algum campo que vai para o Nominatim? (dúvida 5)
   * CEP, bairro e complemento não contam: não entram na busca do mapa.
   */
  private static enderecoMudou(atual: Cliente, nova: DadosDaTela): boolean {
    return (
      atual.logradouro !== nova.logradouro ||
      atual.numero !== nova.numero ||
      atual.cidade !== nova.cidade ||
      atual.uf !== nova.uf
    );
  }

  /** Confere e limpa todos os campos. Devolve a ficha pronta (sem o mapa). */
  private static validar(dados: Partial<Cliente>): DadosDaTela {
    return {
      nome: ClienteService.texto(dados?.nome, MAX_NOME, 'Nome'),
      telefone: ClienteService.texto(dados?.telefone, MAX_TELEFONE, 'Telefone'),
      cep: Validador.cep(dados?.cep), // devolve só os 8 números
      logradouro: ClienteService.texto(dados?.logradouro, MAX_LOGRADOURO, 'Rua'),
      numero: ClienteService.texto(dados?.numero, MAX_NUMERO, 'Número'),
      complemento: ClienteService.opcional(dados?.complemento, MAX_COMPLEMENTO, 'Complemento'),
      bairro: ClienteService.texto(dados?.bairro, MAX_BAIRRO, 'Bairro'),
      cidade: ClienteService.texto(dados?.cidade, MAX_CIDADE, 'Cidade'),
      uf: ClienteService.uf(dados?.uf),
    };
  }

  /** Campo obrigatório que precisa caber na coluna. Devolve sem espaços nas pontas. */
  private static texto(v: unknown, max: number, campo: string): string {
    const texto = Validador.obrigatorio(v, campo);
    return Validador.tamanhoMaximo(texto, max, campo);
  }

  /**
   * Campo opcional: vazio vira null; preenchido precisa caber na coluna.
   * Ex.: '' -> null, '  Apto 12 ' -> 'Apto 12'
   */
  private static opcional(v: unknown, max: number, campo: string): string | null {
    const texto = Validador.tamanhoMaximo(v, max, campo); // já tira os espaços
    return texto === '' ? null : texto;
  }

  /** UF obrigatória, com 2 letras. Devolve em MAIÚSCULAS. */
  private static uf(v: unknown): string {
    const texto = String(v ?? '').trim().toUpperCase();
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
