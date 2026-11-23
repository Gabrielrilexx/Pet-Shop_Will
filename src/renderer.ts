// =====================================================================
// renderer.ts — o "RECEPCIONISTA" da tela
// ---------------------------------------------------------------------
// É o primeiro código que roda na janela. Ele:
//   1. carrega o visual (Bootstrap + nosso CSS);
//   2. pergunta ao Main se já tem alguém logado (auth:atual):
//        - não tem: mostra a tela de login (o menu fica escondido);
//        - tem: mostra o menu com os itens que o perfil pode ver;
//   3. abre a página certa quando um item do menu é clicado.
//
// A navegação usa o "#" do endereço (#usuarios, #clientes...): clicar
// num item troca o #, e o evento "hashchange" avisa que é hora de
// trocar de página. Assim a tela nunca recarrega inteira.
//
// A tela NÃO fala com o banco: tudo passa por window.api.chamar(...).
// =====================================================================

import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap'; // parte JavaScript do Bootstrap (fechar alertas, janelas modais...)
import './index.css';
import type { UsuarioSemSenha } from './shared/tipos';
import { ROTAS } from './renderer/rotas';
import type { Rota } from './renderer/rotas';
import { LoginPage } from './renderer/pages/LoginPage';
import { mostrarAlerta } from './renderer/ui';

const app = document.getElementById('app') as HTMLElement;
const barra = document.getElementById('barra') as HTMLElement;
const menu = document.getElementById('menu') as HTMLElement;
const usuarioLogado = document.getElementById('usuario-logado') as HTMLElement;
const botaoSair = document.getElementById('botao-sair') as HTMLButtonElement;

// Quem está logado, só para a TELA saber o que mostrar.
// (Quem garante a segurança de verdade é o IpcRouter, no Main.)
let usuarioAtual: UsuarioSemSenha | null = null;

/** As rotas que o perfil de quem está logado pode ver. */
function rotasPermitidas(): Rota[] {
  if (usuarioAtual === null) return [];
  const perfil = usuarioAtual.perfil;
  return ROTAS.filter((rota) => rota.perfis.includes(perfil));
}

/** Cria um item de menu para cada rota permitida. */
function montarMenu(): void {
  const itens = rotasPermitidas().map((rota) => {
    const li = document.createElement('li');
    li.className = 'nav-item';

    const link = document.createElement('a');
    link.className = 'nav-link';
    link.href = `#${rota.id}`;
    link.dataset.rota = rota.id;
    link.textContent = rota.titulo; // textContent: o texto nunca vira HTML

    li.append(link);
    return li;
  });
  menu.replaceChildren(...itens);
}

/** Marca no menu qual item está aberto. */
function marcarAtivo(id: string): void {
  menu.querySelectorAll<HTMLAnchorElement>('.nav-link').forEach((link) => {
    link.classList.toggle('active', link.dataset.rota === id);
  });
}

/** Tela mostrada quando nenhuma página está aberta. */
function telaDeBoasVindas(): void {
  const titulo = document.createElement('h1');
  titulo.className = 'h3';
  titulo.textContent = `Olá, ${usuarioAtual?.nome ?? ''}! 🐾`;

  const texto = document.createElement('p');
  texto.className = 'text-secondary mb-0';
  texto.textContent = 'Escolha uma opção no menu acima.';

  const caixa = document.createElement('div');
  caixa.className = 'p-5 bg-white rounded-3 border';
  caixa.append(titulo, texto);
  app.replaceChildren(caixa);
}

/** Abre a página da rota com esse id (o que vem depois do # no endereço). */
async function abrir(id: string): Promise<void> {
  if (usuarioAtual === null) {
    mostrarLogin();
    return;
  }

  marcarAtivo(id);
  const rota = rotasPermitidas().find((r) => r.id === id);
  if (!rota) {
    telaDeBoasVindas();
    return;
  }

  app.replaceChildren(); // limpa a página anterior
  try {
    await rota.criar().render(app);
  } catch (erro) {
    // Se a página quebrar, o sistema não fica em branco: mostra um aviso.
    console.error(`[renderer] Erro ao abrir a página "${id}":`, erro);
    mostrarAlerta(app, 'danger', 'Não foi possível abrir esta tela.');
  }
}

/** Pega o id da página atual a partir do endereço (#usuarios -> usuarios). */
const paginaAtual = (): string => window.location.hash.slice(1);

/** Esconde o menu e mostra a tela de login. */
function mostrarLogin(): void {
  usuarioAtual = null;
  barra.classList.add('d-none');
  menu.replaceChildren();
  // Limpa o # do endereço sem disparar o "hashchange".
  history.replaceState(null, '', window.location.pathname);
  void new LoginPage(entrouNoSistema).render(app);
}

/** Chamado quando o login dá certo (ou quando já havia alguém logado). */
function entrouNoSistema(usuario: UsuarioSemSenha): void {
  usuarioAtual = usuario;
  usuarioLogado.textContent = `${usuario.nome} (${usuario.perfil})`;
  barra.classList.remove('d-none');
  montarMenu();
  void abrir(paginaAtual());
}

// Botão "Sair": avisa o Main (que apaga a Sessao) e volta para o login.
botaoSair.addEventListener('click', async () => {
  await window.api.chamar('auth:sair');
  mostrarLogin();
});

window.addEventListener('hashchange', () => void abrir(paginaAtual()));

/** Ao abrir a janela: já tem alguém logado? (ex.: a página recarregou) */
async function iniciar(): Promise<void> {
  const resposta = await window.api.chamar<UsuarioSemSenha>('auth:atual');
  if (resposta.ok) {
    entrouNoSistema(resposta.dados);
  } else {
    mostrarLogin();
  }
}

void iniciar();
