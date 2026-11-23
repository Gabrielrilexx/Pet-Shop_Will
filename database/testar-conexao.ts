// =====================================================================
// testar-conexao.ts — "CHECK-UP" do banco de dados
// ---------------------------------------------------------------------
// Como rodar:  npm run db:testar
// Serve para QUALQUER integrante conferir, sem abrir o Workbench:
//   1. se o .env está certo e o banco responde;
//   2. se as 10 tabelas do schema.sql existem;
//   3. se o relógio do servidor bate com o do seu computador
//      (importante para "pedidos de hoje", que usa a data do servidor).
// =====================================================================

import { Database } from '../src/main/database/Database';

// As 10 tabelas que o schema.sql (Integrante 4) cria
const TABELAS_ESPERADAS = [
  'categoria',
  'cliente',
  'entrega',
  'entregador',
  'especie',
  'fornecedor',
  'item_pedido',
  'pedido',
  'produto',
  'usuario',
];

async function testar(): Promise<void> {
  let db: Database | null = null;
  try {
    db = Database.instancia(); // se faltar algo no .env, o erro aparece aqui

    // ---------------------------------------------------------------
    // 1. Conexão: SELECT 1 não precisa de nenhuma tabela.
    // ---------------------------------------------------------------
    const [conexao] = await db.consultar<{ resultado: number; banco: string }>(
      'SELECT 1 AS resultado, DATABASE() AS banco',
    );
    console.log('✅ Conectado ao MySQL!');
    console.log(`   Banco em uso: ${conexao.banco}`);

    // ---------------------------------------------------------------
    // 2. Tabelas: o information_schema é o "índice" do MySQL, onde ele
    //    anota quais tabelas existem em cada banco.
    // ---------------------------------------------------------------
    const linhas = await db.consultar<{ nome: string }>(
      'SELECT TABLE_NAME AS nome FROM information_schema.TABLES ' +
        'WHERE TABLE_SCHEMA = DATABASE()',
    );
    const existentes = linhas.map((l) => l.nome.toLowerCase());
    const faltando = TABELAS_ESPERADAS.filter((t) => !existentes.includes(t));

    if (faltando.length === 0) {
      console.log(`✅ As ${TABELAS_ESPERADAS.length} tabelas do schema.sql existem.`);
    } else {
      console.log(
        `⚠️  Tabelas encontradas: ${TABELAS_ESPERADAS.length - faltando.length} ` +
          `de ${TABELAS_ESPERADAS.length}. Faltando: ${faltando.join(', ')}`,
      );
      console.log('   Rode o database/schema.sql no Workbench (combine antes no grupo).');
    }

    // ---------------------------------------------------------------
    // 3. Relógio: comparamos a hora do servidor com a do computador.
    //    O DATE_FORMAT devolve a hora do servidor como TEXTO, do jeito
    //    que ele enxerga, sem nenhuma conversão no caminho.
    // ---------------------------------------------------------------
    const [relogio] = await db.consultar<{ agora: string }>(
      "SELECT DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s') AS agora",
    );
    const horaServidor = new Date(relogio.agora.replace(' ', 'T')); // lida como hora local
    const horaComputador = new Date();
    const diferencaHoras = Math.round(
      (horaServidor.getTime() - horaComputador.getTime()) / 3_600_000,
    );

    const formato = (d: Date): string => d.toLocaleString('pt-BR');
    console.log(`   Hora do servidor:   ${formato(horaServidor)}`);
    console.log(`   Hora do computador: ${formato(horaComputador)}`);

    if (diferencaHoras === 0) {
      console.log('✅ Os relógios batem: "pedidos de hoje" vai funcionar certo.');
    } else {
      console.log(
        `⚠️  O servidor está ${Math.abs(diferencaHoras)} hora(s) ` +
          `${diferencaHoras > 0 ? 'ADIANTADO' : 'ATRASADO'} em relação ao computador.`,
      );
      console.log('   Avise o Integrante 1: isso afeta o "pedidos de hoje".');
    }
  } catch (erro) {
    console.error('❌ Não foi possível conectar ao MySQL.');
    console.error('   Motivo:', erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  } finally {
    await db?.fechar(); // "?." = só fecha se o banco chegou a ser criado
  }
}

testar();
