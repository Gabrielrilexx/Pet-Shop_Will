// =====================================================================
// testar-conexao.ts — confere se o .env está certo e o banco responde
// ---------------------------------------------------------------------
// Como rodar:  npm run db:testar
// Serve para QUALQUER integrante conferir o próprio .env antes de
// começar a programar.
// =====================================================================

import { Database } from '../src/main/database/Database';

async function testar(): Promise<void> {
  let db: Database | null = null;
  try {
    db = Database.instancia(); // se faltar algo no .env, o erro aparece aqui

    // SELECT 1 é a consulta mais simples que existe: não precisa de
    // nenhuma tabela. Se ela responder, a conexão está funcionando.
    const linhas = await db.consultar<{ resultado: number; banco: string }>(
      'SELECT 1 AS resultado, DATABASE() AS banco',
    );
    console.log('✅ Conectado ao MySQL!');
    console.log(`   Banco em uso: ${linhas[0].banco}`);
    console.log(`   SELECT 1 respondeu: ${linhas[0].resultado}`);
  } catch (erro) {
    console.error('❌ Não foi possível conectar ao MySQL.');
    console.error('   Motivo:', erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  } finally {
    await db?.fechar(); // "?." = só fecha se o banco chegou a ser criado
  }
}

testar();
