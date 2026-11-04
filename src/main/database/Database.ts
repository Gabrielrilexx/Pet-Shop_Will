// =====================================================================
// Database.ts — A "CENTRAL TELEFÔNICA" DO BANCO
// ---------------------------------------------------------------------
// É a ÚNICA classe do sistema que conversa direto com o MySQL.
// Os repositories pedem para ela: "consulte isto", "execute aquilo",
// "faça tudo isto numa transação".
//
// Regras de ouro (cada uma tem um motivo de segurança/organização):
//   1. Existe UMA só instância (singleton): Database.instancia().
//   2. SQL sempre com placeholders "?" — nunca juntando texto.
//   3. A senha do banco vem do .env, nunca escrita no código.
// =====================================================================

import mysql from 'mysql2/promise';
import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from 'mysql2/promise';
import dotenv from 'dotenv';

// Lê o arquivo .env da pasta do projeto e coloca os valores em
// process.env. O "quiet" só desliga uma mensagem de propaganda do dotenv.
dotenv.config({ quiet: true });

// Os colegas precisam deste tipo no ProdutoRepository.baixarEstoque(con, ...),
// então já reexportamos daqui para ninguém precisar procurar no mysql2.
export type { PoolConnection };

/** Valores que podem ocupar o lugar de um "?" no SQL. */
export type ValorSql = string | number | boolean | Date | null;

/** O que o executar() devolve depois de um INSERT, UPDATE ou DELETE. */
export interface ResultadoExecucao {
  insertId: number; // id gerado pelo AUTO_INCREMENT (no INSERT)
  affectedRows: number; // quantas linhas foram alteradas
}

export class Database {
  // A instância única fica guardada aqui. Começa vazia (null).
  private static unica: Database | null = null;

  // O "pool" é um grupo de conexões já abertas e reaproveitáveis.
  private readonly pool: Pool;

  // O constructor é PRIVATE: ninguém de fora consegue fazer
  // "new Database()". O único jeito de pegar o banco é pelo instancia().
  private constructor() {
    this.pool = mysql.createPool({
      host: Database.lerVariavel('DB_HOST'),
      port: Number(process.env.DB_PORT || 3306),
      user: Database.lerVariavel('DB_USER'),
      password: process.env.DB_PASSWORD ?? '',
      database: Database.lerVariavel('DB_NAME'),
      charset: 'utf8mb4', // aceita acentos e emojis
      connectionLimit: 5, // no máximo 5 conexões abertas ao mesmo tempo
      waitForConnections: true, // se as 5 estiverem ocupadas, espera a vez
      decimalNumbers: true, // DECIMAL chega como number (e não como texto)

      // Conversão automática de tipos na hora de LER do banco.
      // No MySQL, BOOLEAN é guardado como TINYINT(1) (0 ou 1). Sem isto,
      // "ativo" chegaria como 1 e não como true, e a interface mentiria.
      typeCast: (campo, proximo) => {
        if (campo.type === 'TINY' && campo.length === 1) {
          const valor = proximo(); // lê o valor do jeito padrão (0 ou 1)
          return valor === null ? null : Number(valor) !== 0;
        }
        return proximo(); // qualquer outro tipo: segue o padrão
      },
    });
  }

  /** Devolve SEMPRE a mesma instância do banco (cria na 1ª vez). */
  static instancia(): Database {
    if (Database.unica === null) {
      Database.unica = new Database();
    }
    return Database.unica;
  }

  /**
   * SELECT: devolve a lista de linhas encontradas.
   * Exemplo: db.consultar<Cliente>('SELECT * FROM cliente WHERE id = ?', [5])
   */
  async consultar<T>(sql: string, params: ValorSql[] = []): Promise<T[]> {
    const [linhas] = await this.pool.execute<RowDataPacket[]>(sql, params);
    return linhas as T[];
  }

  /**
   * INSERT, UPDATE ou DELETE: devolve o id gerado e quantas linhas mudaram.
   * Exemplo: db.executar('DELETE FROM especie WHERE id = ?', [3])
   */
  async executar(
    sql: string,
    params: ValorSql[] = [],
  ): Promise<ResultadoExecucao> {
    const [resultado] = await this.pool.execute<ResultSetHeader>(sql, params);
    return {
      insertId: resultado.insertId,
      affectedRows: resultado.affectedRows,
    };
  }

  /**
   * Transação: "ou tudo, ou nada".
   * Tudo o que a função "fn" fizer usando a conexão "con" só vale de
   * verdade se terminar sem erro (COMMIT). Se qualquer coisa der errado
   * no meio, tudo é desfeito (ROLLBACK).
   *
   * Exemplo (confirmar pedido):
   *   await db.transacao(async (con) => {
   *     await con.execute('UPDATE produto SET ...', [...]);
   *     await con.execute('UPDATE pedido SET status = ? ...', [...]);
   *   });
   */
  async transacao<T>(fn: (con: PoolConnection) => Promise<T>): Promise<T> {
    const con = await this.pool.getConnection(); // pega uma conexão do pool
    try {
      await con.beginTransaction();
      const resultado = await fn(con);
      await con.commit(); // deu tudo certo: grava
      return resultado;
    } catch (erro) {
      await con.rollback(); // deu erro: desfaz tudo
      throw erro; // e avisa quem chamou
    } finally {
      con.release(); // SEMPRE devolve a conexão ao pool
    }
  }

  /**
   * Fecha todas as conexões. Usado pelos scripts de terminal
   * (teste de conexão e seed), para o programa conseguir terminar.
   */
  async fechar(): Promise<void> {
    await this.pool.end();
    Database.unica = null;
  }

  /** Lê uma variável do .env e dá um erro claro se ela estiver faltando. */
  private static lerVariavel(nome: string): string {
    const valor = process.env[nome];
    if (!valor) {
      throw new Error(
        `A variável ${nome} não foi encontrada no .env. ` +
          'Copie o .env.example para .env e preencha os valores.',
      );
    }
    return valor;
  }
}
