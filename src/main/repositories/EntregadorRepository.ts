// =====================================================================
// EntregadorRepository.ts — o "ESTOQUISTA" da pasta de motoboys
// ---------------------------------------------------------------------
// Pense na pasta do RH com a ficha de cada motoboy contratado. Só esta
// classe abre a pasta: ela é a ÚNICA que escreve SQL na tabela
// "entregador".
//
// Herda do BaseRepository (Integrante 1): listar(), buscarPorId() e
// excluir() já vêm prontos. Aqui ficam:
//   - inserir() e atualizar() (o CPF é UNIQUE: dois motoboys não podem
//     ter o mesmo CPF);
//   - listarAtivos(): CONTRATO COM O INTEGRANTE 4 (saída para entrega).
//     A assinatura é fixa: listarAtivos(): Promise<Entregador[]>.
//     Não mudar sem combinar com o grupo;
//   - possuiEntregas(): pergunta ao banco se o motoboy já fez entregas,
//     ANTES de tentar excluir (mesma ideia do Passo 6 dos clientes).
//
// LGPD: o CPF é dado sensível. Esta classe nunca escreve CPF no console.
// =====================================================================

import type { Entregador } from '../../shared/tipos';
import { Database } from '../database/Database';
import type { ValorSql } from '../database/Database';
import { BaseRepository } from './BaseRepository';
import { ErroDeNegocio } from '../security/ErroDeNegocio';

export class EntregadorRepository extends BaseRepository<Entregador> {
  constructor() {
    super(Database.instancia(), 'entregador'); // nome da tabela FIXO
  }

  /**
   * Só os motoboys ATIVOS, em ordem alfabética.
   * Quem usa: o Integrante 4, na hora de escolher quem sai com o pedido.
   * Entregador inativo (demitido, de férias) não aparece aqui, mas o
   * histórico de entregas dele continua guardado.
   */
  async listarAtivos(): Promise<Entregador[]> {
    return this.db.consultar<Entregador>(
      'SELECT * FROM entregador WHERE ativo = TRUE ORDER BY nome',
    );
  }

  /** Insere um entregador e devolve o id que o banco criou. */
  async inserir(dados: Omit<Entregador, 'id'>): Promise<number> {
    try {
      const resultado = await this.db.executar(
        'INSERT INTO entregador (nome, cpf, telefone, placa_moto, valor_por_km, ativo) ' +
          'VALUES (?, ?, ?, ?, ?, ?)',
        EntregadorRepository.valores(dados),
      );
      return resultado.insertId;
    } catch (erro) {
      // CPF repetido: frase combinada no contrato do grupo
      if (this.ehErroDeDuplicidade(erro)) {
        throw new ErroDeNegocio('Já existe um entregador com esse CPF.');
      }
      throw erro;
    }
  }

  /** Atualiza a ficha do entregador que tem esse id. */
  async atualizar(id: number, dados: Omit<Entregador, 'id'>): Promise<void> {
    let linhasAlteradas: number;
    try {
      const resultado = await this.db.executar(
        'UPDATE entregador SET nome = ?, cpf = ?, telefone = ?, placa_moto = ?, ' +
          'valor_por_km = ?, ativo = ? WHERE id = ?',
        [...EntregadorRepository.valores(dados), id],
      );
      linhasAlteradas = resultado.affectedRows;
    } catch (erro) {
      if (this.ehErroDeDuplicidade(erro)) {
        throw new ErroDeNegocio('Já existe um entregador com esse CPF.');
      }
      throw erro;
    }

    if (linhasAlteradas === 0) {
      throw new ErroDeNegocio('Registro não encontrado.');
    }
  }

  /**
   * O motoboy já fez alguma entrega?
   * Só LÊ a tabela entrega (do Integrante 4), nunca altera nada nela.
   */
  async possuiEntregas(id: number): Promise<boolean> {
    const linhas = await this.db.consultar<{ total: number }>(
      'SELECT COUNT(*) AS total FROM entrega WHERE entregador_id = ?',
      [id],
    );
    return Number(linhas[0]?.total ?? 0) > 0;
  }

  /** Os 6 valores na MESMA ordem das colunas do INSERT e do UPDATE. */
  private static valores(dados: Omit<Entregador, 'id'>): ValorSql[] {
    return [
      dados.nome,
      dados.cpf,
      dados.telefone,
      dados.placa_moto,
      dados.valor_por_km,
      dados.ativo,
    ];
  }
}
