// =====================================================================
// seed.ts — cria o PRIMEIRO administrador do sistema
// ---------------------------------------------------------------------
// Como rodar:  npm run seed
//
// O problema do "ovo e da galinha": só um ADMIN pode cadastrar usuários,
// mas no começo não existe nenhum ADMIN. Este script resolve isso pelo
// terminal, fora do sistema: pergunta nome, e-mail e senha e grava o
// primeiro ADMIN já com a senha em hash (bcrypt).
//
// A senha NÃO aparece na tela enquanto você digita, e NÃO fica escrita
// em nenhum arquivo do projeto.
// =====================================================================

import readline from 'node:readline';
import { Writable } from 'node:stream';
import { Database } from '../src/main/database/Database';
import { UsuarioRepository } from '../src/main/repositories/UsuarioRepository';
import { ErroDeNegocio } from '../src/main/security/ErroDeNegocio';
import { PasswordHasher } from '../src/main/security/PasswordHasher';
import { Validador } from '../src/main/security/Validador';

// --- Truque para esconder a senha -------------------------------------
// O readline escreve na tela tudo o que você digita. Aqui ele escreve
// numa "saída" nossa, que repassa para a tela SÓ quando não está muda.
let mudo = false;
const saida = new Writable({
  write(pedaco, codificacao, terminou) {
    if (!mudo) process.stdout.write(pedaco, codificacao);
    terminou();
  },
});
const terminal = readline.createInterface({
  input: process.stdin,
  output: saida,
  terminal: Boolean(process.stdin.isTTY), // true quando é uma pessoa digitando
});

// --- Fila de respostas --------------------------------------------------
// Cada Enter vira uma "linha". As linhas entram numa fila, e cada
// pergunta pega a próxima da fila (ou espera a próxima chegar).
// Assim nenhuma resposta se perde, mesmo se chegarem várias de uma vez.
const fila: string[] = [];
let quemEspera: ((linha: string) => void) | null = null;
let terminou = false;

terminal.on('line', (linha) => {
  if (quemEspera) {
    const entregar = quemEspera;
    quemEspera = null;
    entregar(linha);
  } else {
    fila.push(linha);
  }
});
terminal.on('close', () => {
  terminou = true; // acabou a entrada (ex.: Ctrl+C): quem espera recebe ''
  quemEspera?.('');
});

function proximaLinha(): Promise<string> {
  const linha = fila.shift();
  if (linha !== undefined) return Promise.resolve(linha);
  if (terminou) return Promise.resolve('');
  return new Promise((resolver) => {
    quemEspera = resolver;
  });
}

/** Faz uma pergunta. Se "oculta", o que for digitado não aparece. */
async function perguntar(pergunta: string, oculta = false): Promise<string> {
  process.stdout.write(pergunta);
  mudo = oculta;
  const resposta = await proximaLinha();
  mudo = false;
  if (oculta) process.stdout.write('\n'); // pula a linha que o Enter não mostrou
  return resposta;
}

async function criarAdmin(): Promise<void> {
  console.log('=== Criar o primeiro ADMIN do Pet Shop ===\n');

  // Cada resposta passa pelo MESMO Validador que o sistema usa.
  const nome = Validador.tamanhoMaximo(
    Validador.obrigatorio(await perguntar('Nome: '), 'Nome'),
    100,
    'Nome',
  );
  const email = Validador.tamanhoMaximo(Validador.email(await perguntar('E-mail: ')), 150, 'E-mail');
  const senha = Validador.senha(await perguntar('Senha (não aparece ao digitar): ', true));
  const confirmacao = await perguntar('Repita a senha: ', true);
  if (senha !== confirmacao) {
    throw new ErroDeNegocio('As senhas não são iguais.');
  }

  // Grava: a senha vira hash ANTES de chegar perto do banco.
  const usuarios = new UsuarioRepository();
  const id = await usuarios.inserir({
    nome,
    email,
    senha_hash: await PasswordHasher.gerar(senha),
    perfil: 'ADMIN',
    ativo: true,
  });

  console.log(`\n✅ ADMIN criado (id ${id}). Agora é só entrar no sistema com ${email}.`);
}

async function principal(): Promise<void> {
  try {
    await criarAdmin();
  } catch (erro) {
    if (erro instanceof ErroDeNegocio) {
      console.error(`\n❌ ${erro.message}`); // ex.: "Já existe um usuário com esse e-mail."
    } else {
      console.error('\n❌ Erro inesperado:', erro instanceof Error ? erro.message : erro);
    }
    process.exitCode = 1;
  } finally {
    terminal.close();
    // Fecha o banco (se o .env estiver errado, ele nem chegou a abrir).
    try {
      await Database.instancia().fechar();
    } catch {
      // nada a fechar
    }
  }
}

void principal();
