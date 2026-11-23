// =====================================================================
// ClienteRepository.ts — o "ESTOQUISTA" do fichário de clientes
// ---------------------------------------------------------------------
// Pense no arquivo de aço onde ficam as fichas dos clientes. Só esta
// classe abre a gaveta: ela é a ÚNICA que escreve SQL na tabela
// "cliente". O Service (o chef) pede, o Repository busca e guarda.
//
// Herda do BaseRepository (Integrante 1): listar(), buscarPorId() e
// excluir() já vêm prontos. Aqui ficam só o que é próprio do cliente:
//   - inserir() e atualizar();
//   - possuiPedidos(): pergunta ao banco se o cliente já tem pedidos,
//     ANTES de tentar excluir (decisão do grupo: dúvida 1, opção c).
//
// O cliente NÃO tem coluna UNIQUE (dois clientes podem ter o mesmo
// nome), então não há "Já existe um cliente com...".
//
// Quem usa: o ClienteService (Integrante 2) e, para escolher o cliente
// na tela de pedido, o Integrante 4 (pelo canal clientes:listar).
// =====================================================================

import type { Cliente } from '../../shared/tipos';
import { Database } from '../database/Database';
import type { ValorSql } from '../database/Database';
import { BaseRepository } from './BaseRepository';
import { ErroDeNegocio } from '../security/ErroDeNegocio';

export class ClienteRepository extends BaseRepository<Cliente> {
  constructor() {
    super(Database.instancia(), 'cliente'); // nome da tabela FIXO
  }

  /** Insere um cliente e devolve o id que o banco criou. */
  async inserir(dados: Omit<Cliente, 'id'>): Promise<number> {
    const resultado = await this.db.executar(
      'INSERT INTO cliente (nome, telefone, cep, logradouro, numero, complemento, ' +
        'bairro, cidade, uf, latitude, longitude, distancia_km) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ClienteRepository.valores(dados),
    );
    return resultado.insertId;
  }

  /** Atualiza a ficha do cliente que tem esse id. */
  async atualizar(id: number, dados: Omit<Cliente, 'id'>): Promise<void> {
    const resultado = await this.db.executar(
      'UPDATE cliente SET nome = ?, telefone = ?, cep = ?, logradouro = ?, numero = ?, ' +
        'complemento = ?, bairro = ?, cidade = ?, uf = ?, latitude = ?, longitude = ?, ' +
        'distancia_km = ? WHERE id = ?',
      [...ClienteRepository.valores(dados), id],
    );
    if (resultado.affectedRows === 0) {
      throw new ErroDeNegocio('Registro não encontrado.');
    }
  }

  /**
   * O cliente já fez algum pedido?
   * Só LÊ a tabela pedido (do Integrante 4), nunca altera nada nela.
   * COUNT(*) conta quantas linhas existem; "AS total" dá um nome à conta.
   */
  async possuiPedidos(id: number): Promise<boolean> {
    const linhas = await this.db.consultar<{ total: number }>(
      'SELECT COUNT(*) AS total FROM pedido WHERE cliente_id = ?',
      [id],
    );
    return Number(linhas[0]?.total ?? 0) > 0;
  }

  /** Os 12 valores na MESMA ordem das colunas do INSERT e do UPDATE. */
  private static valores(dados: Omit<Cliente, 'id'>): ValorSql[] {
    return [
      dados.nome,
      dados.telefone,
      dados.cep,
      dados.logradouro,
      dados.numero,
      dados.complemento,
      dados.bairro,
      dados.cidade,
      dados.uf,
      dados.latitude,
      dados.longitude,
      dados.distancia_km,
    ];
  }
}
